// Verificación manual del cron desplegado (no es un test): encola un mensaje QA y espera a que
// pg_cron → agent-runner lo responda. Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno run -A cron_check.ts
import { createQaOrg, deleteOrg, inbound, testDb } from "../_shared/agent/testing.ts";

const db = testDb();
if (!db) throw new Error("faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const org = await createQaOrg(db);
try {
  const { conversationId } = await inbound(db, org.id, "hola, ¿a qué hora abren?", "593990000888");
  await db.rpc("enqueue_inbound", { p_org: org.id, p_conversation: conversationId, p_delay: 0 });
  const t0 = Date.now();
  let body: string | null = null;
  while (Date.now() - t0 < 60_000 && !body) {
    const { data } = await db.from("messages").select("body").eq("conversation_id", conversationId).eq("direction", "out").limit(1);
    body = data?.[0]?.body ?? null;
    if (!body) await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(body ? `OK en ${Math.round((Date.now() - t0) / 1000)} s: ${body}` : "SIN RESPUESTA en 60 s");
} finally {
  await deleteOrg(db, org.id);
}
