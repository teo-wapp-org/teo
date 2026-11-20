import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { ConfigStore, type RpcClient } from "../_shared/config.ts";
import { createConnectApp } from "./app.ts";

const ORG = "00000000-0000-4000-8000-00000000000a";
const SECRET = "meta-app-secret-xyz";
const BODY = { org_id: ORG, code: "CODE-1234567890", phone_number_id: "1112223334", waba_id: "5556667778" };

function setup(opts: {
  role?: boolean;
  appId?: string | null;
  secret?: string | null;
  fail?: "oauth" | "subscribe" | "register";
  rpcError?: { message: string; code?: string };
} = {}) {
  const calls: { url: string; method: string; auth: string | null; body: string | null }[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> | undefined; auth: string }[] = [];
  const db: RpcClient = {
    rpc(fn) {
      if (fn === "get_platform_config") {
        return Promise.resolve({ data: { meta: { app_id: opts.appId === undefined ? "123456" : opts.appId, graph_version: "v25.0" } }, error: null });
      }
      if (fn === "get_platform_secret") return Promise.resolve({ data: opts.secret === undefined ? SECRET : opts.secret, error: null });
      return Promise.resolve({ data: null, error: { message: "no" } });
    },
  };
  const userDb = (auth: string): RpcClient => ({
    rpc(fn, args) {
      rpcs.push({ fn, args, auth });
      if (fn === "has_org_role") return Promise.resolve({ data: opts.role ?? true, error: null });
      if (fn === "connect_whatsapp_account") return Promise.resolve({ data: opts.rpcError ? null : "acc-id", error: opts.rpcError ?? null });
      return Promise.resolve({ data: null, error: { message: "no" } });
    },
  });
  const fetchFn = ((url: string, init: RequestInit = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? "GET", auth: new Headers(init.headers).get("authorization"), body: typeof init.body === "string" ? init.body : null });
    const err = (m: string) => Promise.resolve(Response.json({ error: { message: m, code: 100 } }, { status: 400 }));
    if (u.includes("oauth/access_token")) return opts.fail === "oauth" ? err(`bad code with ${SECRET}`) : Promise.resolve(Response.json({ access_token: "EAAtokenDelComercio123456" }));
    if (u.includes("subscribed_apps")) return opts.fail === "subscribe" ? err("no") : Promise.resolve(Response.json({ success: true }));
    if (u.includes("/register")) return opts.fail === "register" ? err("pin") : Promise.resolve(Response.json({ success: true }));
    return Promise.resolve(Response.json({ display_phone_number: "+593 99 123 4567", verified_name: "Café Teo", quality_rating: "GREEN" }));
  }) as typeof fetch;
  const app = createConnectApp({ db, userDb, fetch: fetchFn, pin: () => "123456", config: new ConfigStore({ env: { get: () => undefined }, log: () => {} }) });
  const post = (body: unknown, auth: string | null = "Bearer user-jwt") =>
    app.request("/whatsapp-connect", { method: "POST", headers: { ...(auth ? { Authorization: auth } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { post, calls, rpcs };
}

Deno.test("whatsapp-connect: flujo completo con app secret de Vault y RPC con el token del usuario", async () => {
  const s = setup();
  const res = await s.post(BODY);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, display_phone_number: "+593 99 123 4567", verified_name: "Café Teo" });
  const oauth = new URL(s.calls[0].url);
  assertEquals(oauth.origin + oauth.pathname, "https://graph.facebook.com/v25.0/oauth/access_token");
  assertEquals(oauth.searchParams.get("client_id"), "123456");
  assertEquals(oauth.searchParams.get("client_secret"), SECRET);
  assertEquals(s.calls[1].url, "https://graph.facebook.com/v25.0/5556667778/subscribed_apps");
  assertEquals(s.calls[1].auth, "Bearer EAAtokenDelComercio123456");
  assertEquals(s.calls[2].url, "https://graph.facebook.com/v25.0/1112223334/register");
  assertEquals(JSON.parse(s.calls[2].body!), { messaging_product: "whatsapp", pin: "123456" });
  const connect = s.rpcs.find((r) => r.fn === "connect_whatsapp_account")!;
  assertEquals(connect.auth, "Bearer user-jwt");
  assertEquals(connect.args?.p_token, "EAAtokenDelComercio123456");
  assertEquals(connect.args?.p_status, "conectado");
  assertEquals(connect.args?.p_verified_name, "Café Teo");
});

Deno.test("whatsapp-connect: coexistencia no registra el número", async () => {
  const s = setup();
  assertEquals((await s.post({ ...BODY, coexistence: true })).status, 200);
  assert(!s.calls.some((c) => c.url.endsWith("/register")));
});

Deno.test("whatsapp-connect: permisos, config y validación", async () => {
  assertEquals((await setup().post(BODY, null)).status, 401);
  const noRole = setup({ role: false });
  assertEquals((await noRole.post(BODY)).status, 403);
  assertEquals(noRole.calls.length, 0);
  assertEquals((await setup({ appId: null }).post(BODY)).status, 503);
  assertEquals((await setup({ secret: null }).post(BODY)).status, 503);
  assertEquals((await setup().post({ ...BODY, phone_number_id: "abc" })).status, 400);
});

Deno.test("whatsapp-connect: errores de Meta y de la RPC (sin filtrar el app secret)", async () => {
  const oauth = await setup({ fail: "oauth" }).post(BODY);
  assertEquals(oauth.status, 502);
  const msg = (await oauth.json()).error as string;
  assertStringIncludes(msg, "Meta rechazó el código");
  assert(!msg.includes(SECRET));
  assertEquals((await setup({ fail: "subscribe" }).post(BODY)).status, 502);
  assertEquals((await setup({ fail: "register" }).post(BODY)).status, 502);
  const dup = await setup({ rpcError: { message: "dup", code: "23505" } }).post(BODY);
  assertEquals([dup.status, (await dup.json()).error], [409, "Ese número ya está conectado a otro comercio."]);
});
