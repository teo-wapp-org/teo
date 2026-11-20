import { assert, assertEquals, assertFalse, assertRejects } from "jsr:@std/assert@1";
import { isWindowOpen, OutboundError, type OutboundRow, requiresOpenWindow, toGraphMessage } from "./outbound.ts";

const now = new Date("2026-11-21T12:00:00Z");
const row = (p: Partial<OutboundRow>): OutboundRow => ({
  id: "m1",
  org_id: "o1",
  conversation_id: "c1",
  type: "text",
  body: null,
  media_path: null,
  media_mime: null,
  payload: null,
  send_attempts: 1,
  ...p,
});
const sign = (bucket: string, path: string) => Promise.resolve(`https://storage/${bucket}/${path}?token=x`);

Deno.test("ventana de 24 h", () => {
  assert(isWindowOpen("2026-11-20T12:00:01Z", now));
  assertFalse(isWindowOpen("2026-11-20T12:00:00Z", now));
  assertFalse(isWindowOpen("2026-11-19T09:00:00Z", now));
  assertFalse(isWindowOpen(null, now));
  assert(requiresOpenWindow("text"));
  assert(requiresOpenWindow("interactive"));
  assertFalse(requiresOpenWindow("template"));
});

Deno.test("fila → mensaje de Graph", async () => {
  assertEquals(await toGraphMessage(row({ body: "Hola" }), sign), { type: "text", text: { body: "Hola", preview_url: false } });
  assertEquals(
    await toGraphMessage(row({ type: "image", body: "Torta", media_path: "o1/c1/x.jpg" }), sign),
    { type: "image", image: { link: "https://storage/media/o1/c1/x.jpg?token=x", caption: "Torta" } },
  );
  assertEquals(
    await toGraphMessage(row({ type: "image", payload: { link: "https://cdn/x.jpg" } }), sign),
    { type: "image", image: { link: "https://cdn/x.jpg" } },
  );
  assertEquals(
    await toGraphMessage(row({ type: "document", payload: { media_id: "M1", filename: "menu.pdf" } }), sign),
    { type: "document", document: { id: "M1", filename: "menu.pdf" } },
  );
  const btn = await toGraphMessage(row({ type: "interactive", body: "¿Confirmas?", payload: { interactive: { kind: "buttons", buttons: [{ id: "si", title: "Sí" }] } } }), sign);
  assertEquals((btn.interactive as { type: string }).type, "button");
  const list = await toGraphMessage(row({ type: "interactive", body: "Elige", payload: { interactive: { kind: "list", sections: [{ rows: [{ id: "a", title: "A" }] }] } } }), sign);
  assertEquals((list.interactive as { action: { button: string } }).action.button, "Ver opciones");
  assertEquals(
    await toGraphMessage(row({ type: "reaction", payload: { message_wamid: "wamid.IN", emoji: "👍" } }), sign),
    { type: "reaction", reaction: { message_id: "wamid.IN", emoji: "👍" } },
  );
  assertEquals(
    (await toGraphMessage(row({ type: "template", payload: { template: { name: "pago_confirmado", language: "es" } } }), sign)).template,
    { name: "pago_confirmado", language: { code: "es" } },
  );
});

Deno.test("filas inválidas", async () => {
  await assertRejects(() => toGraphMessage(row({ body: " " }), sign), OutboundError);
  await assertRejects(() => toGraphMessage(row({ type: "image" }), sign), OutboundError);
  await assertRejects(() => toGraphMessage(row({ type: "interactive", body: "x", payload: { interactive: { kind: "buttons", buttons: [] } } }), sign), OutboundError);
  await assertRejects(() => toGraphMessage(row({ type: "sticker" }), sign), OutboundError);
});
