import { redirect } from "next/navigation";
import { getMemberships, getPlatformRole, requireUser } from "@/lib/auth";

/** Redirige al usuario a su destino según su perfil. */
export default async function AppIndex() {
  await requireUser();
  const memberships = await getMemberships();
  if (memberships.length > 0) redirect(`/app/${memberships[0].organization.slug}`);
  if (await getPlatformRole()) redirect("/admin");
  redirect("/onboarding");
}
