// Edge Function whatsapp-webhook (verify_jwt = false: Meta no envía JWT; se valida la firma HMAC).
// URL: https://<ref>.supabase.co/functions/v1/whatsapp-webhook
// Secrets: WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY automáticos).
import { WhatsAppClient } from "../_shared/whatsapp/client.ts";
import { log, serviceClient, waitUntil } from "../_shared/runtime.ts";
import { handleRequest, type WebhookDeps } from "./handler.ts";

const db = serviceClient();

function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

const deps: WebhookDeps = {
  appSecret: Deno.env.get("WHATSAPP_APP_SECRET") ?? "",
  verifyToken: Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "",
  async resolveAccount(phoneNumberId) {
    const rows = must(await db.rpc("resolve_whatsapp_account", { p_phone_number_id: phoneNumberId })) as { account_id: string; org_id: string }[];
    return rows?.[0] ?? null;
  },
  async ingest(a) {
    const rows = must(
      await db.rpc("ingest_whatsapp_message", {
        p_account: a.accountId,
        p_wa_id: a.waId,
        p_profile_name: a.profileName,
        p_wamid: a.wamid,
        p_type: a.type,
        p_body: a.body,
        p_payload: a.payload,
        p_sent_at: a.sentAt?.toISOString() ?? null,
      }),
    ) as { message_id: string; conversation_id: string; case_id: string | null; org_id: string; inserted: boolean }[];
    return rows[0];
  },
  async getToken(accountId) {
    return must(await db.rpc("get_whatsapp_token", { p_account: accountId })) as string | null;
  },
  async fetchMedia(token, mediaId) {
    const client = new WhatsAppClient({ token });
    const info = await client.getMedia(mediaId);
    return client.downloadMedia(info.url);
  },
  async uploadMedia(path, bytes, mime) {
    const { error } = await db.storage.from("media").upload(path, bytes, { contentType: mime, upsert: true });
    if (error) throw new Error(error.message);
  },
  async setMedia(messageId, u) {
    must(await db.from("messages").update({ media_path: u.path, media_mime: u.mime, error: u.error }).eq("id", messageId));
  },
  async enqueue(orgId, conversationId, delay) {
    must(await db.rpc("enqueue_inbound", { p_org: orgId, p_conversation: conversationId, p_delay: delay }));
  },
  async applyStatus(wamid, status, error) {
    return Boolean(must(await db.rpc("apply_whatsapp_status", { p_wamid: wamid, p_status: status, p_error: error })));
  },
  waitUntil,
  log,
};

if (!deps.appSecret || !deps.verifyToken) log("error", "wa_config_incompleta", { appSecret: !!deps.appSecret, verifyToken: !!deps.verifyToken });

Deno.serve((req) => handleRequest(req, deps));
