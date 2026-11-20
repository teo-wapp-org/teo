/**
 * Importación de catálogo (CSV/Excel): lógica pura de tabla → mapeo → validación.
 * Se usa en el navegador (vista previa) y en el servidor (revalidación del lote).
 */
import { z } from "zod";

export const IMPORT_FIELDS = [
  { key: "name", label: "Nombre", required: true },
  { key: "price", label: "Precio", required: true },
  { key: "description", label: "Descripción", required: false },
  { key: "category", label: "Categoría", required: false },
  { key: "sku", label: "SKU", required: false },
  { key: "stock", label: "Stock", required: false },
  { key: "active", label: "Activo", required: false },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
/** Campo → índice de columna del archivo. */
export type ColumnMapping = Partial<Record<ImportField, number>>;

export type Table = { headers: string[]; rows: { line: number; cells: string[] }[] };

/** Datos de una fila. `undefined` = la celda vino vacía o la columna no se mapeó (al actualizar, se conserva lo que había). */
export type ImportRowData = {
  name: string;
  price: number;
  description?: string;
  category?: string;
  sku?: string;
  stock?: number;
  active?: boolean;
};

export type ImportRow = { line: number; data: Partial<ImportRowData>; errors: string[] };

export const MAX_IMPORT_ROWS = 2000;

const SYNONYMS: Record<ImportField, string[]> = {
  name: ["nombre", "producto", "nombre del producto", "name", "product", "titulo", "articulo", "item"],
  price: ["precio", "price", "pvp", "valor", "precio unitario", "precio venta", "precio de venta", "costo"],
  description: ["descripcion", "description", "detalle", "detalles", "desc"],
  category: ["categoria", "category", "tipo", "linea", "familia", "seccion"],
  sku: ["sku", "codigo", "cod", "code", "referencia", "ref", "codigo de barras"],
  stock: ["stock", "inventario", "existencias", "cantidad", "unidades", "disponible", "qty"],
  active: ["activo", "active", "estado", "disponible para venta", "visible", "habilitado"],
};

/** Minúsculas, sin tildes, sin signos ni espacios extra. */
export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[*_\-./()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Propone un mapeo según los nombres de columna (coincidencia exacta primero, luego parcial). */
export function detectMapping(headers: string[]): ColumnMapping {
  const norm = headers.map(normalizeHeader);
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  const fields = IMPORT_FIELDS.map((f) => f.key);

  for (const pass of ["exact", "partial"] as const) {
    for (const field of fields) {
      if (mapping[field] !== undefined) continue;
      const idx = norm.findIndex((h, i) => {
        if (used.has(i) || !h) return false;
        return SYNONYMS[field].some((s) => (pass === "exact" ? h === s : h.startsWith(`${s} `) || h.endsWith(` ${s}`)));
      });
      if (idx >= 0) {
        mapping[field] = idx;
        used.add(idx);
      }
    }
  }
  return mapping;
}

/** Errores del mapeo en sí (faltan obligatorios o una columna usada dos veces). */
export function mappingErrors(mapping: ColumnMapping): string[] {
  const errors: string[] = [];
  for (const f of IMPORT_FIELDS) {
    if (f.required && mapping[f.key] === undefined) errors.push(`Elige la columna de “${f.label}”.`);
  }
  const seen = new Map<number, string>();
  for (const f of IMPORT_FIELDS) {
    const col = mapping[f.key];
    if (col === undefined) continue;
    const prev = seen.get(col);
    if (prev) errors.push(`“${prev}” y “${f.label}” usan la misma columna.`);
    else seen.set(col, f.label);
  }
  return errors;
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "sí" : "no";
  return String(v).trim();
}

/**
 * Convierte una matriz (de papaparse o read-excel-file) en encabezados + filas.
 * La primera fila no vacía es el encabezado. `line` es el número de fila del archivo (1 = encabezado).
 */
export function toTable(matrix: unknown[][]): Table {
  const rows = matrix.map((r, i) => ({ line: i + 1, cells: (Array.isArray(r) ? r : []).map(cellToString) }));
  const nonEmpty = rows.filter((r) => r.cells.some((c) => c !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [head, ...body] = nonEmpty;
  let width = head.cells.length;
  while (width > 0 && head.cells[width - 1] === "") width--;
  const headers = head.cells.slice(0, width).map((h, i) => h || `Columna ${i + 1}`);
  return { headers, rows: body.map((r) => ({ line: r.line, cells: r.cells.slice(0, Math.max(width, 1)) })) };
}

/**
 * Precio en formatos comunes: "12.50", "12,50", "$1.234,50", "1,234.50", "USD 15".
 * Devuelve null si no es un número válido ≥ 0. Redondea a 2 decimales.
 */
export function parsePrice(raw: string): number | null {
  let s = raw.replace(/usd|\$|\s/gi, "");
  if (!s || !/^[0-9.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // el último separador es el decimal
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    // solo comas: "1,234" o "1,234,567" = miles; "12,5" o "12,50" = decimal
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.split(",").join("") : s.replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    // "1.234.567" = miles
    s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.split(".").join("") : "x";
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  if (!Number.isFinite(n) || n < 0 || n >= 1e10) return null;
  return n;
}

/** Stock: vacío = no se informa; entero ≥ 0; "no", "ilimitado", "-" = no controlar (sin valor). */
export function parseStock(raw: string): { ok: true; value: number | undefined } | { ok: false } {
  const s = normalizeHeader(raw);
  if (!s || s === "-" || ["no", "ilimitado", "sin control", "n a", "na"].includes(s)) return { ok: true, value: undefined };
  const clean = raw.replace(/\s/g, "").replace(/[.,]0+$/, "");
  if (!/^\d+$/.test(clean)) return { ok: false };
  const n = Number(clean);
  if (n > 2_147_483_647) return { ok: false };
  return { ok: true, value: n };
}

const TRUE_VALUES = ["si", "s", "yes", "y", "true", "verdadero", "1", "activo", "activa", "x", "disponible", "habilitado"];
const FALSE_VALUES = ["no", "n", "false", "falso", "0", "inactivo", "inactiva", "agotado", "oculto", "deshabilitado"];

/** Activo: sí/no, true/false, 1/0, activo/inactivo. undefined = vacío; null = valor no reconocido. */
export function parseActive(raw: string): boolean | undefined | null {
  const s = normalizeHeader(raw);
  if (!s) return undefined;
  if (TRUE_VALUES.includes(s)) return true;
  if (FALSE_VALUES.includes(s)) return false;
  return null;
}

/** Valida cada fila según el mapeo. Las filas con `errors` vacíos están listas para importar. */
export function validateImport(table: Table, mapping: ColumnMapping): ImportRow[] {
  const cell = (cells: string[], f: ImportField) => {
    const i = mapping[f];
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };
  const skuLines = new Map<string, number>();

  return table.rows.map(({ line, cells }) => {
    const errors: string[] = [];
    const data: Partial<ImportRowData> = {};

    const name = cell(cells, "name");
    if (!name) errors.push("Falta el nombre.");
    else if (name.length > 200) errors.push("El nombre supera 200 caracteres.");
    else data.name = name;

    const rawPrice = cell(cells, "price");
    if (!rawPrice) errors.push("Falta el precio.");
    else {
      const price = parsePrice(rawPrice);
      if (price === null) errors.push(`Precio no válido: “${rawPrice}”.`);
      else data.price = price;
    }

    const description = cell(cells, "description");
    if (description) {
      if (description.length > 5000) errors.push("La descripción supera 5000 caracteres.");
      else data.description = description;
    }

    const category = cell(cells, "category");
    if (category) {
      if (category.length > 80) errors.push("La categoría supera 80 caracteres.");
      else data.category = category;
    }

    const sku = cell(cells, "sku");
    if (sku) {
      if (sku.length > 64) errors.push("El SKU supera 64 caracteres.");
      else {
        const key = sku.toLowerCase();
        const prev = skuLines.get(key);
        if (prev !== undefined) errors.push(`SKU repetido en el archivo (fila ${prev}).`);
        else skuLines.set(key, line);
        data.sku = sku;
      }
    }

    const rawStock = cell(cells, "stock");
    const stock = parseStock(rawStock);
    if (!stock.ok) errors.push(`Stock no válido: “${rawStock}” (usa un número entero o déjalo vacío).`);
    else if (stock.value !== undefined) data.stock = stock.value;

    const rawActive = cell(cells, "active");
    const active = parseActive(rawActive);
    if (active === null) errors.push(`“Activo” no válido: “${rawActive}” (usa sí o no).`);
    else if (active !== undefined) data.active = active;

    return { line, data, errors };
  });
}

/** Esquema con el que el servidor revalida cada fila recibida. */
export const importRowSchema = z.object({
  line: z.number().int().min(1),
  name: z.string().trim().min(1).max(200),
  price: z.number().min(0).max(9_999_999_999.99),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().max(80).optional(),
  sku: z.string().trim().min(1).max(64).optional(),
  stock: z.number().int().min(0).max(2_147_483_647).optional(),
  active: z.boolean().optional(),
});
export type ImportPayloadRow = z.infer<typeof importRowSchema>;

/** Filas válidas listas para enviar al servidor. */
export function toPayload(rows: ImportRow[]): ImportPayloadRow[] {
  return rows.filter((r) => r.errors.length === 0).map((r) => ({ line: r.line, ...(r.data as ImportRowData) }));
}

export const TEMPLATE_CSV = [
  "nombre,precio,descripcion,categoria,sku,stock,activo",
  "Torta de chocolate,18.50,Bizcocho húmedo con ganache,Tortas,TOR-001,10,sí",
  "Cheesecake de maracuyá,22.00,Porción para 8 personas,Tortas,TOR-002,,sí",
  "Café americano,1.75,Taza de 12 oz,Bebidas,BEB-001,,sí",
].join("\n");
