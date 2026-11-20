// Payloads con la forma real de Meta, para tests y para scripts/wa-simulate.
import type { WaMessage, WaStatus, WebhookPayload } from "./types.ts";

export const nowTs = () => String(Math.floor(Date.now() / 1000));
export const fakeWamid = () => `wamid.SIM${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;

export function textMessage(from: string, body: string, id = fakeWamid()): WaMessage {
  return { from, id, timestamp: nowTs(), type: "text", text: { body } };
}

export function imageMessage(from: string, mediaId: string, caption?: string, id = fakeWamid()): WaMessage {
  return { from, id, timestamp: nowTs(), type: "image", image: { id: mediaId, mime_type: "image/jpeg", sha256: "sim", ...(caption ? { caption } : {}) } };
}

export function statusUpdate(wamid: string, status: WaStatus["status"], recipient: string, error?: { code: number; title: string }): WaStatus {
  return { id: wamid, status, timestamp: nowTs(), recipient_id: recipient, ...(error ? { errors: [error] } : {}) };
}

export function webhookPayload(opts: {
  phoneNumberId: string;
  displayPhone?: string;
  wabaId?: string;
  contacts?: { waId: string; name: string }[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
}): WebhookPayload {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: opts.wabaId ?? "000000000000000",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: opts.displayPhone ?? "15550000000", phone_number_id: opts.phoneNumberId },
              ...(opts.contacts ? { contacts: opts.contacts.map((c) => ({ profile: { name: c.name }, wa_id: c.waId })) } : {}),
              ...(opts.messages ? { messages: opts.messages } : {}),
              ...(opts.statuses ? { statuses: opts.statuses } : {}),
            },
          },
        ],
      },
    ],
  };
}
