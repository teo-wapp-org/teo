import "server-only";
import { GRAPH_BASE } from "./constants";

export type PhoneInfo = { display_phone_number?: string; verified_name?: string; quality_rating?: string };
type GraphResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Llama a la Graph API desde el servidor. Nunca incluye el token en el motivo de error. */
async function graph<T>(path: string, token: string | null, init: RequestInit = {}): Promise<GraphResult<T>> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${path}`, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
    if (!res.ok) {
      const msg = (body.error?.message ?? `HTTP ${res.status}`).replace(/EAA[A-Za-z0-9-]{10,}/g, "***");
      return { ok: false, reason: body.error?.code ? `${body.error.code}: ${msg}` : msg };
    }
    return { ok: true, data: body };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === "TimeoutError" ? "Meta no respondió a tiempo" : "No pudimos contactar a Meta" };
  }
}

/** Valida el token: GET /{phone_number_id}?fields=display_phone_number,verified_name,quality_rating */
export function fetchPhoneNumber(phoneNumberId: string, token: string) {
  return graph<PhoneInfo>(`${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`, token);
}

/** Embedded Signup: intercambia el `code` del popup de Facebook por el token de negocio del comercio. */
export function exchangeCode(code: string, appId: string, appSecret: string) {
  const qs = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
  return graph<{ access_token: string }>(`oauth/access_token?${qs}`, null);
}

/** Suscribe la app de Teo a los webhooks de la WABA del comercio. */
export function subscribeApp(wabaId: string, token: string) {
  return graph<{ success: boolean }>(`${encodeURIComponent(wabaId)}/subscribed_apps`, token, { method: "POST" });
}

/** Registra el número en la Cloud API (no aplica a números en coexistencia con la app de WhatsApp Business). */
export function registerPhone(phoneNumberId: string, token: string, pin: string) {
  return graph<{ success: boolean }>(`${encodeURIComponent(phoneNumberId)}/register`, token, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}
