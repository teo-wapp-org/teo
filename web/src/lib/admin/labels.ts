/** Textos y utilidades puras del panel superadmin (traducción de errores, auditoría, tokens). */

const RPC_ERRORS: Record<string, string> = {
  anthropic_key_missing: "Primero guarda la API key de Anthropic.",
  invalid_provider: "Ese proveedor de IA no es válido.",
  invalid_effort: "Ese nivel de esfuerzo no es válido.",
  invalid_trial_plan: "El plan de prueba elegido no existe.",
  invalid_plan: "Ese plan no existe.",
  secret_too_short: "El secreto debe tener al menos 8 caracteres.",
  unknown_secret: "Ese secreto no existe.",
  unknown_setting: "Ese ajuste no existe.",
  setting_must_be_object: "El ajuste tiene un formato inválido.",
  forbidden: "Solo un superadmin puede hacer esto.",
  cannot_remove_self: "No puedes quitarte a ti mismo del equipo Teo.",
  last_superadmin: "Debe quedar al menos un superadmin en el equipo Teo.",
  not_found: "No encontramos una cuenta con ese correo. Pídele que primero se registre en Teo y vuelve a intentarlo.",
};

/** Traduce un error de Supabase/RPC a un mensaje en español para el panel. */
export function translateAdminError(err: { message?: string; code?: string } | string | null | undefined, fallback = "No pudimos guardar. Inténtalo de nuevo."): string {
  if (!err) return fallback;
  const msg = typeof err === "string" ? err : (err.message ?? "");
  const code = typeof err === "string" ? "" : (err.code ?? "");
  for (const [k, v] of Object.entries(RPC_ERRORS)) {
    if (msg === k || msg.startsWith(`${k} `) || msg.includes(k)) return v;
  }
  if (code === "23505") return "Ya existe un registro con ese identificador.";
  if (code === "42501") return RPC_ERRORS.forbidden;
  return fallback;
}

// ─────────────────────────────────────────────────────────────
// Auditoría
// ─────────────────────────────────────────────────────────────
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "org.set_status": "Cambió el estado del comercio",
  "org.subscription": "Cambió la suscripción",
  "org.reset_usage": "Reinició el uso del mes",
  "org.agent_enabled": "Activó o pausó a Teo",
  "platform.setting": "Cambió un ajuste de la plataforma",
  "platform.secret_set": "Guardó un secreto",
  "platform.secret_delete": "Eliminó un secreto",
  "platform.admin_add": "Agregó o cambió a alguien del equipo Teo",
  "platform.admin_remove": "Quitó a alguien del equipo Teo",
  "platform.plan_insert": "Creó un plan",
  "platform.plan_update": "Editó un plan",
};

export const auditActionLabel = (a: string) => AUDIT_ACTION_LABELS[a] ?? a;

export const SETTING_LABELS: Record<string, string> = {
  ai: "Inteligencia artificial",
  meta: "WhatsApp / Meta",
  signup: "Registro y acceso",
  places: "Google Places",
  email: "Correo",
  branding: "Marca y soporte",
};

export const SECRET_LABELS: Record<string, string> = {
  anthropic_api_key: "API key de Anthropic",
  google_places_api_key: "API key de Google Places",
  meta_app_secret: "App Secret de Meta",
  whatsapp_verify_token: "Verify token del webhook",
  resend_api_key: "API key de Resend",
  supabase_management_token: "Token de administración de Supabase",
};

export type AuditChange = { key: string; before?: string; after: string };

const IGNORED = new Set(["updated_at", "created_at", "updated_by", "current_period_start", "org_id"]);

export function formatAuditValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? v.map(formatAuditValue).join(", ") : "—";
  return JSON.stringify(v);
}

/** Convierte el metadata del log en cambios legibles: con before/after solo lista lo que cambió. */
export function describeAuditMetadata(metadata: unknown): AuditChange[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const m = metadata as Record<string, unknown>;
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
  if ("after" in m && (isObj(m.after) || m.after === null) && (isObj(m.before) || m.before == null)) {
    const before = isObj(m.before) ? m.before : {};
    const after = isObj(m.after) ? m.after : {};
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !IGNORED.has(k));
    return keys
      .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
      .map((k) => ({ key: k, before: m.before == null ? undefined : formatAuditValue(before[k]), after: formatAuditValue(after[k]) }));
  }
  return Object.entries(m).map(([k, v]) => ({ key: k, after: formatAuditValue(v) }));
}

/** Texto legible del objetivo de una acción (nombre del ajuste/secreto, etc.). */
export function auditTargetLabel(action: string, target: string | null): string {
  if (!target) return "—";
  if (action === "platform.setting") return SETTING_LABELS[target] ?? target;
  if (action.startsWith("platform.secret")) return SECRET_LABELS[target] ?? target;
  if (action.startsWith("platform.plan")) return `Plan ${target}`;
  if (action === "org.subscription") return `Plan ${target}`;
  return target;
}

// ─────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────
/** Token aleatorio fuerte (base64url) con crypto.getRandomValues; sirve en el navegador y en Node. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
