import "server-only";
import { cache } from "react";
import { getMemberships, getPlatformRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SwitchableOrg = { id: string; name: string; slug: string; status: string; member: boolean };

/**
 * Comercios a los que el usuario puede cambiar: los suyos (membresías) y, si es del equipo Teo,
 * todos los comercios de la plataforma (entra en modo "ver como"). RLS garantiza que no vea otros.
 */
export const getSwitchableOrgs = cache(async (): Promise<SwitchableOrg[]> => {
  const [memberships, platformRole] = await Promise.all([getMemberships(), getPlatformRole()]);
  const mine: SwitchableOrg[] = memberships.map((m) => ({ ...m.organization, member: true }));
  if (!platformRole) return mine;
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("id, name, slug, status").order("name").limit(1000);
  const ids = new Set(mine.map((o) => o.id));
  return [...mine, ...(data ?? []).filter((o) => !ids.has(o.id)).map((o) => ({ ...o, member: false }))];
});
