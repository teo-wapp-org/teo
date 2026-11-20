// Clientes de Supabase para Edge Functions.
// - serviceClient(): service role (solo backend; siempre filtrar por org_id).
// - userClient(authHeader): con el JWT del usuario → todo pasa por RLS.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = (k: string) => Deno.env.get(k);

function url(): string {
  const u = env("SUPABASE_URL");
  if (!u) throw new Error("Falta SUPABASE_URL");
  return u;
}

export function serviceClient(): SupabaseClient {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function userClient(authHeader: string): SupabaseClient {
  const key = env("SUPABASE_ANON_KEY") ?? env("SUPABASE_PUBLISHABLE_KEY");
  if (!key) throw new Error("Falta SUPABASE_ANON_KEY");
  return createClient(url(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}

/** Comparación en tiempo constante (secretos compartidos). */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
