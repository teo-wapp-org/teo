/** Conversión pura de respuestas de Google Places (API New) a borradores de tienda. Se prueba con Vitest. */
import { placesPeriodsToHours, type PlacesPeriod, type WeekHours } from "@/lib/hours";

export type PlaceSearchResult = { id: string; name: string; address: string };

export type StoreDraft = {
  name: string;
  address: string;
  city: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  hours: WeekHours;
  google_place_id: string;
};

export type PlacesPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: { periods?: PlacesPeriod[] };
};

export function mapSearchResults(json: unknown): PlaceSearchResult[] {
  const places = (json as { places?: PlacesPlace[] } | null)?.places ?? [];
  return places
    .filter((p) => p.id)
    .map((p) => ({ id: p.id!, name: p.displayName?.text ?? "Sin nombre", address: p.formattedAddress ?? "" }));
}

export function placeToStoreDraft(p: PlacesPlace): StoreDraft {
  const comp = (type: string) => p.addressComponents?.find((c) => c.types?.includes(type))?.longText;
  return {
    name: (p.displayName?.text ?? "").slice(0, 120),
    address: (p.shortFormattedAddress ?? p.formattedAddress ?? "").slice(0, 300),
    city: (comp("locality") ?? comp("administrative_area_level_2") ?? "").slice(0, 80),
    phone: (p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? "").slice(0, 30),
    lat: typeof p.location?.latitude === "number" ? p.location.latitude : null,
    lng: typeof p.location?.longitude === "number" ? p.location.longitude : null,
    hours: placesPeriodsToHours(p.regularOpeningHours?.periods),
    google_place_id: p.id ?? "",
  };
}

/** Los place_id de Google son alfanuméricos con - y _. */
export const isPlaceId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{10,300}$/.test(id);
