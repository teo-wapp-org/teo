// Edge Function `admin-ops` (verify_jwt = true): operaciones del panel superadmin que necesitan
// secretos de la plataforma (nunca salen de aquí) o la API de administración de Supabase.
//
//   POST /admin-ops/test/anthropic       → { ok, detail, latency_ms }  llamada mínima con ai.cheap_model
//   POST /admin-ops/test/google-places   → { ok, detail, latency_ms }  búsqueda de prueba
//   POST /admin-ops/test/meta            → { ok, detail, latency_ms }  valida meta.app_id + meta_app_secret
//   POST /admin-ops/test/resend          → { ok, detail, latency_ms }  GET /domains
//   GET  /admin-ops/auth-config          → { ok, disable_signup, mailer_autoconfirm, site_url } | { ok:false, detail }
//   POST /admin-ops/auth-config  { disable_signup?, mailer_autoconfirm? } → estado aplicado | { ok:false, detail }
//
// Autorización: el JWT del llamador debe ser de un superadmin (RPC is_superadmin con SU token).
// Config y secretos se leen con service role y sin caché (justo después de guardarlos en /admin).
// Cada acción exitosa se audita con log_admin_action usando el token del usuario (queda su admin_id).
import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { z } from "zod";
import { ConfigStore, projectRef, type RpcClient, type SecretName } from "../_shared/config.ts";
import { graphBase } from "../_shared/whatsapp/constants.ts";

