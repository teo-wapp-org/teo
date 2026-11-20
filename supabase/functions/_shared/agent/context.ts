// Carga del contexto del comercio y del estado del caso (siempre filtrado por org_id).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Hours } from "./hours.ts";
import type { CaseRow } from "./cases.ts";
import { getCase } from "./cases.ts";

export const CATALOG_INLINE_MAX = 50;

export type OrgContext = {
  org: { id: string; name: string; rubro: string | null; status: string; timezone: string; currency: string };
  profile: {
    description: string | null; tone: string; use_usted: boolean; use_emojis: boolean;
    policies: Record<string, string>; faqs: { q: string; a: string }[];
    website: string | null; instagram: string | null; phone: string | null;
  };
  settings: {
    enabled: boolean; mode: "piloto" | "copiloto"; display_name: string; greeting: string | null;
    out_of_hours_message: string | null; escalation_keywords: string[]; escalation_amount_usd: number | null;
    extra_instructions: string | null;
  };
  stores: { id: string; name: string; address: string | null; city: string | null; phone: string | null; hours: Hours; delivery_available: boolean; delivery_notes: string | null }[];
  paymentMethods: { id: string; type: string; label: string; details: Record<string, unknown>; instructions: string | null }[];
  categories: { id: string; name: string }[];
  productCount: number;
  /** Catálogo completo solo si hay ≤ CATALOG_INLINE_MAX productos activos. */
  products: { id: string; name: string; price: number; stock: number | null; category_id: string | null }[] | null;
};

const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
};

export async function loadOrgContext(db: SupabaseClient, orgId: string): Promise<OrgContext> {
  const [org, profile, settings, stores, pms, cats, count] = await Promise.all([
    db.from("organizations").select("id, name, rubro, status, timezone, currency").eq("id", orgId).single(),
    db.from("business_profiles").select("description, tone, use_usted, use_emojis, policies, faqs, website, instagram, phone").eq("org_id", orgId).maybeSingle(),
    db.from("agent_settings").select("enabled, mode, display_name, greeting, out_of_hours_message, escalation_keywords, escalation_amount_usd, extra_instructions").eq("org_id", orgId).maybeSingle(),
    db.from("stores").select("id, name, address, city, phone, hours, delivery_available, delivery_notes").eq("org_id", orgId).eq("active", true).order("name"),
    db.from("payment_methods").select("id, type, label, details, instructions").eq("org_id", orgId).eq("active", true).order("sort_order"),
    db.from("product_categories").select("id, name").eq("org_id", orgId).order("sort_order"),
    db.from("products").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("active", true),
  ]);
  if (count.error) throw new Error(`products_count: ${count.error.message}`);
  const productCount = count.count ?? 0;
  let products: OrgContext["products"] = null;
  if (productCount <= CATALOG_INLINE_MAX) {
    products = must(
      await db.from("products").select("id, name, price, stock, category_id").eq("org_id", orgId).eq("active", true).order("name"),
      "products",
    );
  }
  return {
    org: must(org, "org"),
    profile: (profile.data ?? {
      description: null, tone: "cercano", use_usted: false, use_emojis: true, policies: {}, faqs: [], website: null, instagram: null, phone: null,
    }) as OrgContext["profile"],
    settings: (settings.data ?? {
      enabled: true, mode: "piloto", display_name: "Teo", greeting: null, out_of_hours_message: null,
      escalation_keywords: [], escalation_amount_usd: null, extra_instructions: null,
    }) as OrgContext["settings"],
    stores: must(stores, "stores") ?? [],
    paymentMethods: must(pms, "payment_methods") ?? [],
    categories: must(cats, "categories") ?? [],
    productCount,
    products,
  };
}

export type OrderState = {
  id: string;
  status: "borrador" | "confirmado" | "pagado" | "cancelado";
  subtotal: number;
  shipping: number;
  total: number;
  delivery: Record<string, unknown>;
  items: { id: string; product_id: string | null; variant_id: string | null; name: string; quantity: number; unit_price: number; subtotal: number }[];
};

export type CaseState = { case: CaseRow; order: OrderState | null };

/** Pedido abierto (borrador o confirmado) del caso, con ítems. */
export async function loadOpenOrder(db: SupabaseClient, orgId: string, caseId: string): Promise<OrderState | null> {
  const { data, error } = await db.from("orders")
    .select("id, status, subtotal, shipping, total, delivery, items:order_items(id, product_id, variant_id, name, quantity, unit_price, subtotal)")
    .eq("org_id", orgId).eq("case_id", caseId).in("status", ["borrador", "confirmado"])
    .maybeSingle();
  if (error) throw new Error(`order_load: ${error.message}`);
  if (!data) return null;
  const num = (v: unknown) => Number(v ?? 0);
  return {
    ...(data as unknown as OrderState),
    subtotal: num(data.subtotal),
    shipping: num(data.shipping),
    total: num(data.total),
    items: ((data.items ?? []) as OrderState["items"]).map((i) => ({ ...i, unit_price: num(i.unit_price), subtotal: num(i.subtotal) })),
  };
}

export async function loadCaseState(db: SupabaseClient, orgId: string, caseId: string): Promise<CaseState> {
  const [c, order] = await Promise.all([getCase(db, orgId, caseId), loadOpenOrder(db, orgId, caseId)]);
  return { case: c, order };
}

/** Uso del período vs cupo del plan (FICHA §17.1). */
export async function quotaStatus(db: SupabaseClient, orgId: string): Promise<{ used: number; limit: number; exhausted: boolean }> {
  const { data: sub } = await db.from("subscriptions").select("plan_id, current_period_start, plan:plans(teo_messages_month)").eq("org_id", orgId).maybeSingle();
  const planLimit = Number((sub?.plan as unknown as { teo_messages_month?: number } | null)?.teo_messages_month ?? 100); // sin suscripción: cupo Gratis
  // mismo período que increment_teo_usage: día de inicio de la suscripción o inicio de mes
  const period = sub?.current_period_start
    ? new Date(sub.current_period_start).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 7) + "-01";
  const { data: usage } = await db.from("usage_counters").select("teo_messages, extra_messages").eq("org_id", orgId).eq("period_start", period).maybeSingle();
  const used = Number(usage?.teo_messages ?? 0);
  const limit = planLimit + Number(usage?.extra_messages ?? 0);
  return { used, limit, exhausted: used >= limit };
}
