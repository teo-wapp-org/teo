import "server-only";
import { isPlaceId, mapSearchResults, placeToStoreDraft, type PlaceSearchResult, type PlacesPlace, type StoreDraft } from "@/lib/places-map";

/**
 * Google Places API (New), solo servidor. La clave GOOGLE_PLACES_API_KEY nunca llega al navegador.
 * FICHA §9.2: los datos importados son una sugerencia que el comercio revisa y confirma; solo el place_id se guarda tal cual.
 */
const BASE = "https://places.googleapis.com/v1";
const key = () => process.env.GOOGLE_PLACES_API_KEY;

export const placesConfigured = () => Boolean(key());

export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  const res = await fetch(`${BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key()!,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "es", regionCode: "EC", pageSize: 5 }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`places search ${res.status}`);
  return mapSearchResults(await res.json());
}

export async function getPlaceDraft(placeId: string): Promise<StoreDraft> {
  if (!isPlaceId(placeId)) throw new Error("invalid place id");
  const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=es&regionCode=EC`, {
    headers: {
      "X-Goog-Api-Key": key()!,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,shortFormattedAddress,addressComponents,location,nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`places details ${res.status}`);
  return placeToStoreDraft((await res.json()) as PlacesPlace);
}
