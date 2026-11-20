import { assert, assertEquals } from "@std/assert";
import { createQaOrg, dbTest, deleteOrg, deps, inbound } from "../_shared/agent/testing.ts";
import { FakeProvider } from "../_shared/llm/fake.ts";
import { createRunnerApp, processQueue } from "./app.ts";

Deno.test("runner: rechaza sin el secreto del cron", async () => {
  const app = createRunnerApp({ agent: { db: {} as never, llm: new FakeProvider(), now: () => new Date() }, secret: "s3cr3t" });
  const r1 = await app.request("/agent-runner", { method: "POST" });
  assertEquals(r1.status, 401);
  const r2 = await app.request("/agent-runner", { method: "POST", headers: { "x-teo-cron-secret": "otro" } });
  assertEquals(r2.status, 401);
  const noSecret = createRunnerApp({ agent: { db: {} as never, llm: new FakeProvider(), now: () => new Date() }, secret: undefined });
  assertEquals((await noSecret.request("/agent-runner", { method: "POST", headers: { "x-teo-cron-secret": "" } })).status, 401);
});

dbTest("lease por conversación: claim exclusivo hasta release", async (db) => {
  const org = await createQaOrg(db);
  try {
    const { conversationId } = await inbound(db, org.id, "hola");
    assertEquals((await db.rpc("claim_conversation", { p_conversation: conversationId, p_seconds: 60 })).data, true);
    assertEquals((await db.rpc("claim_conversation", { p_conversation: conversationId, p_seconds: 60 })).data, false);
    await db.rpc("release_conversation", { p_conversation: conversationId });
    assertEquals((await db.rpc("claim_conversation", { p_conversation: conversationId, p_seconds: 60 })).data, true);
    await db.rpc("release_conversation", { p_conversation: conversationId });
  } finally {
    await deleteOrg(db, org.id);
  }
});

dbTest("cola inbound → runner → respuesta de Teo (worker local o cron desplegado)", async (db) => {
  const org = await createQaOrg(db);
  try {
    const { conversationId } = await inbound(db, org.id, "hola", "593990000777");
    const { error } = await db.rpc("enqueue_inbound", { p_org: org.id, p_conversation: conversationId, p_delay: 0 });
    assertEquals(error, null);
    await processQueue(deps(db), 20_000); // puede que el cron (cada 10 s) lo tome antes: ambos sirven
    let out = 0;
    for (let i = 0; i < 20 && !out; i++) {
      const { count } = await db.from("messages").select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId).eq("direction", "out");
      out = count ?? 0;
      if (!out) await new Promise((r) => setTimeout(r, 2000));
    }
    assert(out >= 1, "Teo debió responder");
  } finally {
    await deleteOrg(db, org.id);
  }
});
