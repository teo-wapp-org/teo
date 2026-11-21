// Ajustes del agente desde la configuración de la plataforma (_shared/config.ts): proveedor LLM y
// key de Anthropic (Vault), interruptor global, iteraciones y timeout. Se resuelve en cada turno
// (la config tiene caché de 30 s por isolate), así un cambio en /admin aplica sin redesplegar.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformSecret, loadPlatformConfig, type RpcClient } from "../config.ts";
import { FakeProvider } from "../llm/fake.ts";
import { createProvider } from "../llm/provider.ts";
import type { AgentDeps, AgentRuntime } from "./types.ts";

/** Aplica `deps.runtime()` (si existe) y devuelve dependencias ya resueltas (sin `runtime`). */
export async function resolveAgentDeps(deps: AgentDeps): Promise<AgentDeps> {
  if (!deps.runtime) return deps;
  const { runtime, ...rest } = deps;
  return { ...rest, ...(await runtime()) };
}

export function platformRuntime(db: RpcClient): () => Promise<AgentRuntime> {
  return async () => {
    const cfg = await loadPlatformConfig(db);
    const key = cfg.ai.provider === "anthropic" ? await getPlatformSecret(db, "anthropic_api_key") : null;
    const { llm, error } = createProvider(cfg.ai, key);
    return {
      llm,
      configError: error,
      aiEnabled: cfg.ai.enabled,
      maxToolIterations: cfg.ai.maxToolIterations,
      timeoutMs: cfg.ai.timeoutMs,
    };
  };
}

/** Dependencias de producción del agente: service role + configuración de la plataforma por turno. */
export function platformAgentDeps(db: SupabaseClient, log: AgentDeps["log"]): AgentDeps {
  return {
    db,
    llm: new FakeProvider(), // se reemplaza en cada turno por el proveedor configurado
    runtime: platformRuntime(db),
    now: () => new Date(),
    log,
  };
}
