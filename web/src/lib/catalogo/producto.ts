/** Esquema del formulario de producto (compartido por el cliente y la Server Action). */
import { z } from "zod";

const money = z
  .number({ error: "Ingresa un precio válido." })
  .min(0, "El precio no puede ser negativo.")
  .max(9_999_999_999.99, "El precio es demasiado alto.")
  .transform((n) => Math.round(n * 100) / 100);

const stock = z.number().int("El stock debe ser un número entero.").min(0, "El stock no puede ser negativo.").max(2_147_483_647).nullable();

export const variantSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Cada variante necesita un nombre.").max(120, "El nombre de la variante es muy largo."),
  price: money.nullable(),
  stock,
  active: z.boolean(),
});

export const attributeSchema = z.object({
  key: z.string().trim().min(1, "Cada atributo necesita un nombre.").max(60),
  value: z.string().trim().max(300),
});

export const productSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1, "Escribe el nombre del producto.").max(200, "El nombre supera 200 caracteres."),
    description: z.string().trim().max(5000, "La descripción supera 5000 caracteres."),
    price: money,
    categoryId: z.uuid().nullable(),
    sku: z.string().trim().max(64, "El SKU supera 64 caracteres."),
    stock,
    active: z.boolean(),
    attributes: z.array(attributeSchema).max(30, "Máximo 30 atributos."),
    variants: z.array(variantSchema).max(100, "Máximo 100 variantes."),
    photos: z.array(z.string().min(1).max(300)).max(10, "Máximo 10 fotos."),
  })
  .superRefine((p, ctx) => {
    const keys = new Set<string>();
    for (const a of p.attributes) {
      const k = a.key.toLowerCase();
      if (keys.has(k)) ctx.addIssue({ code: "custom", message: `El atributo “${a.key}” está repetido.`, path: ["attributes"] });
      keys.add(k);
    }
    const names = new Set<string>();
    for (const v of p.variants) {
      const k = v.name.toLowerCase();
      if (names.has(k)) ctx.addIssue({ code: "custom", message: `La variante “${v.name}” está repetida.`, path: ["variants"] });
      names.add(k);
    }
  });

export type ProductInput = z.input<typeof productSchema>;
export type ProductData = z.output<typeof productSchema>;

/** Atributos jsonb ↔ lista clave/valor. */
export function attributesToList(attrs: unknown): { key: string; value: string }[] {
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return [];
  return Object.entries(attrs as Record<string, unknown>).map(([key, value]) => ({ key, value: value == null ? "" : String(value) }));
}

export function listToAttributes(list: { key: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(list.map((a) => [a.key.trim(), a.value.trim()]));
}

/** "12,50" o "12.50" → 12.5; vacío → null; inválido → NaN. */
export function parseMoneyInput(s: string): number | null {
  const t = s.trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!t) return null;
  const norm = t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(norm) ? Number(norm) : Number.NaN;
}

/** Entero ≥ 0; vacío → null; inválido → NaN. */
export function parseIntInput(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}
