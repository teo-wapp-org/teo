"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATALOGO_BUCKET, isPhotoPathFor, remainingProducts } from "@/lib/catalogo/formato";
import { importRowSchema, MAX_IMPORT_ROWS, type ImportPayloadRow } from "@/lib/catalogo/importar";
import { listToAttributes, productSchema } from "@/lib/catalogo/producto";
import { getPlanQuota, requireCatalog } from "@/lib/data/catalogo";
import { createClient } from "@/lib/supabase/server";

type Fail = { ok: false; error: string; limit?: boolean };
const READ_ONLY: Fail = { ok: false, error: "Solo el dueño o un administrador del comercio pueden cambiar el catálogo." };

type DbError = { code?: string; message?: string } | null;

function limitMessage(max: number | null, planName: string) {
  return `Llegaste al límite de ${max ?? 0} productos de tu plan ${planName}. Sube de plan para agregar más.`;
}

function dbMessage(error: DbError, sku?: string | null): string {
  if (error?.code === "23505") return sku ? `Ya tienes otro producto con el SKU “${sku}”.` : "Ya existe un registro con esos datos.";
  if (error?.message?.includes("plan_limit_products")) return "Llegaste al límite de productos de tu plan. Sube de plan para agregar más.";
  if (error?.code === "23503") return "La categoría elegida ya no existe. Recarga la página.";
  return "No pudimos guardar los cambios. Inténtalo de nuevo.";
}

async function editor(slug: string) {
  const ctx = await requireCatalog(slug);
  return ctx.canEdit ? ctx : null;
}

function revalidateCatalog(slug: string) {
  revalidatePath(`/app/${slug}/catalogo`, "layout");
}

// ─────────────────────────────────────────────────────────────
// Productos
// ─────────────────────────────────────────────────────────────

export async function saveProduct(
  slug: string,
  input: unknown,
  mode: "create" | "update",
): Promise<{ ok: true; id: string } | (Fail & { id?: string })> {
  const ctx = await editor(slug);
  if (!ctx) return READ_ONLY;
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const p = parsed.data;
  const orgId = ctx.org.id;
  if (p.photos.some((path) => !isPhotoPathFor(path, orgId, p.id))) return { ok: false, error: "Hay una foto con una ruta no válida." };

  const supabase = await createClient();
  const row = {
    org_id: orgId,
    name: p.name,
    description: p.description || null,
    price: p.price,
    category_id: p.categoryId,
    sku: p.sku || null,
    stock: p.stock,
    active: p.active,
    attributes: listToAttributes(p.attributes),
  };

  if (mode === "create") {
    const quota = await getPlanQuota(orgId);
    if (remainingProducts(quota) <= 0) return { ok: false, error: limitMessage(quota.maxProducts, quota.planName), limit: true };
    const { error } = await supabase.from("products").insert({ id: p.id, ...row });
    if (error) {
      const limit = error.message?.includes("plan_limit_products");
      return { ok: false, error: limit ? limitMessage(quota.maxProducts, quota.planName) : dbMessage(error, row.sku), limit };
    }
  } else {
    const { data, error } = await supabase.from("products").update(row).eq("id", p.id).eq("org_id", orgId).select("id");
    if (error) return { ok: false, error: dbMessage(error, row.sku) };
    if (!data?.length) return { ok: false, error: "No encontramos este producto. Puede que lo hayan eliminado." };
  }

  // Variantes: actualiza las existentes, crea las nuevas y borra las quitadas.
  const { data: currentVariants, error: e1 } = await supabase.from("product_variants").select("id").eq("product_id", p.id);
  if (e1) return { ok: false, error: dbMessage(e1), id: p.id };
  const existing = new Set((currentVariants ?? []).map((v) => v.id));
  const variants = p.variants.map((v, i) => ({
    id: v.id && existing.has(v.id) ? v.id : crypto.randomUUID(),
    org_id: orgId,
    product_id: p.id,
    name: v.name,
    price: v.price,
    stock: v.stock,
    active: v.active,
    sort_order: i,
  }));
  const keep = new Set(variants.map((v) => v.id));
  const removed = [...existing].filter((id) => !keep.has(id));
  if (removed.length) {
    const { error } = await supabase.from("product_variants").delete().in("id", removed);
    if (error) return { ok: false, error: dbMessage(error), id: p.id };
  }
  if (variants.length) {
    const { error } = await supabase.from("product_variants").upsert(variants, { onConflict: "id" });
    if (error) return { ok: false, error: dbMessage(error), id: p.id };
  }

  // Fotos: product_media refleja el orden enviado; se borran de Storage las que se quitaron.
  const { data: currentMedia, error: e2 } = await supabase.from("product_media").select("id, storage_path").eq("product_id", p.id);
  if (e2) return { ok: false, error: dbMessage(e2), id: p.id };
  if (currentMedia?.length) {
    const { error } = await supabase.from("product_media").delete().eq("product_id", p.id);
    if (error) return { ok: false, error: dbMessage(error), id: p.id };
  }
  if (p.photos.length) {
    const { error } = await supabase
      .from("product_media")
      .insert(p.photos.map((storage_path, sort_order) => ({ org_id: orgId, product_id: p.id, storage_path, sort_order })));
    if (error) return { ok: false, error: dbMessage(error), id: p.id };
  }
  const photosRemoved = (currentMedia ?? []).map((m) => m.storage_path).filter((path) => !p.photos.includes(path));
  if (photosRemoved.length) await supabase.storage.from(CATALOGO_BUCKET).remove(photosRemoved);

  revalidateCatalog(slug);
  return { ok: true, id: p.id };
}

