/** Esquemas zod y tipos del panel superadmin (/admin). Puros: se prueban con Vitest. */
import { z } from "zod";
import { FEATURE_LABELS } from "@/lib/plans-shared";

// ─────────────────────────────────────────────────────────────
// Helpers de FormData
// ─────────────────────────────────────────────────────────────
const bool = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

const int = (min: number, max: number, label: string) =>
  z
    .string({ message: `Ingresa ${label}` })
    .trim()
    .min(1, `Ingresa ${label}`)
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v), `${cap(label)} debe ser un número entero`)
    .refine((v) => v >= min && v <= max, `${cap(label)} debe estar entre ${min} y ${max}`);

/** Entero opcional: vacío = null (ilimitado). */
const optInt = (max: number, label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v == null || (Number.isInteger(v) && v >= 0 && v <= max), `${cap(label)}: usa un número entero entre 0 y ${max.toLocaleString("es-EC")}, o déjalo vacío para ilimitado`);

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

const optEmail = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Ingresa un correo válido");

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const modelId = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Ingresa el ${label}`)
    .max(80, "Máximo 80 caracteres")
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/, `El ${label} solo puede tener letras, números, puntos y guiones`);

// ─────────────────────────────────────────────────────────────
// Ajustes de plataforma (admin_set_setting)
// ─────────────────────────────────────────────────────────────
export const SETTING_KEYS = ["ai", "meta", "signup", "places", "email", "branding"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const AI_PROVIDERS = ["anthropic", "fake"] as const;
export const AI_EFFORTS = ["low", "medium", "high"] as const;
export const PROVIDER_LABELS: Record<(typeof AI_PROVIDERS)[number], string> = { anthropic: "Anthropic (Claude)", fake: "Modo de prueba" };
export const EFFORT_LABELS: Record<(typeof AI_EFFORTS)[number], string> = { low: "Bajo", medium: "Medio", high: "Alto" };

export const AiSettingSchema = z
  .object({
    enabled: bool,
    provider: z.enum(AI_PROVIDERS, { message: "Elige un proveedor" }),
    agent_model: modelId("modelo del agente"),
    cheap_model: modelId("modelo económico"),
    effort: z.enum(AI_EFFORTS, { message: "Elige un nivel de esfuerzo" }),
    max_tool_iterations: int(1, 20, "el máximo de iteraciones"),
    timeout_s: int(5, 300, "el tiempo máximo"),
    debounce_seconds: int(0, 60, "la espera"),
  })
  .transform(({ timeout_s, ...v }) => ({ ...v, timeout_ms: timeout_s * 1000 }));

export const MetaSettingSchema = z.object({
  app_id: optText(40).refine((v) => v == null || /^\d{5,30}$/.test(v), "El App ID son solo números"),
  es_config_id: optText(40).refine((v) => v == null || /^\d{5,30}$/.test(v), "El config ID son solo números"),
  graph_version: z.string().trim().regex(/^v\d{1,3}\.\d{1,2}$/, "Usa el formato v24.0"),
  manual_connection_enabled: bool,
});

export const SignupSettingSchema = z.object({
  enabled: bool,
  require_email_confirmation: bool,
  trial_plan: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "Elige un plan"),
  trial_days: int(0, 90, "los días de prueba"),
});

export const PlacesSettingSchema = z.object({ enabled: bool });

export const EmailSettingSchema = z.object({
  from_name: z.string().trim().min(1, "Ingresa el nombre del remitente").max(60, "Máximo 60 caracteres"),
  from_email: optEmail,
});

export const BrandingSettingSchema = z.object({ support_email: optEmail });

export const SETTING_SCHEMAS = {
  ai: AiSettingSchema,
  meta: MetaSettingSchema,
  signup: SignupSettingSchema,
  places: PlacesSettingSchema,
  email: EmailSettingSchema,
  branding: BrandingSettingSchema,
} as const;

export type AiSettings = {
  enabled: boolean;
  provider: (typeof AI_PROVIDERS)[number];
  agent_model: string;
  cheap_model: string;
  effort: (typeof AI_EFFORTS)[number];
  max_tool_iterations: number;
  timeout_ms: number;
  debounce_seconds: number;
};
export type MetaSettings = { app_id: string | null; es_config_id: string | null; graph_version: string; manual_connection_enabled: boolean };
export type SignupSettings = { enabled: boolean; require_email_confirmation: boolean; trial_plan: string; trial_days: number };
export type PlacesSettings = { enabled: boolean };
export type EmailSettings = { from_name: string; from_email: string | null };
export type BrandingSettings = { support_email: string | null };
export type PlatformSettings = {
  ai: AiSettings;
  meta: MetaSettings;
  signup: SignupSettings;
  places: PlacesSettings;
  email: EmailSettings;
  branding: BrandingSettings;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  ai: { enabled: true, provider: "fake", agent_model: "claude-opus-5-5", cheap_model: "claude-haiku-5-5", effort: "low", max_tool_iterations: 6, timeout_ms: 45000, debounce_seconds: 4 },
  meta: { app_id: null, es_config_id: null, graph_version: "v24.0", manual_connection_enabled: true },
  signup: { enabled: true, require_email_confirmation: false, trial_plan: "negocio", trial_days: 14 },
  places: { enabled: true },
  email: { from_name: "Teo", from_email: null },
  branding: { support_email: null },
};

// ─────────────────────────────────────────────────────────────
// Secretos
// ─────────────────────────────────────────────────────────────
export const SECRET_NAMES = [
  "anthropic_api_key",
  "google_places_api_key",
  "meta_app_secret",
  "whatsapp_verify_token",
  "resend_api_key",
  "supabase_management_token",
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];
export type SecretMeta = { last4: string | null; updated_at: string; updated_by: string | null } | null;

export const SecretValueSchema = z.object({
  name: z.enum(SECRET_NAMES, { message: "Secreto desconocido" }),
  value: z.string().trim().min(8, "El secreto debe tener al menos 8 caracteres").max(4000, "El secreto es demasiado largo"),
});

/** Une lo que devuelve admin_get_platform_config() con los valores por defecto (la UI nunca ve undefined). */
export function normalizeConfig(raw: unknown): { settings: PlatformSettings; secrets: Record<SecretName, SecretMeta> } {
  const r = (raw && typeof raw === "object" ? raw : {}) as { settings?: Record<string, unknown>; secrets?: Record<string, unknown> };
  const s = r.settings ?? {};
  const settings = Object.fromEntries(
    SETTING_KEYS.map((k) => {
      const v = s[k] && typeof s[k] === "object" ? (s[k] as object) : {};
      return [k, { ...DEFAULT_SETTINGS[k], ...v }];
    }),
  ) as PlatformSettings;
  const secrets = Object.fromEntries(
    SECRET_NAMES.map((n) => {
      const m = r.secrets?.[n];
      return [n, m && typeof m === "object" ? (m as SecretMeta) : null];
    }),
  ) as Record<SecretName, SecretMeta>;
  return { settings, secrets };
}

// ─────────────────────────────────────────────────────────────
// Planes
// ─────────────────────────────────────────────────────────────
export const FEATURE_KEYS = Object.keys(FEATURE_LABELS);

export const PlanSchema = z.object({
  mode: z.enum(["create", "update"]),
  id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,29}$/, "El identificador usa minúsculas, números y guiones (2 a 30 caracteres)"),
  name: z.string().trim().min(1, "Ingresa el nombre del plan").max(40, "Máximo 40 caracteres"),
  price_usd_month: z
    .string()
    .trim()
    .min(1, "Ingresa el precio")
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 100000, "El precio debe ser un número entre 0 y 100.000")
    .transform((v) => Math.round(v * 100) / 100),
  teo_messages_month: int(0, 10_000_000, "los mensajes de Teo"),
  max_users: optInt(100_000, "máximo de usuarios"),
  max_stores: optInt(100_000, "máximo de tiendas"),
  max_products: optInt(10_000_000, "máximo de productos"),
  features: z.array(z.string()).transform((fs) => [...new Set(fs)].filter((f) => FEATURE_KEYS.includes(f))),
  highlighted: bool,
  active: bool,
  sort_order: int(0, 1000, "el orden"),
});

/** FormData → objeto para PlanSchema (las features llegan como varios checkboxes con el mismo nombre). */
export function planFormInput(fd: FormData) {
  return { ...Object.fromEntries(fd), features: fd.getAll("features").map(String) };
}

// ─────────────────────────────────────────────────────────────
// Comercios
// ─────────────────────────────────────────────────────────────
export const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "canceled"] as const;
export const SUBSCRIPTION_LABELS: Record<(typeof SUBSCRIPTION_STATUSES)[number], string> = {
  trial: "En prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
};
export const ORG_STATUS_LABELS: Record<"onboarding" | "activo" | "suspendido", string> = {
  onboarding: "En onboarding",
  activo: "Activo",
  suspendido: "Suspendido",
};

export const ORG_STATUS_CLS: Record<string, string> = {
  onboarding: "bg-secondary text-secondary-foreground",
  activo: "bg-cta text-cta-foreground",
  suspendido: "bg-destructive text-white",
};

const optDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida")
  // Fin del día en Ecuador (UTC-5, sin horario de verano)
  .transform((v) => (v ? `${v}T23:59:59-05:00` : null));

export const SubscriptionSchema = z
  .object({
    orgId: z.uuid("Comercio inválido"),
    plan: z.string().trim().min(1, "Elige un plan"),
    status: z.enum(SUBSCRIPTION_STATUSES, { message: "Elige un estado" }),
    trial_ends_at: optDate,
    period_end: optDate,
  })
  .refine((v) => v.status !== "trial" || v.trial_ends_at != null, { message: "Indica hasta cuándo dura la prueba", path: ["trial_ends_at"] });

/** ISO → "YYYY-MM-DD" en hora de Ecuador (para inputs type=date). */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

// ─────────────────────────────────────────────────────────────
// Equipo Teo
// ─────────────────────────────────────────────────────────────
export const PLATFORM_ROLES = ["superadmin", "soporte"] as const;
export const PLATFORM_ROLE_LABELS: Record<(typeof PLATFORM_ROLES)[number], string> = { superadmin: "Superadmin", soporte: "Soporte (solo lectura)" };

export const TeamMemberSchema = z.object({
  email: z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Ingresa un correo válido"),
  role: z.enum(PLATFORM_ROLES, { message: "Elige un rol" }),
});
