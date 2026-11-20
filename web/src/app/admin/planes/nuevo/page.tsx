import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { PlanEditor } from "../plan-editor";

export const metadata = { title: "Nuevo plan · Admin" };

export default async function AdminNuevoPlanPage() {
  const role = await requirePlatformAdmin();
  if (role !== "superadmin") notFound();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/planes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Planes
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Nuevo plan</h1>
      </div>
      <PlanEditor
        mode="create"
        canEdit
        plan={{
          id: "",
          name: "",
          price_usd_month: 0,
          teo_messages_month: 500,
          max_users: 1,
          max_stores: 1,
          max_products: 100,
          features: ["kanban", "chat"],
          highlighted: false,
          active: false,
          sort_order: 10,
        }}
      />
    </div>
  );
}
