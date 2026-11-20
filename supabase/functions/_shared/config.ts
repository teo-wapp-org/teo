// Configuración de la plataforma (administrada desde /admin, vive en la DB y en Vault).
//
//   loadPlatformConfig(db)          → ajustes tipados (RPC get_platform_config, solo service_role)
//   getPlatformSecret(db, nombre)   → secreto de Vault (RPC get_platform_secret, solo service_role)
//
// Precedencia: DB > variable de entorno > valor por defecto. Las variables de entorno quedan solo
// como respaldo (proyectos sin la migración o si la DB falla). Caché en memoria por isolate de 30 s;
// `{ fresh: true }` la salta (p. ej. pruebas de conexión del panel admin justo después de guardar).
// Nunca se registran los valores de los secretos.

export type Effort = "low" | "medium" | "high";
export type LlmProviderName = "anthropic" | "fake";

export type AiSettings = {
  /** Interruptor global: si es false, Teo no responde en ningún comercio (solo sugiere). */
  enabled: boolean;
  provider: LlmProviderName;
  agentModel: string;
  cheapModel: string;
  effort: Effort;
  maxToolIterations: number;
  timeoutMs: number;
  debounceSeconds: number;
};

export type MetaSettings = {
  appId: string | null;
  esConfigId: string | null;
  graphVersion: string;
  manualConnectionEnabled: boolean;
};

export type SignupSettings = {
  enabled: boolean;
  requireEmailConfirmation: boolean;
  trialPlan: string;
  trialDays: number;
};

export type PlacesSettings = { enabled: boolean };
export type EmailSettings = { fromName: string; fromEmail: string | null };
export type BrandingSettings = { supportEmail: string | null };

export type PlatformConfig = {
  ai: AiSettings;
  meta: MetaSettings;
  signup: SignupSettings;
  places: PlacesSettings;
  email: EmailSettings;
  branding: BrandingSettings;
};

