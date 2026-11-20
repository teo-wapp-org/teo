"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, fail, zodFail, type ActionState } from "@/lib/action-state";
import { getUser } from "@/lib/auth";
import { getPlanLimits } from "@/lib/data/plan-limits";
import { requireOrgEditor } from "@/lib/org-editor";
import { AgentSchema, BusinessSchema, InviteSchema, PaymentMethodSchema, paymentDetails, ROLES } from "@/lib/schemas/contexto";

const GENERIC = "No pudimos guardar. Inténtalo de nuevo.";
const Id = z.uuid();

// ─────────────────────────────────────────────────────────────
// Negocio
// ─────────────────────────────────────────────────────────────
export async function saveBusiness(_: ActionState, fd: FormData): Promise<ActionState> {
  const ed = await requireOrgEditor(fd.get("slug"));
  if (ed.error) return fail(ed.error);
  const parsed = BusinessSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return zodFail(parsed.error);
  const v = parsed.data;

  const { error: e1 } = await ed.supabase.from("organizations").update({ name: v.name, rubro: v.rubro }).eq("id", ed.org.id);
  if (e1) return fail(GENERIC);
  const policies = Object.fromEntries(
    (["envios", "devoluciones", "garantia", "otros"] as const).filter((k) => v[k]).map((k) => [k, v[k]]),
  );
  const { error: e2 } = await ed.supabase.from("business_profiles").upsert({
    org_id: ed.org.id,
    description: v.description,
    tone: v.tone,
    use_usted: v.use_usted,
    use_emojis: v.use_emojis,
    policies,
    faqs: v.faqs,
    website: v.website,
    instagram: v.instagram,
    phone: v.phone,
  });
  if (e2) return fail(GENERIC);
  revalidatePath(`/app/${ed.org.slug}`, "layout");
  return done("Listo, guardamos los datos de tu negocio.");
}

// ─────────────────────────────────────────────────────────────
// Formas de pago
// ─────────────────────────────────────────────────────────────
export async function savePaymentMethod(_: ActionState, fd: FormData): Promise<ActionState> {
  const ed = await requireOrgEditor(fd.get("slug"));
  if (ed.error) return fail(ed.error);
  const parsed = PaymentMethodSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return zodFail(parsed.error);
  const v = parsed.data;
  const row = { type: v.type, label: v.label, instructions: v.instructions, active: v.active, details: paymentDetails(v) };

  if (v.id) {
    const { data, error } = await ed.supabase.from("payment_methods").update(row).eq("id", v.id).eq("org_id", ed.org.id).select("id");
    if (error || !data?.length) return fail(GENERIC);
  } else {
    const { data: last } = await ed.supabase
      .from("payment_methods")
      .select("sort_order")
      .eq("org_id", ed.org.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await ed.supabase.from("payment_methods").insert({ ...row, org_id: ed.org.id, sort_order: (last?.sort_order ?? -1) + 1 });
    if (error) return fail(GENERIC);
  }
  revalidatePath(`/app/${ed.org.slug}`, "layout");
  return done(v.id ? "Forma de pago actualizada." : "Forma de pago agregada.");
}

export async function deletePaymentMethod(slug: string, id: string): Promise<ActionState> {
  const ed = await requireOrgEditor(slug);
  if (ed.error) return fail(ed.error);
  if (!Id.safeParse(id).success) return fail("Forma de pago inválida");
  const { error } = await ed.supabase.from("payment_methods").delete().eq("id", id).eq("org_id", ed.org.id);
  // FK desde pagos registrados: no se puede borrar, se sugiere desactivar.
  if (error) return fail(error.code === "23503" ? "Esta forma de pago ya tiene pagos registrados. Desactívala en lugar de eliminarla." : GENERIC);
  revalidatePath(`/app/${ed.org.slug}`, "layout");
  return done("Forma de pago eliminada.");
}

export async function setPaymentMethodActive(slug: string, id: string, active: boolean): Promise<ActionState> {
  const ed = await requireOrgEditor(slug);
  if (ed.error) return fail(ed.error);
  if (!Id.safeParse(id).success) return fail("Forma de pago inválida");
  const { error } = await ed.supabase.from("payment_methods").update({ active: Boolean(active) }).eq("id", id).eq("org_id", ed.org.id);
  if (error) return fail(GENERIC);
  revalidatePath(`/app/${ed.org.slug}`, "layout");
  return done(active ? "Forma de pago activada." : "Forma de pago desactivada.");
}

export async function movePaymentMethod(slug: string, id: string, direction: "up" | "down"): Promise<ActionState> {
  const ed = await requireOrgEditor(slug);
  if (ed.error) return fail(ed.error);
  if (!Id.safeParse(id).success || !["up", "down"].includes(direction)) return fail("Movimiento inválido");
  const { data, error } = await ed.supabase.from("payment_methods").select("id").eq("org_id", ed.org.id).order("sort_order").order("created_at");
  if (error || !data) return fail(GENERIC);
  const ids = data.map((r) => r.id);
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return done("");
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const results = await Promise.all(ids.map((pid, idx) => ed.supabase.from("payment_methods").update({ sort_order: idx }).eq("id", pid).eq("org_id", ed.org.id)));
  if (results.some((r) => r.error)) return fail(GENERIC);
  revalidatePath(`/app/${ed.org.slug}`, "layout");
  return done("");
}

// ─────────────────────────────────────────────────────────────
// Teo
// ─────────────────────────────────────────────────────────────
export async function saveAgentSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const ed = await requireOrgEditor(fd.get("slug"));
  if (ed.error) return fail(ed.error);
  const parsed = AgentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return zodFail(parsed.error);
  const { error } = await ed.supabase.from("agent_settings").upsert({ org_id: ed.org.id, ...parsed.data });
  if (error) return fail(GENERIC);
  revalidatePath(`/app/${ed.org.slug}`, "layout");
  return done("Listo, Teo ya tiene tu configuración.");
}

