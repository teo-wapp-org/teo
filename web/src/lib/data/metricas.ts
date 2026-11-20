import "server-only";
import { createClient } from "@/lib/supabase/server";
import { startOfTodayIso } from "@/lib/format";
import { computeKpis, dailySeries, type MetricCase, type MetricEvent, type MetricPayment, type MetricSuggestion, type Range } from "@/lib/metricas";

/** Consumo de Teo del periodo actual y cupo del plan. */
export async function getTeoUsage(orgId: string) {
  const supabase = await createClient();
  const [{ data: usage }, { data: sub }] = await Promise.all([
    supabase.from("usage_counters").select("teo_messages, extra_messages, period_start").eq("org_id", orgId).order("period_start", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("subscriptions").select("plan:plans(name, teo_messages_month)").eq("org_id", orgId).maybeSingle(),
  ]);
  const plan = sub?.plan as unknown as { name: string; teo_messages_month: number } | null;
  return { used: Number(usage?.teo_messages ?? 0), quota: plan?.teo_messages_month ?? null, plan: plan?.name ?? null };
}

/** Tarjetas de resumen del inicio del panel. */
export async function getResumen(orgId: string) {
  const supabase = await createClient();
  const [conv, waiting, usage] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("last_message_at", startOfTodayIso()),
    supabase.from("cases").select("estimated_amount").eq("org_id", orgId).eq("status", "esperando_pago").limit(2000),
    getTeoUsage(orgId),
  ]);
  const rows = waiting.data ?? [];
  return {
    conversacionesHoy: conv.count ?? 0,
    esperandoPago: rows.reduce((a, r) => a + (Number(r.estimated_amount) || 0), 0),
    esperandoPagoCasos: rows.length,
    teo: usage,
  };
}

export async function getMetricas(orgId: string, days: Range) {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [conv, cases, events, human, payments, sugg, teoMsgs, usage] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("last_message_at", since),
    supabase.from("cases").select("id, type, status, opened_at, closed_at").eq("org_id", orgId).gte("opened_at", since).limit(10000),
    supabase.from("case_events").select("case_id, to_status").eq("org_id", orgId).gte("created_at", since).in("to_status", ["esperando_pago", "pago_por_confirmar", "confirmado", "cerrado_ganado"]).limit(20000),
    supabase.from("messages").select("case_id").eq("org_id", orgId).like("author", "user:%").gte("created_at", since).not("case_id", "is", null).limit(20000),
    supabase
      .from("payments")
      .select("order_id, status, created_at, reviewed_at, order:orders!payments_order_id_org_id_fkey(total)")
      .eq("org_id", orgId)
      .gte("created_at", since)
      .limit(10000),
    supabase.from("ai_suggestions").select("state").eq("org_id", orgId).gte("created_at", since).limit(20000),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("author", "teo").gte("created_at", since),
    getTeoUsage(orgId),
  ]);

  const caseRows = (cases.data ?? []) as MetricCase[];
  const paymentRows: MetricPayment[] = (payments.data ?? []).map((p) => ({
    order_id: p.order_id as string,
    status: p.status as MetricPayment["status"],
    created_at: p.created_at as string,
    reviewed_at: (p.reviewed_at as string | null) ?? null,
    total: Number((p.order as unknown as { total: number } | null)?.total ?? 0),
  }));

  const kpis = computeKpis({
    conversaciones: conv.count ?? 0,
    cases: caseRows,
    events: (events.data ?? []) as MetricEvent[],
    humanCaseIds: new Set((human.data ?? []).map((m) => m.case_id as string)),
    payments: paymentRows,
    suggestions: (sugg.data ?? []) as MetricSuggestion[],
    teoMensajes: usage.used,
    teoCupo: usage.quota,
  });

  const seen = new Set<string>();
  const ventas = paymentRows
    .filter((p) => p.status === "confirmado" && p.reviewed_at && !seen.has(p.order_id) && seen.add(p.order_id))
    .map((p) => ({ at: p.reviewed_at!, value: p.total ?? 0 }));

  return {
    kpis,
    teoMensajesRango: teoMsgs.count ?? 0,
    casosPorDia: dailySeries(days, caseRows.map((c) => ({ at: c.opened_at }))),
    ventasPorDia: dailySeries(days, ventas),
  };
}