/** Borra una foto recién subida que no llegó a guardarse (solo de la carpeta del producto). */
export async function discardUploadedPhoto(slug: string, productId: string, path: string): Promise<{ ok: boolean }> {
  const ctx = await editor(slug);
  if (!ctx || !z.uuid().safeParse(productId).success || !isPhotoPathFor(path, ctx.org.id, productId)) return { ok: false };
  const supabase = await createClient();
  const { data: used } = await supabase.from("product_media").select("id").eq("storage_path", path).limit(1);
  if (used?.length) return { ok: false }; // ya está guardada: se borra al guardar el producto
  const { error } = await supabase.storage.from(CATALOGO_BUCKET).remove([path]);
  return { ok: !error };
}

export async function deleteProduct(slug: string, productId: string): Promise<{ ok: true } | Fail> {
  const ctx = await editor(slug);
  if (!ctx) return READ_ONLY;
  if (!z.uuid().safeParse(productId).success) return { ok: false, error: "Producto no válido." };
  const supabase = await createClient();
  const orgId = ctx.org.id;

  const { data: media } = await supabase.from("product_media").select("storage_path").eq("product_id", productId).eq("org_id", orgId);
  const { data, error } = await supabase.from("products").delete().eq("id", productId).eq("org_id", orgId).select("id");
  if (error) return { ok: false, error: "No pudimos eliminar el producto. Inténtalo de nuevo." };
  if (!data?.length) return { ok: false, error: "No encontramos este producto." };

  // Archivos: los registrados y cualquier otro que haya quedado en la carpeta del producto.
  const folder = `${orgId}/${productId}`;
  const { data: files } = await supabase.storage.from(CATALOGO_BUCKET).list(folder, { limit: 1000 });
  const paths = new Set([...(media ?? []).map((m) => m.storage_path), ...(files ?? []).map((f) => `${folder}/${f.name}`)]);
  if (paths.size) await supabase.storage.from(CATALOGO_BUCKET).remove([...paths]);

  revalidateCatalog(slug);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Categorías
// ─────────────────────────────────────────────────────────────

const categoryName = z.string().trim().min(1, "Escribe el nombre de la categoría.").max(80, "El nombre es muy largo (máx. 80).");

export async function createCategory(slug: string, name: string): Promise<{ ok: true; category: { id: string; name: string } } | Fail> {
  const ctx = await editor(slug);
  if (!ctx) return READ_ONLY;
  const parsed = categoryName.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: all } = await supabase.from("product_categories").select("id, name, sort_order").eq("org_id", ctx.org.id);
  const same = all?.find((c) => c.name.toLowerCase() === parsed.data.toLowerCase());
  if (same) return { ok: true, category: { id: same.id, name: same.name } };
  const sort = Math.max(-1, ...(all ?? []).map((c) => c.sort_order)) + 1;
  const { data, error } = await supabase
    .from("product_categories")
    .insert({ org_id: ctx.org.id, name: parsed.data, sort_order: sort })
    .select("id, name")
    .single();
  if (error || !data) return { ok: false, error: dbMessage(error) };
  revalidateCatalog(slug);
  return { ok: true, category: data };
}

