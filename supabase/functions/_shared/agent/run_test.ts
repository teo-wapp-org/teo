// Tests de integración del turno del agente contra teo-dev (datos QA que se borran al final).
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { LlmToolResultBlock } from "../llm/types.ts";
import { PRICE_GUARD_TEXT, runAgentTurn } from "./run.ts";
import { generateSuggestions } from "./suggest.ts";
import { addProduct, createQaOrg, dbTest, deleteOrg, deps, inbound, ScriptedProvider } from "./testing.ts";

// deno-lint-ignore no-explicit-any -- cliente de test
const caseOf = async (db: any, caseId: string) =>
  (await db.from("cases").select("status, type, estimated_amount").eq("id", caseId).single()).data;

dbTest("flujo feliz: consulta → cotización → esperando pago (FakeProvider)", async (db) => {
  const org = await createQaOrg(db);
  try {
    await addProduct(db, org.id, { name: "Torta de chocolate", price: 18.5, description: "Torta húmeda para 10 personas" });
    await addProduct(db, org.id, { name: "Pie de limón", price: 12 });
    await db.from("payment_methods").insert({ org_id: org.id, type: "transferencia", label: "Transferencia Banco Pichincha", instructions: "Cuenta 2200 a nombre de QA" });

    const { conversationId } = await inbound(db, org.id, "hola, tienen torta?");
    const r1 = await runAgentTurn(deps(db), { orgId: org.id, conversationId });
    assertEquals(r1.handledBy, "teo");
    assertEquals(r1.replies.length, 1);
    assertStringIncludes(r1.replies[0].body, "Torta de chocolate: $18.50");
    assertEquals((await caseOf(db, r1.caseId)).status, "en_conversacion");

    await inbound(db, org.id, "la quiero");
    const r2 = await runAgentTurn(deps(db), { orgId: org.id, conversationId });
    assertEquals(r2.caseId, r1.caseId);
    assertStringIncludes(r2.replies[0].body, "Total: $18.50");
    assertStringIncludes(r2.replies[0].body, "Transferencia Banco Pichincha");
    const c = await caseOf(db, r2.caseId);
    assertEquals(c.status, "esperando_pago");
    assertEquals(c.type, "venta");
    assertEquals(Number(c.estimated_amount), 18.5);

    const { data: order } = await db.from("orders").select("status, total, items:order_items(name, quantity, unit_price)").eq("case_id", r2.caseId).single();
    assertEquals(order!.status, "confirmado");
    assertEquals(Number(order!.total), 18.5);

    const { data: out } = await db.from("messages").select("status, author").eq("conversation_id", conversationId).eq("direction", "out");
    assertEquals(out!.length, 2);
    // canal whatsapp: se guardan 'queued'; el envío (otra fase) puede pasarlos a sent/failed enseguida
    assert(out!.every((m) => m.status !== "received" && m.author === "teo"), JSON.stringify(out));
    const { data: runs } = await db.from("agent_runs").select("kind, tools").eq("org_id", org.id);
    assertEquals(runs!.length, 2);
    const { data: usage } = await db.from("usage_counters").select("teo_messages").eq("org_id", org.id).single();
    assertEquals(usage!.teo_messages, 2);
    const { data: events } = await db.from("case_events").select("actor, to_status").eq("case_id", r2.caseId).order("id");
    assert(events!.some((e) => e.actor === "teo" && e.to_status === "esperando_pago"));

    // sin mensajes nuevos: no hace nada
    const r3 = await runAgentTurn(deps(db), { orgId: org.id, conversationId });
    assertEquals(r3.skipped, "sin_mensajes");
  } finally {
    await deleteOrg(db, org.id);
  }
});

dbTest("canal simulador: respuestas quedan 'sent'", async (db) => {
  const org = await createQaOrg(db);
  try {
    const { conversationId } = await inbound(db, org.id, "hola", "simulador", "simulador");
    const r = await runAgentTurn(deps(db), { orgId: org.id, conversationId });
    assertEquals(r.replies[0].body, "¡Hola! ¿En qué te puedo ayudar hoy?");
    const { data: out } = await db.from("messages").select("status").eq("id", r.replies[0].messageId).single();
    assertEquals(out!.status, "sent");
  } finally {
    await deleteOrg(db, org.id);
  }
});

