import { requireOrg } from "@/lib/auth";
import { canEditConfig } from "@/lib/org-editor";
import { createClient } from "@/lib/supabase/server";
import { BusinessForm, type BusinessInitial } from "./business-form";

export const metadata = { title: "Negocio" };

export default async function NegocioPage({ params }: PageProps<"/app/[org]/configuracion">) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const supabase = await createClient();
  const [{ data: org }, { data: bp }] = await Promise.all([
    supabase.from("organizations").select("name, rubro").eq("id", ctx.org.id).maybeSingle(),
    supabase.from("business_profiles").select("*").eq("org_id", ctx.org.id).maybeSingle(),
  ]);

  const policies = (bp?.policies ?? {}) as Record<string, string | undefined>;
  const faqs = Array.isArray(bp?.faqs) ? (bp.faqs as { q?: string; a?: string }[]) : [];
  const initial: BusinessInitial = {
    name: org?.name ?? ctx.org.name,
    rubro: org?.rubro ?? "",
    description: bp?.description ?? "",
    tone: (bp?.tone as BusinessInitial["tone"]) ?? "cercano",
    use_usted: bp?.use_usted ?? false,
    use_emojis: bp?.use_emojis ?? true,
    envios: policies.envios ?? "",
    devoluciones: policies.devoluciones ?? "",
    garantia: policies.garantia ?? "",
    otros: policies.otros ?? "",
    website: bp?.website ?? "",
    instagram: bp?.instagram ?? "",
    phone: bp?.phone ?? "",
    faqs: faqs.map((f) => ({ q: String(f.q ?? ""), a: String(f.a ?? "") })),
  };

  return <BusinessForm slug={ctx.org.slug} initial={initial} canEdit={canEditConfig(ctx)} />;
}
