"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { done, fail, zodFail, type ActionState } from "@/lib/action-state";
import { translateAdminError } from "@/lib/admin/labels";
import { requireSuperadmin } from "@/lib/admin/server";
import { getUser } from "@/lib/auth";
import { PLATFORM_ROLES, TeamMemberSchema } from "@/lib/schemas/admin";

export async function addTeamMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  const parsed = TeamMemberSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return zodFail(parsed.error);
  const { data, error } = await sa.supabase.rpc("admin_add_platform_admin", { p_email: parsed.data.email, p_role: parsed.data.role });
  if (error) return fail(translateAdminError(error));
  if (data === "not_found") return fail(translateAdminError("not_found"), { email: "No hay una cuenta con ese correo" });
  revalidatePath("/admin/equipo");
  return done(`Listo, ${parsed.data.email} ya es parte del equipo Teo.`);
}

const ChangeRole = z.object({ userId: z.uuid(), email: z.string().min(3), role: z.enum(PLATFORM_ROLES) });

/** Cambia el rol (reutiliza admin_add_platform_admin, que hace upsert). Protege al último superadmin y a uno mismo. */
export async function changeTeamRole(input: { userId: string; email: string; role: string }): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  const parsed = ChangeRole.safeParse(input);
  if (!parsed.success) return fail("Datos inválidos");
  const me = await getUser();
  if (me?.id === parsed.data.userId) return fail("No puedes cambiar tu propio rol.");
  if (parsed.data.role === "soporte") {
    const { data: admins } = await sa.supabase.from("platform_admins").select("user_id, role");
    const supers = (admins ?? []).filter((a) => a.role === "superadmin");
    if (supers.length <= 1 && supers.some((a) => a.user_id === parsed.data.userId)) return fail(translateAdminError("last_superadmin"));
  }
  const { data, error } = await sa.supabase.rpc("admin_add_platform_admin", { p_email: parsed.data.email, p_role: parsed.data.role });
  if (error) return fail(translateAdminError(error));
  if (data !== "added") return fail(translateAdminError(String(data)));
  revalidatePath("/admin/equipo");
  return done("Rol actualizado.");
}

export async function removeTeamMember(userId: string): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  if (!z.uuid().safeParse(userId).success) return fail("Usuario inválido");
  const { data, error } = await sa.supabase.rpc("admin_remove_platform_admin", { p_user: userId });
  if (error) return fail(translateAdminError(error));
  if (data !== "removed") return fail(translateAdminError(String(data)));
  revalidatePath("/admin/equipo");
  return done("Listo, ya no es parte del equipo Teo.");
}
