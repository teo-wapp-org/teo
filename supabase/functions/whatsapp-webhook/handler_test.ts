import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest, type IngestResult, processPayload, type WebhookDeps } from "./handler.ts";
import { imageMessage, statusUpdate, textMessage, webhookPayload } from "../_shared/whatsapp/fixtures.ts";
import { signBody } from "../_shared/whatsapp/signature.ts";

const SECRET = "app-secret-test";
const ORG = "00000000-0000-0000-0000-00000000000a";

/** Base de datos en memoria con la misma semántica que las funciones SQL (idempotencia por wamid). */
function fakeDeps(overrides: Partial<WebhookDeps> = {}) {
  const messages = new Map<string, { id: string; conversation: string; type: string; body: string | null; media?: string | null; error?: string | null }>();
  const conversations = new Map<string, string>(); // wa_id → conversation id
  const enqueued: string[] = [];
  const statuses: string[] = [];
  const uploads: string[] = [];
  const pending: Promise<unknown>[] = [];
  const logs: string[] = [];
  const deps: WebhookDeps = {
    appSecret: SECRET,
    verifyToken: "verify-me",
    resolveAccount: (id) => Promise.resolve(id === "111" ? { account_id: "acc-1", org_id: ORG } : null),
    ingest(a) {
      const existing = messages.get(a.wamid);
      if (!conversations.has(a.waId)) conversations.set(a.waId, `conv-${a.waId}`);
      const conv = conversations.get(a.waId)!;
      if (existing) return Promise.resolve({ message_id: existing.id, conversation_id: conv, case_id: "case", org_id: ORG, inserted: false } satisfies IngestResult);
      const id = `msg-${messages.size + 1}`;
      messages.set(a.wamid, { id, conversation: conv, type: a.type, body: a.body });
      return Promise.resolve({ message_id: id, conversation_id: conv, case_id: "case", org_id: ORG, inserted: true });
    },
    getToken: () => Promise.resolve("TOKEN"),
    fetchMedia: (_t, mediaId) => mediaId === "roto" ? Promise.reject(new Error("404")) : Promise.resolve({ bytes: new Uint8Array([1]), mime: "image/jpeg" }),
    uploadMedia: (path) => {
      uploads.push(path);
      return Promise.resolve();
    },
    setMedia: (messageId, u) => {
      for (const m of messages.values()) if (m.id === messageId) Object.assign(m, { media: u.path, error: u.error });
      return Promise.resolve();
    },
    enqueue: (_org, conv) => {
      enqueued.push(conv);
      return Promise.resolve();
    },
    applyStatus: (wamid, status) => {
      statuses.push(`${wamid}:${status}`);
      return Promise.resolve(true);
    },
    waitUntil: (p) => void pending.push(p),
    log: (_l, event) => void logs.push(event),
    ...overrides,
  };
  return { deps, messages, enqueued, statuses, uploads, pending, logs };
}

async function post(deps: WebhookDeps, body: string, signature?: string | null) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signature !== null) headers.set("X-Hub-Signature-256", signature ?? (await signBody(SECRET, body)));
  return handleRequest(new Request("https://x/functions/v1/whatsapp-webhook", { method: "POST", body, headers }), deps);
}

Deno.test("GET: verificación del challenge", async () => {
  const { deps } = fakeDeps();
  const ok = await handleRequest(new Request("https://x/?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"), deps);
  assertEquals([ok.status, await ok.text()], [200, "12345"]);
  const bad = await handleRequest(new Request("https://x/?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=12345"), deps);
  assertEquals(bad.status, 403);
});

Deno.test("secretos de la config de la plataforma: tienen prioridad sobre los valores fijos", async () => {
  const delays: number[] = [];
  const { deps } = fakeDeps({
    appSecret: "",
    verifyToken: "",
    secrets: () => Promise.resolve({ appSecret: "secreto-vault", verifyToken: "token-vault" }),
    debounceSeconds: () => Promise.resolve(9),
    enqueue: (_o, _c, d) => {
      delays.push(d);
      return Promise.resolve();
    },
  });
  const ok = await handleRequest(new Request("https://x/?hub.mode=subscribe&hub.verify_token=token-vault&hub.challenge=7"), deps);
  assertEquals([ok.status, await ok.text()], [200, "7"]);
  const bad = await handleRequest(new Request("https://x/?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=7"), deps);
  assertEquals(bad.status, 403);

  const body = JSON.stringify(webhookPayload({ phoneNumberId: "111", messages: [textMessage("5939", "hola")] }));
  assertEquals((await post(deps, body)).status, 401); // firmado con el secreto viejo
  const res = await handleRequest(
    new Request("https://x/", { method: "POST", body, headers: { "X-Hub-Signature-256": await signBody("secreto-vault", body) } }),
    deps,
  );
  assertEquals(res.status, 200);
  await processPayload(JSON.parse(body), deps);
  assertEquals(delays, [9]); // debounce = ai.debounce_seconds
});

Deno.test("sin secretos configurados: verificación y firma se rechazan", async () => {
  const { deps } = fakeDeps({ secrets: () => Promise.resolve({ appSecret: "", verifyToken: "" }) });
  const res = await handleRequest(new Request("https://x/?hub.mode=subscribe&hub.verify_token=&hub.challenge=7"), deps);
  assertEquals(res.status, 403);
  const body = "{}";
  assertEquals((await post(deps, body)).status, 401);
});

