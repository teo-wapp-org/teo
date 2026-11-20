import { assertEquals, assertStringIncludes } from "@std/assert";
import { classify, FakeProvider } from "./fake.ts";
import { buildConfig } from "../config.ts";
import { createProvider } from "./provider.ts";
import type { LlmMessage, LlmRequest, LlmToolUseBlock } from "./types.ts";
import { textOf, toolUsesOf } from "./types.ts";

const req = (messages: LlmMessage[], extra: Partial<LlmRequest> = {}): LlmRequest => ({ task: "agent", system: [{ text: "x" }], messages, ...extra });

Deno.test("classify: intenciones básicas", () => {
  assertEquals(classify("hola"), "saludo");
  assertEquals(classify("hola, tienen torta?"), "producto");
  assertEquals(classify("la quiero"), "comprar");
  assertEquals(classify("quiero hablar con una persona"), "escalar");
  assertEquals(classify("¿a qué hora abren?"), "tiendas");
  assertEquals(classify("hacen envíos?"), "politicas");
});

Deno.test("fake: compra completa pide buscar → actualizar → confirmar y responde con el total del backend", async () => {
  const llm = new FakeProvider();
  const msgs: LlmMessage[] = [
    { role: "user", content: "hola, tienen torta?" },
    { role: "assistant", content: "Sí, Torta: $18.50" },
    { role: "user", content: "la quiero" },
    { role: "system", content: "estado" },
  ];
  let r = await llm.complete(req(msgs));
  let call = toolUsesOf(r.content)[0] as LlmToolUseBlock;
  assertEquals(call.name, "buscar_productos");
  assertEquals((call.input as { query: string }).query, "torta");

  const push = (id: string, result: unknown) => {
    msgs.push({ role: "assistant", content: r.content });
    msgs.push({ role: "user", content: [{ type: "tool_result", tool_use_id: id, content: JSON.stringify(result) }] });
  };
  push(call.id, { productos: [{ id: "p1", nombre: "Torta", precio: 18.5, disponible: true }] });
  r = await llm.complete(req(msgs));
  call = toolUsesOf(r.content)[0];
  assertEquals(call.name, "actualizar_pedido");
  assertEquals((call.input as { items: { producto_id: string }[] }).items[0].producto_id, "p1");

  push(call.id, { pedido: { items: [], total: 18.5 } });
  r = await llm.complete(req(msgs));
  call = toolUsesOf(r.content)[0];
  assertEquals(call.name, "confirmar_pedido");

  push(call.id, { pedido: { items: [{ nombre: "Torta", cantidad: 1, subtotal: 18.5 }], total: 18.5 }, metodos_pago: [] });
  r = await llm.complete(req(msgs));
  assertEquals(r.stopReason, "end_turn");
  assertStringIncludes(textOf(r.content), "Total: $18.50");
});

Deno.test("fake: escalamiento y sugerencias JSON", async () => {
  const llm = new FakeProvider();
  const r = await llm.complete(req([{ role: "user", content: "quiero hablar con una persona" }]));
  assertEquals(toolUsesOf(r.content)[0].name, "escalar_a_humano");
  const s = await llm.complete(req([{ role: "user", content: "la quiero" }], { task: "suggest", jsonSchema: {} }));
  const parsed = JSON.parse(textOf(s.content));
  assertEquals(parsed.sugerencias[0].acciones[0].estado, "esperando_pago");
});

Deno.test("createProvider: según ai.provider y la key de Vault", () => {
  const ai = (provider: string) => buildConfig({ ai: { provider } }, { get: () => undefined }).ai;
  const fake = createProvider(ai("fake"), "sk-test");
  assertEquals([fake.llm.name, fake.error], ["fake", null]);
  const real = createProvider(ai("anthropic"), "sk-test");
  assertEquals([real.llm.name, real.error], ["anthropic", null]);
  // anthropic sin key → fake + error (se registra en agent_runs)
  const missing = createProvider(ai("anthropic"), null);
  assertEquals([missing.llm.name, missing.error], ["fake", "anthropic_key_missing"]);
});
