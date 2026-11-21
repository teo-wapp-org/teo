import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { ConfigStore, type RpcClient } from "../_shared/config.ts";
import { type AdminOpsDeps, createAdminOpsApp, MISSING_MANAGEMENT_TOKEN, scrub } from "./app.ts";

const KEY = "sk-ant-api03-SECRETO-de-prueba-1234";

type Call = { url: string; method: string; headers: Record<string, string>; body: string | null };

function setup(opts: {
  superadmin?: boolean;
  secrets?: Record<string, string>;
  settings?: Record<string, unknown>;
  respond?: (call: Call) => Response;
} = {}) {
  const audits: { action: string; target: string; metadata: unknown }[] = [];
  const calls: Call[] = [];
  const userTokens: string[] = [];
  const db: RpcClient = {
    rpc(fn, args) {
      if (fn === "get_platform_config") return Promise.resolve({ data: opts.settings ?? {}, error: null });
      if (fn === "get_platform_secret") return Promise.resolve({ data: opts.secrets?.[String(args?.p_name)] ?? null, error: null });
      return Promise.resolve({ data: null, error: { message: "no" } });
    },
  };
  const userDb = (auth: string): RpcClient => ({
    rpc(fn, args) {
      userTokens.push(auth);
      if (fn === "is_superadmin") return Promise.resolve({ data: opts.superadmin ?? true, error: null });
      if (fn === "log_admin_action") {
        audits.push({ action: String(args?.p_action), target: String(args?.p_target), metadata: args?.p_metadata });
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "no" } });
    },
  });
  const fetchFn = ((input: string | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === "string" ? init.body : null,
    };
    calls.push(call);
    return Promise.resolve(opts.respond ? opts.respond(call) : Response.json({}));
  }) as typeof fetch;
  let t = 1000;
  const deps: AdminOpsDeps = {
    db,
    userDb,
    fetch: fetchFn,
    supabaseUrl: "https://abcdref.supabase.co",
    config: new ConfigStore({ env: { get: () => undefined }, log: () => {} }),
    now: () => (t += 25),
  };
  const app = createAdminOpsApp(deps);
  const req = (method: string, path: string, body?: unknown, auth: string | null = "Bearer user-jwt") =>
    app.request(`/admin-ops${path}`, {
      method,
      headers: { ...(auth ? { Authorization: auth } : {}), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { req, audits, calls, userTokens };
}

Deno.test("admin-ops: sin token → 401; no superadmin → 403 y no llama a nada", async () => {
  const anon = setup();
  assertEquals((await anon.req("POST", "/test/anthropic", undefined, null)).status, 401);
  const notAdmin = setup({ superadmin: false, secrets: { anthropic_api_key: KEY } });
  const res = await notAdmin.req("POST", "/test/anthropic");
  assertEquals(res.status, 403);
  assertEquals(notAdmin.calls.length, 0);
});

Deno.test("admin-ops: test/anthropic usa la key guardada y ai.cheap_model; no expone la key; audita con el token del usuario", async () => {
  const s = setup({
    secrets: { anthropic_api_key: KEY },
    settings: { ai: { cheap_model: "claude-haiku-5-5" } },
    respond: () => Response.json({ model: "claude-haiku-5-5", content: [{ type: "text", text: "ok" }] }),
  });
  const res = await s.req("POST", "/test/anthropic");
  const body = await res.json();
  assertEquals(body.ok, true);
  assertStringIncludes(body.detail, "claude-haiku-5-5");
  assert(body.latency_ms > 0);
  assertEquals(s.calls[0].url, "https://api.anthropic.com/v1/messages");
  assertEquals(s.calls[0].headers["x-api-key"], KEY);
  const sent = JSON.parse(s.calls[0].body!);
  assertEquals(sent.model, "claude-haiku-5-5");
  assert(sent.max_tokens <= 16);
  assert(!JSON.stringify(body).includes(KEY));
  assertEquals(s.audits, [{ action: "platform.test_connection", target: "anthropic", metadata: { latency_ms: body.latency_ms } }]);
  assert(s.userTokens.every((t) => t === "Bearer user-jwt"));
});

Deno.test("admin-ops: error de Anthropic → ok:false sin filtrar la key y sin auditar", async () => {
  const s = setup({
    secrets: { anthropic_api_key: KEY },
    respond: () => Response.json({ type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` } }, { status: 401 }),
  });
  const body = await (await s.req("POST", "/test/anthropic")).json();
  assertEquals(body.ok, false);
  assertStringIncludes(body.detail, "401");
  assert(!body.detail.includes(KEY));
  assertEquals(s.audits.length, 0);
});

Deno.test("admin-ops: sin key → ok:false sin llamar a la API", async () => {
  const s = setup();
  for (const [path, text] of [["/test/anthropic", "Anthropic"], ["/test/google-places", "Google"], ["/test/resend", "Resend"], ["/test/meta", "App ID"]]) {
    const body = await (await s.req("POST", path)).json();
    assertEquals(body.ok, false);
    assertStringIncludes(body.detail, text);
  }
  assertEquals(s.calls.length, 0);
});

Deno.test("admin-ops: test/google-places hace una búsqueda mínima", async () => {
  const s = setup({ secrets: { google_places_api_key: "AIzaPRUEBA123456789012345678" }, respond: () => Response.json({ places: [{ id: "x" }] }) });
  const body = await (await s.req("POST", "/test/google-places")).json();
  assertEquals(body.ok, true);
  assertEquals(s.calls[0].url, "https://places.googleapis.com/v1/places:searchText");
  assertEquals(s.calls[0].headers["x-goog-api-key"], "AIzaPRUEBA123456789012345678");
  assertEquals(JSON.parse(s.calls[0].body!).pageSize, 1);
});

Deno.test("admin-ops: test/meta valida app_id|app_secret con la versión de Graph configurada", async () => {
  const s = setup({
    secrets: { meta_app_secret: "meta-secret-xyz" },
    settings: { meta: { app_id: "123456", graph_version: "v25.0" } },
    respond: () => Response.json({ id: "123456", name: "Teo" }),
  });
  const body = await (await s.req("POST", "/test/meta")).json();
  assertEquals(body.ok, true);
  assertStringIncludes(body.detail, "Teo");
  const u = new URL(s.calls[0].url);
  assertEquals(u.origin + u.pathname, "https://graph.facebook.com/v25.0/123456");
  assertEquals(u.searchParams.get("access_token"), "123456|meta-secret-xyz");
  assert(!JSON.stringify(body).includes("meta-secret-xyz"));
});

Deno.test("admin-ops: test/resend lista dominios; key de solo envío también es válida", async () => {
  const ok = setup({ secrets: { resend_api_key: "re_PRUEBA_1234567890" }, respond: () => Response.json({ data: [{ id: "d" }] }) });
  const b1 = await (await ok.req("POST", "/test/resend")).json();
  assertEquals(b1.ok, true);
  assertEquals(ok.calls[0].url, "https://api.resend.com/domains");
  assertEquals(ok.calls[0].headers.authorization, "Bearer re_PRUEBA_1234567890");
  const restricted = setup({
    secrets: { resend_api_key: "re_PRUEBA_1234567890" },
    respond: () => Response.json({ name: "restricted_api_key", message: "This API key is restricted" }, { status: 401 }),
  });
  assertEquals((await (await restricted.req("POST", "/test/resend")).json()).ok, true);
});

Deno.test("admin-ops: auth-config sin token de administración → ok:false", async () => {
  const s = setup();
  assertEquals(await (await s.req("GET", "/auth-config")).json(), { ok: false, detail: MISSING_MANAGEMENT_TOKEN });
  assertEquals(await (await s.req("POST", "/auth-config", { disable_signup: true })).json(), { ok: false, detail: MISSING_MANAGEMENT_TOKEN });
  assertEquals(s.calls.length, 0);
});

Deno.test("admin-ops: auth-config GET y PATCH contra la API de administración (ref de SUPABASE_URL)", async () => {
  const s = setup({
    secrets: { supabase_management_token: "sbp_prueba123" },
    respond: (c) =>
      Response.json({
        disable_signup: c.method === "PATCH" ? JSON.parse(c.body!).disable_signup ?? false : false,
        mailer_autoconfirm: true,
        site_url: "https://teo.app",
        jwt_exp: 3600,
      }),
  });
  const g = await (await s.req("GET", "/auth-config")).json();
  assertEquals(g, { ok: true, disable_signup: false, mailer_autoconfirm: true, site_url: "https://teo.app" });
  assertEquals(s.calls[0].url, "https://api.supabase.com/v1/projects/abcdref/config/auth");
  assertEquals(s.calls[0].headers.authorization, "Bearer sbp_prueba123");
  assertEquals(s.audits.length, 0); // lectura: no se audita

  const p = await (await s.req("POST", "/auth-config", { disable_signup: true })).json();
  assertEquals(p.disable_signup, true);
  assertEquals(s.calls[1].method, "PATCH");
  assertEquals(JSON.parse(s.calls[1].body!), { disable_signup: true });
  assertEquals(s.audits[0].action, "platform.auth_config");

  assertEquals((await s.req("POST", "/auth-config", {})).status, 400);
  assertEquals((await s.req("POST", "/auth-config", { site_url: "x" })).status, 400);
});

Deno.test("scrub: oculta keys conocidas", () => {
  assertEquals(scrub("x sk-ant-abc_123 y", null), "x *** y");
  assertEquals(scrub("token SECRETO1", "SECRETO1"), "token ***");
});
