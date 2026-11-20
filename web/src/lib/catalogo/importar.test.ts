import { describe, expect, it } from "vitest";
import {
  detectMapping,
  mappingErrors,
  normalizeHeader,
  parseActive,
  parsePrice,
  parseStock,
  TEMPLATE_CSV,
  toPayload,
  toTable,
  validateImport,
} from "./importar";

describe("normalizeHeader", () => {
  it("quita tildes, mayúsculas y signos", () => {
    expect(normalizeHeader("  Descripción*  ")).toBe("descripcion");
    expect(normalizeHeader("Precio_Unitario")).toBe("precio unitario");
  });
});

describe("detectMapping", () => {
  it("detecta columnas en español e inglés", () => {
    expect(detectMapping(["Nombre", "Precio", "Descripción", "Categoría", "SKU", "Stock", "Activo"])).toEqual({
      name: 0, price: 1, description: 2, category: 3, sku: 4, stock: 5, active: 6,
    });
    expect(detectMapping(["product", "price", "code"])).toEqual({ name: 0, price: 1, sku: 2 });
  });

  it("usa coincidencias parciales y no repite columnas", () => {
    const m = detectMapping(["Código", "Nombre del producto", "Precio de venta USD", "Otra"]);
    expect(m).toEqual({ sku: 0, name: 1, price: 2 });
  });

  it("no inventa columnas", () => {
    expect(detectMapping(["foo", "bar"])).toEqual({});
  });
});

describe("mappingErrors", () => {
  it("exige nombre y precio", () => {
    expect(mappingErrors({})).toHaveLength(2);
    expect(mappingErrors({ name: 0, price: 1 })).toEqual([]);
  });
  it("detecta una columna usada dos veces", () => {
    expect(mappingErrors({ name: 0, price: 0 })[0]).toMatch(/misma columna/);
  });
});

describe("parsePrice", () => {
  it.each([
    ["12.50", 12.5],
    ["12,50", 12.5],
    ["$ 18", 18],
    ["USD 15.75", 15.75],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["1,234", 1234],
    ["1.234.567", 1234567],
    ["0", 0],
    ["3.456", 3.46],
  ])("%s → %s", (raw, expected) => {
    expect(parsePrice(raw)).toBe(expected);
  });

  it.each(["", "abc", "-5", "12..5", "1.2.3", "1e5"])("rechaza %s", (raw) => {
    expect(parsePrice(raw)).toBeNull();
  });
});

describe("parseStock", () => {
  it("acepta enteros y vacíos", () => {
    expect(parseStock("10")).toEqual({ ok: true, value: 10 });
    expect(parseStock("10.0")).toEqual({ ok: true, value: 10 });
    expect(parseStock("")).toEqual({ ok: true, value: undefined });
    expect(parseStock("Ilimitado")).toEqual({ ok: true, value: undefined });
  });
  it("rechaza negativos y decimales", () => {
    expect(parseStock("-1").ok).toBe(false);
    expect(parseStock("2.5").ok).toBe(false);
    expect(parseStock("muchos").ok).toBe(false);
  });
});

describe("parseActive", () => {
  it("entiende sí/no y variantes", () => {
    expect(parseActive("Sí")).toBe(true);
    expect(parseActive("TRUE")).toBe(true);
    expect(parseActive("1")).toBe(true);
    expect(parseActive("no")).toBe(false);
    expect(parseActive("Inactivo")).toBe(false);
    expect(parseActive("")).toBeUndefined();
    expect(parseActive("tal vez")).toBeNull();
  });
});

describe("toTable", () => {
  it("toma la primera fila no vacía como encabezado, omite filas vacías y conserva el número de fila", () => {
    const t = toTable([[], ["nombre", "precio", ""], ["Torta", 18, null], ["", "", ""], ["Pan", "0,50"]]);
    expect(t.headers).toEqual(["nombre", "precio"]);
    expect(t.rows).toEqual([
      { line: 3, cells: ["Torta", "18"] },
      { line: 5, cells: ["Pan", "0,50"] },
    ]);
  });

  it("convierte fechas y booleanos de Excel", () => {
    const t = toTable([["nombre", "activo", "fecha"], ["A", true, new Date("2026-01-02T00:00:00Z")]]);
    expect(t.rows[0].cells).toEqual(["A", "sí", "2026-01-02"]);
  });

  it("archivo vacío", () => {
    expect(toTable([])).toEqual({ headers: [], rows: [] });
  });
});

describe("validateImport", () => {
  const table = toTable([
    ["Nombre", "Precio", "SKU", "Stock", "Activo", "Categoría"],
    ["Torta", "18,50", "T-1", "5", "sí", "Tortas"],
    ["", "abc", "T-2", "-1", "quizás", ""],
    ["Pan", "0.50", "t-1", "", "", ""],
    ["", "", "", "", "", ""],
  ]);
  const rows = validateImport(table, detectMapping(table.headers));

  it("acepta filas válidas y normaliza valores", () => {
    expect(rows[0]).toEqual({
      line: 2,
      errors: [],
      data: { name: "Torta", price: 18.5, sku: "T-1", stock: 5, active: true, category: "Tortas" },
    });
  });

  it("reporta todos los errores de una fila", () => {
    expect(rows[1].errors).toHaveLength(4);
    expect(rows[1].errors.join(" ")).toMatch(/nombre/);
    expect(rows[1].errors.join(" ")).toMatch(/Precio no válido/);
  });

  it("detecta SKU repetido en el archivo (sin distinguir mayúsculas)", () => {
    expect(rows[2].errors).toEqual(["SKU repetido en el archivo (fila 2)."]);
  });

  it("toPayload solo envía filas válidas", () => {
    expect(toPayload(rows)).toEqual([{ line: 2, name: "Torta", price: 18.5, sku: "T-1", stock: 5, active: true, category: "Tortas" }]);
  });

  it("la plantilla es válida", () => {
    const lines = TEMPLATE_CSV.split("\n").map((l) => l.split(","));
    const t = toTable(lines);
    const m = detectMapping(t.headers);
    expect(mappingErrors(m)).toEqual([]);
    expect(validateImport(t, m).every((r) => r.errors.length === 0)).toBe(true);
  });
});
