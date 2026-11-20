import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Plan } from "@/lib/plans-shared";

export type { Plan } from "@/lib/plans-shared";
export { FEATURE_LABELS, fmtLimit } from "@/lib/plans-shared";

export async function getPlans(): Promise<Plan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plans").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, price_usd_month: Number(p.price_usd_month) })) as Plan[];
}
