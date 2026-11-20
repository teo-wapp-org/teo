import { assertEquals } from "@std/assert";
import { ConfigStore, type RpcClient } from "../_shared/config.ts";
import { createPlacesApp } from "./app.ts";

const ORG = "00000000-0000-4000-8000-00000000000a";
const KEY = "AIzaPRUEBA-places-1234567890";

function setup(opts: { member?: boolean; enabled?: boolean; key?: string | null; status?: number } = {}) {
  const calls: { url: string; headers: Record<string, string>; body: string | null }[] = [];
  const db: RpcClient = {
    rpc(fn) {
      if (fn === "get_platform_config") return Promise.resolve({ data: { places: { enabled: opts.enabled ?? true } }, error: null });
      if (fn === "get_platform_secret") return Promise.resolve({ data: opts.key === undefined ? KEY : opts.key, error: null });
      return Promise.resolve({ data: null, error: { message: "no" } });
    },
  };
  const userDb = (): RpcClient => ({
    rpc: (fn, args) => Promise.resolve(fn === "is_org_member" && args?.p_org === ORG ? { data: opts.member ?? true, error: null } : { data: false, error: null }),
  });
  const fetchFn = ((url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), headers: Object.fromEntries(new Headers(init.headers).entries()), body: typeof init.body === "string" ? init.body : null });
    if (opts.status) return Promise.resolve(new Response("{}", { status: opts.status }));
    return Promise.resolve(Response.json(String(url).includes("searchText") ? { places: [{ id: "ChIJ123", displayName: { text: "Café" } }] } : { id: "ChIJ1234567890" }));
  }) as typeof fetch;
  const app = createPlacesApp({ db, userDb, fetch: fetchFn, config: new ConfigStore({ env: { get: () => undefined }, log: () => {} }) });
  const post = (path: string, body: unknown, auth: string | null = "Bearer jwt") =>
    app.request(`/places${path}`, { method: "POST", headers: { ...(auth ? { Authorization: auth } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { post, calls };
}

Deno.test("places: search con la key de Vault y field mask acotado", async () => {
  const s = setup();
  const res = await s.post("/search", { org_id: ORG, query: "Café Guayaquil" });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { places: [{ id: "ChIJ123", displayName: { text: "Café" } }] });
  assertEquals(s.calls[0].url, "https://places.googleapis.com/v1/places:searchText");
  assertEquals(s.calls[0].headers["x-goog-api-key"], KEY);
  assertEquals(s.calls[0].headers["x-goog-fieldmask"], "places.id,places.displayName,places.formattedAddress");
  assertEquals(JSON.parse(s.calls[0].body!).textQuery, "Café Guayaquil");
});

Deno.test("places: details devuelve el lugar", async () => {
  const s = setup();
  const res = await s.post("/details", { org_id: ORG, place_id: "ChIJ1234567890" });
  assertEquals(await res.json(), { place: { id: "ChIJ1234567890" } });
  assertEquals(s.calls[0].url.startsWith("https://places.googleapis.com/v1/places/ChIJ1234567890?"), true);
});

Deno.test("places: autorización y disponibilidad", async () => {
  assertEquals((await setup().post("/search", { org_id: ORG, query: "Café" }, null)).status, 401);
  const notMember = setup({ member: false });
  assertEquals((await notMember.post("/search", { org_id: ORG, query: "Café" })).status, 403);
  assertEquals(notMember.calls.length, 0);
  assertEquals((await setup({ enabled: false }).post("/search", { org_id: ORG, query: "Café" })).status, 503);
  assertEquals((await setup({ key: null }).post("/search", { org_id: ORG, query: "Café" })).status, 503);
  assertEquals((await setup().post("/search", { org_id: ORG, query: "ab" })).status, 400);
  assertEquals((await setup().post("/details", { org_id: ORG, place_id: "../x" })).status, 400);
  const broken = await setup({ status: 403 }).post("/search", { org_id: ORG, query: "Café" });
  assertEquals([broken.status, await broken.json()], [502, { error: "google_error" }]);
});
