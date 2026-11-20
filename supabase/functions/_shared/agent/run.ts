// Turno del agente: contrato público entre el webhook/worker/simulador y Teo.
//
//   runAgentTurn(deps, { orgId, conversationId })
//     → { replies, caseId, handledBy, usage, skipped? }
//
// 1. Carga conversación y contacto (filtrando por org), abre caso si no hay uno abierto y le asigna
//    los mensajes entrantes sueltos.
// 2. Si no hay mensajes nuevos del cliente → no hace nada.
// 3. Si la conversación está en modo humano, el agente está desactivado, el comercio está en
//    copiloto o el cupo del plan se agotó → NO responde: genera sugerencias y retorna sin replies.
// 4. Loop de herramientas (máx. 6 iteraciones, timeout total). Errores repetidos, refusal o
//    exceso de iteraciones → escala a humano con un mensaje de cortesía.
// 5. Guarda las respuestas en messages (queued si WhatsApp, sent si simulador), registra agent_runs
//    e incrementa el uso (increment_teo_usage; el simulador no consume cupo).
import { addUsage, emptyUsage, type LlmMessage, type LlmToolResultBlock, textOf, toolUsesOf } from "../llm/types.ts";
import { escalateCase, ensureOpenCase, moveCase } from "./cases.ts";
import { loadCaseState, loadOrgContext, quotaStatus } from "./context.ts";
import { buildHistory, buildOrgContext, buildVolatile, systemBlocks } from "./prompt.ts";
import { generateSuggestions, loadCaseHistory } from "./suggest.ts";
import { sanitizeReply, unknownAmounts } from "./text.ts";
import { executeTool, TOOL_DEFS } from "./tools.ts";
import {
  type AgentDeps, type AgentTurnResult, type Channel, DEFAULT_TURN_TIMEOUT_MS, MAX_TOOL_ITERATIONS,
  type OutboundReply, type SkipReason, type ToolContext,
} from "./types.ts";

export const HANDOFF_TEXT = "Gracias por escribirnos. Una persona del equipo te responderá en un momento.";
export const PRICE_GUARD_TEXT = "Déjame confirmar ese dato con el equipo y te escribimos en un momento.";

