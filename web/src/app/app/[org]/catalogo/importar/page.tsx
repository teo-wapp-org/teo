import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { remainingProducts } from "@/lib/catalogo/formato";
import { getPlanQuota, requireCatalog } from "@/lib/data/catalogo";
import { cn } from "@/lib/utils";
import { PlanAviso } from "../_components/plan-aviso";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Importar catálogo" };

export default async function ImportarPage({ params }: PageProps<"/app/[org]/catalogo/importar">) {
  const { org: slug } = await params;
  const { org, canEdit } = await requireCatalog(slug);
  if (!canEdit) notFound();
  const quota = await getPlanQuota(org.id);
  const left = remainingProducts(quota);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href={`/app/${org.slug}/catalogo`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden /> Catálogo
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Importar catálogo</h1>
        <p className="text-muted-foreground">Sube tu lista de productos en CSV o Excel. Si un SKU ya existe, actualizamos ese producto.</p>
      </div>

      {quota.canImport ? (
        <>
          <PlanAviso quota={quota} slug={org.slug} />
          <Importer slug={org.slug} remaining={Number.isFinite(left) ? left : null} />
        </>
      ) : (
        <div role="alert" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Tu plan {quota.planName} no incluye importar catálogo</p>
              <p className="text-sm text-muted-foreground">Sube a Emprende o superior para cargar cientos de productos en un minuto. Mientras tanto, puedes agregarlos uno por uno.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href={`/app/${org.slug}/catalogo/nuevo`} className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>Agregar producto</Link>
            <Link href={`/app/${org.slug}/configuracion`} className={cn(buttonVariants({ variant: "cta" }), "h-9 px-4")}>Ver planes</Link>
          </div>
        </div>
      )}
    </div>
  );
}