export async function renameCategory(slug: string, id: string, name: string): Promise<{ ok: true } | Fail> {
  const ctx = await editor(slug);
  if (!ctx) return READ_ONLY;
  const parsed = categoryName.safeParse(name);
  if (!parsed.success || !z.uuid().safeParse(id).success) return { ok: false, error: parsed.error?.issues[0].message ?? "Categoría no válida." };
  const supabase = await createClient();
  const { error } = await supabase.from("product_categories").update({ name: parsed.data }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) return { ok: false, error: error.code === "23505" ? `Ya tienes una categoría llamada “${parsed.data}”.` : dbMessage(error) };
  revalidateCatalog(slug);
  return { ok: true };
}

export async function reorderCategories(slug: string, ids: string[]): Promise<{ ok: true } | Fail> {
  const ctx = await editor(slug);
  if (!ctx) return READ_ONLY;
  const parsed = z.array(z.uuid()).max(500).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Orden no válido." };
  const supabase = await createClient();
  const results = await Promise.all(
    parsed.data.map((id, i) => supabase.from("product_categories").update({ sort_order: i }).eq("id", id).eq("org_id", ctx.org.id)),
  );
  if (results.some((r) => r.error)) return { ok: false, error: "No pudimos guardar el orden. Inténtalo de nuevo." };
  revalidateCatalog(slug);
  return { ok: true };
}

