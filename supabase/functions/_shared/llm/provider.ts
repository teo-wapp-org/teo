// Selección del proveedor por entorno:
//   TEO_LLM_PROVIDER = anthropic | fake
//   por defecto: anthropic si existe ANTHROPIC_API_KEY, si no fake.
// Opcionales: TEO_AGENT_MODEL, TEO_CHEAP_MODEL, TEO_LLM_EFFORT (low|medium|high).
import { AnthropicProvider } from "./anthropic.ts";
import { FakeProvider } from "./fake.ts";
import type { LlmProvider } from "./types.ts";

type Env = { get(k: string): string | undefined };

export function selectProvider(env: Env = Deno.env): LlmProvider {
  const apiKey = env.get("ANTHROPIC_API_KEY");
  const wanted = (env.get("TEO_LLM_PROVIDER") ?? (apiKey ? "anthropic" : "fake")).toLowerCase();
  if (wanted === "anthropic") {
    if (!apiKey) throw new Error("TEO_LLM_PROVIDER=anthropic requiere ANTHROPIC_API_KEY");
    const effort = env.get("TEO_LLM_EFFORT") as "low" | "medium" | "high" | undefined;
    return new AnthropicProvider({
      apiKey,
      agentModel: env.get("TEO_AGENT_MODEL"),
      cheapModel: env.get("TEO_CHEAP_MODEL"),
      effort,
    });
  }
  if (wanted === "fake") return new FakeProvider();
  throw new Error(`TEO_LLM_PROVIDER desconocido: ${wanted}`);
}
