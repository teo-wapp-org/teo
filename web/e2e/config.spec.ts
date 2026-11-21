import { createClient } from "@supabase/supabase-js";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import type { QaUser } from "./supabase-admin";

// Edge Functions que leen la configuración de la plataforma (desplegadas en teo-dev).
async function signedIn(user: QaUser) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return sb;
}

async function statusOf(error: unknown) {
  return error instanceof FunctionsHttpError ? (error.context as Response).status : error ? -1 : 200;
}

test("admin-ops: solo superadmin; pruebas de conexión devuelven { ok, detail, latency_ms } sin exponer secretos", async ({ owner, superadmin }) => {
  const asOwner = await signedIn(owner);
  const denied = await asOwner.functions.invoke("admin-ops/test/anthropic", { body: {} });
  expect(await statusOf(denied.error)).toBe(403);

  const asAdmin = await signedIn(superadmin);
  const res = await asAdmin.functions.invoke<{ ok: boolean; detail: string; latency_ms: number }>("admin-ops/test/resend", { body: {} });
  expect(res.error).toBeNull();
  expect(typeof res.data!.ok).toBe("boolean");
  expect(typeof res.data!.detail).toBe("string");
  expect(typeof res.data!.latency_ms).toBe("number");
  expect(res.data!.detail).not.toMatch(/re_[A-Za-z0-9_]{10,}/);

  const auth = await asAdmin.functions.invoke<{ ok: boolean; detail?: string }>("admin-ops/auth-config", { method: "GET" });
  expect(auth.error).toBeNull();
  if (!auth.data!.ok) expect(auth.data!.detail).toBe("Falta el token de administración de Supabase");
});

test("places: solo miembros del comercio; responde según places.enabled y la key en Vault", async ({ owner, superadmin }) => {
  const asOwner = await signedIn(owner);
  const r = await asOwner.functions.invoke("places/search", { body: { org_id: owner.orgId, query: "Malecón 2000 Guayaquil" } });
  expect([200, 503]).toContain(await statusOf(r.error));

  // el superadmin sin membresía no puede usar el comercio ajeno
  const asAdmin = await signedIn(superadmin);
  const other = await asAdmin.functions.invoke("places/search", { body: { org_id: owner.orgId, query: "Malecón 2000" } });
  expect(await statusOf(other.error)).toBe(403);
});

test("whatsapp-connect: un operador o un usuario ajeno no puede conectar números", async ({ owner, superadmin }) => {
  const asAdmin = await signedIn(superadmin);
  const r = await asAdmin.functions.invoke("whatsapp-connect", {
    body: { org_id: owner.orgId, code: "CODE-1234567890", phone_number_id: "1112223334", waba_id: "5556667778" },
  });
  expect(await statusOf(r.error)).toBe(403);
});