export async function runAgentTurn(
  deps: AgentDeps,
  input: { orgId: string; conversationId: string },
): Promise<AgentTurnResult> {
  const { db } = deps;
  const { orgId, conversationId } = input;
  const t0 = Date.now();
  const log = deps.log ?? (() => {});

  const { data: conv, error: convErr } = await db.from("conversations")
    .select("id, org_id, contact_id, channel, handled_by")
    .eq("org_id", orgId).eq("id", conversationId).maybeSingle();
  if (convErr) throw new Error(`conversation_load: ${convErr.message}`);
  if (!conv) throw new Error("conversation_not_found");
  const channel = conv.channel as Channel;

  const c0 = await ensureOpenCase(db, { orgId, contactId: conv.contact_id, conversationId });
  await db.from("messages").update({ case_id: c0.id }).eq("org_id", orgId).eq("conversation_id", conversationId).is("case_id", null);

  // ¿hay mensajes del cliente posteriores a la última respuesta?
  const { data: lastOut } = await db.from("messages").select("created_at")
    .eq("org_id", orgId).eq("conversation_id", conversationId).eq("direction", "out")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let pendingQ = db.from("messages").select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("conversation_id", conversationId).eq("direction", "in");
  if (lastOut) pendingQ = pendingQ.gt("created_at", lastOut.created_at);
  const { count: pending } = await pendingQ;

  const base = { caseId: c0.id, usage: emptyUsage() };
  if (!pending) return { ...base, replies: [], handledBy: conv.handled_by, skipped: "sin_mensajes" };

  const ctx = await loadOrgContext(db, orgId);
  let skip: SkipReason | null = null;
  if (ctx.org.status === "suspendido") skip = "suspendido";
  else if (conv.handled_by === "humano") skip = "humano";
  else if (!ctx.settings.enabled) skip = "desactivado";
  else if (ctx.settings.mode === "copiloto") skip = "copiloto";
  else if ((await quotaStatus(db, orgId)).exhausted) skip = "cupo_agotado";
  if (skip) {
    if (skip !== "suspendido") {
      try {
        await generateSuggestions(deps, { orgId, caseId: c0.id, n: 3 });
      } catch (e) {
        log("suggest_failed", { error: String(e) });
      }
    }
    return { ...base, replies: [], handledBy: conv.handled_by, skipped: skip };
  }

  let caseRow = c0;
  if (caseRow.status === "nuevo") caseRow = await moveCase(db, caseRow, "en_conversacion", "Teo atiende la conversación");

  const [state, rows, contact] = await Promise.all([
    loadCaseState(db, orgId, caseRow.id),
    loadCaseHistory(deps, orgId, caseRow.id),
    db.from("contacts").select("name").eq("org_id", orgId).eq("id", conv.contact_id).maybeSingle(),
  ]);
  const volatile = buildVolatile(deps.now(), ctx, state, { name: contact.data?.name ?? null });
  const convo: LlmMessage[] = [...buildHistory(rows), { role: "system", content: volatile }];
  const system = systemBlocks(ctx);
  const knownSources = [buildOrgContext(ctx), volatile];

  const toolCtx: ToolContext = {
    db, now: deps.now, orgId, caseId: caseRow.id, contactId: conv.contact_id, conversationId,
    timezone: ctx.org.timezone, extraReplies: [], escalated: false,
  };

  const timeoutMs = deps.timeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  let usage = emptyUsage();
  let model = deps.llm.name;
  let stopReason = "";
  let finalText = "";
  let error: string | null = null;
  const toolLog: { name: string; ok: boolean; error?: string }[] = [];

  try {
    let llmFailures = 0;
    let iterations = 0;
    while (true) {
      if (abort.signal.aborted) { error = "timeout"; break; }
      if (iterations >= MAX_TOOL_ITERATIONS) { error = "max_iterations"; break; }
      let res;
      try {
        res = await deps.llm.complete({ task: "agent", system, tools: TOOL_DEFS, messages: convo }, { signal: abort.signal });
      } catch (e) {
        llmFailures++;
        log("llm_error", { error: String(e), attempt: llmFailures });
        if (llmFailures >= 2 || abort.signal.aborted) { error = abort.signal.aborted ? "timeout" : `llm_error: ${String(e).slice(0, 300)}`; break; }
        continue;
      }
      iterations++;
      usage = addUsage(usage, res.usage);
      model = res.model;
      stopReason = res.stopReason;
      if (res.stopReason === "refusal") { error = "refusal"; break; }
      if (res.stopReason === "pause_turn") { convo.push({ role: "assistant", content: res.content }); continue; }

      const calls = toolUsesOf(res.content);
      convo.push({ role: "assistant", content: res.content });
      if (!calls.length) {
        finalText = textOf(res.content);
        if (!finalText && res.stopReason === "max_tokens") error = "max_tokens";
        break;
      }
      // Las herramientas mutan estado: se ejecutan en orden, y todos los resultados van en un solo mensaje.
      const results: LlmToolResultBlock[] = [];
      for (const call of calls) {
        const out = await executeTool(toolCtx, call.name, call.input);
        toolLog.push({ name: call.name, ok: out.ok, ...(out.ok ? {} : { error: out.detail ?? out.error }) });
        if (out.ok) knownSources.push(JSON.stringify(out.result));
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(out.ok ? out.result : { error: out.error }),
          ...(out.ok ? {} : { is_error: true }),
        });
      }
      convo.push({ role: "user", content: results });
      if (toolLog.filter((t) => !t.ok).length >= 3) { error = "tool_errors"; break; }
    }
  } finally {
    clearTimeout(timer);
  }

  // Guardrail de precios: todo monto mencionado debe venir del contexto o de una herramienta.
  if (!error && finalText) {
    const unknown = unknownAmounts(finalText, knownSources);
    if (unknown.length) {
      log("price_guard", { unknown, text: finalText });
      error = `precio_no_verificado: ${unknown.join(", ")}`;
    }
  }

  let handledBy: "teo" | "humano" = toolCtx.escalated ? "humano" : "teo";
  if (error) {
    await escalateCase(db, orgId, caseRow.id, error.startsWith("precio") ? "Teo iba a mencionar un precio no verificado" : `Error del agente: ${error}`)
      .catch((e) => log("escalate_failed", { error: String(e) }));
    handledBy = "humano";
    finalText = error.startsWith("precio") ? PRICE_GUARD_TEXT : HANDOFF_TEXT;
  } else if (!finalText && toolCtx.escalated) {
    finalText = HANDOFF_TEXT;
  }

  // Validación de salida y persistencia
  const allowedHosts = [ctx.profile.website, ctx.profile.instagram, ...ctx.paymentMethods.map((m) => String((m.details as { url?: string })?.url ?? ""))]
    .filter(Boolean)
    .map((u) => { try { return new URL(String(u).startsWith("http") ? String(u) : `https://${u}`).host.replace(/^www\./, ""); } catch { return ""; } })
    .filter(Boolean);
  const outgoing: Omit<OutboundReply, "messageId">[] = [];
  const clean = sanitizeReply(finalText, allowedHosts);
  if (clean) outgoing.push({ type: "text", body: clean });
  for (const img of toolCtx.extraReplies) outgoing.push({ type: "image", body: img.body, mediaUrl: img.mediaUrl });

  const replies: OutboundReply[] = [];
  if (outgoing.length) {
    const { data: saved, error: saveErr } = await db.from("messages").insert(outgoing.map((o) => ({
      org_id: orgId, conversation_id: conversationId, case_id: caseRow.id, direction: "out", author: "teo",
      type: o.type, body: o.body, status: channel === "whatsapp" ? "queued" : "sent",
      payload: o.mediaUrl ? { media_url: o.mediaUrl } : null,
    }))).select("id, type, body, payload, created_at").order("created_at");
    if (saveErr) throw new Error(`messages_save: ${saveErr.message}`);
    for (const m of saved ?? []) {
      replies.push({ messageId: m.id, type: m.type, body: m.body ?? "", ...(m.payload?.media_url ? { mediaUrl: m.payload.media_url } : {}) });
    }
    const nowIso = deps.now().toISOString();
    await db.from("conversations").update({ last_message_at: nowIso }).eq("org_id", orgId).eq("id", conversationId);
    // El simulador no consume el cupo del plan (el costo real queda igual en agent_runs).
    if (channel !== "simulador") {
      const { error: usageErr } = await db.rpc("increment_teo_usage", { p_org: orgId, p_n: replies.length });
      if (usageErr) log("usage_failed", { error: usageErr.message });
    }
  }

  await db.from("agent_runs").insert({
    org_id: orgId, case_id: caseRow.id, kind: "reply", model,
    input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
    cache_read_tokens: usage.cacheReadTokens, cache_write_tokens: usage.cacheWriteTokens,
    latency_ms: Date.now() - t0, tools: toolLog, stop_reason: stopReason || null, error,
  });

  return { replies, caseId: caseRow.id, handledBy, usage };
}
