// Selección del proveedor LLM a partir de la configuración de la plataforma (ajuste `ai` en la DB
// y secreto `anthropic_api_key` en Vault; ver _shared/config.ts). Si el ajuste pide Anthropic pero
// no hay key, se usa el FakeProvider y se devuelve el error para registrarlo en agent_runs.
import type { AiSettings } from "../config.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { FakeProvider } from "./fake.ts";
import type { LlmProvider } from "./types.ts";

export type ProviderSelection = { llm: LlmProvider; error: string | null };

export function createProvider(ai: AiSettings, anthropicApiKey: string | null): ProviderSelection {
  if (ai.provider === "anthropic") {
    if (!anthropicApiKey) return { llm: new FakeProvider(), error: "anthropic_key_missing" };
    return {
      llm: new AnthropicProvider({
        apiKey: anthropicApiKey,
        agentModel: ai.agentModel,
        cheapModel: ai.cheapModel,
        effort: ai.effort,
      }),
      error: null,
    };
  }
  return { llm: new FakeProvider(), error: null };
}
