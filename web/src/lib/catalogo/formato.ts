/** Utilidades puras del catálogo (cliente y servidor). */

const usd = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

/** Precio en USD con formato de Ecuador. */
export function formatUSD(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  return usd.format(Number(n));
}

export const CATALOGO_BUCKET = "catalogo";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 10;
export const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** URL pública de un archivo del bucket "catalogo". */
export function publicPhotoUrl(path: string, baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): string {
  return `${baseUrl}/storage/v1/object/public/${CATALOGO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Ruta válida de una foto: {org_id}/{product_id}/{uuid}.{ext} */
export function isPhotoPathFor(path: string, orgId: string, productId: string): boolean {
  const prefix = `${orgId}/${productId}/`;
  if (!path.startsWith(prefix)) return false;
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(path.slice(prefix.length));
}

/** Valida un archivo de foto antes de subirlo. Devuelve el mensaje de error o null. */
export function photoError(file: { name: string; type: string; size: number }): string | null {
  if (!PHOTO_TYPES[file.type]) return `“${file.name}” no es JPG, PNG ni WebP.`;
  if (file.size > MAX_PHOTO_BYTES) return `“${file.name}” pesa más de 5 MB.`;
  return null;
}

/** Limpia el texto de búsqueda para usarlo en un filtro ilike de PostgREST. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[%_,()*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export type PlanQuota = { planName: string; maxProducts: number | null; used: number; canImport: boolean };

/** Cuántos productos nuevos se pueden crear todavía (Infinity si es ilimitado). */
export function remainingProducts(q: Pick<PlanQuota, "maxProducts" | "used">): number {
  return q.maxProducts == null ? Number.POSITIVE_INFINITY : Math.max(0, q.maxProducts - q.used);
}
