// Normaliza el payload del webhook: TODOS los entry[].changes[].value, con sus mensajes y statuses.
import type { WaMedia, WaMessage, WaStatus, WebhookPayload } from "./types.ts";

export type InboundType = "text" | "image" | "document" | "audio" | "video" | "sticker" | "location" | "interactive" | "reaction" | "unsupported";

export interface InboundMessage {
  phoneNumberId: string;
  wamid: string;
  waId: string;
  profileName: string | null;
  sentAt: Date | null;
  type: InboundType;
  body: string | null;
  media: WaMedia | null;
  /** Mensaje original de Meta (auditoría y contexto del agente). */
  raw: WaMessage;
}

export interface StatusUpdate {
  phoneNumberId: string;
  wamid: string;
  status: "sent" | "delivered" | "read" | "failed";
  error: string | null;
}

export interface ParsedWebhook {
  messages: InboundMessage[];
  statuses: StatusUpdate[];
}

const MEDIA_TYPES = new Set(["image", "document", "audio", "video", "sticker"]);
const STATUS_TYPES = new Set(["sent", "delivered", "read", "failed"]);

function toDate(ts?: string): Date | null {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
}

export function describeError(errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[]): string | null {
  const e = errors?.[0];
  if (!e) return null;
  const text = e.error_data?.details || e.message || e.title || "error";
  return e.code ? `${e.code}: ${text}` : text;
}

/** Tipo + cuerpo legible de un mensaje de Meta. */
export function mapMessage(m: WaMessage): { type: InboundType; body: string | null; media: WaMedia | null } {
  if (m.type === "text") return { type: "text", body: m.text?.body ?? "", media: null };

  if (MEDIA_TYPES.has(m.type)) {
    const media = (m as unknown as Record<string, WaMedia | undefined>)[m.type] ?? null;
    return { type: m.type as InboundType, body: media?.caption ?? null, media: media?.id ? media : null };
  }

  if (m.type === "location" && m.location) {
    const { latitude, longitude, name, address } = m.location;
    const label = [name, address].filter(Boolean).join(", ");
    return { type: "location", body: label ? `${label} (${latitude}, ${longitude})` : `${latitude}, ${longitude}`, media: null };
  }

  if (m.type === "interactive" && m.interactive) {
    const reply = m.interactive.button_reply ?? m.interactive.list_reply;
    return { type: "interactive", body: reply?.title ?? null, media: null };
  }

  // respuesta rápida de plantilla
  if (m.type === "button" && m.button) return { type: "interactive", body: m.button.text ?? m.button.payload ?? null, media: null };

  if (m.type === "reaction" && m.reaction) return { type: "reaction", body: m.reaction.emoji ?? "", media: null };

  return { type: "unsupported", body: null, media: null };
}

export function parseWebhook(payload: WebhookPayload): ParsedWebhook {
  const out: ParsedWebhook = { messages: [], statuses: [] };
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "messages") continue;
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!value || !phoneNumberId) continue;

      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);

      for (const m of value.messages ?? []) {
        if (!m?.id || !m.from) continue;
        const mapped = mapMessage(m);
        out.messages.push({
          phoneNumberId,
          wamid: m.id,
          waId: m.from,
          profileName: names.get(m.from) ?? null,
          sentAt: toDate(m.timestamp),
          ...mapped,
          raw: m,
        });
      }

      for (const s of (value.statuses ?? []) as WaStatus[]) {
        if (!s?.id || !STATUS_TYPES.has(s.status)) continue;
        out.statuses.push({
          phoneNumberId,
          wamid: s.id,
          status: s.status as StatusUpdate["status"],
          error: s.status === "failed" ? describeError(s.errors) ?? "failed" : null,
        });
      }
    }
  }
  return out;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export function extensionFor(mime?: string | null, filename?: string | null): string {
  const base = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_MIME[base]) return EXT_BY_MIME[base];
  const fromName = filename?.match(/\.([a-z0-9]{1,8})$/i)?.[1];
  return fromName ? fromName.toLowerCase() : "bin";
}

/** Ruta en el bucket privado `media`: {org_id}/{conversation_id}/{wamid}.{ext} */
export function mediaPath(orgId: string, conversationId: string, wamid: string, ext: string): string {
  const safe = wamid.replace(/[^A-Za-z0-9._-]/g, "_");
  return `${orgId}/${conversationId}/${safe}.${ext}`;
}
