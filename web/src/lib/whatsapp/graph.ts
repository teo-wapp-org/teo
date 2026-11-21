import "server-only";
import { getPublicConfig } from "@/lib/data/platform-config";
import { graphBase } from "./constants";

export type PhoneInfo = { display_phone_number?: string; verified_name?: string; quality_rating?: string };
type GraphResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/**
 * Llama a la Graph API desde el servidor (versión = ajuste meta.graph_version). Nunca incluye el token
 * en el motivo de error. El intercambio del code del Embedded Signup (que necesita el app secret)
 * vive en la Edge Function `whatsapp-connect`.
 */
async function graph<T>(path: string, token: string | null, init: RequestInit = {}): Promise<GraphResult<T>> {
  try {
    const base = graphBase((await getPublicConfig()).meta_graph_version);
    const res = await fetch(`${base}/${path}`, {
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
