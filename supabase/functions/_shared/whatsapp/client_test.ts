import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { buildButtons, buildList, buildText, GraphError, WhatsAppClient } from "./client.ts";
import { GRAPH_BASE } from "./constants.ts";

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const f = ((url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses.shift() ?? { status: 200, body: {} };
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }));
  }) as unknown as typeof fetch;
  return { f, calls };
}

Deno.test("sendText: endpoint versionado, token del comercio y wamid", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { messages: [{ id: "wamid.OK" }] } }]);
  const c = new WhatsAppClient({ token: "TOKEN-COMERCIO", phoneNumberId: "111", fetch: f });
  assertEquals(await c.sendText("593990000001", "Hola", { replyTo: "wamid.IN" }), "wamid.OK");
  assertEquals(calls[0].url, `${GRAPH_BASE}/111/messages`);
  assertEquals((calls[0].init.headers as Record<string, string>).Authorization, "Bearer TOKEN-COMERCIO");
  const body = JSON.parse(String(calls[0].init.body));
  assertEquals(body, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "593990000001",
    context: { message_id: "wamid.IN" },
    type: "text",
    text: { body: "Hola", preview_url: false },
  });
});

Deno.test("imagen, documento, reacción", async () => {
  const { f, calls } = fakeFetch([
    { status: 200, body: { messages: [{ id: "w1" }] } },
    { status: 200, body: { messages: [{ id: "w2" }] } },
    { status: 200, body: { messages: [{ id: "w3" }] } },
  ]);
  const c = new WhatsAppClient({ token: "t", phoneNumberId: "111", fetch: f });
  await c.sendImage("5939", { link: "https://x/y.jpg" }, "Torta");
  await c.sendDocument("5939", { id: "MEDIA1" }, { filename: "menu.pdf" });
  await c.sendReaction("5939", "wamid.IN", "❤️");
  const bodies = calls.map((x) => JSON.parse(String(x.init.body)));
  assertEquals(bodies[0].image, { link: "https://x/y.jpg", caption: "Torta" });
  assertEquals(bodies[1].document, { id: "MEDIA1", filename: "menu.pdf" });
  assertEquals(bodies[2].reaction, { message_id: "wamid.IN", emoji: "❤️" });
});

Deno.test("botones: máximo 3 y títulos recortados a 20", () => {
  const m = buildButtons("¿Confirmas?", [{ id: "si", title: "Sí, confirmo mi pedido ahora" }, { id: "no", title: "No" }]);
  const action = (m.interactive as { action: { buttons: { reply: { title: string } }[] } }).action;
  assertEquals(action.buttons.length, 2);
  assertEquals(action.buttons[0].reply.title.length, 20);
  assertThrows(() => buildButtons("x", [1, 2, 3, 4].map((i) => ({ id: `${i}`, title: `${i}` }))), GraphError);
  assertThrows(() => buildButtons("x", []), GraphError);
});

Deno.test("listas: hasta 10 filas", () => {
  const m = buildList("Elige talla", "Ver tallas", [{ rows: [{ id: "s", title: "S" }, { id: "m", title: "M", description: "Mediana" }] }]);
  assertEquals((m.interactive as { type: string }).type, "list");
  const rows = Array.from({ length: 11 }, (_, i) => ({ id: `${i}`, title: `${i}` }));
  assertThrows(() => buildList("x", "y", [{ rows }]), GraphError);
  assertThrows(() => buildList("x", "y", [{ rows: rows.slice(0, 2) }, { rows: rows.slice(2, 3) }]), GraphError);
});

Deno.test("texto vacío no se envía", () => {
  assertThrows(() => buildText("   "), GraphError);
});

Deno.test("markRead con typing indicator", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { success: true } }]);
  await new WhatsAppClient({ token: "t", phoneNumberId: "111", fetch: f }).markRead("wamid.IN", { typing: true });
  assertEquals(JSON.parse(String(calls[0].init.body)), {
    messaging_product: "whatsapp",
    status: "read",
    message_id: "wamid.IN",
    typing_indicator: { type: "text" },
  });
});

Deno.test("errores de Graph: código, reintentable o no", async () => {
  const { f } = fakeFetch([
    { status: 400, body: { error: { message: "Re-engagement", code: 131047 } } },
    { status: 503, body: { error: { message: "down", code: 1 } } },
    { status: 401, body: { error: { message: "Invalid OAuth access token", code: 190 } } },
  ]);
  const c = new WhatsAppClient({ token: "t", phoneNumberId: "111", fetch: f });
  const e1 = await assertRejects(() => c.sendText("5939", "hola"), GraphError);
  assertEquals([e1.code, e1.retriable], [131047, false]);
  const e2 = await assertRejects(() => c.sendText("5939", "hola"), GraphError);
  assertEquals(e2.retriable, true);
  const e3 = await assertRejects(() => c.getPhoneNumber(), GraphError);
  assertEquals([e3.status, e3.code, e3.retriable], [401, 190, false]);
});

Deno.test("el token nunca aparece en el mensaje de error", async () => {
  const token = "EAAG-token-secreto-1234567890";
  const { f } = fakeFetch([{ status: 400, body: { error: { message: `Malformed access token ${token}`, code: 190 } } }]);
  const e = await assertRejects(() => new WhatsAppClient({ token, phoneNumberId: "111", fetch: f }).sendText("5939", "hola"), GraphError);
  assertEquals(e.message, "Malformed access token ***");
});

Deno.test("media: GET /{media_id} y descarga con el token", async () => {
  const calls: string[] = [];
  const f = ((url: string, init: RequestInit) => {
    calls.push(`${url} ${(init.headers as Record<string, string>).Authorization}`);
    if (String(url).includes("lookaside")) return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    return Promise.resolve(new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/x", mime_type: "image/jpeg" })));
  }) as unknown as typeof fetch;
  const c = new WhatsAppClient({ token: "TK", fetch: f });
  const info = await c.getMedia("MEDIA1");
  const { bytes, mime } = await c.downloadMedia(info.url);
  assertEquals([...bytes], [1, 2, 3]);
  assertEquals(mime, "image/jpeg");
  assertEquals(calls, [`${GRAPH_BASE}/MEDIA1 Bearer TK`, "https://lookaside.fbsbx.com/x Bearer TK"]);
});

Deno.test("graphVersion: la versión de la Graph API sale de la config", async () => {
  const calls: string[] = [];
  const f = ((url: string) => {
    calls.push(String(url));
    return Promise.resolve(new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] })));
  }) as unknown as typeof fetch;
  await new WhatsAppClient({ token: "t", phoneNumberId: "111", fetch: f, graphVersion: "v99.0" }).sendText("5939", "hola");
  assertEquals(calls[0], "https://graph.facebook.com/v99.0/111/messages");
});
