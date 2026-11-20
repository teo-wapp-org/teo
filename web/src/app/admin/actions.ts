"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { done, fail, zodFail, type ActionState } from "@/lib/action-state";
import { translateAdminError } from "@/lib/admin/labels";
import { requireSuperadmin } from "@/lib/admin/server";
import { SubscriptionSchema } from "@/lib/schemas/admin";

const revalidateOrg = (orgId: string) => {
  revalidatePath("/admin");
  revalidatePath(`/admin/comercios/${orgId}`);
};

const StatusSchema = z.object({ orgId: z.uuid(), status: z.enum(["activo", "suspendido", "onboarding"]) });

export async function setOrgStatus(input: { orgId: string; status: string }): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) return fail("Datos inválidos");
  const { error } = await sa.supabase.rpc("admin_set_org_status", { p_org: parsed.data.orgId, p_status: parsed.data.status });
  if (error) return fail(translateAdminError(error));
  revalidateOrg(parsed.data.orgId);
  return done(parsed.data.status === "suspendido" ? "Comercio suspendido." : "Comercio activado.");
}

export async function updateSubscription(_: ActionState, fd: FormData): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  const parsed = SubscriptionSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return zodFail(parsed.error);
  const v = parsed.data;
  const { error } = await sa.supabase.rpc("admin_update_subscription", {
    p_org: v.orgId,
    p_plan: v.plan,
    p_status: v.status,
    ...(v.trial_ends_at ? { p_trial_ends_at: v.trial_ends_at } : {}),
    ...(v.period_end ? { p_period_end: v.period_end } : {}),
  });
  if (error) return fail(translateAdminError(error));
  revalidateOrg(v.orgId);
  return done("Suscripción actualizada.");
}

export async function resetUsage(orgId: string): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  if (!z.uuid().safeParse(orgId).success) return fail("Comercio inválido");
  const { error } = await sa.supabase.rpc("admin_reset_usage", { p_org: orgId });
  if (error) return fail(translateAdminError(error));
  revalidateOrg(orgId);
  return done("Uso del mes reiniciado.");
}

export async function setAgentEnabled(orgId: string, enabled: boolean): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  if (!z.uuid().safeParse(orgId).success || typeof enabled !== "boolean") return fail("Datos inválidos");
  const { error } = await sa.supabase.rpc("admin_set_agent_enabled", { p_org: orgId, p_enabled: enabled });
  if (error) return fail(translateAdminError(error));
  revalidateOrg(orgId);
  return done(enabled ? "Teo está activo en este comercio." : "Teo quedó en pausa en este comercio.");
}