dbTest("escalamiento: pide una persona → requiere atención y luego solo sugiere", async (db) => {
  const org = await createQaOrg(db);
  try {
    const { conversationId } = await inbound(db, org.id, "quiero hablar con una persona");
    const r = await runAgentTurn(deps(db), { orgId: org.id, conversationId });
    assertEquals(r.handledBy, "humano");
    assertEquals(r.replies.length, 1);
    assertEquals((await caseOf(db, r.caseId)).status, "requiere_atencion");
    const { data: conv } = await db.from("conversations").select("handled_by").eq("id", conversationId).single();
    assertEquals(conv!.handled_by, "humano");

    await inbound(db, org.id, "hola? sigo esperando");
    const r2 = await runAgentTurn(deps(db), { orgId: org.id, conversationId });
    assertEquals(r2.replies.length, 0);
    assertEquals(r2.skipped, "humano");
    const { data: sug } = await db.from("ai_suggestions").select("text, state").eq("case_id", r.caseId).eq("state", "nueva");
    assert(sug!.length >= 1);
  } finally {
    await deleteOrg(db, org.id);
  }
});

dbTest("cupo agotado → modo copiloto (no responde, genera sugerencias)", async (db) => {
  const org = await createQaOrg(db, { plan: "gratis" });
  try {
    const { data: sub } = await db.from("subscriptions").select("current_period_start").eq("org_id", org.id).single();
    const period = new Date(sub!.current_period_start).toISOString().slice(0, 10);
    await db.from("usage_counters").insert({ org_id: org.id, period_start: period, teo_messages: 100 });
    const { conversationId } = await inbound(db, org.id, "la quiero");
    const r = await runAgentTurn(deps(db), { orgId: org.id, conversationId });
    assertEquals(r.replies.length, 0);
    assertEquals(r.skipped, "cupo_agotado");
    const { data: sug } = await db.from("ai_suggestions").select("text, actions").eq("case_id", r.caseId);
    assert(sug!.length >= 1);
    const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).eq("direction", "out");
    assertEquals(count, 0);
  } finally {
    await deleteOrg(db, org.id);
  }
});

dbTest("modo copiloto del comercio: no responde; generateSuggestions devuelve acciones", async (db) => {
  const org = await createQaOrg(db);
  try {
    await db.from("agent_settings").update({ mode: "copiloto" }).eq("org_id", org.id);
    const { conversationId } = await inbound(db, org.id, "la quiero");
    const r = await runAgentTurn(deps(db), { orgId: org.id, conversationId });
    assertEquals(r.skipped, "copiloto");
    const s = await generateSuggestions(deps(db), { orgId: org.id, caseId: r.caseId, n: 2 });
    assertEquals(s.length, 2);
    assertEquals(s[0].actions[0].estado, "esperando_pago");
    const { count } = await db.from("ai_suggestions").select("id", { count: "exact", head: true }).eq("case_id", r.caseId).eq("state", "nueva");
    assertEquals(count, 2); // las anteriores quedan descartadas
  } finally {
    await deleteOrg(db, org.id);
  }
});

dbTest("guardrail de precios: el modelo no puede fijar precios ni inventar montos", async (db) => {
  const org = await createQaOrg(db);
  try {
    const pid = await addProduct(db, org.id, { name: "Torta de chocolate", price: 18.5 });
    const llm = new ScriptedProvider([
      // 1) intenta fijar un precio → entrada inválida (clave extra)
      () => [{ type: "tool_use", id: "t1", name: "actualizar_pedido", input: { items: [{ producto_id: pid, variante_id: null, cantidad: 2, precio: 0.01 }], entrega: null, notas: null } }],
      // 2) lo arma bien → el backend pone el precio
      () => [{ type: "tool_use", id: "t2", name: "actualizar_pedido", input: { items: [{ producto_id: pid, variante_id: null, cantidad: 2 }], entrega: null, notas: null } }],
      // 3) inventa un total
      () => [{ type: "text", text: "Listo, te lo dejo en $1.00 en total." }],
    ]);
    const { conversationId } = await inbound(db, org.id, "quiero 2 tortas");
    const r = await runAgentTurn(deps(db, llm), { orgId: org.id, conversationId });

    const first = (llm.calls[1].messages.at(-1)!.content as LlmToolResultBlock[])[0];
    assertEquals(first.is_error, true);
    assertStringIncludes(first.content, "Entrada inválida");
    const second = JSON.parse((llm.calls[2].messages.at(-1)!.content as LlmToolResultBlock[])[0].content);
    assertEquals(second.pedido.total, 37);

    assertEquals(r.replies[0].body, PRICE_GUARD_TEXT);
    assertEquals(r.handledBy, "humano");
    assertEquals((await caseOf(db, r.caseId)).status, "requiere_atencion");
    const { data: order } = await db.from("orders").select("total").eq("case_id", r.caseId).single();
    assertEquals(Number(order!.total), 37);
  } finally {
    await deleteOrg(db, org.id);
  }
});

