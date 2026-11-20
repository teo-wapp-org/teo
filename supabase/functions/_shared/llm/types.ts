// Contrato del proveedor de LLM. La forma imita la Messages API de Anthropic (bloques de contenido,
// herramientas con JSON Schema), pero es independiente del SDK para que el FakeProvider y los tests
// no necesiten red ni API key.

/** Tarea → modelo. `agent` y `suggest`: modelo del agente. `cheap`: resúmenes, clasificación, extracción. */
export type LlmTask = "agent" | "suggest" | "cheap";

export type LlmTextBlock = { type: "text"; text: string };
export type LlmToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
export type LlmToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
/** Bloques que el proveedor devuelve y deben reenviarse sin cambios (p. ej. thinking). */
export type LlmOpaqueBlock = { type: string; [k: string]: unknown };

export type LlmBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock | LlmOpaqueBlock;

export type LlmMessage =
  | { role: "user"; content: string | LlmBlock[] }
  | { role: "assistant"; content: string | LlmBlock[] }
  /** Mensaje de sistema a mitad de conversación (operador): fecha/hora, estado del caso. */
  | { role: "system"; content: string };

export type LlmTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type LlmSystemBlock = { text: string; cache?: boolean };

export type LlmRequest = {
  task: LlmTask;
  /** Bloques de system en orden; `cache: true` pone un breakpoint de prompt caching al final de ese bloque. */
  system: LlmSystemBlock[];
  tools?: LlmTool[];
  messages: LlmMessage[];
  maxTokens?: number;
  /** Salida estructurada (JSON Schema). La respuesta llega como texto JSON válido. */
  jsonSchema?: Record<string, unknown>;
};

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type LlmResponse = {
  /** Contenido del asistente tal cual, para reenviarlo en la siguiente iteración. */
  content: LlmBlock[];
  /** end_turn | tool_use | max_tokens | refusal | pause_turn | ... */
  stopReason: string;
  model: string;
  usage: LlmUsage;
};

export interface LlmProvider {
  readonly name: "anthropic" | "fake" | string;
  complete(req: LlmRequest, opts?: { signal?: AbortSignal }): Promise<LlmResponse>;
}

export const emptyUsage = (): LlmUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export const textOf = (content: LlmBlock[]): string =>
  content.filter((b): b is LlmTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();

export const toolUsesOf = (content: LlmBlock[]): LlmToolUseBlock[] =>
  content.filter((b): b is LlmToolUseBlock => b.type === "tool_use");
