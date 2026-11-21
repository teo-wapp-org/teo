import { assertEquals } from "@std/assert";
import { buildConfig, ConfigStore, projectRef, type RpcClient } from "./config.ts";

const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });

/** DB simulada: cuenta las llamadas RPC y puede fallar. */
function fakeDb(opts: { settings?: unknown; secrets?: Record<string, string | null>; fail?: boolean } = {}) {
  const calls: string[] = [];
  const db: RpcClient = {
    rpc(fn, args) {
      calls.push(fn === "get_platform_secret" ? `${fn}:${args?.p_name}` : fn);
      if (opts.fail) return Promise.resolve({ data: null, error: { message: "boom" } });
      if (fn === "get_platform_config") return Promise.resolve({ data: opts.settings ?? {}, error: null });
      if (fn === "get_platform_secret") return Promise.resolve({ data: opts.secrets?.[String(args?.p_name)] ?? null, error: null });
      return Promise.resolve({ data: null, error: { message: "unknown" } });
    },
  };
  return { db, calls };
}

const quiet = { log: () => {} };

Deno.test("config: defaults sin DB ni env", () => {
  const c = buildConfig({}, env({}));
  assertEquals(c.ai.provider, "fake");
  assertEquals(c.ai.enabled, true);
  assertEquals(c.ai.maxToolIterations, 6);
  assertEquals(c.ai.timeoutMs, 45_000);
  assertEquals(c.ai.debounceSeconds, 4);
  assertEquals(c.meta.graphVersion, "v24.0");
  assertEquals(c.meta.appId, null);
  assertEquals(c.signup.trialDays, 14);
  assertEquals(c.places.enabled, true);
});

Deno.test("config: precedencia DB > env > default", () => {
  const e = env({ TEO_LLM_PROVIDER: "anthropic", TEO_AGENT_MODEL: "env-model", TEO_LLM_EFFORT: "high", META_GRAPH_VERSION: "v99.0", META_APP_ID: "123" });
  const fromEnv = buildConfig({}, e);
  assertEquals(fromEnv.ai.provider, "anthropic");
  assertEquals(fromEnv.ai.agentModel, "env-model");
  assertEquals(fromEnv.ai.effort, "high");
  assertEquals(fromEnv.meta.graphVersion, "v99.0");
  assertEquals(fromEnv.meta.appId, "123");

  const fromDb = buildConfig({
    ai: { provider: "fake", agent_model: "db-model", effort: "medium", enabled: false, max_tool_iterations: 3, timeout_ms: 20000, debounce_seconds: 2 },
    meta: { app_id: null, graph_version: "v25.0", manual_connection_enabled: false },
  }, e);
  assertEquals(fromDb.ai.provider, "fake");
  assertEquals(fromDb.ai.agentModel, "db-model");
  assertEquals(fromDb.ai.effort, "medium");
  assertEquals(fromDb.ai.enabled, false);
  assertEquals(fromDb.ai.maxToolIterations, 3);
  assertEquals(fromDb.ai.timeoutMs, 20_000);
  assertEquals(fromDb.ai.debounceSeconds, 2);
  assertEquals(fromDb.meta.graphVersion, "v25.0");
  assertEquals(fromDb.meta.appId, "123"); // null en DB → respaldo env
  assertEquals(fromDb.meta.manualConnectionEnabled, false);
});

Deno.test("config: valores inválidos caen al respaldo y se acotan", () => {
  const c = buildConfig({ ai: { provider: "openai", effort: "max", max_tool_iterations: 500, timeout_ms: "abc" } }, env({}));
  assertEquals(c.ai.provider, "fake");
  assertEquals(c.ai.effort, "low");
  assertEquals(c.ai.maxToolIterations, 20);
  assertEquals(c.ai.timeoutMs, 45_000);
});

Deno.test("config: sin DB y con ANTHROPIC_API_KEY → anthropic (comportamiento histórico)", () => {
  assertEquals(buildConfig({}, env({ ANTHROPIC_API_KEY: "sk-x" })).ai.provider, "anthropic");
});

Deno.test("config: caché de 30 s por isolate y fresh la salta", async () => {
  let t = 0;
  const store = new ConfigStore({ env: env({}), now: () => t, ...quiet });
  const { db, calls } = fakeDb({ settings: { ai: { provider: "fake" } } });
  await store.load(db);
  await store.load(db);
  assertEquals(calls.length, 1);
  t = 29_999;
  await store.load(db);
  assertEquals(calls.length, 1);
  t = 30_000;
  await store.load(db);
  assertEquals(calls.length, 2);
  await store.load(db, { fresh: true });
  assertEquals(calls.length, 3);
});

Deno.test("config: si la DB falla usa env y no cachea el error", async () => {
  const store = new ConfigStore({ env: env({ TEO_LLM_PROVIDER: "anthropic" }), ...quiet });
  const { db, calls } = fakeDb({ fail: true });
  assertEquals((await store.load(db)).ai.provider, "anthropic");
  await store.load(db);
  assertEquals(calls.length, 2);
});

Deno.test("secretos: DB > env, caché y fallback", async () => {
  let t = 0;
  const e = env({ ANTHROPIC_API_KEY: "env-key", WHATSAPP_APP_SECRET: "env-app-secret" });
  const store = new ConfigStore({ env: e, now: () => t, ...quiet });
  const { db, calls } = fakeDb({ secrets: { anthropic_api_key: "db-key" } });
  assertEquals(await store.secret(db, "anthropic_api_key"), "db-key");
  assertEquals(await store.secret(db, "anthropic_api_key"), "db-key");
  assertEquals(calls.filter((c) => c.endsWith("anthropic_api_key")).length, 1);
  // sin valor en Vault → env (meta_app_secret ← WHATSAPP_APP_SECRET)
  assertEquals(await store.secret(db, "meta_app_secret"), "env-app-secret");
  // sin Vault ni env → null
  assertEquals(await store.secret(db, "resend_api_key"), null);
  t = 31_000;
  await store.secret(db, "anthropic_api_key");
  assertEquals(calls.filter((c) => c.endsWith("anthropic_api_key")).length, 2);

  const failing = fakeDb({ fail: true });
  assertEquals(await store.secret(failing.db, "anthropic_api_key", { fresh: true }), "env-key");
});

Deno.test("projectRef: deriva el ref de SUPABASE_URL", () => {
  assertEquals(projectRef("https://abcd1234.supabase.co"), "abcd1234");
  assertEquals(projectRef("http://localhost:54321"), null);
  assertEquals(projectRef(undefined), null);
});
