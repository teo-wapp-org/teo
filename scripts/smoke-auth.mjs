// Smoke test autenticado: crea un usuario QA, su comercio y lo hace superadmin; pide páginas protegidas; borra todo.
// Uso: ./scripts/smoke [baseUrl]   (por defecto producción)
import { createRequire } from "node:module";
const require = createRequire(new URL("../web/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

const base = process.argv[2] ?? "http://localhost:3123";
const { SB_URL, SB_PUB, SB_SECRET } = process.env;
const ref = new URL(SB_URL).hostname.split(".")[0];
const admin = createClient(SB_URL, SB_SECRET, { auth: { persistSession: false } });
const email = `qa+smoke-${Date.now()}@teo.test`;
const password = `Qa-${crypto.randomUUID()}`;

let userId;
let failed = false;
try {
  const { data: created, error: e1 } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "QA Smoke" } });
  if (e1) throw e1;
  userId = created.user.id;

  const client = createClient(SB_URL, SB_PUB, { auth: { persistSession: false } });
  const { data: sess, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const { data: org, error: e3 } = await client.rpc("create_organization", { p_name: "QA Smoke Store", p_rubro: "Otro" });
  if (e3) throw e3;
  const { error: e4 } = await admin.from("platform_admins").insert({ user_id: userId, role: "superadmin" });
  if (e4) throw e4;

  // Cookie de @supabase/ssr: "base64-" + base64url(JSON), en trozos de 3180 chars
  const raw = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  const chunks = raw.match(/.{1,3180}/g);
  const cookie = chunks.length === 1 ? `${name}=${raw}` : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");

  for (const path of ["/app", `/app/${org.slug}`, `/app/${org.slug}/casos`, `/app/${org.slug}/catalogo`, "/admin", "/admin/auditoria", "/onboarding"]) {
    const res = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
    const body = res.status === 200 ? await res.text() : "";
    const ok = res.status === 200 || (path === "/app" && res.status === 307);
    const marker = body.includes("QA Smoke Store") ? "· muestra el comercio" : "";
    console.log(`${ok ? "OK  " : "FAIL"} ${res.status} ${path} ${res.headers.get("location") ?? ""} ${marker}`);
    if (!ok) failed = true;
  }
} catch (e) {
  failed = true;
  console.error("ERROR", e.message ?? e);
} finally {
  if (userId) {
    await admin.from("organizations").delete().eq("created_by", userId);
    await admin.auth.admin.deleteUser(userId);
    console.log("limpieza: usuario y comercio QA eliminados");
  }
  process.exit(failed ? 1 : 0);
}
