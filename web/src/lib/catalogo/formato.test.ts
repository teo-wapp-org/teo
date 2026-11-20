import { describe, expect, it } from "vitest";
import { formatUSD, isPhotoPathFor, photoError, publicPhotoUrl, remainingProducts, sanitizeSearch } from "./formato";
import { attributesToList, listToAttributes, parseIntInput, parseMoneyInput, productSchema } from "./producto";

const ORG = "11111111-1111-4111-8111-111111111111";
const PROD = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";

describe("formatUSD", () => {
  it("usa el formato de Ecuador", () => {
    expect(formatUSD(1234.5).replace(/\s/g, " ")).toMatch(/1\.234,50/);
    expect(formatUSD(null)).toBe("—");
  });
});

describe("fotos", () => {
  it("valida la ruta {org}/{producto}/{uuid}.{ext}", () => {
    expect(isPhotoPathFor(`${ORG}/${PROD}/${FILE}.png`, ORG, PROD)).toBe(true);
    expect(isPhotoPathFor(`${ORG}/${PROD}/../x/${FILE}.png`, ORG, PROD)).toBe(false);
    expect(isPhotoPathFor(`${PROD}/${ORG}/${FILE}.png`, ORG, PROD)).toBe(false);
    expect(isPhotoPathFor(`${ORG}/${PROD}/${FILE}.gif`, ORG, PROD)).toBe(false);
  });

  it("valida tipo y tamaño", () => {
    expect(photoError({ name: "a.png", type: "image/png", size: 1000 })).toBeNull();
    expect(photoError({ name: "a.gif", type: "image/gif", size: 1000 })).toMatch(/JPG/);
    expect(photoError({ name: "a.jpg", type: "image/jpeg", size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });

  it("arma la URL pública", () => {
    expect(publicPhotoUrl("a/b c.png", "https://x.supabase.co")).toBe("https://x.supabase.co/storage/v1/object/public/catalogo/a/b%20c.png");
  });
});

describe("búsqueda y cupo", () => {
  it("limpia caracteres especiales de PostgREST", () => {
    expect(sanitizeSearch(" torta, (grande)%  ")).toBe("torta grande");
    expect(sanitizeSearch("TOR-001.2")).toBe("TOR-001.2");
  });
  it("calcula productos restantes", () => {
    expect(remainingProducts({ maxProducts: 30, used: 28 })).toBe(2);
    expect(remainingProducts({ maxProducts: 30, used: 40 })).toBe(0);
    expect(remainingProducts({ maxProducts: null, used: 40 })).toBe(Infinity);
  });
});

describe("producto", () => {
  const base = {
    id: PROD, name: " Torta ", description: "", price: 18.499, categoryId: null, sku: "", stock: null, active: true,
    attributes: [{ key: "Sabor", value: "Chocolate" }], variants: [{ name: "Grande", price: null, stock: 3, active: true }], photos: [],
  };
  it("normaliza nombre y redondea precio", () => {
    const r = productSchema.parse(base);
    expect(r.name).toBe("Torta");
    expect(r.price).toBe(18.5);
  });
  it("rechaza variantes y atributos repetidos", () => {
    expect(productSchema.safeParse({ ...base, variants: [...base.variants, { ...base.variants[0], name: "grande" }] }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, attributes: [...base.attributes, { key: "sabor", value: "x" }] }).success).toBe(false);
  });
  it("convierte atributos", () => {
    expect(attributesToList({ a: "1", b: 2 })).toEqual([{ key: "a", value: "1" }, { key: "b", value: "2" }]);
    expect(attributesToList(null)).toEqual([]);
    expect(listToAttributes([{ key: " a ", value: " 1 " }])).toEqual({ a: "1" });
  });
  it("lee montos y enteros escritos a mano", () => {
    expect(parseMoneyInput("12,50")).toBe(12.5);
    expect(parseMoneyInput("$1,200.00")).toBe(1200);
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNaN();
    expect(parseIntInput("4")).toBe(4);
    expect(parseIntInput("")).toBeNull();
    expect(parseIntInput("4.5")).toBeNaN();
  });
});
