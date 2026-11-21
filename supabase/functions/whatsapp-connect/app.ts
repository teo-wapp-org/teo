// Edge Function `whatsapp-connect` (verify_jwt = true): Embedded Signup de Meta.
// El popup de Facebook devuelve un `code` y, por postMessage, el phone_number_id y el waba_id elegidos.
// Aquí se intercambia el code por el token del comercio (con el app secret de Vault, que nunca sale
// de aquí), se suscribe la app a la WABA, se registra el número y se guarda con
// connect_whatsapp_account (llamada con el token del usuario: la RPC vuelve a validar owner/admin).
//
//   POST /whatsapp-connect  { org_id, code, phone_number_id, waba_id, coexistence? }
//     200 → { ok: true, display_phone_number, verified_name }
//     4xx/5xx → { error: "<mensaje para el usuario>" }
//       400 datos inválidos · 401 no autenticado · 403 no es owner/admin · 503 falta la app de Meta
//       502 Meta rechazó algún paso · 409 no se pudo guardar (p. ej. número ya conectado a otro comercio)
import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { z } from "zod";
import { ConfigStore, type RpcClient } from "../_shared/config.ts";
import { graphBase } from "../_shared/whatsapp/constants.ts";

export type ConnectDeps = {
  db: RpcClient; // service role: config y secreto
  userDb: (authHeader: string) => RpcClient; // JWT del usuario: has_org_role, connect_whatsapp_account
  fetch?: typeof fetch;
  config?: ConfigStore;
  /** PIN de verificación en dos pasos al registrar el número (inyectable en tests). */
  pin?: () => string;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

const body = z.object({
  org_id: z.string().uuid(),
  code: z.string().min(10).max(2048),
  phone_number_id: z.string().regex(/^[0-9]{5,30}$/),
  waba_id: z.string().regex(/^[0-9]{5,30}$/),
  coexistence: z.boolean().optional(),
});

type GraphResult<T> = { ok: true; data: T } | { ok: false; reason: string };
export type PhoneInfo = { display_phone_number?: string; verified_name?: string; quality_rating?: string };

const randomPin = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");

export function createConnectApp(deps: ConnectDeps) {
  const f = deps.fetch ?? fetch;
  const store = deps.config ?? new ConfigStore();
  const log = deps.log ?? (() => {});
  const pin = deps.pin ?? randomPin;

  /** Llama a la Graph API. Nunca incluye tokens ni el app secret en el motivo de error. */
  async function graph<T>(base: string, path: string, token: string | null, init: RequestInit = {}, hide: string[] = []): Promise<GraphResult<T>> {
    try {
      const res = await f(`${base}/${path}`, {
        ...init,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.body ? { "Content-Type": "application/json" } : {}) },
        signal: AbortSignal.timeout(8_000),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
      if (!res.ok) {
        let msg = (json.error?.message ?? `HTTP ${res.status}`).replace(/EAA[A-Za-z0-9-]{10,}/g, "***");
        for (const h of hide) if (h) msg = msg.split(h).join("***");
        return { ok: false, reason: (json.error?.code ? `${json.error.code}: ${msg}` : msg).slice(0, 300) };
      }
      return { ok: true, data: json };
    } catch (e) {
      return { ok: false, reason: e instanceof Error && e.name === "TimeoutError" ? "Meta no respondió a tiempo" : "No pudimos contactar a Meta" };
    }
  }

  const app = new Hono().basePath("/whatsapp-connect");
  app.use("*", cors({ origin: "*", allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"], allowMethods: ["POST", "OPTIONS"] }));
  app.onError((err, c) => {
    log("whatsapp_connect_error", { error: String(err).slice(0, 300) });
    return c.json({ error: "No pudimos conectar tu número. Inténtalo de nuevo." }, 500);
  });

  app.post("/", async (c) => {
    const parsed = body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Datos inválidos" }, 400);
    const { org_id, code, phone_number_id, waba_id, coexistence } = parsed.data;

    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "No autenticado" }, 401);
    const udb = deps.userDb(authHeader);
    const { data: allowed, error: roleErr } = await udb.rpc("has_org_role", { p_org: org_id, p_roles: ["owner", "admin"] });
    if (roleErr || allowed !== true) return c.json({ error: "Sin permiso" }, 403);

    const cfg = await store.load(deps.db);
    const appId = cfg.meta.appId;
    const appSecret = await store.secret(deps.db, "meta_app_secret");
    if (!appId || !appSecret) return c.json({ error: "Embedded Signup aún no está habilitado (falta la app de Meta)." }, 503);
    const base = graphBase(cfg.meta.graphVersion);

    const qs = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
    const tok = await graph<{ access_token: string }>(base, `oauth/access_token?${qs}`, null, {}, [appSecret, code]);
    if (!tok.ok) return c.json({ error: `Meta rechazó el código: ${tok.reason}` }, 502);
    const token = tok.data.access_token;

    const sub = await graph<{ success: boolean }>(base, `${encodeURIComponent(waba_id)}/subscribed_apps`, token, { method: "POST" }, [token]);
    if (!sub.ok) return c.json({ error: `No pudimos suscribir los webhooks: ${sub.reason}` }, 502);

    if (!coexistence) {
      // PIN de verificación en dos pasos del número (Meta lo exige al registrar).
      const reg = await graph<{ success: boolean }>(base, `${encodeURIComponent(phone_number_id)}/register`, token, {
        method: "POST",
        body: JSON.stringify({ messaging_product: "whatsapp", pin: pin() }),
      }, [token]);
      if (!reg.ok) return c.json({ error: `No pudimos registrar el número: ${reg.reason}` }, 502);
    }

    const info = await graph<PhoneInfo>(base, `${encodeURIComponent(phone_number_id)}?fields=display_phone_number,verified_name,quality_rating`, token, {}, [token]);
    const { error } = await udb.rpc("connect_whatsapp_account", {
      p_org: org_id,
      p_phone_number_id: phone_number_id,
      p_waba_id: waba_id,
      p_token: token,
      p_display_phone: info.ok ? info.data.display_phone_number ?? null : null,
      p_verified_name: info.ok ? info.data.verified_name ?? null : null,
      p_status: "conectado",
      p_quality_rating: info.ok ? info.data.quality_rating ?? null : null,
    });
    if (error) {
      log("connect_rpc_failed", { code: error.code ?? null });
      return c.json({ error: error.code === "23505" ? "Ese número ya está conectado a otro comercio." : "No pudimos guardar la conexión." }, 409);
    }
    log("whatsapp_connected", { org_id, coexistence: Boolean(coexistence) });
    return c.json({
      ok: true,
      display_phone_number: info.ok ? info.data.display_phone_number ?? null : null,
      verified_name: info.ok ? info.data.verified_name ?? null : null,
    });
  });

  return app;
}