export type AdminOpsDeps = {
  /** Service role: config y secretos de la plataforma. */
  db: RpcClient;
  /** Cliente con el JWT del usuario (is_superadmin, log_admin_action). */
  userDb: (authHeader: string) => RpcClient;
  fetch?: typeof fetch;
  supabaseUrl: string | undefined;
  config?: ConfigStore;
  now?: () => number;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

export type TestResult = { ok: boolean; detail: string; latency_ms: number };

const TIMEOUT_MS = 10_000;
export const MISSING_MANAGEMENT_TOKEN = "Falta el token de administración de Supabase";

const authConfigBody = z.object({
  disable_signup: z.boolean().optional(),
  mailer_autoconfirm: z.boolean().optional(),
}).strict().refine((b) => b.disable_signup !== undefined || b.mailer_autoconfirm !== undefined, "vacío");

/** Quita secretos (y patrones de keys conocidos) de un texto que vuelve al panel. */
export function scrub(text: string, ...secrets: (string | null | undefined)[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("***");
  return out
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "***")
    .replace(/re_[A-Za-z0-9_]{10,}/g, "***")
    .replace(/sbp_[A-Za-z0-9]+/g, "***")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "***")
    .slice(0, 300);
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function errMessage(body: Record<string, unknown>, status: number): string {
  const e = body.error;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") return (e as { message: string }).message;
  if (typeof e === "string") return e;
  if (typeof body.message === "string") return body.message;
  return `HTTP ${status}`;
}

export function createAdminOpsApp(deps: AdminOpsDeps) {
  const f = deps.fetch ?? fetch;
  const store = deps.config ?? new ConfigStore();
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const secret = (name: SecretName) => store.secret(deps.db, name, { fresh: true });
  const config = () => store.load(deps.db, { fresh: true });

  const app = new Hono<{ Variables: { udb: RpcClient } }>().basePath("/admin-ops");
  app.use("*", cors({ origin: "*", allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"], allowMethods: ["GET", "POST", "OPTIONS"] }));

  app.onError((err, c) => {
    log("admin_ops_error", { error: String(err).slice(0, 300) });
    return c.json({ error: "error_interno" }, 500);
  });

  // Solo superadmin (consultado con el token del propio usuario).
  app.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "no_autenticado" }, 401);
    const udb = deps.userDb(authHeader);
    const { data, error } = await udb.rpc("is_superadmin");
    if (error || data !== true) return c.json({ error: "sin_acceso" }, 403);
    c.set("udb", udb);
    await next();
  });

  const audit = async (udb: RpcClient, action: string, target: string, metadata: Record<string, unknown>) => {
    const { error } = await udb.rpc("log_admin_action", { p_action: action, p_org: null, p_target: target, p_metadata: metadata });
    if (error) log("audit_failed", { action, error: error.message });
  };

  /** Ejecuta una prueba con tiempo medido; audita si salió bien. */
  const runTest = async (udb: RpcClient, target: string, fn: () => Promise<{ ok: boolean; detail: string }>): Promise<TestResult> => {
    const t0 = now();
    let r: { ok: boolean; detail: string };
    try {
      r = await fn();
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      r = { ok: false, detail: timeout ? "El servicio no respondió a tiempo" : `No se pudo conectar: ${scrub(String(e))}` };
    }
    const result = { ...r, latency_ms: Math.max(0, Math.round(now() - t0)) };
    if (result.ok) await audit(udb, "platform.test_connection", target, { latency_ms: result.latency_ms });
    return result;
  };

  app.post("/test/anthropic", async (c) => {
    const r = await runTest(c.get("udb"), "anthropic", async () => {
      const key = await secret("anthropic_api_key");
      if (!key) return { ok: false, detail: "Falta la API key de Anthropic" };
      const model = (await config()).ai.cheapModel;
      const res = await f("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: "user", content: "Responde solo: ok" }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await readJson(res);
      if (!res.ok) return { ok: false, detail: scrub(`Anthropic respondió ${res.status}: ${errMessage(body, res.status)}`, key) };
      return { ok: true, detail: `Conexión correcta con ${String(body.model ?? model)}` };
    });
    return c.json(r);
  });

  app.post("/test/google-places", async (c) => {
    const r = await runTest(c.get("udb"), "google_places", async () => {
      const key = await secret("google_places_api_key");
      if (!key) return { ok: false, detail: "Falta la API key de Google Places" };
      const res = await f("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
        body: JSON.stringify({ textQuery: "Malecón 2000 Guayaquil", languageCode: "es", regionCode: "EC", pageSize: 1 }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await readJson(res);
      if (!res.ok) return { ok: false, detail: scrub(`Google respondió ${res.status}: ${errMessage(body, res.status)}`, key) };
      const n = Array.isArray(body.places) ? body.places.length : 0;
      return { ok: true, detail: `Google Places respondió (${n} resultado${n === 1 ? "" : "s"})` };
    });
    return c.json(r);
  });

  app.post("/test/meta", async (c) => {
    const r = await runTest(c.get("udb"), "meta", async () => {
      const cfg = await config();
      const appId = cfg.meta.appId;
      if (!appId) return { ok: false, detail: "Falta el App ID de Meta" };
      const appSecret = await secret("meta_app_secret");
      if (!appSecret) return { ok: false, detail: "Falta el App Secret de Meta" };
      const qs = new URLSearchParams({ fields: "id,name", access_token: `${appId}|${appSecret}` });
      const res = await f(`${graphBase(cfg.meta.graphVersion)}/${encodeURIComponent(appId)}?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = await readJson(res);
      if (!res.ok) return { ok: false, detail: scrub(`Meta respondió ${res.status}: ${errMessage(body, res.status)}`, appSecret) };
      return { ok: true, detail: `App de Meta válida: ${String(body.name ?? body.id ?? appId)}` };
    });
    return c.json(r);
  });

  app.post("/test/resend", async (c) => {
    const r = await runTest(c.get("udb"), "resend", async () => {
      const key = await secret("resend_api_key");
      if (!key) return { ok: false, detail: "Falta la API key de Resend" };
      const res = await f("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = await readJson(res);
      if (!res.ok) {
        // una key de solo envío no puede listar dominios, pero es válida
        if (body.name === "restricted_api_key") return { ok: true, detail: "Key válida (solo permite enviar correos)" };
        return { ok: false, detail: scrub(`Resend respondió ${res.status}: ${errMessage(body, res.status)}`, key) };
      }
      const n = Array.isArray(body.data) ? body.data.length : 0;
      return { ok: true, detail: `Key válida (${n} dominio${n === 1 ? "" : "s"})` };
    });
    return c.json(r);
  });

  // ── Configuración de Auth del proyecto (API de administración de Supabase) ──
  const authState = (b: Record<string, unknown>) => ({
    ok: true as const,
    disable_signup: Boolean(b.disable_signup),
    mailer_autoconfirm: Boolean(b.mailer_autoconfirm),
    site_url: typeof b.site_url === "string" ? b.site_url : null,
  });

  const management = async () => {
    const token = await secret("supabase_management_token");
    if (!token) return { error: MISSING_MANAGEMENT_TOKEN } as const;
    const ref = projectRef(deps.supabaseUrl);
    if (!ref) return { error: "No se pudo identificar el proyecto de Supabase" } as const;
    return { token, url: `https://api.supabase.com/v1/projects/${ref}/config/auth` } as const;
  };

  app.get("/auth-config", async (c) => {
    const m = await management();
    if ("error" in m) return c.json({ ok: false, detail: m.error });
    const res = await f(m.url, { headers: { Authorization: `Bearer ${m.token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await readJson(res);
    if (!res.ok) return c.json({ ok: false, detail: scrub(`Supabase respondió ${res.status}: ${errMessage(body, res.status)}`, m.token) });
    return c.json(authState(body));
  });

  app.post("/auth-config", async (c) => {
    const parsed = authConfigBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "entrada_invalida" }, 400);
    const m = await management();
    if ("error" in m) return c.json({ ok: false, detail: m.error });
    const res = await f(m.url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${m.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await readJson(res);
    if (!res.ok) return c.json({ ok: false, detail: scrub(`Supabase respondió ${res.status}: ${errMessage(body, res.status)}`, m.token) });
    const state = authState(body);
    await audit(c.get("udb"), "platform.auth_config", "auth", { requested: parsed.data, applied: { disable_signup: state.disable_signup, mailer_autoconfirm: state.mailer_autoconfirm } });
    return c.json(state);
  });

  return app;
}
