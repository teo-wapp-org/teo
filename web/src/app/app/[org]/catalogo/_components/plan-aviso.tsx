import Link from "next/link";
import { TriangleAlert, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { remainingProducts, type PlanQuota } from "@/lib/catalogo/formato";
import { cn } from "@/lib/utils";

/** Aviso de límite del plan: al llegar al tope (rojo) o cuando queda poco (amarillo). */
export function PlanAviso({ quota, slug, className }: { quota: PlanQuota; slug: string; className?: string }) {
  if (quota.maxProducts == null) return null;
  const left = remainingProducts(quota);
  const full = left <= 0;
  if (!full && left > Math.max(3, Math.ceil(quota.maxProducts * 0.1))) return null;
  return (
    <div
      role={full ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        full ? "border-destructive/30 bg-destructive/5" : "border-warning/40 bg-warning/10",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className={cn("mt-0.5 size-5 shrink-0", full ? "text-destructive" : "text-foreground")} aria-hidden />
        <div>
          <p className="font-semibold">
            {full
              ? `Llegaste al límite de ${quota.maxProducts} productos de tu plan ${quota.planName}`
              : `Te quedan ${left} de ${quota.maxProducts} productos en tu plan ${quota.planName}`}
          </p>
          <p className="text-sm text-muted-foreground">Sube de plan para seguir agregando productos y que Teo los ofrezca a tus clientes.</p>
        </div>
      </div>
      <Link href={`/app/${slug}/configuracion`} className={cn(buttonVariants({ variant: "cta" }), "h-9 shrink-0 px-4")}>
        <Sparkles aria-hidden /> Ver planes
      </Link>
    </div>
  );
}
