// Edge Function `agent` (verify_jwt = true): simulador del panel y sugerencias bajo demanda.
//
//   POST /agent/simulate  { org_id, text?, reset? }
//     → { replies, handled_by, skipped, case, order, messages, agent: { enabled, mode } }
//   POST /agent/suggest   { case_id }
//     → { suggestions: [{ id, text, actions }] }
//
// Autorización: el JWT del usuario se valida consultando con SU token (RLS): debe ser miembro del
// comercio. Los datos se escriben con service role, siempre filtrando por org_id.
import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CLOSED } from "../_shared/agent/cases.ts";
import { loadOpenOrder } from "../_shared/agent/context.ts";
import { runAgentTurn } from "../_shared/agent/run.ts";
import { generateSuggestions } from "../_shared/agent/suggest.ts";
import type { AgentDeps } from "../_shared/agent/types.ts";

export const SIMULATOR_WA_ID = "simulador";

export type AgentAppDeps = {
  agent: AgentDeps; // db = service role
  userDb: (authHeader: string) => SupabaseClient;
};

const simulateBody = z.object({
  org_id: z.string().uuid(),
  text: z.string().trim().max(2000).optional(),
  reset: z.boolean().optional(),
});
const suggestBody = z.object({ case_id: z.string().uuid() });

/** Usuario autenticado y miembro del comercio (consultado con su propio token → RLS). */
async function requireMember(deps: AgentAppDeps, authHeader: string | undefined, orgId: string) {
  if (!authHeader?.startsWith("Bearer ")) return { error: "no_autenticado", status: 401 as const };
  const udb = deps.userDb(authHeader);
  const { data: u, error } = await udb.auth.getUser(authHeader.slice(7));
  if (error || !u.user) return { error: "no_autenticado", status: 401 as const };
  const { data: m } = await udb.from("memberships").select("role").eq("org_id", orgId).eq("user_id", u.user.id).maybeSingle();
  if (!m) return { error: "sin_acceso", status: 403 as const };
  return { userId: u.user.id, role: m.role as string };
}

export async function simulatorState(db: SupabaseClient, orgId: string, conversationId: string, contactId: string) {
  const [{ data: cases }, { data: msgs }, { data: conv }, { data: settings }] = await Promise.all([
    db.from("cases").select("id, number, status, type, previous_status, estimated_amount, opened_at")
      .eq("org_id", orgId).eq("contact_id", contactId).order("opened_at", { ascending: false }).limit(1),
    db.from("messages").select("id, direction, author, type, body, payload, created_at")
      .eq("org_id", orgId).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(60),
    db.from("conversations").select("handled_by").eq("org_id", orgId).eq("id", conversationId).single(),
    db.from("agent_settings").select("enabled, mode").eq("org_id", orgId).maybeSingle(),
  ]);
  const c = cases?.[0] ?? null;
  let order = c ? await loadOpenOrder(db, orgId, c.id) : null;
  if (c && !order) {
    // caso cerrado o pedido pagado: muestra el último pedido del caso
    const { data: last } = await db.from("orders").select("id").eq("org_id", orgId).eq("case_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last) {
      const { data } = await db.from("orders")
        .select("id, status, subtotal, shipping, total, delivery, items:order_items(id, product_id, variant_id, name, quantity, unit_price, subtotal)")
        .eq("id", last.id).single();
      order = data as unknown as typeof order;
    }
  }
  return {
    handled_by: conv?.handled_by ?? "teo",
    agent: { enabled: settings?.enabled ?? true, mode: settings?.mode ?? "piloto" },
    case: c ? { ...c, open: !CLOSED.includes(c.status) } : null,
    order: order
      ? {
        status: order.status,
        items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, unit_price: Number(i.unit_price), subtotal: Number(i.subtotal) })),
        subtotal: Number(order.subtotal),
        shipping: Number(order.shipping),
        total: Number(order.total),
      }
      : null,
    messages: (msgs ?? []).reverse().map((m) => ({
      id: m.id, direction: m.direction, author: m.author, type: m.type, body: m.body,
      media_url: (m.payload as { media_url?: string } | null)?.media_url ?? null, created_at: m.created_at,
    })),
  };
}

export function createAgentApp(deps: AgentAppDeps) {
  const app = new Hono().basePath("/agent");
  app.use("*", cors({ origin: "*", allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"], allowMethods: ["POST", "OPTIONS"] }));

  app.onError((err, c) => {
    deps.agent.log?.("agent_error", { error: String(err) });
    return c.json({ error: "error_interno" }, 500);
  });

  app.post("/simulate", async (c) => {
    const parsed = simulateBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "entrada_invalida" }, 400);
    const { org_id: orgId, text, reset } = parsed.data;
    const auth = await requireMember(deps, c.req.header("authorization"), orgId);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    const db = deps.agent.db;

    if (reset) {
      // datos de prueba: borrar el contacto del simulador elimina en cascada conversación, casos, mensajes y pedidos
      const { error } = await db.from("contacts").delete().eq("org_id", orgId).eq("wa_id", SIMULATOR_WA_ID);
      if (error) throw new Error(`reset: ${error.message}`);
    }
    const { data: contact, error: e1 } = await db.from("contacts")
      .upsert({ org_id: orgId, wa_id: SIMULATOR_WA_ID, name: "Cliente de prueba" }, { onConflict: "org_id,wa_id" })
      .select("id").single();
    if (e1) throw new Error(`contact: ${e1.message}`);
    const { data: conv, error: e2 } = await db.from("conversations")
      .upsert({ org_id: orgId, contact_id: contact.id, channel: "simulador" }, { onConflict: "org_id,contact_id,channel" })
      .select("id").single();
    if (e2) throw new Error(`conversation: ${e2.message}`);

    let turn = null;
    if (text) {
      const now = deps.agent.now().toISOString();
      const { error: e3 } = await db.from("messages").insert({
        org_id: orgId, conversation_id: conv.id, direction: "in", author: "cliente", type: "text", body: text, status: "received",
      });
      if (e3) throw new Error(`message: ${e3.message}`);
      await db.from("conversations").update({ last_inbound_at: now, last_message_at: now }).eq("org_id", orgId).eq("id", conv.id);
      turn = await runAgentTurn(deps.agent, { orgId, conversationId: conv.id });
    }
    const state = await simulatorState(db, orgId, conv.id, contact.id);
    return c.json({ replies: turn?.replies ?? [], skipped: turn?.skipped ?? null, usage: turn?.usage ?? null, ...state });
  });

  app.post("/suggest", async (c) => {
    const parsed = suggestBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "entrada_invalida" }, 400);
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "no_autenticado" }, 401);
    // el caso se lee con el token del usuario: si no es visible por RLS, no existe para él
    const { data: cs } = await deps.userDb(authHeader).from("cases").select("id, org_id").eq("id", parsed.data.case_id).maybeSingle();
    if (!cs) return c.json({ error: "no_encontrado" }, 404);
    const auth = await requireMember(deps, authHeader, cs.org_id);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    const suggestions = await generateSuggestions(deps.agent, { orgId: cs.org_id, caseId: cs.id, n: 3 });
    return c.json({ suggestions });
  });

  return app;
}
