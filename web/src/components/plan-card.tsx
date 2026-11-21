import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FEATURE_LABELS, fmtLimit, type Plan } from "@/lib/plans-shared";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de plan de la landing. Sin hooks: la usan la landing (Server Component)
 * y la vista previa del editor de planes en /admin (Client Component).
 */
export function PlanCard({ plan: p, trialDays = 14, preview = false }: { plan: Plan; trialDays?: number; preview?: boolean }) {
  const cta = p.price_usd_month === 0 ? "Empezar gratis" : trialDays > 0 ? `Probar ${trialDays} días gratis` : "Empezar ahora";
  const ctaCls = cn(buttonVariants({ variant: p.highlighted ? "cta" : "outline" }), "mt-6 h-11");
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-background p-6",
        p.highlighted ? "border-2 border-cta shadow-lg" : "border-border",
        p.highlighted && !preview && "lg:-mt-4 lg:mb-4",
      )}
    >
      {p.highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cta px-3 py-1 text-xs font-bold text-cta-foreground">Más elegido</span>
      )}
      <h3 className="text-lg font-semibold">{p.name || "Sin nombre"}</h3>
      <p className="mt-3">
        <span className="font-heading text-4xl font-extrabold">${Number.isFinite(p.price_usd_month) ? p.price_usd_month : 0}</span>
        <span className="text-sm text-muted-foreground">/mes</span>
      </p>
      <p className="mt-1 text-sm font-medium">{(p.teo_messages_month || 0).toLocaleString("es-EC")} mensajes de Teo al mes</p>
      <ul className="mt-6 flex-1 space-y-2 text-sm">
        <Item>{fmtLimit(p.max_users, "usuarios")}</Item>
        <Item>{fmtLimit(p.max_stores, "tiendas")}</Item>
        <Item>{fmtLimit(p.max_products, "productos")}</Item>
        {p.features
          .filter((f) => FEATURE_LABELS[f] && f !== "sello_teo")
          .map((f) => (
            <Item key={f}>{FEATURE_LABELS[f]}</Item>
          ))}
      </ul>
      {preview ? (
        <span className={ctaCls} aria-hidden>
          {cta}
        </span>
      ) : (
        <Link href={`/registro?plan=${p.id}`} className={ctaCls}>
          {cta}
        </Link>
      )}
    </div>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <CircleCheck className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
      {children}
    </li>
  );
}
