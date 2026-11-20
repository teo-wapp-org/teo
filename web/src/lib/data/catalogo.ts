import "server-only";
import { requireOrg } from "@/lib/auth";
import type { PlanQuota } from "@/lib/catalogo/formato";
import { createClient } from "@/lib/supabase/server";

export type Category = { id: string; name: string; sort_order: number };

/** Comercio + permisos del catálogo: solo owner/admin editan; el equipo Teo (impersonación) solo mira. */
export async function requireCatalog(slug: string) {
  const ctx = await requireOrg(slug);
  const canEdit = !ctx.impersonating && (ctx.role === "owner" || ctx.role === "admin");
  return { ...ctx, canEdit };
}

/** Plan del comercio y productos usados (para el límite max_products y la función de importar). */
export async function getPlanQuota(orgId: string): Promise<PlanQuota> {
  const supabase = await createClient();
  const [{ data: sub }, { count }] = await Promise.all([
    supabase.from("subscriptions").select("plan:plans(name, max_products, features)").eq("org_id", orgId).maybeSingle(),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);
  const plan = sub?.plan as unknown as { name: string; max_products: number | null; features: string[] } | null;
  return {
    planName: plan?.name ?? "Gratis",
    maxProducts: plan ? plan.max_products : 30,
    used: count ?? 0,
    canImport: Boolean(plan?.features?.includes("importar_catalogo")),
  };
}

export async function getCategories(orgId: string): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, name, sort_order")
    .eq("org_id", orgId)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data ?? [];
}
