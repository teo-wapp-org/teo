import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmProvider, LlmUsage } from "../llm/types.ts";

/** Dependencias inyectables del agente (tests: FakeProvider/ScriptedProvider, reloj fijo). */
export type AgentDeps = {
  /** Cliente con service role. Toda consulta filtra por org_id explícitamente. */
  db: SupabaseClient;
  llm: LlmProvider;
  now: () => Date;
  /** Tiempo máximo del turno completo (todas las iteraciones). Por defecto 45 s (ajuste ai.timeout_ms). */
  timeoutMs?: number;
  /** Máximo de iteraciones del loop de herramientas. Por defecto 6 (ajuste ai.max_tool_iterations). */
  maxToolIterations?: number;
  /** Interruptor global de la IA (ajuste ai.enabled). false → Teo no responde, solo sugiere. */
  aiEnabled?: boolean;
  /** Error de configuración (p. ej. falta la key de Anthropic → se usó fake). Se registra en agent_runs. */
  configError?: string | null;
  /** Resuelve llm y ajustes desde la configuración de la plataforma en cada turno (ver runtime.ts). */
  runtime?: () => Promise<AgentRuntime>;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

export type AgentRuntime = Pick<AgentDeps, "llm" | "timeoutMs" | "maxToolIterations" | "aiEnabled" | "configError">;

export type OutboundReply = {
  messageId: string;
  type: "text" | "image";
  body: string;
  mediaUrl?: string;
};

export type SkipReason = "humano" | "ia_pausada" | "desactivado" | "copiloto" | "cupo_agotado" | "suspendido" | "sin_mensajes";

export type AgentTurnResult = {
  replies: OutboundReply[];
  caseId: string;
  handledBy: "teo" | "humano";
  usage: LlmUsage;
  /** Por qué Teo no respondió (si aplica). En esos casos se generan sugerencias. */
  skipped?: SkipReason;
};

export type Channel = "whatsapp" | "simulador";

/** Contexto que el servidor inyecta a cada herramienta. El modelo nunca elige org ni caso. */
export type ToolContext = {
  db: SupabaseClient;
  now: () => Date;
  orgId: string;
  caseId: string;
  contactId: string;
  conversationId: string;
  timezone: string;
  /** Respuestas extra (p. ej. fotos) que la herramienta pide enviar. */
  extraReplies: { type: "image"; body: string; mediaUrl: string }[];
  /** Se marca cuando una herramienta escala a humano. */
  escalated: boolean;
};

export const MAX_TOOL_ITERATIONS = 6;
export const DEFAULT_TURN_TIMEOUT_MS = 45_000;