dbTest("aislamiento por comercio en herramientas", async (db) => {
  const a = await createQaOrg(db);
  const b = await createQaOrg(db);
  try {
    await addProduct(db, a.id, { name: "Torta de vainilla", price: 10 });
    const foreign = await addProduct(db, b.id, { name: "Torta secreta", price: 99 });
    const llm = new ScriptedProvider([
      () => [
        { type: "tool_use", id: "t1", name: "ver_producto", input: { producto_id: foreign } },
        { type: "tool_use", id: "t2", name: "actualizar_pedido", input: { items: [{ producto_id: foreign, variante_id: null, cantidad: 1 }], entrega: null, notas: null } },
        { type: "tool_use", id: "t3", name: "buscar_productos", input: { query: "torta", categoria: null, precio_max: null } },
      ],
      () => [{ type: "text", text: "Tenemos Torta de vainilla." }],
    ]);
    const { conversationId } = await inbound(db, a.id, "tienen torta?");
    const r = await runAgentTurn(deps(db, llm), { orgId: a.id, conversationId });
    const results = llm.calls[1].messages.at(-1)!.content as LlmToolResultBlock[];
    assertEquals(results.length, 3); // todos los resultados en un solo mensaje
    assertEquals(results[0].is_error, true);
    assertStringIncludes(results[0].content, "no encontrado");
    assertEquals(results[1].is_error, true);
    const found = JSON.parse(results[2].content).productos.map((p: { nombre: string }) => p.nombre);
    assertEquals(found, ["Torta de vainilla"]);
    assertEquals(r.replies[0].body, "Tenemos Torta de vainilla.");
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("org_id", a.id);
    assertEquals(count, 0);
    // el contexto del prompt solo incluye el catálogo propio
    const sys = llm.calls[0].system.map((s) => s.text).join("\n");
    assert(!sys.includes("Torta secreta"));
    assertStringIncludes(sys, "Torta de vainilla");
  } finally {
    await deleteOrg(db, a.id);
    await deleteOrg(db, b.id);
  }
});

dbTest("conversación de otro comercio: runAgentTurn la rechaza", async (db) => {
  const a = await createQaOrg(db);
  const b = await createQaOrg(db);
  try {
    const { conversationId } = await inbound(db, b.id, "hola");
    let err = "";
    try {
      await runAgentTurn(deps(db), { orgId: a.id, conversationId });
    } catch (e) {
      err = String(e);
    }
    assertStringIncludes(err, "conversation_not_found");
  } finally {
    await deleteOrg(db, a.id);
    await deleteOrg(db, b.id);
  }
});

dbTest("errores repetidos del LLM → escala a humano con mensaje de cortesía", async (db) => {
  const org = await createQaOrg(db);
  try {
    const llm = { name: "roto", complete: () => Promise.reject(new Error("503")) };
    const { conversationId } = await inbound(db, org.id, "hola");
    const r = await runAgentTurn(deps(db, llm), { orgId: org.id, conversationId });
    assertEquals(r.handledBy, "humano");
    assertEquals(r.replies.length, 1);
    assertEquals((await caseOf(db, r.caseId)).status, "requiere_atencion");
    const { data: run } = await db.from("agent_runs").select("error").eq("org_id", org.id).single();
    assertStringIncludes(run!.error, "llm_error");
  } finally {
    await deleteOrg(db, org.id);
  }
});
