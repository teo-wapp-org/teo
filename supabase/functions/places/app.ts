// Edge Function `places` (verify_jwt = true): Google Places API (New) para el panel del comercio.
// La key vive en Vault (secreto google_places_api_key) y nunca llega a Next ni al navegador.
//
//   POST /places/search   { org_id, query }     → { places: [{ id, displayName, formattedAddress }] }
//   POST /places/details  { org_id, place_id }  → { place: { id, displayName, formattedAddress, ... } }
//
// Errores: 400 entrada_invalida · 401 no_autenticado · 403 sin_acceso (no es miembro del comercio)
//          503 places_no_disponible (ajuste places.enabled=false o sin key) · 502 google_error
// Devuelve el JSON de Google tal cual (con field mask acotado); la conversión a borrador de tienda
// es pura y vive en Next (web/src/lib/places-map.ts).
import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { z } from "zod";
import { ConfigStore, type RpcClient } from "../_shared/config.ts";

export const PLACES_BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 8_000;
export const SEARCH_FIELDS = "places.id,places.displayName,places.formattedAddress";
export const DETAIL_FIELDS =
  "id,displayName,formattedAddress,shortFormattedAddress,addressComponents,location,nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours";

export type PlacesDeps = {
  db: RpcClient; // service role: config y secreto
  userDb: (authHeader: string) => RpcClient; // con el JWT del usuario: is_org_member
  fetch?: typeof fetch;
  config?: ConfigStore;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

const searchBody = z.object({ org_id: z.string().uuid(), query: z.string().trim().min(3).max(120) });
const detailsBody = z.object({ org_id: z.string().uuid(), place_id: z.string().regex(/^[A-Za-z0-9_-]{10,300}$/) });

export function createPlacesApp(deps: PlacesDeps) {
  const f = deps.fetch ?? fetch;
  const store = deps.config ?? new ConfigStore();
  const log = deps.log ?? (() => {});

  const app = new Hono().basePath("/places");
  app.use("*", cors({ origin: "*", allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"], allowMethods: ["POST", "OPTIONS"] }));
  app.onError((err, c) => {
    log("places_error", { error: String(err).slice(0, 300) });
    return c.json({ error: "error_interno" }, 500);
  });

  /** Miembro del comercio (con su token) + Places habilitado y con key. */
  async function guard(authHeader: string | undefined, orgId: string) {
    if (!authHeader?.startsWith("Bearer ")) return { error: "no_autenticado", status: 401 as const };
    const { data, error } = await deps.userDb(authHeader).rpc("is_org_member", { p_org: orgId });
    if (error || data !== true) return { error: "sin_acceso", status: 403 as const };
    const cfg = await store.load(deps.db);
    const key = cfg.places.enabled ? await store.secret(deps.db, "google_places_api_key") : null;
    if (!key) return { error: "places_no_disponible", status: 503 as const };
    return { key };
  }

  async function google(url: string, key: string, fieldMask: string, init: RequestInit = {}) {
    const res = await f(url, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMask },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      log("google_error", { status: res.status });
      return null;
    }
    return await res.json();
  }

  app.post("/search", async (c) => {
    const parsed = searchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "entrada_invalida" }, 400);
    const g = await guard(c.req.header("authorization"), parsed.data.org_id);
    if ("error" in g) return c.json({ error: g.error }, g.status);
    const json = await google(`${PLACES_BASE}/places:searchText`, g.key, SEARCH_FIELDS, {
      method: "POST",
      body: JSON.stringify({ textQuery: parsed.data.query, languageCode: "es", regionCode: "EC", pageSize: 5 }),
    });
    if (!json) return c.json({ error: "google_error" }, 502);
    return c.json({ places: Array.isArray(json.places) ? json.places : [] });
  });

  app.post("/details", async (c) => {
    const parsed = detailsBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "entrada_invalida" }, 400);
    const g = await guard(c.req.header("authorization"), parsed.data.org_id);
    if ("error" in g) return c.json({ error: g.error }, g.status);
    const json = await google(`${PLACES_BASE}/places/${encodeURIComponent(parsed.data.place_id)}?languageCode=es&regionCode=EC`, g.key, DETAIL_FIELDS);
    if (!json) return c.json({ error: "google_error" }, 502);
    return c.json({ place: json });
  });

  return app;
}
