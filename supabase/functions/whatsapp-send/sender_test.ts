import { assertEquals } from "jsr:@std/assert@1";
import { handleSendRequest, processOutbound, type SendDeps, type SendTarget } from "./sender.ts";
import type { OutboundRow } from "../_shared/whatsapp/outbound.ts";

const NOW = new Date("2026-11-21T12:00:00Z");
const row = (p: Partial<OutboundRow> = {}): OutboundRow => ({
  id: crypto.randomUUID(),
  org_id: "o1",
  conversation_id: "c1",
  type: "text",
  body: "¡Hola! Sí tenemos tortas 🎂",
  media_path: null,
  media_mime: null,
  payload: null,
  send_attempts: 1,
  ...p,
});

function fakeDeps(opts: { target?: Partial<SendTarget>; graph?: { status: number; body: unknown }[]; rows?: OutboundRow[] } = {}) {
  const state = { sent: new Map<string, string>(), failed: new Map<string, string>(), released: [] as string[], graphCalls: [] as unknown[] };
  const graph = [...(opts.graph ?? [{ status: 200, body: { messages: [{ id: "wamid.OUT" }] } }])];
  const deps: SendDeps = {
    sendSecret: "send-secret",
    claim: () => Promise.resolve(opts.rows ?? []),
    loadTarget: () =>
      Promise.resolve({
        channel: "whatsapp",
        last_inbound_at: "2026-11-21T10:00:00Z",
        wa_id: "593990000001",
        account: { id: "acc", phone_number_id: "111", status: "conectado" },
        ...opts.target,
      }),
    getToken: () => Promise.resolve("TOKEN"),
    signUrl: (b, p) => Promise.resolve(`https://s/${b}/${p}`),
    markSent: (id, wamid) => {
      state.sent.set(id, wamid);
      return Promise.resolve();
    },
    markFailed: (id, e) => {
      state.failed.set(id, e);
      return Promise.resolve();
    },
    release: (id) => {
      state.released.push(id);
      return Promise.resolve();
    },
    fetch: ((_u: string, init: RequestInit) => {
      state.graphCalls.push(JSON.parse(String(init.body)));
      const r = graph.shift() ?? { status: 200, body: { messages: [{ id: "wamid.OUT" }] } };
      return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }));
    }) as unknown as typeof fetch,
    now: () => NOW,
    waitUntil: () => {},
    log: () => {},
  };
  return { deps, state };
}

Deno.test("dentro de la ventana: envía y guarda el wamid", async () => {
  const { deps, state } = fakeDeps();
  const r = row();
  assertEquals(await processOutbound([r], deps), { sent: 1, failed: 0, retry: 0 });
  assertEquals(state.sent.get(r.id), "wamid.OUT");
  assertEquals((state.graphCalls[0] as { to: string }).to, "593990000001");
});

Deno.test("ventana cerrada: no envía texto libre y marca failed 'ventana_cerrada'", async () => {
  const { deps, state } = fakeDeps({ target: { last_inbound_at: "2026-11-20T11:59:59Z" } });
  const r = row();
  assertEquals(await processOutbound([r], deps), { sent: 0, failed: 1, retry: 0 });
  assertEquals(state.failed.get(r.id), "ventana_cerrada");
  assertEquals(state.graphCalls.length, 0);
});

Deno.test("ventana cerrada: una plantilla sí sale", async () => {
  const { deps, state } = fakeDeps({ target: { last_inbound_at: null } });
  const r = row({ type: "template", body: null, payload: { template: { name: "pago_confirmado", language: "es" } } });
  await processOutbound([r], deps);
  assertEquals(state.sent.has(r.id), true);
});

Deno.test("Meta responde 131047: failed 'ventana_cerrada'", async () => {
  const { deps, state } = fakeDeps({ graph: [{ status: 400, body: { error: { code: 131047, message: "Re-engagement message" } } }] });
  const r = row();
  await processOutbound([r], deps);
  assertEquals(state.failed.get(r.id), "ventana_cerrada");
});

Deno.test("error transitorio: se libera para reintento; agotado: failed", async () => {
  const { deps, state } = fakeDeps({ graph: [{ status: 503, body: {} }, { status: 503, body: {} }] });
  const a = row({ send_attempts: 1 });
  const b = row({ send_attempts: 5 });
  assertEquals(await processOutbound([a, b], deps), { sent: 0, failed: 1, retry: 1 });
  assertEquals(state.released, [a.id]);
  assertEquals(state.failed.get(b.id)?.startsWith("graph"), true);
});

Deno.test("número no conectado o mensaje inválido: failed sin llamar a Graph", async () => {
  const { deps, state } = fakeDeps({ target: { account: { id: "acc", phone_number_id: "111", status: "pendiente" } } });
  const r = row();
  await processOutbound([r], deps);
  assertEquals(state.failed.get(r.id), "whatsapp_no_conectado");

  const ok = fakeDeps();
  const bad = row({ type: "interactive", payload: { interactive: { kind: "buttons", buttons: [1, 2, 3, 4].map((i) => ({ id: `${i}`, title: `${i}` })) } } });
  await processOutbound([bad], ok.deps);
  assertEquals(ok.state.failed.get(bad.id)?.startsWith("mensaje_invalido"), true);
  assertEquals(ok.state.graphCalls.length, 0);
});

Deno.test("HTTP: secreto obligatorio y validación del body", async () => {
  const { deps } = fakeDeps({ rows: [row()] });
  const req = (body: unknown, secret?: string) =>
    new Request("https://x", { method: "POST", body: JSON.stringify(body), headers: secret ? { "x-teo-send-secret": secret } : {} });
  assertEquals((await handleSendRequest(req({ sweep: true }), deps)).status, 401);
  assertEquals((await handleSendRequest(req({ sweep: true }, "malo"), deps)).status, 401);
  assertEquals((await handleSendRequest(req({}, "send-secret"), deps)).status, 400);
  assertEquals((await handleSendRequest(req({ message_id: "x;drop" }, "send-secret"), deps)).status, 400);
  const res = await handleSendRequest(req({ sweep: true, wait: true }, "send-secret"), deps);
  assertEquals([res.status, await res.json()], [200, { claimed: 1, sent: 1, failed: 0, retry: 0 }]);
  assertEquals((await handleSendRequest(req({ message_id: crypto.randomUUID() }, "send-secret"), deps)).status, 202);
});
