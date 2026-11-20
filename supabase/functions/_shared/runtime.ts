// Utilidades comunes de las Edge Functions: cliente service_role, logs estructurados y waitUntil.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { log } from "./log.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Ejecuta en segundo plano tras responder (fast-ack). Fuera del Edge Runtime, no bloquea igual. */
export function waitUntil(p: Promise<unknown>): void {
  const guarded = p.catch((e) => log("error", "background_failed", { error: String(e) }));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(guarded);
}

export { log, type Logger, maskPhone } from "./log.ts";