Deno.test("POST: firma inválida o ausente → 401 y no procesa", async () => {
  const { deps, pending } = fakeDeps();
  const body = JSON.stringify(webhookPayload({ phoneNumberId: "111", messages: [textMessage("5939", "hola")] }));
  assertEquals((await post(deps, body, "sha256=00")).status, 401);
  assertEquals((await post(deps, body, null)).status, 401);
  assertEquals((await post(deps, body, await signBody("otro-secreto", body))).status, 401);
  assertEquals(pending.length, 0);
});

Deno.test("POST: firma válida → 200 inmediato y procesa en segundo plano", async () => {
  const { deps, pending, messages } = fakeDeps();
  const body = JSON.stringify(webhookPayload({ phoneNumberId: "111", messages: [textMessage("5939", "hola")] }));
  const res = await post(deps, body);
  assertEquals(res.status, 200);
  assertEquals(pending.length, 1);
  await Promise.all(pending);
  assertEquals(messages.size, 1);
});

Deno.test("varios mensajes + statuses en un payload: todos se procesan, una sola entrada en cola por conversación", async () => {
  const { deps, messages, enqueued, statuses } = fakeDeps();
  const payload = webhookPayload({
    phoneNumberId: "111",
    contacts: [{ waId: "593990000001", name: "Ana" }, { waId: "593990000002", name: "Luis" }],
    messages: [textMessage("593990000001", "hola"), textMessage("593990000001", "¿tienen tortas?"), textMessage("593990000002", "buenas")],
    statuses: [statusUpdate("wamid.OUT1", "delivered", "593990000001"), statusUpdate("wamid.OUT1", "read", "593990000001")],
  });
  const sum = await processPayload(payload, deps);
  assertEquals(sum, { inserted: 3, duplicates: 0, unknown: 0, statuses: 2, enqueued: 2, errors: 0 });
  assertEquals(messages.size, 3);
  assertEquals(enqueued.sort(), ["conv-593990000001", "conv-593990000002"]);
  assertEquals(statuses, ["wamid.OUT1:delivered", "wamid.OUT1:read"]);
});

Deno.test("idempotencia: el mismo wamid dos veces se guarda y encola una sola vez", async () => {
  const { deps, messages, enqueued } = fakeDeps();
  const msg = textMessage("593990000001", "hola", "wamid.REPETIDO");
  const payload = webhookPayload({ phoneNumberId: "111", messages: [msg] });
  const s1 = await processPayload(payload, deps);
  const s2 = await processPayload(payload, deps);
  assertEquals([s1.inserted, s2.inserted, s2.duplicates], [1, 0, 1]);
  assertEquals(messages.size, 1);
  assertEquals(enqueued.length, 1);
});

Deno.test("comercio desconocido: se registra y no se guarda nada", async () => {
  const { deps, messages, enqueued, statuses, logs } = fakeDeps();
  const sum = await processPayload(
    webhookPayload({ phoneNumberId: "999", messages: [textMessage("5939", "hola")], statuses: [statusUpdate("wamid.Z", "read", "5939")] }),
    deps,
  );
  assertEquals([sum.unknown, messages.size, enqueued.length, statuses.length], [2, 0, 0, 0]);
  assertEquals(logs.includes("wa_numero_desconocido"), true);
});

Deno.test("media: se descarga con el token del comercio y se sube a media/{org}/{conv}/{wamid}.{ext}", async () => {
  const { deps, uploads, messages } = fakeDeps();
  await processPayload(webhookPayload({ phoneNumberId: "111", messages: [imageMessage("593990000001", "MEDIA1", "mira", "wamid.IMG1")] }), deps);
  assertEquals(uploads, [`${ORG}/conv-593990000001/wamid.IMG1.jpg`]);
  const m = messages.get("wamid.IMG1")!;
  assertEquals([m.type, m.body, m.media], ["image", "mira", uploads[0]]);
});

Deno.test("media que falla: el mensaje queda guardado, marcado y encolado igual", async () => {
  const { deps, messages, enqueued } = fakeDeps();
  const sum = await processPayload(webhookPayload({ phoneNumberId: "111", messages: [imageMessage("593990000001", "roto", undefined, "wamid.IMG2")] }), deps);
  assertEquals(sum.errors, 0);
  assertEquals(messages.get("wamid.IMG2")!.error, "media_no_descargada");
  assertEquals(enqueued.length, 1);
});

Deno.test("un error en un mensaje no detiene al resto", async () => {
  let n = 0;
  const { deps, messages } = fakeDeps();
  const ingest = deps.ingest;
  deps.ingest = (a) => (++n === 1 ? Promise.reject(new Error("db caída")) : ingest(a));
  const sum = await processPayload(webhookPayload({ phoneNumberId: "111", messages: [textMessage("5939", "a"), textMessage("5939", "b")] }), deps);
  assertEquals([sum.errors, sum.inserted, messages.size], [1, 1, 1]);
});

Deno.test("JSON inválido con firma válida → 400", async () => {
  const { deps } = fakeDeps();
  assertEquals((await post(deps, "{no-json")).status, 400);
});
