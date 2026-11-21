import { ReadOnlyNotice } from "@/components/forms/fields";
import { requirePlatformAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddMemberForm, TeamList, type TeamRow } from "./team";

export const metadata = { title: "Equipo Teo · Admin" };

export default async function AdminEquipoPage() {
  const user = await requireUser();
  const role = await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_platform_admins");
  if (error) throw error;
  const canEdit = role === "superadmin";
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Equipo Teo</h1>
        <p className="text-muted-foreground">Quién puede entrar a este panel. Los superadmin cambian cosas; soporte solo mira.</p>
      </div>
      {canEdit ? <AddMemberForm /> : <ReadOnlyNotice>Tu rol es de soporte: puedes ver el equipo, pero no cambiarlo.</ReadOnlyNotice>}
      <TeamList rows={(data ?? []) as TeamRow[]} meId={user.id} canEdit={canEdit} />
    </div>
  );
}
