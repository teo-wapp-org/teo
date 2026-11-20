"use server";

import { revalidatePath } from "next/cache";
import { done, fail, zodFail, type ActionState } from "@/lib/action-state";
import { translateAdminError } from "@/lib/admin/labels";
import { requireSuperadmin } from "@/lib/admin/server";
import { planFormInput, PlanSchema } from "@/lib/schemas/admin";

/** Crea o actualiza un plan (RLS: solo superadmin; un trigger lo audita). */
export async function savePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  const parsed = PlanSchema.safeParse(planFormInput(fd));
  if (!parsed.success) return zodFail(parsed.error);
  const { mode, id, ...row } = parsed.data;

  if (mode === "create") {
    if (id === "nuevo") return fail("Ese identificador está reservado", { id: "Elige otro identificador" });
    const { error } = await sa.supabase.from("plans").insert({ id, ...row });
    if (error) {
      if (error.code === "23505") return fail("Ya existe un plan con ese identificador", { id: "Ya existe un plan con ese identificador" });
      return fail(translateAdminError(error));
    }
  } else {
    const { data, error } = await sa.supabase.from("plans").update(row).eq("id", id).select("id");
    if (error) return fail(translateAdminError(error));
    if (!data?.length) return fail("No encontramos ese plan.");
  }
  revalidatePath("/admin/planes", "layout");
  revalidatePath("/");
  return done(mode === "create" ? "Plan creado." : "Plan actualizado. La landing ya muestra los cambios.", { id });
}
