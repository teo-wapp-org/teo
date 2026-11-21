"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { done, fail, zodFail, type ActionState } from "@/lib/action-state";
import { atLimit, getPlanLimits } from "@/lib/data/plan-limits";
import { requireOrgEditor } from "@/lib/org-editor";
import { getPublicConfig } from "@/lib/data/platform-config";
import { getPlaceDraft, searchPlaces } from "@/lib/places";
import type { PlaceSearchResult, StoreDraft } from "@/lib/places-map";
import { StoreSchema } from "@/lib/schemas/contexto";

const GENERIC = "No pudimos guardar la tienda. Inténtalo de nuevo.";

export async function saveStore(_: ActionState, fd: FormData): Promise<ActionState> {
  const ed = await requireOrgEditor(fd.get("slug"));
  if (ed.error) return fail(ed.error);
  const parsed = StoreSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return zodFail(parsed.error);
  const { id, ...row } = parsed.data;

  if (id) {
    const { data, error } = await ed.supabase.from("stores").update(row).eq("id", id).eq("org_id", ed.org.id).select("id");
    if (error || !data?.length) return fail(GENERIC);
  } else {
    const [limits, { count }] = await Promise.all([
      getPlanLimits(ed.supabase, ed.org.id),
      ed.supabase.from("stores").select("id", { count: "exact", head: true }).eq("org_id", ed.org.id),
    ]);
    if (atLimit(count ?? 0, limits.maxStores)) {
      return fail(`Tu plan ${limits.planName} permite ${limits.maxStores === 1 ? "1 tienda" : `${limits.maxStores} tiendas`}. Sube de plan para agregar más.`);
    }
    const { error } = await ed.supabase.from("stores").insert({ ...row, org_id: ed.org.id });
    if (error) return fail(GENERIC);
  }
  revalidatePath(`/app/${ed.org.slug}`, "layout");
  return done(id ? "Tienda actualizada." : "Tienda creada. ¡Teo ya sabe dónde encontrarte!");
}

export async function deleteStore(slug: string, id: string): Promise<ActionState> {
  const ed = await requireOrgEditor(slug);
  if (ed.error) return fail(ed.error);
  if (!z.uuid().safeParse(id).success) return fail("Tienda inválida");
  const { data, error } = await ed.supabase.from("stores").delete().eq("id", id).eq("org_id", ed.org.id).select("id");
  if (error || !data?.length) return fail("No pudimos eliminar la tienda. Inténtalo de nuevo.");
  revalidatePath(`/app/${ed.org.slug}`, "layout");
  return done("Tienda eliminada.");
}

// ─────────────────────────────────────────────────────────────
// Google Places (búsqueda y borrador para revisar; nada se guarda aquí)
// ─────────────────────────────────────────────────────────────
type PlacesResult<T> = { ok: true; data: T } | { ok: false; error: string };

type PlacesGuard =
  | { ok: false; error: string }
  | { ok: true; ed: Extract<Awaited<ReturnType<typeof requireOrgEditor>>, { error: null }> };

async function placesGuard(slug: string): Promise<PlacesGuard> {
  const ed = await requireOrgEditor(slug);
  if (ed.error !== null) return { ok: false, error: ed.error };
  if (!(await getPublicConfig()).places_available) return { ok: false, error: "La importación desde Google estará disponible pronto." };
  const limits = await getPlanLimits(ed.supabase, ed.org.id);
  if (!limits.features.includes("google_places")) return { ok: false, error: "Importar desde Google está disponible desde el plan Emprende." };
  return { ok: true, ed };
}

export async function searchPlacesAction(slug: string, query: string): Promise<PlacesResult<PlaceSearchResult[]>> {
  const q = z.string().trim().min(3, "Escribe al menos 3 letras").max(120).safeParse(query);
  if (!q.success) return { ok: false, error: q.error.issues[0].message };
  const guard = await placesGuard(slug);
  if (!guard.ok) return guard;
  try {
    return { ok: true, data: await searchPlaces(guard.ed.supabase, guard.ed.org.id, q.data) };
  } catch {
    return { ok: false, error: "No pudimos buscar en Google ahora. Inténtalo en un momento." };
  }
}

export async function placeDraftAction(slug: string, placeId: string): Promise<PlacesResult<StoreDraft>> {
  const guard = await placesGuard(slug);
  if (!guard.ok) return guard;
  try {
    return { ok: true, data: await getPlaceDraft(guard.ed.supabase, guard.ed.org.id, placeId) };
  } catch {
    return { ok: false, error: "No pudimos traer los datos de Google. Inténtalo en un momento." };
  }
}
