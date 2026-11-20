import { describe, expect, it } from "vitest";
import { isPlaceId, mapSearchResults, placeToStoreDraft } from "./places-map";

describe("Google Places → tienda", () => {
  it("mapea resultados de búsqueda", () => {
    expect(
      mapSearchResults({ places: [{ id: "ChIJabc123456", displayName: { text: "Café Ñandú" }, formattedAddress: "Av. Amazonas, Quito" }, { displayName: { text: "sin id" } }] }),
    ).toEqual([{ id: "ChIJabc123456", name: "Café Ñandú", address: "Av. Amazonas, Quito" }]);
    expect(mapSearchResults({})).toEqual([]);
  });

  it("arma el borrador con horario, ciudad y coordenadas", () => {
    const d = placeToStoreDraft({
      id: "ChIJabc123456",
      displayName: { text: "Café Ñandú" },
      formattedAddress: "Av. Amazonas N24, Quito 170143, Ecuador",
      shortFormattedAddress: "Av. Amazonas N24, Quito",
      addressComponents: [
        { longText: "Quito", types: ["locality", "political"] },
        { longText: "Pichincha", types: ["administrative_area_level_1"] },
      ],
      location: { latitude: -0.2, longitude: -78.5 },
      internationalPhoneNumber: "+593 2-222-2222",
      regularOpeningHours: { periods: [{ open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }] },
    });
    expect(d).toMatchObject({
      name: "Café Ñandú",
      address: "Av. Amazonas N24, Quito",
      city: "Quito",
      phone: "+593 2-222-2222",
      lat: -0.2,
      lng: -78.5,
      google_place_id: "ChIJabc123456",
    });
    expect(d.hours.lun).toEqual([{ open: "08:00", close: "17:00" }]);
    expect(d.hours.dom).toEqual([]);
  });

  it("tolera datos faltantes", () => {
    const d = placeToStoreDraft({ id: "ChIJabc123456" });
    expect(d).toMatchObject({ name: "", address: "", city: "", phone: "", lat: null, lng: null, hours: {} });
  });

  it("valida place_id", () => {
    expect(isPlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(true);
    expect(isPlaceId("../../etc")).toBe(false);
    expect(isPlaceId(42)).toBe(false);
  });
});
