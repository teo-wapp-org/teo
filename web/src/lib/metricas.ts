/** Cálculo de KPIs (FICHA §16). Puro: recibe filas ya filtradas por comercio y rango. */
import { OPEN_STATUSES, CLOSED_STATUSES, type CaseStatus, type CaseType } from "./casos";
import { dayKey } from "./format";

export type MetricCase = { id: string; type: CaseType; status: CaseStatus; opened_at: string; closed_at: string | null };
export type MetricEvent = { case_id: string; to_status: CaseStatus | null };
export type MetricPayment = { order_id: string; status: "pendiente" | "confirmado" | "rechazado"; created_at: string; reviewed_at: string | null; total: number | null };
export type MetricSuggestion = { state: "nueva" | "usada" | "editada" | "descartada" };

export type Ratio = { num: number; den: number; ratio: number | null };

export type Kpis = {
  conversaciones: number;
  casos: number;
  casosPorEstado: Record<CaseStatus, number>;
  conversion: Ratio;
  llegadaPago: Ratio;
  autonomia: Ratio;
  usoSugerencias: Ratio;
  ventasConfirmadas: number;
  pagosConfirmados: number;
  tiempoConfirmacionMs: number | null; // mediana
  teoMensajes: number;
  teoCupo: number | null;
};

const PROGRESSION: readonly CaseStatus[] = ["nuevo", "en_conversacion", "cotizacion", "esperando_pago", "pago_por_confirmar", "confirmado", "cerrado_ganado"];

const ratio = (num: number, den: number): Ratio => ({ num, den, ratio: den > 0 ? num / den : null });

/** ¿El caso llegó (alguna vez) al estado `target` o más allá en el embudo de venta? */
export function reached(current: CaseStatus, history: Iterable<CaseStatus>, target: CaseStatus): boolean {
  const t = PROGRESSION.indexOf(target);
  const seen = [current, ...history];
  return seen.some((s) => PROGRESSION.indexOf(s) >= t && PROGRESSION.indexOf(s) >= 0);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeKpis(input: {
  conversaciones: number;
  cases: MetricCase[];
  events: MetricEvent[];
  /** casos con intervención humana (mensajes de operador) */
  humanCaseIds: Set<string>;
  payments: MetricPayment[];
  suggestions: MetricSuggestion[];
  teoMensajes: number;
  teoCupo: number | null;
}): Kpis {
  const history = new Map<string, CaseStatus[]>();
  for (const e of input.events) {
    if (!e.to_status) continue;
    const list = history.get(e.case_id) ?? [];
    list.push(e.to_status);
    history.set(e.case_id, list);
  }

  const casosPorEstado = Object.fromEntries([...OPEN_STATUSES, ...CLOSED_STATUSES].map((s) => [s, 0])) as Record<CaseStatus, number>;
  for (const c of input.cases) casosPorEstado[c.status] += 1;

  const ventas = input.cases.filter((c) => c.type === "venta");
  const conv = ventas.filter((c) => reached(c.status, history.get(c.id) ?? [], "confirmado")).length;
  const pago = ventas.filter((c) => reached(c.status, history.get(c.id) ?? [], "esperando_pago")).length;

  const cerrados = input.cases.filter((c) => CLOSED_STATUSES.includes(c.status));
  const autonomos = cerrados.filter((c) => !input.humanCaseIds.has(c.id)).length;

  const confirmados = new Map<string, MetricPayment>();
  for (const p of input.payments) if (p.status === "confirmado" && !confirmados.has(p.order_id)) confirmados.set(p.order_id, p);
  const ventasConfirmadas = Math.round([...confirmados.values()].reduce((a, p) => a + (Number(p.total) || 0), 0) * 100) / 100;
  const tiempos = [...confirmados.values()]
    .filter((p) => p.reviewed_at)
    .map((p) => new Date(p.reviewed_at!).getTime() - new Date(p.created_at).getTime())
    .filter((ms) => ms >= 0);

  const mostradas = input.suggestions.length;
  const aprovechadas = input.suggestions.filter((s) => s.state === "usada" || s.state === "editada").length;

  return {
    conversaciones: input.conversaciones,
    casos: input.cases.length,
    casosPorEstado,
    conversion: ratio(conv, ventas.length),
    llegadaPago: ratio(pago, ventas.length),
    autonomia: ratio(autonomos, cerrados.length),
    usoSugerencias: ratio(aprovechadas, mostradas),
    ventasConfirmadas,
    pagosConfirmados: confirmados.size,
    tiempoConfirmacionMs: median(tiempos),
    teoMensajes: input.teoMensajes,
    teoCupo: input.teoCupo,
  };
}

/** Serie diaria (zona Guayaquil) con días vacíos rellenados en 0. */
export function dailySeries(
  days: number,
  rows: { at: string; value?: number }[],
  now = new Date(),
): { day: string; label: string; value: number }[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) buckets.set(dayKey(new Date(now.getTime() - i * 86_400_000)), 0);
  for (const r of rows) {
    const k = dayKey(r.at);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + (r.value ?? 1));
  }
  return [...buckets.entries()].map(([day, value]) => ({ day, label: `${day.slice(8, 10)}/${day.slice(5, 7)}`, value: Math.round(value * 100) / 100 }));
}

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export function parseRange(v: string | string[] | undefined): Range {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 30;
}
