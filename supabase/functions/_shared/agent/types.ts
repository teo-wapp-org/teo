import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmProvider, LlmUsage } from "../llm/types.ts";

/** Dependencias inyectables del agente (tests: FakeProvider/ScriptedProvider, reloj fijo). */
export type AgentDeps = {
  /** Cliente con service role. Toda consulta filtra por org_id explícitamente. */
  db: SupabaseClient;
  llm: LlmProvider;
  now: () => Date;
  /** Tiempo máximo del turno completo (todas las iteraciones). Por defecto 45 s. */
  timeoutMs?: number;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

export type OutboundReply = {
  messageId: string;
  type: "text" | "image";
  body: string;
  mediaUrl?: string;
};

export type SkipReason = "humano" | "desactivado" | "copiloto" | "cupo_agotado" | "suspendido" | "sin_mensajes";

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
