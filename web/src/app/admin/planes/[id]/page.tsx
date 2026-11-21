import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReadOnlyNotice } from "@/components/forms/fields";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PlanEditor } from "../plan-editor";

export default async function AdminPlanPage({ params }: PageProps<"/admin/planes/[id]">) {
  const { id } = await params;
  const role = await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: plan } = await supabase.from("plans").select("*").eq("id", id).maybeSingle();
  if (!plan) notFound();
  const canEdit = role === "superadmin";
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/planes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Planes
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Plan {plan.name}</h1>
      </div>
      {!canEdit && <ReadOnlyNotice>Tu rol es de soporte: puedes ver el plan, pero no cambiarlo.</ReadOnlyNotice>}
      <PlanEditor mode="update" canEdit={canEdit} plan={{ ...plan, price_usd_month: Number(plan.price_usd_month) }} />
    </div>
  );
}