// ─────────────────────────────────────────────────────────────
// Equipo
// ─────────────────────────────────────────────────────────────
export async function inviteMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const ed = await requireOrgEditor(fd.get("slug"));
  if (ed.error) return fail(ed.error);
  const parsed = InviteSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return zodFail(parsed.error);
  const { email, role } = parsed.data;
  if (role === "owner" && ed.role !== "owner") return fail("Solo un dueño puede agregar a otro dueño.", { role: "Elige Administrador u Operador" });

  const { data, error } = await ed.supabase.rpc("add_member_by_email", { p_org: ed.org.id, p_email: email, p_role: role });
  if (error) return fail(GENERIC);
  switch (data) {
    case "added":
      revalidatePath(`/app/${ed.org.slug}/configuracion/equipo`);
      return done(`Agregamos a ${email} a tu equipo.`);
    case "already_member":
      return fail("Esa persona ya es parte de tu equipo.", { email: "Ya es parte de tu equipo" });
    case "limit_reached": {
      const limits = await getPlanLimits(ed.supabase, ed.org.id);
      return fail(`Tu plan ${limits.planName} permite hasta ${limits.maxUsers} usuarios. Sube de plan para sumar más personas.`);
    }
    case "not_found":
      return fail("Ese correo aún no tiene cuenta en Teo. Pídele que cree su cuenta en /registro y vuelve a invitarlo.", {
        email: "Pídele que cree su cuenta en /registro y vuelve a invitarlo",
      });
    default:
      return fail(GENERIC);
  }
}

async function loadMembers(ed: Exclude<Awaited<ReturnType<typeof requireOrgEditor>>, { error: string }>) {
  const { data } = await ed.supabase.from("memberships").select("user_id, role").eq("org_id", ed.org.id);
  return data ?? [];
}

export async function changeMemberRole(slug: string, userId: string, role: string): Promise<ActionState> {
  const ed = await requireOrgEditor(slug);
  if (ed.error) return fail(ed.error);
  const r = z.object({ userId: z.uuid(), role: z.enum(ROLES) }).safeParse({ userId, role });
  if (!r.success) return fail("Datos inválidos");
  const members = await loadMembers(ed);
  const target = members.find((m) => m.user_id === r.data.userId);
  if (!target) return fail("Esa persona ya no está en el equipo.");
  if (target.role === r.data.role) return done("");
  if ((target.role === "owner" || r.data.role === "owner") && ed.role !== "owner") return fail("Solo un dueño puede cambiar el rol de dueño.");
  if (target.role === "owner" && members.filter((m) => m.role === "owner").length <= 1) return fail("Tu comercio necesita al menos un dueño.");

  const { error } = await ed.supabase.from("memberships").update({ role: r.data.role }).eq("org_id", ed.org.id).eq("user_id", r.data.userId);
  if (error) return fail(GENERIC);
  revalidatePath(`/app/${ed.org.slug}`, "layout");
  return done("Rol actualizado.");
}

export async function removeMember(slug: string, userId: string): Promise<ActionState> {
  const ed = await requireOrgEditor(slug);
  if (ed.error) return fail(ed.error);
  if (!Id.safeParse(userId).success) return fail("Datos inválidos");
  const members = await loadMembers(ed);
  const target = members.find((m) => m.user_id === userId);
  if (!target) return fail("Esa persona ya no está en el equipo.");
  if (target.role === "owner" && ed.role !== "owner") return fail("Solo un dueño puede quitar a otro dueño.");
  if (target.role === "owner" && members.filter((m) => m.role === "owner").length <= 1) return fail("No puedes quitar al último dueño del comercio.");

  const { error } = await ed.supabase.from("memberships").delete().eq("org_id", ed.org.id).eq("user_id", userId);
  if (error) return fail(GENERIC);
  const me = await getUser();
  if (me?.id === userId) redirect("/app");
  revalidatePath(`/app/${ed.org.slug}/configuracion/equipo`);
  return done("Quitamos a la persona del equipo.");
}