export async function deleteCategory(slug: string, id: string): Promise<{ ok: true } | Fail> {
  const ctx = await editor(slug);
  if (!ctx) return READ_ONLY;
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Categoría no válida." };
  const supabase = await createClient();
  const { error } = await supabase.from("product_categories").delete().eq("id", id).eq("org_id", ctx.org.id);
  if (error) return { ok: false, error: dbMessage(error) };
  revalidateCatalog(slug);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Importación
// ─────────────────────────────────────────────────────────────

export type ImportResult =
  | { ok: true; created: number; updated: number; failed: { line: number; message: string }[] }
  | Fail;

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function importProducts(slug: string, input: unknown): Promise<ImportResult> {
  const ctx = await editor(slug);
  if (!ctx) return READ_ONLY;
  const parsed = z.array(importRowSchema).min(1, "No hay filas válidas para importar.").max(MAX_IMPORT_ROWS, `Importa como máximo ${MAX_IMPORT_ROWS} filas por archivo.`).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const rows = parsed.data;
  const orgId = ctx.org.id;
  const quota = await getPlanQuota(orgId);
  if (!quota.canImport) return { ok: false, error: `Tu plan ${quota.planName} no incluye importar catálogo. Sube de plan para usarlo.`, limit: true };

  const supabase = await createClient();
  const failed: { line: number; message: string }[] = [];

  // Productos existentes por SKU (upsert por sku)
  const skus = [...new Set(rows.map((r) => r.sku).filter((s): s is string => Boolean(s)))];
  type Existing = { id: string; sku: string | null; description: string | null; category_id: string | null; stock: number | null; active: boolean };
  const bySku = new Map<string, Existing>();
  for (const part of chunk(skus, 150)) {
    const { data, error } = await supabase.from("products").select("id, sku, description, category_id, stock, active").eq("org_id", orgId).in("sku", part);
    if (error) return { ok: false, error: "No pudimos leer tu catálogo actual. Inténtalo de nuevo." };
    for (const p of data ?? []) if (p.sku) bySku.set(p.sku, p);
  }

  const toCreate = rows.filter((r) => !r.sku || !bySku.has(r.sku));
  const toUpdate = rows.filter((r) => r.sku && bySku.has(r.sku));
  const remaining = remainingProducts(quota);
  if (toCreate.length > remaining) {
    return {
      ok: false,
      limit: true,
      error: `Este archivo crearía ${toCreate.length} productos nuevos, pero a tu plan ${quota.planName} le quedan ${remaining} de ${quota.maxProducts}. Sube de plan o quita filas.`,
    };
  }

  // Categorías: reutiliza las existentes (sin distinguir mayúsculas) y crea las que falten.
  const { data: cats, error: catErr } = await supabase.from("product_categories").select("id, name, sort_order").eq("org_id", orgId);
  if (catErr) return { ok: false, error: "No pudimos leer tus categorías. Inténtalo de nuevo." };
  const catId = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c.id]));
  const newCats = new Map<string, string>();
  for (const r of rows) if (r.category && !catId.has(r.category.toLowerCase())) newCats.set(r.category.toLowerCase(), r.category);
  if (newCats.size) {
    let sort = Math.max(-1, ...(cats ?? []).map((c) => c.sort_order)) + 1;
    const { data: created, error } = await supabase
      .from("product_categories")
      .insert([...newCats.values()].map((name) => ({ org_id: orgId, name, sort_order: sort++ })))
      .select("id, name");
    if (error) return { ok: false, error: "No pudimos crear las categorías nuevas. Inténtalo de nuevo." };
    for (const c of created ?? []) catId.set(c.name.toLowerCase(), c.id);
  }
  const category = (r: ImportPayloadRow) => (r.category ? (catId.get(r.category.toLowerCase()) ?? null) : undefined);

  const newRows = toCreate.map((r) => ({
    line: r.line,
    row: {
      org_id: orgId,
      name: r.name,
      price: r.price,
      description: r.description ?? null,
      category_id: category(r) ?? null,
      sku: r.sku ?? null,
      stock: r.stock ?? null,
      active: r.active ?? true,
    },
  }));
  const updRows = toUpdate.map((r) => {
    const ex = bySku.get(r.sku!)!;
    const cat = category(r);
    return {
      line: r.line,
      row: {
        id: ex.id,
        org_id: orgId,
        name: r.name,
        price: r.price,
        description: r.description ?? ex.description,
        category_id: cat === undefined ? ex.category_id : cat,
        sku: ex.sku,
        stock: r.stock ?? ex.stock,
        active: r.active ?? ex.active,
      },
    };
  });

  // Lotes; si un lote falla, se reintenta fila por fila para reportar el error exacto.
  async function write(items: { line: number; row: Record<string, unknown> }[], kind: "insert" | "upsert") {
    let ok = 0;
    const run = (batch: Record<string, unknown>[]) =>
      kind === "insert"
        ? supabase.from("products").insert(batch as never)
        : supabase.from("products").upsert(batch as never, { onConflict: "id" });
    for (const part of chunk(items, 300)) {
      const { error } = await run(part.map((i) => i.row));
      if (!error) {
        ok += part.length;
        continue;
      }
      for (const item of part) {
        const { error: e } = await run([item.row]);
        if (e) failed.push({ line: item.line, message: dbMessage(e, item.row.sku as string | null) });
        else ok++;
      }
    }
    return ok;
  }

  const created = await write(newRows, "insert");
  const updated = await write(updRows, "upsert");
  revalidateCatalog(slug);
  return { ok: true, created, updated, failed: failed.sort((a, b) => a.line - b.line) };
}
