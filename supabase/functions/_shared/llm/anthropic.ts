// Proveedor real: Claude vía Messages API (SDK oficial). FICHA §7.2.
// - Opus 5.5 con thinking adaptativo y effort bajo/medio; sin temperature ni prefill.
// - tool_choice auto (forzado da 400 en Opus 5.5); herramientas strict.
// - Prompt caching: tools → system estático → contexto del comercio (breakpoint) → historial
//   (cache automático de nivel superior). Lo volátil va en un mensaje de sistema al final.
// - Fallbacks del servidor ante `refusal` (beta server-side-fallback) en el modelo del agente.
import Anthropic from "@anthropic-ai/sdk";
import type { LlmBlock, LlmProvider, LlmRequest, LlmResponse, LlmTask } from "./types.ts";

type Effort = "low" | "medium" | "high";

export type AnthropicConfig = {
  apiKey: string;
  agentModel?: string;
  cheapModel?: string;
  effort?: Effort;
  timeoutMs?: number;
};

export const DEFAULT_AGENT_MODEL = "claude-opus-5-5";
export const DEFAULT_CHEAP_MODEL = "claude-haiku-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private cfg: Required<Omit<AnthropicConfig, "apiKey">>;

  constructor(cfg: AnthropicConfig) {
    this.client = new Anthropic({ apiKey: cfg.apiKey, timeout: cfg.timeoutMs ?? 60_000, maxRetries: 2 });
    this.cfg = {
      agentModel: cfg.agentModel ?? DEFAULT_AGENT_MODEL,
      cheapModel: cfg.cheapModel ?? DEFAULT_CHEAP_MODEL,
      effort: cfg.effort ?? "low",
      timeoutMs: cfg.timeoutMs ?? 60_000,
    };
  }

  modelFor(task: LlmTask): string {
    return task === "cheap" ? this.cfg.cheapModel : this.cfg.agentModel;
  }

  async complete(req: LlmRequest, opts?: { signal?: AbortSignal }): Promise<LlmResponse> {
    const model = this.modelFor(req.task);
    const withFallbacks = req.task !== "cheap"; // Haiku no tiene fallback de servidor

    const system: Anthropic.Beta.BetaTextBlockParam[] = req.system.map((b) => ({
      type: "text",
      text: b.text,
      ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
    }));

    const tools: Anthropic.Beta.BetaTool[] | undefined = req.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
      strict: true,
    }));

    const messages = req.messages.map((m) =>
      m.role === "system"
        ? ({ role: "system", content: m.content } as Anthropic.Beta.BetaSystemMessageParam)
        : ({ role: m.role, content: m.content } as Anthropic.Beta.BetaMessageParam)
    );

    const res = await this.client.beta.messages.create(
      {
        model,
        max_tokens: req.maxTokens ?? 16_000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: req.task === "agent" ? this.cfg.effort : "low",
          ...(req.jsonSchema ? { format: { type: "json_schema" as const, schema: req.jsonSchema } } : {}),
        },
        // Breakpoint automático al final del historial (el del contexto del comercio va en `system`).
        cache_control: { type: "ephemeral" },
        system,
        ...(tools?.length ? { tools, tool_choice: { type: "auto" as const } } : {}),
        messages,
        ...(withFallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      },
      { signal: opts?.signal },
    );

    return {
      content: res.content as unknown as LlmBlock[],
      stopReason: res.stop_reason ?? "end_turn",
      model: res.model,
      usage: {
        inputTokens: res.usage.input_tokens ?? 0,
        outputTokens: res.usage.output_tokens ?? 0,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
