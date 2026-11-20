import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrg } from "@/lib/auth";
import { atLimit, getPlanLimits } from "@/lib/data/plan-limits";
import { canEditConfig } from "@/lib/org-editor";
import { placesConfigured } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/forms/fields";
import { buttonVariants } from "@/components/ui/button";
import { StoreForm, type PlacesAvailability } from "../store-form";

export const metadata = { title: "Nueva tienda" };

export default async function NuevaTiendaPage({ params }: PageProps<"/app/[org]/tiendas/nueva">) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  if (!canEditConfig(ctx)) notFound();
  const supabase = await createClient();
  const [limits, { count }] = await Promise.all([
    getPlanLimits(supabase, ctx.org.id),
    supabase.from("stores").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id),
  ]);
  const list = `/app/${ctx.org.slug}/tiendas`;

  const places: PlacesAvailability = !placesConfigured()
    ? { enabled: false, label: "Disponible pronto", reason: "Muy pronto podrás traer tus datos desde Google." }
    : !limits.features.includes("google_places")
      ? { enabled: false, label: "Buscar en Google", reason: "Importar desde Google está disponible desde el plan Emprende." }
      : { enabled: true };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={list} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Tiendas
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Nueva tienda</h1>
      </div>
      {atLimit(count ?? 0, limits.maxStores) ? (
        <EmptyState
          title="Llegaste al límite de tu plan"
          action={
            <Link href="/#precios" className={buttonVariants({ variant: "cta" })}>
              Ver planes
            </Link>
          }
        >
          Tu plan {limits.planName} permite {limits.maxStores === 1 ? "1 tienda" : `${limits.maxStores} tiendas`}. Sube de plan para agregar más sucursales.
        </EmptyState>
      ) : (
        <StoreForm
          slug={ctx.org.slug}
          places={places}
          initial={{ name: "", address: "", city: "", phone: "", hours: {}, delivery_available: false, delivery_notes: "", active: true, lat: null, lng: null, google_place_id: "" }}
        />
      )}
    </div>
  );
}
