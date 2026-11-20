// Webhook de WhatsApp Cloud API (lógica pura con dependencias inyectables; ver index.ts para las reales).
//   GET  → verificación hub.challenge
//   POST → firma X-Hub-Signature-256 → 200 inmediato → procesamiento en segundo plano:
//          todos los entry/changes, mensajes (idempotentes por wamid) + media + cola, y statuses.
import { INBOUND_DEBOUNCE_SECONDS } from "../_shared/whatsapp/constants.ts";
import { extensionFor, type InboundMessage, mediaPath, parseWebhook } from "../_shared/whatsapp/parse.ts";
import { timingSafeEqual, verifySignature } from "../_shared/whatsapp/signature.ts";
import type { WebhookPayload } from "../_shared/whatsapp/types.ts";
import { type Logger, maskPhone } from "../_shared/log.ts";

export interface Account { account_id: string; org_id: string }
export interface IngestResult { message_id: string; conversation_id: string; case_id: string | null; org_id: string; inserted: boolean }

export interface WebhookDeps {
  appSecret: string;
  verifyToken: string;
  resolveAccount(phoneNumberId: string): Promise<Account | null>;
  ingest(a: {
    accountId: string;
    waId: string;
    profileName: string | null;
    wamid: string;
    type: string;
    body: string | null;
    payload: unknown;
    sentAt: Date | null;
  }): Promise<IngestResult>;
  getToken(accountId: string): Promise<string | null>;
  /** Descarga la media de Meta (GET /{media_id} → url → bytes) con el token del comercio. */
  fetchMedia(token: string, mediaId: string): Promise<{ bytes: Uint8Array; mime: string }>;
  uploadMedia(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  setMedia(messageId: string, update: { path: string | null; mime: string | null; error: string | null }): Promise<void>;
  enqueue(orgId: string, conversationId: string, delaySeconds: number): Promise<void>;
  applyStatus(wamid: string, status: string, error: string | null): Promise<boolean>;
  waitUntil(p: Promise<unknown>): void;
  log: Logger;
}

export interface ProcessSummary {
  inserted: number;
  duplicates: number;
  unknown: number;
  statuses: number;
  enqueued: number;
  errors: number;
}

export async function processPayload(payload: WebhookPayload, deps: WebhookDeps): Promise<ProcessSummary> {
  const sum: ProcessSummary = { inserted: 0, duplicates: 0, unknown: 0, statuses: 0, enqueued: 0, errors: 0 };
  const parsed = parseWebhook(payload);

  const accounts = new Map<string, Account | null>();
  const resolve = async (id: string) => {
    if (!accounts.has(id)) accounts.set(id, await deps.resolveAccount(id));
    return accounts.get(id)!;
  };
  const tokens = new Map<string, Promise<string | null>>();
  const token = (accountId: string) => {
    if (!tokens.has(accountId)) tokens.set(accountId, deps.getToken(accountId));
    return tokens.get(accountId)!;
  };

  // conversaciones con mensajes nuevos → una sola entrada en la cola por conversación
  const toEnqueue = new Map<string, string>();

  for (const m of parsed.messages) {
    try {
      const acc = await resolve(m.phoneNumberId);
      if (!acc) {
        sum.unknown++;
        deps.log("warn", "wa_numero_desconocido", { phone_number_id: m.phoneNumberId, wamid: m.wamid });
        continue;
      }
      const r = await deps.ingest({
        accountId: acc.account_id,
        waId: m.waId,
        profileName: m.profileName,
        wamid: m.wamid,
        type: m.type,
        body: m.body,
        payload: m.raw,
        sentAt: m.sentAt,
      });
      if (!r.inserted) {
        sum.duplicates++;
        deps.log("info", "wa_mensaje_duplicado", { wamid: m.wamid });
        continue;
      }
      sum.inserted++;
      deps.log("info", "wa_mensaje_guardado", { org_id: r.org_id, type: m.type, from: maskPhone(m.waId), wamid: m.wamid });
      if (m.media) await storeMedia(m, r, acc, token, deps);
      toEnqueue.set(r.conversation_id, r.org_id);
    } catch (e) {
      sum.errors++;
      deps.log("error", "wa_mensaje_error", { wamid: m.wamid, error: String(e) });
    }
  }

  for (const [conversationId, orgId] of toEnqueue) {
    try {
      await deps.enqueue(orgId, conversationId, INBOUND_DEBOUNCE_SECONDS);
      sum.enqueued++;
    } catch (e) {
      sum.errors++;
      deps.log("error", "wa_encolar_error", { conversation_id: conversationId, error: String(e) });
    }
  }

  for (const s of parsed.statuses) {
    try {
      if (!(await resolve(s.phoneNumberId))) {
        sum.unknown++;
        continue;
      }
      if (await deps.applyStatus(s.wamid, s.status, s.error)) sum.statuses++;
    } catch (e) {
      sum.errors++;
      deps.log("error", "wa_status_error", { wamid: s.wamid, error: String(e) });
    }
  }

  deps.log("info", "wa_webhook_procesado", { ...sum });
  return sum;
}

async function storeMedia(
  m: InboundMessage,
  r: IngestResult,
  acc: Account,
  token: (id: string) => Promise<string | null>,
  deps: WebhookDeps,
) {
  try {
    const t = await token(acc.account_id);
    if (!t) throw new Error("cuenta sin token");
    const { bytes, mime } = await deps.fetchMedia(t, m.media!.id);
    const finalMime = m.media!.mime_type ?? mime;
    const path = mediaPath(r.org_id, r.conversation_id, m.wamid, extensionFor(finalMime, m.media!.filename));
    await deps.uploadMedia(path, bytes, finalMime);
    await deps.setMedia(r.message_id, { path, mime: finalMime, error: null });
  } catch (e) {
    // el mensaje queda guardado sin media; el agente/operador lo verá como "no se pudo descargar"
    deps.log("warn", "wa_media_error", { wamid: m.wamid, error: String(e) });
    await deps.setMedia(r.message_id, { path: null, mime: m.media?.mime_type ?? null, error: "media_no_descargada" }).catch(() => {});
  }
}

export async function handleRequest(req: Request, deps: WebhookDeps): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && deps.verifyToken && timingSafeEqual(token, deps.verifyToken)) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    deps.log("warn", "wa_verify_rechazado", { mode });
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const raw = new Uint8Array(await req.arrayBuffer());
  if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256"), deps.appSecret))) {
    deps.log("warn", "wa_firma_invalida", {});
    return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    deps.log("warn", "wa_json_invalido", {});
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  deps.waitUntil(processPayload(payload, deps));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
