import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type PlanLimits = { planId: string | null; planName: string; maxStores: number | null; maxUsers: number | null; features: string[] };

/** Límites del plan actual del comercio (subscriptions → plans). Sin suscripción: sin límites conocidos. */
export async function getPlanLimits(supabase: SupabaseClient<Database>, orgId: string): Promise<PlanLimits> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan:plans(id, name, max_stores, max_users, features)")
    .eq("org_id", orgId)
    .maybeSingle();
  const plan = data?.plan as unknown as { id: string; name: string; max_stores: number | null; max_users: number | null; features: string[] } | null;
  return {
    planId: plan?.id ?? null,
    planName: plan?.name ?? "—",
    maxStores: plan?.max_stores ?? null,
    maxUsers: plan?.max_users ?? null,
    features: plan?.features ?? [],
  };
}

export const atLimit = (count: number, max: number | null) => max != null && count >= max;
