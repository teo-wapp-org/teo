import "server-only";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { requirePlatformAdmin } from "@/lib/auth";
import { normalizeConfig } from "@/lib/schemas/admin";
import { createClient } from "@/lib/supabase/server";

export const READ_ONLY_ERROR = "Tu rol es de solo lectura. Solo un superadmin puede hacer cambios.";

/** Lee la configuración de la plataforma (superadmin y soporte). Nunca incluye valores de secretos. */
export async function getPlatformConfig() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_platform_config");
  if (error) throw error;
  return normalizeConfig(data);
}

/**
 * Para Server Actions de escritura: exige sesión, rol de plataforma (si no, 404) y que sea superadmin.
 * Devuelve el cliente con la sesión del usuario: la base valida de nuevo (RLS / funciones).
 */
export async function requireSuperadmin() {
  const role = await requirePlatformAdmin();
  if (role !== "superadmin") return { error: READ_ONLY_ERROR } as const;
  return { supabase: await createClient(), error: null } as const;
}

export type AdminOpsResult = { ok: boolean; detail: string; latency_ms?: number; data?: Record<string, unknown> };

/**
 * Invoca la Edge Function `admin-ops` con la sesión del usuario.
 * Nunca lanza: si la función no existe o falla, devuelve un mensaje amable.
 */
export async function invokeAdminOps(path: string, init: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}): Promise<AdminOpsResult> {
  try {
    const supabase = await createClient();
    const method = init.method ?? "POST";
    const { data, error } = await supabase.functions.invoke(`admin-ops/${path}`, method === "GET" ? { method } : { method, body: init.body ?? {} });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response;
        let body: Record<string, unknown> | null = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        if (body && typeof body.detail === "string") return { ok: false, detail: body.detail, data: body };
        if (res.status === 404) return { ok: false, detail: "La función admin-ops aún no está disponible en este entorno. Despliégala y vuelve a intentarlo." };
        if (res.status === 401 || res.status === 403) return { ok: false, detail: "No tienes permiso para esta operación." };
        return { ok: false, detail: `La función admin-ops respondió con un error (${res.status}).` };
      }
      if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
        return { ok: false, detail: "No pudimos contactar la función admin-ops. Revisa que esté desplegada." };
      }
      return { ok: false, detail: "No pudimos completar la operación." };
    }
    const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    return {
      ok: d.ok === true,
      detail: typeof d.detail === "string" ? d.detail : d.ok === true ? "Conexión correcta." : "La prueba no fue exitosa.",
      latency_ms: typeof d.latency_ms === "number" ? d.latency_ms : undefined,
      data: d,
    };
  } catch {
    return { ok: false, detail: "No pudimos contactar la función admin-ops. Inténtalo más tarde." };
  }
}
