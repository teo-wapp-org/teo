// Cliente de la Graph API de WhatsApp Cloud. Un cliente por comercio (token propio, leído de Vault).
import { graphBase } from "./constants.ts";

export type FetchFn = typeof fetch;

export type MediaRef = { link: string } | { id: string };
export interface Button { id: string; title: string }
export interface ListRow { id: string; title: string; description?: string }
export interface ListSection { title?: string; rows: ListRow[] }

/** Cuerpo JSON para POST /{phone_number_id}/messages (sin messaging_product ni to). */
export type GraphMessage = Record<string, unknown> & { type: string };

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

const RETRIABLE_CODES = new Set([1, 2, 4, 80007, 130429, 131016, 131048, 131056, 133004]);
/** 131047: más de 24 h desde el último mensaje del cliente. */
export const WINDOW_CLOSED_CODE = 131047;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new GraphError(msg, 400, null, false);
}

function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ── Constructores puros (testeables sin red) ─────────────────────────────

export function buildText(text: string, opts: { previewUrl?: boolean } = {}): GraphMessage {
  assert(text.trim().length > 0, "texto vacío");
  return { type: "text", text: { body: clip(text, 4096), preview_url: Boolean(opts.previewUrl) } };
}

export function buildImage(media: MediaRef, caption?: string | null): GraphMessage {
  return { type: "image", image: { ...media, ...(caption ? { caption: clip(caption, 1024) } : {}) } };
}

export function buildDocument(media: MediaRef, opts: { caption?: string | null; filename?: string | null } = {}): GraphMessage {
  return {
    type: "document",
    document: { ...media, ...(opts.caption ? { caption: clip(opts.caption, 1024) } : {}), ...(opts.filename ? { filename: opts.filename } : {}) },
  };
}

export function buildButtons(body: string, buttons: Button[], opts: { header?: string; footer?: string } = {}): GraphMessage {
  assert(buttons.length >= 1 && buttons.length <= 3, "los botones deben ser entre 1 y 3");
  assert(new Set(buttons.map((b) => b.id)).size === buttons.length, "ids de botones repetidos");
  return {
    type: "interactive",
    interactive: {
      type: "button",
      ...(opts.header ? { header: { type: "text", text: clip(opts.header, 60) } } : {}),
      body: { text: clip(body, 1024) },
      ...(opts.footer ? { footer: { text: clip(opts.footer, 60) } } : {}),
      action: { buttons: buttons.map((b) => ({ type: "reply", reply: { id: clip(b.id, 256), title: clip(b.title, 20) } })) },
    },
  };
}

export function buildList(body: string, buttonText: string, sections: ListSection[], opts: { header?: string; footer?: string } = {}): GraphMessage {
  const rows = sections.flatMap((s) => s.rows);
  assert(sections.length >= 1 && sections.length <= 10, "las secciones deben ser entre 1 y 10");
  assert(rows.length >= 1 && rows.length <= 10, "la lista admite entre 1 y 10 filas");
  assert(sections.length === 1 || sections.every((s) => s.title), "con varias secciones, cada una necesita título");
  return {
    type: "interactive",
    interactive: {
      type: "list",
      ...(opts.header ? { header: { type: "text", text: clip(opts.header, 60) } } : {}),
      body: { text: clip(body, 4096) },
      ...(opts.footer ? { footer: { text: clip(opts.footer, 60) } } : {}),
      action: {
        button: clip(buttonText, 20),
        sections: sections.map((s) => ({
          ...(s.title ? { title: clip(s.title, 24) } : {}),
          rows: s.rows.map((r) => ({ id: clip(r.id, 200), title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })),
        })),
      },
    },
  };
}

export function buildReaction(messageWamid: string, emoji: string): GraphMessage {
  return { type: "reaction", reaction: { message_id: messageWamid, emoji } };
}

export function buildTemplate(name: string, language: string, components?: unknown[]): GraphMessage {
  return { type: "template", template: { name, language: { code: language }, ...(components ? { components } : {}) } };
}

// ── Cliente ───────────────────────────────────────────────────────────

export interface ClientOptions {
  token: string;
  phoneNumberId?: string;
  fetch?: FetchFn;
  baseUrl?: string;
  /** Versión de la Graph API (ajuste meta.graph_version). Se ignora si hay baseUrl. */
  graphVersion?: string;
}

