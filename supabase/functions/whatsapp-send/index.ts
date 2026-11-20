// Edge Function whatsapp-send (verify_jwt = false: la llama pg_net con el secreto x-teo-send-secret leído de Vault).
// URL: https://<ref>.supabase.co/functions/v1/whatsapp-send
// Secrets: WHATSAPP_SEND_SECRET (= Vault whatsapp_send_secret) + SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY automáticos.
import { MAX_SEND_ATTEMPTS } from "../_shared/whatsapp/constants.ts";
import type { OutboundRow } from "../_shared/whatsapp/outbound.ts";
import { log, serviceClient, waitUntil } from "../_shared/runtime.ts";
import { handleSendRequest, type SendDeps } from "./sender.ts";

const db = serviceClient();

function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

const deps: SendDeps = {
  sendSecret: Deno.env.get("WHATSAPP_SEND_SECRET") ?? "",
  async claim(messageId) {
    return must(await db.rpc("claim_whatsapp_outbound", { p_message: messageId, p_limit: 20 })) as OutboundRow[];
  },
  async loadTarget(conversationId) {
    const conv = must(
      await db
        .from("conversations")
        .select("channel, last_inbound_at, contact:contacts(wa_id), account:whatsapp_accounts(id, phone_number_id, status)")
        .eq("id", conversationId)
        .maybeSingle(),
    ) as unknown as
      | { channel: string; last_inbound_at: string | null; contact: { wa_id: string } | null; account: { id: string; phone_number_id: string | null; status: string } | null }
      | null;
    if (!conv?.contact) return null;
    return { channel: conv.channel, last_inbound_at: conv.last_inbound_at, wa_id: conv.contact.wa_id, account: conv.account };
  },
  async getToken(accountId) {
    return must(await db.rpc("get_whatsapp_token", { p_account: accountId })) as string | null;
  },
  async signUrl(bucket, path) {
    const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (error || !data) throw new Error(error?.message ?? "no se pudo firmar la URL");
    return data.signedUrl;
  },
  async markSent(id, wamid) {
    must(await db.from("messages").update({ wamid, status: "sent", error: null, send_claimed_at: null }).eq("id", id).eq("status", "queued"));
  },
  async markFailed(id, error) {
    must(await db.from("messages").update({ status: "failed", error, send_claimed_at: null }).eq("id", id).eq("status", "queued"));
  },
  async release(id) {
    // si ya agotó los intentos, el próximo barrido no lo toma: se marca failed aquí
    const row = must(await db.from("messages").select("send_attempts").eq("id", id).maybeSingle()) as { send_attempts: number } | null;
    if (row && row.send_attempts >= MAX_SEND_ATTEMPTS) {
      must(await db.from("messages").update({ status: "failed", error: "reintentos_agotados", send_claimed_at: null }).eq("id", id));
    } else {
      must(await db.from("messages").update({ send_claimed_at: null }).eq("id", id));
    }
  },
  now: () => new Date(),
  waitUntil,
  log,
};

if (!deps.sendSecret) log("error", "wa_config_incompleta", { sendSecret: false });

Deno.serve((req) => handleSendRequest(req, deps));
