import { assertEquals } from "jsr:@std/assert@1";
import { extensionFor, mapMessage, mediaPath, parseWebhook } from "./parse.ts";
import type { WaMessage } from "./types.ts";

const base = { from: "593991112233", id: "wamid.X", timestamp: "1763600000" };

Deno.test("mapeo de tipos de mensaje", () => {
  const cases: [WaMessage, string, string | null, boolean][] = [
    [{ ...base, type: "text", text: { body: "Hola" } }, "text", "Hola", false],
    [{ ...base, type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "foto" } }, "image", "foto", true],
    [{ ...base, type: "document", document: { id: "m2", mime_type: "application/pdf", filename: "f.pdf" } }, "document", null, true],
    [{ ...base, type: "audio", audio: { id: "m3", mime_type: "audio/ogg; codecs=opus", voice: true } }, "audio", null, true],
    [{ ...base, type: "location", location: { latitude: -2.17, longitude: -79.9, name: "Malecón", address: "Guayaquil" } }, "location", "Malecón, Guayaquil (-2.17, -79.9)", false],
    [{ ...base, type: "location", location: { latitude: 1, longitude: 2 } }, "location", "1, 2", false],
    [{ ...base, type: "interactive", interactive: { type: "button_reply", button_reply: { id: "si", title: "Sí, confirmo" } } }, "interactive", "Sí, confirmo", false],
    [{ ...base, type: "interactive", interactive: { type: "list_reply", list_reply: { id: "v-1", title: "Talla M" } } }, "interactive", "Talla M", false],
    [{ ...base, type: "button", button: { payload: "OK", text: "Confirmar" } }, "interactive", "Confirmar", false],
    [{ ...base, type: "reaction", reaction: { message_id: "wamid.Y", emoji: "👍" } }, "reaction", "👍", false],
    [{ ...base, type: "ephemeral" }, "unsupported", null, false],
  ];
  for (const [msg, type, body, hasMedia] of cases) {
    const r = mapMessage(msg);
    assertEquals(r.type, type, msg.type);
    assertEquals(r.body, body, msg.type);
    assertEquals(Boolean(r.media), hasMedia, msg.type);
  }
});

Deno.test("procesa todos los entry/changes, mensajes y statuses", () => {
  const parsed = parseWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "W1",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "111" },
              contacts: [{ wa_id: "593990000001", profile: { name: "Ana" } }, { wa_id: "593990000002", profile: { name: "Luis" } }],
              messages: [
                { from: "593990000001", id: "wamid.A1", timestamp: "1763600000", type: "text", text: { body: "uno" } },
                { from: "593990000002", id: "wamid.B1", timestamp: "1763600001", type: "text", text: { body: "dos" } },
              ],
              statuses: [{ id: "wamid.OUT1", status: "delivered" }],
            },
          },
          { field: "account_update", value: { metadata: { phone_number_id: "111" } } },
        ],
      },
      {
        id: "W2",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "222" },
              messages: [{ from: "593990000003", id: "wamid.C1", type: "text", text: { body: "tres" } }],
              statuses: [
                { id: "wamid.OUT2", status: "failed", errors: [{ code: 131047, title: "Re-engagement message" }] },
                { id: "wamid.OUT3", status: "deleted" },
              ],
            },
          },
        ],
      },
    ],
  });
  assertEquals(parsed.messages.map((m) => [m.phoneNumberId, m.wamid, m.profileName]), [
    ["111", "wamid.A1", "Ana"],
    ["111", "wamid.B1", "Luis"],
    ["222", "wamid.C1", null],
  ]);
  assertEquals(parsed.messages[0].sentAt?.toISOString(), new Date(1763600000 * 1000).toISOString());
  assertEquals(parsed.messages[2].sentAt, null);
  assertEquals(parsed.statuses, [
    { phoneNumberId: "111", wamid: "wamid.OUT1", status: "delivered", error: null },
    { phoneNumberId: "222", wamid: "wamid.OUT2", status: "failed", error: "131047: Re-engagement message" },
  ]);
});

Deno.test("payload vacío o raro no rompe", () => {
  assertEquals(parseWebhook({}), { messages: [], statuses: [] });
  assertEquals(parseWebhook({ entry: [{ changes: [{ value: {} }] }] }), { messages: [], statuses: [] });
});

Deno.test("extensión y ruta de media", () => {
  assertEquals(extensionFor("image/jpeg"), "jpg");
  assertEquals(extensionFor("audio/ogg; codecs=opus"), "ogg");
  assertEquals(extensionFor("application/octet-stream", "lista.CSV"), "csv");
  assertEquals(extensionFor(null), "bin");
  assertEquals(mediaPath("org", "conv", "wamid.HBg+/=x", "jpg"), "org/conv/wamid.HBg___x.jpg");
});
