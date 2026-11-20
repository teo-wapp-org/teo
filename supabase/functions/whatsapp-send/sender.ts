// Envío de mensajes salientes de WhatsApp (lógica pura con dependencias inyectables).
// Lo dispara el trigger AFTER INSERT de messages (pg_net) y un barrido de pg_cron cada minuto.
import { type FetchFn, GraphError, WhatsAppClient, WINDOW_CLOSED_CODE } from "../_shared/whatsapp/client.ts";
import { MAX_SEND_ATTEMPTS } from "../_shared/whatsapp/constants.ts";
import { isWindowOpen, OutboundError, type OutboundRow, requiresOpenWindow, toGraphMessage, WINDOW_CLOSED } from "../_shared/whatsapp/outbound.ts";
import { timingSafeEqual } from "../_shared/whatsapp/signature.ts";
import type { Logger } from "../_shared/log.ts";

export interface SendTarget {
  channel: string;
  last_inbound_at: string | null;
  wa_id: string;
  account: { id: string; phone_number_id: string | null; status: string } | null;
}

export interface SendDeps {
  sendSecret: string;
  claim(messageId: string | null): Promise<OutboundRow[]>;
  loadTarget(conversationId: string): Promise<SendTarget | null>;
  getToken(accountId: string): Promise<string | null>;
  signUrl(bucket: string, path: string): Promise<string>;
  markSent(id: string, wamid: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  /** Libera el reclamo para que el barrido lo reintente. */
  release(id: string): Promise<void>;
  fetch?: FetchFn;
  now(): Date;
  waitUntil(p: Promise<unknown>): void;
  log: Logger;
}

export type SendOutcome = "sent" | "failed" | "retry";
export interface SendSummary { sent: number; failed: number; retry: number }

export async function sendOne(row: OutboundRow, deps: SendDeps): Promise<SendOutcome> {
  const fail = async (error: string) => {
    await deps.markFailed(row.id, error);
    deps.log("warn", "wa_envio_fallido", { message_id: row.id, org_id: row.org_id, error });
    return "failed" as const;
  };

  const target = await deps.loadTarget(row.conversation_id);
  if (!target || target.channel !== "whatsapp") return fail("canal_no_whatsapp");
  if (!target.account || target.account.status !== "conectado" || !target.account.phone_number_id) return fail("whatsapp_no_conectado");
  if (requiresOpenWindow(row.type) && !isWindowOpen(target.last_inbound_at, deps.now())) return fail(WINDOW_CLOSED);

  let message;
  try {
    message = await toGraphMessage(row, deps.signUrl);
  } catch (e) {
    return fail(e instanceof OutboundError ? `mensaje_invalido: ${e.message}` : String(e));
  }

  const token = await deps.getToken(target.account.id);
  if (!token) return fail("sin_token");

  const client = new WhatsAppClient({ token, phoneNumberId: target.account.phone_number_id, fetch: deps.fetch });
  const replyTo = typeof row.payload?.reply_to === "string" ? row.payload.reply_to : null;
  try {
    const wamid = await client.send(target.wa_id, message, replyTo);
    await deps.markSent(row.id, wamid);
    deps.log("info", "wa_enviado", { message_id: row.id, org_id: row.org_id, type: row.type, wamid });
    return "sent";
  } catch (e) {
    if (e instanceof GraphError) {
      if (e.code === WINDOW_CLOSED_CODE) return fail(WINDOW_CLOSED);
      if (e.retriable && row.send_attempts < MAX_SEND_ATTEMPTS) {
        await deps.release(row.id);
        deps.log("warn", "wa_envio_reintento", { message_id: row.id, attempt: row.send_attempts, error: e.message });
        return "retry";
      }
      return fail(`graph${e.code ? ` ${e.code}` : ""}: ${e.message}`.slice(0, 500));
    }
    return fail(String(e).slice(0, 500));
  }
}

export async function processOutbound(rows: OutboundRow[], deps: SendDeps): Promise<SendSummary> {
  const sum: SendSummary = { sent: 0, failed: 0, retry: 0 };
  // en orden de creación para conservar el orden de la conversación
  for (const row of rows) {
    try {
      sum[await sendOne(row, deps)]++;
    } catch (e) {
      sum.retry++;
      deps.log("error", "wa_envio_error", { message_id: row.id, error: String(e) });
      await deps.release(row.id).catch(() => {});
    }
  }
  return sum;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** POST { message_id } | { sweep: true } [+ wait: true]. Autenticado con x-teo-send-secret (de Vault vía pg_net). */
export async function handleSendRequest(req: Request, deps: SendDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = req.headers.get("x-teo-send-secret") ?? "";
  if (!deps.sendSecret || !timingSafeEqual(secret, deps.sendSecret)) return json({ error: "unauthorized" }, 401);

  let body: { message_id?: string; sweep?: boolean; wait?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (body.message_id && !UUID.test(body.message_id)) return json({ error: "invalid_message_id" }, 400);
  if (!body.message_id && !body.sweep) return json({ error: "message_id_or_sweep_required" }, 400);

  const rows = await deps.claim(body.message_id ?? null);
  if (body.wait) return json({ claimed: rows.length, ...(await processOutbound(rows, deps)) });
  deps.waitUntil(processOutbound(rows, deps));
  return json({ claimed: rows.length }, 202);
}
