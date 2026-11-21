/**
 * Conversión pura de public_platform_config() (se prueba con Vitest).
 * Configuración pública de la plataforma (RPC public_platform_config): solo valores no sensibles
 * que el superadmin administra desde /admin. Si la DB falla, valores por defecto conservadores.
 */
export type PublicPlatformConfig = {
  signup_enabled: boolean;
  trial_days: number;
  meta_app_id: string | null;
  meta_es_config_id: string | null;
  meta_graph_version: string;
  whatsapp_manual_connection: boolean;
  places_available: boolean;
  support_email: string | null;
};

export const DEFAULT_PUBLIC_CONFIG: PublicPlatformConfig = {
  signup_enabled: true,
  trial_days: 14,
  meta_app_id: null,
  meta_es_config_id: null,
  meta_graph_version: "v24.0",
  whatsapp_manual_connection: true,
  places_available: false,
  support_email: null,
};

export function parsePublicConfig(raw: unknown): PublicPlatformConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const days = Number(r.trial_days);
  return {
    signup_enabled: bool(r.signup_enabled, DEFAULT_PUBLIC_CONFIG.signup_enabled),
    trial_days: Number.isFinite(days) && days >= 0 ? Math.round(days) : DEFAULT_PUBLIC_CONFIG.trial_days,
    meta_app_id: str(r.meta_app_id),
    meta_es_config_id: str(r.meta_es_config_id),
    meta_graph_version: str(r.meta_graph_version) ?? DEFAULT_PUBLIC_CONFIG.meta_graph_version,
    whatsapp_manual_connection: bool(r.whatsapp_manual_connection, DEFAULT_PUBLIC_CONFIG.whatsapp_manual_connection),
    places_available: bool(r.places_available, DEFAULT_PUBLIC_CONFIG.places_available),
    support_email: str(r.support_email),
  };
}
