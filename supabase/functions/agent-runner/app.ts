// Edge Function `agent-runner` (verify_jwt = false; protegida con x-teo-cron-secret).
// La invoca pg_cron cada ~10 s (public.invoke_agent_runner, URL y secreto en Vault).
//
// Por cada mensaje de la cola inbound (pgmq):
//   - read_ct > MAX_ATTEMPTS → escala el caso a humano y lo borra (dead letter).
//   - reclama la conversación (claim_conversation: lease en DB; try_lock_conversation es por
//     transacción y no sirve entre llamadas RPC separadas), ejecuta runAgentTurn y borra el mensaje.
//   - si falla, no se borra: reaparece tras el visibility timeout (reintento con backoff natural).
import { Hono } from "@hono/hono";
import { escalateCase, ensureOpenCase } from "../_shared/agent/cases.ts";
import { runAgentTurn } from "../_shared/agent/run.ts";
import type { AgentDeps } from "../_shared/agent/types.ts";
import { safeEqual } from "../_shared/supabase.ts";

export const MAX_ATTEMPTS = 3;
const VT_SECONDS = 90;
const BUDGET_MS = 40_000;

type Job = { msg_id: number; read_ct: number; org_id: string; conversation_id: string };

export type RunnerDeps = { agent: AgentDeps; secret: string | undefined; budgetMs?: number };

export async function processQueue(deps: AgentDeps, budgetMs = BUDGET_MS) {
  const { db } = deps;
  const log = deps.log ?? (() => {});
  const started = Date.now();
  const summary = { processed: 0, replies: 0, escalated: 0, failed: 0, busy: 0 };

  while (Date.now() - started < budgetMs) {
    const { data, error } = await db.rpc("read_inbound", { p_qty: 5, p_vt: VT_SECONDS });
    if (error) throw new Error(`read_inbound: ${error.message}`);
    const jobs = (data ?? []) as Job[];
    if (!jobs.length) break;

    for (const job of jobs) {
      if (job.read_ct > MAX_ATTEMPTS) {
        try {
          const { data: conv } = await db.from("conversations").select("contact_id").eq("org_id", job.org_id).eq("id", job.conversation_id).maybeSingle();
          if (conv) {
            const c = await ensureOpenCase(db, { orgId: job.org_id, contactId: conv.contact_id, conversationId: job.conversation_id });
            await escalateCase(db, job.org_id, c.id, `El agente falló ${job.read_ct - 1} veces procesando la conversación`);
          }
          summary.escalated++;
        } catch (e) {
          log("dead_letter_escalate_failed", { msg_id: job.msg_id, error: String(e) });
        }
        await db.rpc("delete_inbound", { p_msg_id: job.msg_id });
        continue;
      }

      const { data: claimed } = await db.rpc("claim_conversation", { p_conversation: job.conversation_id, p_seconds: VT_SECONDS });
      if (!claimed) {
        summary.busy++; // otro worker la procesa; el mensaje reaparece tras el VT y se agrupará
        continue;
      }
      try {
        const r = await runAgentTurn(deps, { orgId: job.org_id, conversationId: job.conversation_id });
        await db.rpc("delete_inbound", { p_msg_id: job.msg_id });
        summary.processed++;
        summary.replies += r.replies.length;
      } catch (e) {
        summary.failed++;
        log("turn_failed", { msg_id: job.msg_id, read_ct: job.read_ct, error: String(e) });
      } finally {
        await db.rpc("release_conversation", { p_conversation: job.conversation_id });
      }
    }
  }
  return summary;
}

export function createRunnerApp(deps: RunnerDeps) {
  const app = new Hono().basePath("/agent-runner");
  app.post("*", async (c) => {
    const given = c.req.header("x-teo-cron-secret") ?? "";
    if (!deps.secret || !safeEqual(given, deps.secret)) return c.json({ error: "no_autorizado" }, 401);
    const summary = await processQueue(deps.agent, deps.budgetMs);
    return c.json(summary);
  });
  app.onError((err, c) => {
    deps.agent.log?.("runner_error", { error: String(err) });
    return c.json({ error: "error_interno" }, 500);
  });
  return app;
}