export class WhatsAppClient {
  private readonly f: FetchFn;
  private readonly base: string;
  constructor(private readonly opts: ClientOptions) {
    this.f = opts.fetch ?? fetch;
    this.base = opts.baseUrl ?? graphBase(opts.graphVersion);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.f(`${this.base}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.opts.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new GraphError(`red: ${(e as Error).message}`, 0, null, true);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (data as { error?: { message?: string; code?: number; error_data?: { details?: string } } }).error;
      const code = err?.code ?? null;
      const retriable = res.status >= 500 || res.status === 429 || (code !== null && RETRIABLE_CODES.has(code));
      // Meta a veces repite el token en el mensaje ("Malformed access token EAAG…"): nunca se guarda ni se loguea.
      const text = (err?.error_data?.details || err?.message || `HTTP ${res.status}`).split(this.opts.token).join("***");
      throw new GraphError(text.replace(/EAA[A-Za-z0-9]{10,}/g, "***"), res.status, code, retriable);
    }
    return data as T;
  }

  private phone(): string {
    assert(this.opts.phoneNumberId, "falta phone_number_id");
    return this.opts.phoneNumberId;
  }

  /** Envía un mensaje ya construido. Devuelve el wamid. */
  async send(to: string, message: GraphMessage, replyTo?: string | null): Promise<string> {
    const data = await this.request<{ messages?: { id: string }[] }>("POST", `${this.phone()}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      ...(replyTo ? { context: { message_id: replyTo } } : {}),
      ...message,
    });
    const wamid = data.messages?.[0]?.id;
    if (!wamid) throw new GraphError("respuesta sin wamid", 502, null, true);
    return wamid;
  }

  sendText(to: string, text: string, opts: { previewUrl?: boolean; replyTo?: string } = {}) {
    return this.send(to, buildText(text, opts), opts.replyTo);
  }
  sendImage(to: string, media: MediaRef, caption?: string) {
    return this.send(to, buildImage(media, caption));
  }
  sendDocument(to: string, media: MediaRef, opts: { caption?: string; filename?: string } = {}) {
    return this.send(to, buildDocument(media, opts));
  }
  sendButtons(to: string, body: string, buttons: Button[], opts: { header?: string; footer?: string } = {}) {
    return this.send(to, buildButtons(body, buttons, opts));
  }
  sendList(to: string, body: string, buttonText: string, sections: ListSection[], opts: { header?: string; footer?: string } = {}) {
    return this.send(to, buildList(body, buttonText, sections, opts));
  }
  sendReaction(to: string, messageWamid: string, emoji: string) {
    return this.send(to, buildReaction(messageWamid, emoji));
  }

  /** Marca un mensaje entrante como leído (ticks azules) y, opcionalmente, muestra "escribiendo…". */
  async markRead(wamid: string, opts: { typing?: boolean } = {}): Promise<void> {
    await this.request("POST", `${this.phone()}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: wamid,
      ...(opts.typing ? { typing_indicator: { type: "text" } } : {}),
    });
  }

  /** GET /{media_id} → URL temporal (expira en minutos) y mime. */
  getMedia(mediaId: string) {
    return this.request<{ url: string; mime_type?: string; file_size?: number; sha256?: string }>("GET", encodeURIComponent(mediaId));
  }

  /** Descarga los bytes de la URL temporal de Meta (requiere el mismo token). */
  async downloadMedia(url: string, maxBytes = 16 * 1024 * 1024): Promise<{ bytes: Uint8Array; mime: string }> {
    let res: Response;
    try {
      res = await this.f(url, { headers: { Authorization: `Bearer ${this.opts.token}` }, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      throw new GraphError(`red: ${(e as Error).message}`, 0, null, true);
    }
    if (!res.ok) throw new GraphError(`descarga de media: HTTP ${res.status}`, res.status, null, res.status >= 500);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new GraphError("media demasiado grande", 413, null, false);
    return { bytes, mime: res.headers.get("content-type") ?? "application/octet-stream" };
  }

  getPhoneNumber(fields = "display_phone_number,verified_name,quality_rating") {
    return this.request<{ id: string; display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
      "GET",
      `${this.phone()}?fields=${encodeURIComponent(fields)}`,
    );
  }
}
