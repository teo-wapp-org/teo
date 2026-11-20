import type { Metadata } from "next";
import Link from "next/link";
import { StatusDot } from "@/components/operacion/bits";
import { DailyColumns } from "@/components/operacion/metric-charts";
import { requireOrg } from "@/lib/auth";
import { CLOSED_STATUSES, OPEN_STATUSES, STATUS_LABEL } from "@/lib/casos";
import { getMetricas } from "@/lib/data/metricas";
import { formatDuration, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { parseRange, RANGES, type Ratio } from "@/lib/metricas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Métricas" };

function Tile({ label, value, hint, id, goal }: { label: string; value: string; hint?: string; id: string; goal?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-heading text-2xl font-bold tabular-nums" data-testid={`kpi-${id}`}>{value}</dd>
      {(hint || goal) && (
        <dd className="mt-0.5 text-xs text-muted-foreground">
          {hint}
          {hint && goal ? " · " : ""}
          {goal && <span>meta {goal}</span>}
        </dd>
      )}
    </div>
  );
}

const ratioHint = (r: Ratio, unit: string) => (r.den ? `${r.num} de ${r.den} ${unit}` : `sin ${unit} en el rango`);

export default async function MetricasPage({ params, searchParams }: PageProps<"/app/[org]/metricas">) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { org } = await requireOrg(slug);
  const days = parseRange(sp.r);
  const { kpis: k, casosPorDia, ventasPorDia, teoMensajesRango } = await getMetricas(org.id, days);
  const states = [...OPEN_STATUSES, ...CLOSED_STATUSES];
  const maxState = Math.max(1, ...states.map((s) => k.casosPorEstado[s]));
  const usagePct = k.teoCupo ? Math.min(1, k.teoMensajes / k.teoCupo) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Métricas</h1>
          <p className="text-sm text-muted-foreground">Cómo vende tu WhatsApp con Teo en los últimos {days} días.</p>
        </div>
        <nav aria-label="Rango de fechas" className="inline-flex rounded-lg bg-muted p-0.5">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/app/${org.slug}/metricas?r=${r}`}
              aria-current={r === days ? "page" : undefined}
              className={cn("inline-flex h-7 items-center rounded-md px-3 text-sm font-medium", r === days ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {r} días
            </Link>
          ))}
        </nav>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicadores clave">
        <Tile id="conversaciones" label="Conversaciones activas" value={formatNumber(k.conversaciones)} hint={`${formatNumber(k.casos)} casos abiertos en el rango`} />
        <Tile id="ventas" label="Ventas confirmadas" value={formatMoney(k.ventasConfirmadas)} hint={`${k.pagosConfirmados} ${k.pagosConfirmados === 1 ? "pago" : "pagos"}`} />
        <Tile id="conversion" label="Conversión" value={formatPercent(k.conversion.ratio)} hint={ratioHint(k.conversion, "ventas")} goal={"> 25\u00a0%"} />
        <Tile id="llegada-pago" label="Llegada a pago" value={formatPercent(k.llegadaPago.ratio)} hint={ratioHint(k.llegadaPago, "ventas")} goal={"> 40\u00a0%"} />
        <Tile id="autonomia" label="Autonomía de Teo" value={formatPercent(k.autonomia.ratio)} hint={ratioHint(k.autonomia, "cerrados")} goal={"> 60\u00a0%"} />
        <Tile id="confirmacion" label="Confirmación de pago (mediana)" value={k.tiempoConfirmacionMs === null ? "—" : formatDuration(k.tiempoConfirmacionMs)} goal={"< 2\u00a0h"} />
        <Tile id="sugerencias" label="Uso de sugerencias" value={formatPercent(k.usoSugerencias.ratio)} hint={ratioHint(k.usoSugerencias, "sugerencias")} goal={"> 50\u00a0%"} />
        <div className="rounded-xl border border-border bg-card p-4">
          <dt className="text-xs font-medium text-muted-foreground">Mensajes de Teo (periodo del plan)</dt>
          <dd className="mt-1 font-heading text-2xl font-bold tabular-nums" data-testid="kpi-teo">
            {formatNumber(k.teoMensajes)}
            <span className="text-sm font-medium text-muted-foreground"> / {k.teoCupo ? formatNumber(k.teoCupo) : "—"}</span>
          </dd>
          {usagePct !== null && (
            <dd className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Cupo de mensajes usado" aria-valuemin={0} aria-valuemax={k.teoCupo ?? 0} aria-valuenow={k.teoMensajes}>
                <div className={cn("h-full rounded-full", usagePct > 0.9 ? "bg-destructive" : usagePct > 0.75 ? "bg-warning" : "bg-primary")} style={{ width: `${usagePct * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatNumber(teoMensajesRango)} respuestas en los últimos {days} días</p>
            </dd>
          )}
        </div>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <DailyColumns id="casos-dia" title="Casos nuevos por día" data={casosPorDia} />
        <DailyColumns id="ventas-dia" title="Ventas confirmadas por día" data={ventasPorDia} money />
      </div>

      <section aria-labelledby="por-estado" className="rounded-xl border border-border bg-card p-4">
        <h2 id="por-estado" className="mb-3 text-sm font-semibold">Casos por estado <span className="font-normal text-muted-foreground">(abiertos en el rango, estado actual)</span></h2>
        <table className="w-full text-sm">
          <caption className="sr-only">Casos por estado</caption>
          <tbody>
            {states.map((s) => (
              <tr key={s} data-testid={`estado-${s}`}>
                <th scope="row" className="w-44 py-1 pr-3 text-left font-normal">
                  <span className="inline-flex items-center gap-2"><StatusDot status={s} />{STATUS_LABEL[s]}</span>
                </th>
                <td className="py-1">
                  <div className="flex items-center gap-2">
                    <div className="h-3 flex-1">
                      <div className="h-full rounded-r bg-chart-3" style={{ width: `${(k.casosPorEstado[s] / maxState) * 100}%`, maxWidth: "100%" }} />
                    </div>
                    <span className="w-8 text-right tabular-nums">{k.casosPorEstado[s]}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
