// Traduce una fila saliente de `messages` (status 'queued') a un mensaje de la Graph API.
//
// Contrato para quien encola (agente, operador desde el panel):
//   type 'text'        → body
//   type 'image'       → payload.link | payload.media_id | media_path (bucket payload.bucket ?? 'media'); caption = body
//   type 'document'    → igual que image + payload.filename
//   type 'interactive' → body + payload.interactive = { kind: 'buttons', buttons: [{id,title}] (≤3), header?, footer? }
//                                               | { kind: 'list', button, sections: [{title?, rows:[{id,title,description?}]}], header?, footer? }
//   type 'reaction'    → payload.message_wamid + (payload.emoji | body)
//   type 'template'    → payload.template = { name, language, components? }  (única forma de escribir fuera de la ventana)
//   payload.reply_to   → wamid al que responde (opcional)
import {
  type Button,
  buildButtons,
  buildDocument,
  buildImage,
  buildList,
  buildReaction,
  buildTemplate,
  buildText,
  type GraphMessage,
  type ListSection,
  type MediaRef,
} from "./client.ts";
import { WINDOW_MS } from "./constants.ts";

export interface OutboundRow {
  id: string;
  org_id: string;
  conversation_id: string;
  type: string;
  body: string | null;
  media_path: string | null;
  media_mime: string | null;
  payload: Record<string, unknown> | null;
  send_attempts: number;
}

export class OutboundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundError";
  }
}

export const WINDOW_CLOSED = "ventana_cerrada";

/** Solo las plantillas aprobadas pueden salir fuera de la ventana de 24 h. */
export function requiresOpenWindow(type: string): boolean {
  return type !== "template";
}

export function isWindowOpen(lastInboundAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  return Number.isFinite(t) && now.getTime() - t < WINDOW_MS;
}

type SignUrl = (bucket: string, path: string) => Promise<string>;

async function mediaRef(row: OutboundRow, signUrl: SignUrl): Promise<MediaRef> {
  const p = row.payload ?? {};
  if (typeof p.media_id === "string" && p.media_id) return { id: p.media_id };
  if (typeof p.link === "string" && /^https:\/\//.test(p.link)) return { link: p.link };
  if (row.media_path) return { link: await signUrl(typeof p.bucket === "string" ? p.bucket : "media", row.media_path) };
  throw new OutboundError(`mensaje ${row.type} sin media (link, media_id o media_path)`);
}

export async function toGraphMessage(row: OutboundRow, signUrl: SignUrl): Promise<GraphMessage> {
  const p = row.payload ?? {};
  try {
    switch (row.type) {
      case "text":
        if (!row.body?.trim()) throw new OutboundError("texto vacío");
        return buildText(row.body, { previewUrl: /https?:\/\//.test(row.body) });
      case "image":
        return buildImage(await mediaRef(row, signUrl), row.body);
      case "document":
        return buildDocument(await mediaRef(row, signUrl), { caption: row.body, filename: typeof p.filename === "string" ? p.filename : null });
      case "interactive": {
        const it = (p.interactive ?? {}) as {
          kind?: string;
          buttons?: Button[];
          button?: string;
          sections?: ListSection[];
          header?: string;
          footer?: string;
        };
        if (!row.body?.trim()) throw new OutboundError("interactivo sin texto");
        if (it.kind === "buttons") return buildButtons(row.body, it.buttons ?? [], it);
        if (it.kind === "list") return buildList(row.body, it.button ?? "Ver opciones", it.sections ?? [], it);
        throw new OutboundError("interactivo sin kind 'buttons' o 'list'");
      }
      case "reaction": {
        const target = p.message_wamid;
        if (typeof target !== "string" || !target) throw new OutboundError("reacción sin message_wamid");
        return buildReaction(target, typeof p.emoji === "string" ? p.emoji : (row.body ?? ""));
      }
      case "template": {
        const t = (p.template ?? {}) as { name?: string; language?: string; components?: unknown[] };
        if (!t.name) throw new OutboundError("plantilla sin nombre");
        return buildTemplate(t.name, t.language ?? "es", t.components);
      }
      default:
        throw new OutboundError(`tipo no soportado: ${row.type}`);
    }
  } catch (e) {
    if (e instanceof OutboundError) throw e;
    throw new OutboundError((e as Error).message);
  }
}
