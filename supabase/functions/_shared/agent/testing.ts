// Helpers para tests de integración contra teo-dev (service role). Crean comercios QA
// ("qa-agent-*") y los borran al final (cascade). Requieren SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
// (usa ./scripts/test-functions).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FakeProvider } from "../llm/fake.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "../llm/types.ts";
import type { AgentDeps } from "./types.ts";

export function testDb(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const hasDb = Boolean(Deno.env.get("SUPABASE_URL") && Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

export function deps(db: SupabaseClient, llm: LlmProvider = new FakeProvider()): AgentDeps {
  return { db, llm, now: () => new Date("2026-11-23T15:00:00Z") }; // lunes 10:00 en Guayaquil
}

export async function createQaOrg(db: SupabaseClient, opts: { plan?: string } = {}) {
  const slug = `qa-agent-${crypto.randomUUID().slice(0, 8)}`;
  const { data: org, error } = await db.from("organizations").insert({ name: `QA Agente ${slug}`, slug, status: "activo" }).select("id, slug").single();
  if (error) throw error;
  const { error: e2 } = await db.from("subscriptions").insert({ org_id: org.id, plan_id: opts.plan ?? "negocio", status: "active" });
  if (e2) throw e2;
  return org as { id: string; slug: string };
}

export async function deleteOrg(db: SupabaseClient, orgId: string) {
  await db.from("organizations").delete().eq("id", orgId);
}

export async function addProduct(db: SupabaseClient, orgId: string, p: { name: string; price: number; stock?: number | null; description?: string }) {
  const { data, error } = await db.from("products").insert({ org_id: orgId, name: p.name, price: p.price, stock: p.stock ?? null, description: p.description ?? null }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

/** Inserta un mensaje entrante del cliente (crea contacto y conversación si hace falta). */
export async function inbound(db: SupabaseClient, orgId: string, text: string, waId = "593990000001", channel = "whatsapp") {
  const { data: contact, error: e1 } = await db.from("contacts").upsert({ org_id: orgId, wa_id: waId }, { onConflict: "org_id,wa_id" }).select("id").single();
  if (e1) throw e1;
  const { data: conv, error: e2 } = await db.from("conversations")
    .upsert({ org_id: orgId, contact_id: contact.id, channel }, { onConflict: "org_id,contact_id,channel" }).select("id").single();
  if (e2) throw e2;
  const { error: e3 } = await db.from("messages").insert({ org_id: orgId, conversation_id: conv.id, direction: "in", author: "cliente", type: "text", body: text, status: "received" });
  if (e3) throw e3;
  await new Promise((r) => setTimeout(r, 5)); // created_at estrictamente posterior
  return { conversationId: conv.id as string, contactId: contact.id as string };
}

/** Proveedor guionado: devuelve respuestas en orden (para probar guardrails). */
export class ScriptedProvider implements LlmProvider {
  readonly name = "scripted";
  calls: LlmRequest[] = [];
  constructor(private script: ((req: LlmRequest) => LlmResponse["content"])[]) {}
  complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(structuredClone(req));
    const step = this.script.shift();
    if (!step) throw new Error("script agotado");
    const content = step(req);
    return Promise.resolve({
      content,
      stopReason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
      model: "scripted",
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
  }
}

export const dbTest = (name: string, fn: (db: SupabaseClient) => Promise<void>) =>
  Deno.test({
    name,
    ignore: !hasDb,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () => fn(testDb()!),
  });
