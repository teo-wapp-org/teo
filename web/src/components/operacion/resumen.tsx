import Link from "next/link";
import { getResumen } from "@/lib/data/metricas";
import { formatMoney, formatNumber } from "@/lib/format";

/** Tarjetas de resumen del inicio del panel (Server Component, datos reales con RLS). */
export async function ResumenOperacion({ orgId, base }: { orgId: string; base: string }) {
  const r = await getResumen(orgId);
  const cards = [
    { k: "Conversaciones hoy", v: formatNumber(r.conversacionesHoy), href: `${base}/conversaciones`, id: "conversaciones-hoy" },
    {
      k: "Esperando pago",
      v: formatMoney(r.esperandoPago),
      hint: `${r.esperandoPagoCasos} ${r.esperandoPagoCasos === 1 ? "caso" : "casos"}`,
      href: `${base}/casos`,
      id: "esperando-pago",
    },
    { k: "Mensajes de Teo este mes", v: `${formatNumber(r.teo.used)} / ${r.teo.quota ? formatNumber(r.teo.quota) : "—"}`, href: `${base}/metricas`, id: "mensajes-teo" },
  ];
  return (
    <section className="grid gap-4 sm:grid-cols-3" aria-label="Resumen">
      {cards.map((s) => (
        <Link key={s.k} href={s.href} className="rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
          <p className="text-sm text-muted-foreground">{s.k}</p>
          <p className="mt-1 font-heading text-3xl font-bold tabular-nums" data-testid={`resumen-${s.id}`}>{s.v}</p>
          {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
        </Link>
      ))}
    </section>
  );
}