export const SECRET_NAMES = [
  "anthropic_api_key",
  "google_places_api_key",
  "meta_app_secret",
  "whatsapp_verify_token",
  "resend_api_key",
  "supabase_management_token",
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

/** Variables de entorno de respaldo por secreto (en orden). */
export const SECRET_ENV: Record<SecretName, string[]> = {
  anthropic_api_key: ["ANTHROPIC_API_KEY"],
  google_places_api_key: ["GOOGLE_PLACES_API_KEY"],
  meta_app_secret: ["WHATSAPP_APP_SECRET", "META_APP_SECRET"],
  whatsapp_verify_token: ["WHATSAPP_VERIFY_TOKEN"],
  resend_api_key: ["RESEND_API_KEY"],
  supabase_management_token: ["SUPABASE_MANAGEMENT_TOKEN"],
};

export const CONFIG_TTL_MS = 30_000;

/** Lo mínimo que se necesita del cliente de Supabase (service role). */
export type RpcClient = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
export type EnvReader = { get(k: string): string | undefined };

type Raw = Record<string, Record<string, unknown> | undefined>;

// ── Conversión con precedencia DB > env > default ─────────────────────────

const present = (v: unknown) => v !== undefined && v !== null && v !== "";

function str(db: unknown, env: string | undefined, def: string): string;
function str(db: unknown, env: string | undefined, def: null): string | null;
function str(db: unknown, env: string | undefined, def: string | null): string | null {
  if (present(db)) return String(db);
  if (present(env)) return env!;
  return def;
}

function bool(db: unknown, env: string | undefined, def: boolean): boolean {
  if (typeof db === "boolean") return db;
  if (db === "true" || db === "false") return db === "true";
  if (env === "true" || env === "1") return true;
  if (env === "false" || env === "0") return false;
  return def;
}

function int(db: unknown, env: string | undefined, def: number, min: number, max: number): number {
  for (const v of [db, env]) {
    if (!present(v)) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return Math.min(Math.max(Math.round(n), min), max);
  }
  return def;
}

function oneOf<T extends string>(allowed: readonly T[], db: unknown, env: string | undefined, def: T): T {
  for (const v of [db, env]) {
    const s = typeof v === "string" ? v.toLowerCase() : null;
    if (s && (allowed as readonly string[]).includes(s)) return s as T;
  }
  return def;
}

export function buildConfig(raw: Raw, env: EnvReader): PlatformConfig {
  const ai = raw.ai ?? {};
  const meta = raw.meta ?? {};
  const signup = raw.signup ?? {};
  const places = raw.places ?? {};
  const email = raw.email ?? {};
  const branding = raw.branding ?? {};
  return {
    ai: {
      enabled: bool(ai.enabled, env.get("TEO_AI_ENABLED"), true),
      // Sin DB: anthropic si hay ANTHROPIC_API_KEY (comportamiento histórico), si no fake.
      provider: oneOf(["anthropic", "fake"], ai.provider, env.get("TEO_LLM_PROVIDER"), env.get("ANTHROPIC_API_KEY") ? "anthropic" : "fake"),
      agentModel: str(ai.agent_model, env.get("TEO_AGENT_MODEL"), "claude-opus-5-5"),
      cheapModel: str(ai.cheap_model, env.get("TEO_CHEAP_MODEL"), "claude-haiku-5-5"),
      effort: oneOf(["low", "medium", "high"], ai.effort, env.get("TEO_LLM_EFFORT"), "low"),
      maxToolIterations: int(ai.max_tool_iterations, env.get("TEO_MAX_TOOL_ITERATIONS"), 6, 1, 20),
      timeoutMs: int(ai.timeout_ms, env.get("TEO_AGENT_TIMEOUT_MS"), 45_000, 5_000, 140_000),
      debounceSeconds: int(ai.debounce_seconds, env.get("TEO_DEBOUNCE_SECONDS"), 4, 0, 60),
    },
    meta: {
      appId: str(meta.app_id, env.get("META_APP_ID"), null),
      esConfigId: str(meta.es_config_id, env.get("META_ES_CONFIG_ID"), null),
      graphVersion: str(meta.graph_version, env.get("META_GRAPH_VERSION"), "v24.0"),
      manualConnectionEnabled: bool(meta.manual_connection_enabled, undefined, true),
    },
    signup: {
      enabled: bool(signup.enabled, undefined, true),
      requireEmailConfirmation: bool(signup.require_email_confirmation, undefined, false),
      trialPlan: str(signup.trial_plan, undefined, "negocio"),
      trialDays: int(signup.trial_days, undefined, 14, 0, 365),
    },
    places: { enabled: bool(places.enabled, undefined, true) },
    email: { fromName: str(email.from_name, undefined, "Teo"), fromEmail: str(email.from_email, env.get("EMAIL_FROM"), null) },
    branding: { supportEmail: str(branding.support_email, undefined, null) },
  };
}

// ── Caché por isolate ─────────────────────────────────────────────────────

type Entry<T> = { value: T; at: number };

export type ConfigStoreOptions = {
  env?: EnvReader;
  now?: () => number;
  ttlMs?: number;
  log?: (event: string, data: Record<string, unknown>) => void;
};

export class ConfigStore {
  private config: Entry<PlatformConfig> | null = null;
  private secrets = new Map<string, Entry<string | null>>();
  private env: EnvReader;
  private now: () => number;
  private ttl: number;
  private log: (event: string, data: Record<string, unknown>) => void;

  constructor(opts: ConfigStoreOptions = {}) {
    this.env = opts.env ?? Deno.env;
    this.now = opts.now ?? Date.now;
    this.ttl = opts.ttlMs ?? CONFIG_TTL_MS;
    this.log = opts.log ?? ((event, data) => console.warn(JSON.stringify({ level: "warn", event, ...data })));
  }

  private fresh<T>(e: Entry<T> | null | undefined): e is Entry<T> {
    return !!e && this.now() - e.at < this.ttl;
  }

  async load(db: RpcClient, opts: { fresh?: boolean } = {}): Promise<PlatformConfig> {
    if (!opts.fresh && this.fresh(this.config)) return this.config.value;
    let raw: Raw = {};
    try {
      const { data, error } = await db.rpc("get_platform_config");
      if (error) throw new Error(error.message);
      raw = (data && typeof data === "object" ? data : {}) as Raw;
    } catch (e) {
      // Sin DB: respaldo a env/defaults, sin cachear para reintentar en la próxima llamada.
      this.log("config_db_error", { error: String(e).slice(0, 200) });
      return buildConfig({}, this.env);
    }
    const value = buildConfig(raw, this.env);
    this.config = { value, at: this.now() };
    return value;
  }

  async secret(db: RpcClient, name: SecretName, opts: { fresh?: boolean } = {}): Promise<string | null> {
    const cached = this.secrets.get(name);
    if (!opts.fresh && this.fresh(cached)) return cached.value;
    const fromEnv = () => SECRET_ENV[name].map((k) => this.env.get(k)).find((v) => present(v)) ?? null;
    let fromDb: string | null = null;
    try {
      const { data, error } = await db.rpc("get_platform_secret", { p_name: name });
      if (error) throw new Error(error.message);
      fromDb = typeof data === "string" && data ? data : null;
    } catch (e) {
      this.log("secret_db_error", { name, error: String(e).slice(0, 200) });
      return fromEnv();
    }
    const value = fromDb ?? fromEnv();
    this.secrets.set(name, { value, at: this.now() });
    return value;
  }

  clear() {
    this.config = null;
    this.secrets.clear();
  }
}

const shared = new ConfigStore();

/** Ajustes de la plataforma (caché 30 s por isolate). */
export function loadPlatformConfig(db: RpcClient, opts?: { fresh?: boolean }): Promise<PlatformConfig> {
  return shared.load(db, opts);
}

/** Secreto de la plataforma desde Vault, con respaldo a env (caché 30 s por isolate). */
export function getPlatformSecret(db: RpcClient, name: SecretName, opts?: { fresh?: boolean }): Promise<string | null> {
  return shared.secret(db, name, opts);
}

export function clearPlatformConfigCache() {
  shared.clear();
}

/** Ref del proyecto a partir de SUPABASE_URL (https://<ref>.supabase.co). */
export function projectRef(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const host = new URL(supabaseUrl).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  } catch {
    return null;
  }
}
