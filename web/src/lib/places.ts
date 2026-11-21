import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlaceId, mapSearchResults, placeToStoreDraft, type PlaceSearchResult, type PlacesPlace, type StoreDraft } from "@/lib/places-map";

/**
 * Google Places vía la Edge Function `places` (la key vive en Vault y nunca llega a Next ni al navegador).
 * Se invoca con el cliente del usuario: la función valida que sea miembro del comercio.
 * FICHA §9.2: los datos importados son una sugerencia que el comercio revisa y confirma; solo el place_id se guarda tal cual.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cualquier cliente tipado de Supabase
type AnyClient = SupabaseClient<any, any, any>;

export async function searchPlaces(supabase: AnyClient, orgId: string, query: string): Promise<PlaceSearchResult[]> {
  const { data, error } = await supabase.functions.invoke("places/search", { body: { org_id: orgId, query } });
  if (error) throw error;
  return mapSearchResults(data);
}

export async function getPlaceDraft(supabase: AnyClient, orgId: string, placeId: string): Promise<StoreDraft> {
  if (!isPlaceId(placeId)) throw new Error("invalid place id");
  const { data, error } = await supabase.functions.invoke<{ place: PlacesPlace }>("places/details", { body: { org_id: orgId, place_id: placeId } });
  if (error || !data?.place) throw error ?? new Error("places details vacío");
  return placeToStoreDraft(data.place);
}
