import Link from "next/link";
import { CircleCheck, Circle, MessageCircle, Package, Settings, Store, Wallet, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireOrg } from "@/lib/auth";
import { buildChecklist, loadChecklistData, type ChecklistStepId } from "@/lib/data/checklist";
import { createClient } from "@/lib/supabase/server";
import { ResumenOperacion } from "@/components/operacion/resumen";

const STEP_ICONS: Record<ChecklistStepId, typeof Store> = {
  comercio: CircleCheck,
  tiendas: Store,
  catalogo: Package,
  pagos: Wallet,
  teo: Settings,
  whatsapp: MessageCircle,
};

/** Días restantes hasta una fecha (servidor, por request). */
function daysUntil(iso: string | null | undefined, now = new Date()) {
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 86_400_000));
}

export default async function OrgHome({ params }: PageProps<"/app/[org]">) {
  const { org: slug } = await params;
  const { org } = await requireOrg(slug);
  const supabase = await createClient();
  const [{ data: sub }, checklist] = await Promise.all([
    supabase.from("subscriptions").select("status, trial_ends_at, plan:plans(name, teo_messages_month)").eq("org_id", org.id).maybeSingle(),
    loadChecklistData(supabase, org.id),
  ]);

  const plan = sub?.plan as unknown as { name: string; teo_messages_month: number } | null;
  const trialDays = daysUntil(sub?.trial_ends_at);
  const base = `/app/${org.slug}`;

  const pasos = buildChecklist(checklist);
  const hechos = pasos.filter((p) => p.done).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Panel de</p>
          <h1 className="text-3xl font-bold">{org.name}</h1>
        </div>
        {plan && (
          <Badge className="w-fit bg-secondary text-secondary-foreground">
            Plan {plan.name}
            {sub?.status === "trial" && trialDays !== null ? ` · prueba: ${trialDays} días` : ""}
          </Badge>
        )}
      </div>

      <section aria-labelledby="checklist" className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="checklist" className="text-xl font-semibold">Deja a Teo listo para vender</h2>
            <p className="text-sm text-muted-foreground">{hechos} de {pasos.length} pasos completados</p>
          </div>
          <Sparkles className="size-6 text-foreground" aria-hidden />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={hechos} aria-valuemin={0} aria-valuemax={pasos.length}>
          <div className="h-full rounded-full bg-cta transition-all" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
        </div>
        <ol className="mt-6 grid gap-2 sm:grid-cols-2" aria-label="Pasos">
          {pasos.map((p) => {
            const Icon = STEP_ICONS[p.id];
            return (
            <li key={p.id}>
              <Link href={`${base}${p.path}`} className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted">
                {p.done ? <CircleCheck className="size-5 shrink-0 text-foreground" aria-hidden /> : <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
                <span className={p.done ? "text-muted-foreground line-through" : "font-medium"}>{p.label}</span>
                <span className="sr-only">{p.done ? "(completado)" : "(pendiente)"}</span>
                <Icon className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
            );
          })}
        </ol>
      </section>

      <ResumenOperacion orgId={org.id} base={base} />
    </div>
  );
}
