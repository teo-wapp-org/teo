"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatNumber } from "@/lib/format";

type Point = { day: string; label: string; value: number };

/** Columnas diarias de una sola serie (sin leyenda: el título la nombra). Tooltip al pasar el cursor y tabla accesible. */
export function DailyColumns({ title, data, money = false, id }: { title: string; data: Point[]; money?: boolean; id: string }) {
  const fmt = (v: number) => (money ? formatMoney(v) : formatNumber(v));
  const total = data.reduce((a, d) => a + d.value, 0);
  const interval = data.length > 31 ? 13 : data.length > 7 ? 4 : 0;
  return (
    <figure className="rounded-xl border border-border bg-card p-4" aria-labelledby={`${id}-t`}>
      <figcaption className="mb-3 flex items-baseline justify-between gap-2">
        <span id={`${id}-t`} className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">Total: <span className="font-semibold text-foreground tabular-nums">{fmt(total)}</span></span>
      </figcaption>
      <div className="h-48" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval={interval} />
            <YAxis
              allowDecimals={money}
              tickLine={false}
              axisLine={false}
              width={money ? 56 : 32}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => (money ? formatMoney(v, { compact: true }) : formatNumber(v))}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Point;
                return (
                  <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <p className="text-muted-foreground">{p.label}</p>
                    <p className="font-semibold tabular-nums">{fmt(p.value)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver datos</summary>
        <table className="mt-2 w-full">
          <caption className="sr-only">{title}</caption>
          <thead><tr className="text-left text-muted-foreground"><th scope="col" className="font-medium">Día</th><th scope="col" className="text-right font-medium">Valor</th></tr></thead>
          <tbody>
            {data.filter((d) => d.value > 0).map((d) => (
              <tr key={d.day}><td>{d.label}</td><td className="text-right tabular-nums">{fmt(d.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
