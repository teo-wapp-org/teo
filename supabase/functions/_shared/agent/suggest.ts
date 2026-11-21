// Respuestas sugeridas para el panel (FICHA §7.6): modo humano, copiloto o cupo agotado.
import { emptyUsage, textOf } from "../llm/types.ts";
import { getCase } from "./cases.ts";
import { loadCaseState, loadOrgContext } from "./context.ts";
import { buildHistory, buildVolatile, systemBlocks, type HistoryMessage } from "./prompt.ts";
import { sanitizeReply } from "./text.ts";
import { resolveAgentDeps } from "./runtime.ts";
import type { AgentDeps } from "./types.ts";

export type Suggestion = { id: string; text: string; actions: SuggestionAction[] };
export type SuggestionAction = { tipo: "mover_estado" | "enviar_datos_pago" | "escalar" | "ninguna"; estado: string | null };

const STATUSES = ["en_conversacion", "cotizacion", "esperando_pago", "pago_por_confirmar", "confirmado", "requiere_atencion", "cerrado_ganado", "cerrado_perdido", "resuelto"];

export const SUGGESTIONS_SCHEMA = {
  type: "object",
  properties: {
    sugerencias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          texto: { type: "string" },
          acciones: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tipo: { type: "string", enum: ["mover_estado", "enviar_datos_pago", "escalar", "ninguna"] },
                estado: { type: ["string", "null"], enum: [...STATUSES, null] },
              },
              required: ["tipo", "estado"],
              additionalProperties: false,
            },
          },
        },
        required: ["texto", "acciones"],
        additionalProperties: false,
      },
    },
  },
  required: ["sugerencias"],
  additionalProperties: false,
};

export async function loadCaseHistory(deps: AgentDeps, orgId: string, caseId: string, limit = 30) {
  const { data, error } = await deps.db.from("messages")
    .select("id, direction, author, type, body, media_path, created_at")
    .eq("org_id", orgId).eq("case_id", caseId)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`history: ${error.message}`);
  return ((data ?? []) as (HistoryMessage & { id: string; created_at: string })[]).reverse();
}

export async function generateSuggestions(
  baseDeps: AgentDeps,
  p: { orgId: string; caseId: string; n?: number },
): Promise<Suggestion[]> {
  const deps = await resolveAgentDeps(baseDeps);
  const n = Math.min(Math.max(p.n ?? 3, 1), 3);
  const t0 = Date.now();
  const c = await getCase(deps.db, p.orgId, p.caseId); // valida que el caso sea del comercio
  const [ctx, state, rows, contact] = await Promise.all([
    loadOrgContext(deps.db, p.orgId),
    loadCaseState(deps.db, p.orgId, p.caseId),
    loadCaseHistory(deps, p.orgId, p.caseId),
    deps.db.from("contacts").select("name").eq("org_id", p.orgId).eq("id", c.contact_id).maybeSingle(),
  ]);
  const history = buildHistory(rows);
  if (!history.length) return [];
  if (history.at(-1)!.role !== "user") history.push({ role: "user", content: "(sin mensajes nuevos del cliente)" });

  const instruction = `${buildVolatile(deps.now(), ctx, state, { name: contact.data?.name ?? null })}

Modo copiloto: NO respondes tú al cliente. Propón ${n} respuestas alternativas, cortas y listas para enviar, que una persona del equipo podría mandar como siguiente mensaje (variando enfoque o tono). Usa solo datos del contexto; no inventes precios. En "acciones" sugiere, si aplica, mover el caso a otro estado (mover_estado + estado), enviar datos de pago o escalar; si no, una lista vacía.`;

  let usage = emptyUsage();
  let model = "";
  let error: string | null = null;
  let parsed: { sugerencias: { texto: string; acciones: SuggestionAction[] }[] } = { sugerencias: [] };
  try {
    const res = await deps.llm.complete({
      task: "suggest",
      system: systemBlocks(ctx),
      messages: [...history, { role: "system", content: instruction }],
      jsonSchema: SUGGESTIONS_SCHEMA,
      maxTokens: 8000,
    });
    usage = res.usage;
    model = res.model;
    if (res.stopReason === "refusal") throw new Error("refusal");
    parsed = JSON.parse(textOf(res.content));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const allowedHosts = [ctx.profile.website, ctx.profile.instagram].filter(Boolean).map((u) => {
    try { return new URL(String(u).startsWith("http") ? String(u) : `https://${u}`).host.replace(/^www\./, ""); } catch { return ""; }
  }).filter(Boolean);

  const lastIn = [...rows].reverse().find((r) => r.direction === "in");
  const items = (parsed.sugerencias ?? []).slice(0, n)
    .map((s) => ({ text: sanitizeReply(s.texto ?? "", allowedHosts), actions: (s.acciones ?? []).filter((a) => a.tipo !== "ninguna") }))
    .filter((s) => s.text);

  let out: Suggestion[] = [];
  if (items.length) {
    await deps.db.from("ai_suggestions").update({ state: "descartada" }).eq("org_id", p.orgId).eq("case_id", p.caseId).eq("state", "nueva");
    const { data, error: insErr } = await deps.db.from("ai_suggestions")
      .insert(items.map((s) => ({ org_id: p.orgId, case_id: p.caseId, message_id: lastIn?.id ?? null, text: s.text, actions: s.actions })))
      .select("id, text, actions");
    if (insErr) throw new Error(`ai_suggestions: ${insErr.message}`);
    out = (data ?? []) as Suggestion[];
  }

  await deps.db.from("agent_runs").insert({
    org_id: p.orgId, case_id: p.caseId, kind: "suggestion", model: model || deps.llm.name,
    input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
    cache_read_tokens: usage.cacheReadTokens, cache_write_tokens: usage.cacheWriteTokens,
    latency_ms: Date.now() - t0, tools: [], stop_reason: error ? "error" : "end_turn",
    error: error ?? (deps.configError ? `config: ${deps.configError}` : null),
  });
  if (error) deps.log?.("suggest_error", { caseId: p.caseId, error });
  return out;
}
