import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OrgRole = "owner" | "admin" | "operador";
export type Membership = {
  role: OrgRole;
  organization: { id: string; name: string; slug: string; status: "onboarding" | "activo" | "suspendido" };
};

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organization:organizations(id, name, slug, status)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as Membership[];
});

export const getPlatformRole = cache(async (): Promise<"superadmin" | "soporte" | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("platform_admins").select("role").eq("user_id", user.id).maybeSingle();
  return (data?.role as "superadmin" | "soporte" | undefined) ?? null;
});

/** Valida que el usuario pertenezca al comercio del slug. Los admins de plataforma entran en modo impersonación. */
export async function requireOrg(slug: string) {
  await requireUser();
  const memberships = await getMemberships();
  const m = memberships.find((x) => x.organization.slug === slug);
  if (m) return { org: m.organization, role: m.role, impersonating: false as const };

  const platformRole = await getPlatformRole();
  if (platformRole) {
    const supabase = await createClient();
    const { data: org } = await supabase.from("organizations").select("id, name, slug, status").eq("slug", slug).maybeSingle();
    if (org) return { org: org as Membership["organization"], role: null, impersonating: true as const };
  }
  notFound();
}

export async function requirePlatformAdmin() {
  await requireUser();
  const role = await getPlatformRole();
  if (!role) notFound();
  return role;
}
