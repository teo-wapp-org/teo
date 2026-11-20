import { getUser, requireOrg } from "@/lib/auth";
import { getPlanLimits } from "@/lib/data/plan-limits";
import { canEditConfig } from "@/lib/org-editor";
import { createClient } from "@/lib/supabase/server";
import { Team, type Member } from "./team";

export const metadata = { title: "Equipo" };

export default async function EquipoPage({ params }: PageProps<"/app/[org]/configuracion/equipo">) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const supabase = await createClient();
  const [{ data }, limits, me] = await Promise.all([supabase.rpc("org_members", { p_org: ctx.org.id }), getPlanLimits(supabase, ctx.org.id), getUser()]);
  const members: Member[] = (data ?? []).map((m) => ({ userId: m.user_id, role: m.role, name: m.full_name ?? "", email: m.email ?? "" }));

  return (
    <Team
      slug={ctx.org.slug}
      members={members}
      meId={me?.id ?? ""}
      myRole={ctx.role}
      canEdit={canEditConfig(ctx)}
      maxUsers={limits.maxUsers}
      planName={limits.planName}
    />
  );
}
