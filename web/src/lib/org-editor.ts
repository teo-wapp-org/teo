import "server-only";
import { requireOrg, type OrgRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const READ_ONLY_MESSAGE = "Solo el dueño o un administrador pueden cambiar la configuración.";
export const IMPERSONATING_MESSAGE = "Estás en modo solo lectura (equipo Teo).";

/** ¿Puede este contexto cambiar la configuración del comercio? (owner/admin y sin impersonación) */
export function canEditConfig(ctx: { role: OrgRole | null; impersonating: boolean }) {
  return !ctx.impersonating && (ctx.role === "owner" || ctx.role === "admin");
}

/** Mensaje para mostrar en modo lectura (o null si puede editar). */
export function readOnlyReason(ctx: { role: OrgRole | null; impersonating: boolean }) {
  if (ctx.impersonating) return IMPERSONATING_MESSAGE;
  return canEditConfig(ctx) ? null : READ_ONLY_MESSAGE;
}

/**
 * Para Server Actions de configuración: valida sesión + membresía (requireOrg) y rol owner/admin.
 * Rechaza escrituras en modo impersonación. RLS sigue siendo la última palabra.
 */
export async function requireOrgEditor(slug: unknown) {
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,120}$/.test(slug)) return { error: "Comercio inválido" } as const;
  const ctx = await requireOrg(slug);
  const reason = readOnlyReason(ctx);
  if (reason) return { error: reason } as const;
  const supabase = await createClient();
  return { org: ctx.org, role: ctx.role as "owner" | "admin", supabase, error: null } as const;
}
