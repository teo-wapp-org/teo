import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrg } from "@/lib/auth";
import { normalizeHours } from "@/lib/hours";
import { canEditConfig } from "@/lib/org-editor";
import { createClient } from "@/lib/supabase/server";
import { StoreForm } from "../store-form";

export const metadata = { title: "Editar tienda" };

export default async function EditarTiendaPage({ params }: PageProps<"/app/[org]/tiendas/[id]">) {
  const { org: slug, id } = await params;
  const ctx = await requireOrg(slug);
  if (!canEditConfig(ctx) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: s } = await supabase.from("stores").select("*").eq("org_id", ctx.org.id).eq("id", id).maybeSingle();
  if (!s) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/app/${ctx.org.slug}/tiendas`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Tiendas
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{s.name}</h1>
      </div>
      <StoreForm
        slug={ctx.org.slug}
        initial={{
          id: s.id,
          name: s.name,
          address: s.address ?? "",
          city: s.city ?? "",
          phone: s.phone ?? "",
          hours: normalizeHours(s.hours),
          delivery_available: s.delivery_available,
          delivery_notes: s.delivery_notes ?? "",
          active: s.active,
          lat: s.lat,
          lng: s.lng,
          google_place_id: s.google_place_id ?? "",
        }}
      />
    </div>
  );
}
