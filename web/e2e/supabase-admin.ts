import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

export const QA_DOMAIN = "teo.test";
export const QA_PREFIX = "qa+e2e-";

export function adminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usa ../scripts/e2e)");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Id de esta corrida (lo fija playwright.config.ts). Va en el email de cada usuario QA para que el teardown
 * solo borre los de esta corrida: varias corridas (agentes/worktrees) comparten teo-dev en paralelo.
 */
export const RUN_ID = process.env.E2E_RUN_ID ?? "local";
const STALE_MS = 2 * 60 * 60 * 1000; // usuarios QA huérfanos de corridas viejas

export const qaEmail = (tag: string) => `${QA_PREFIX}${RUN_ID}-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@${QA_DOMAIN}`;

export type QaUser = { id: string; email: string; password: string; orgId?: string; orgSlug?: string };

/** Crea un usuario confirmado; opcionalmente con comercio propio y/o rol de plataforma. */
export async function createQaUser(opts: { tag: string; withOrg?: string; platformRole?: "superadmin" | "soporte" }): Promise<QaUser> {
  const admin = adminClient();
  const email = qaEmail(opts.tag);
  const password = `Qa-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `QA ${opts.tag}` } });
  if (error) throw error;
  const user: QaUser = { id: data.user.id, email, password };

  if (opts.withOrg) {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { error: e1 } = await anon.auth.signInWithPassword({ email, password });
    if (e1) throw e1;
    const { data: org, error: e2 } = await anon.rpc("create_organization", { p_name: opts.withOrg, p_rubro: "Otro" });
    if (e2) throw e2;
    user.orgId = org.id;
    user.orgSlug = org.slug;
  }
  if (opts.platformRole) {
    const { error: e3 } = await admin.from("platform_admins").insert({ user_id: user.id, role: opts.platformRole });
    if (e3) throw e3;
  }
  return user;
}

/** Agrega un usuario existente a un comercio con el rol dado (vía service role, solo para preparar tests). */
export async function addQaMember(orgId: string, userId: string, role: "owner" | "admin" | "operador") {
  const { error } = await adminClient().from("memberships").insert({ org_id: orgId, user_id: userId, role });
  if (error) throw error;
}

/** Borra los usuarios QA de esta corrida (y los huérfanos de más de 2 horas) con los comercios que crearon. */
export async function cleanupQa() {
  const admin = adminClient();
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const now = Date.now();
    const qa = data.users.filter(
      (u) =>
        u.email?.startsWith(QA_PREFIX) &&
        u.email.endsWith(`@${QA_DOMAIN}`) &&
        (u.email.startsWith(`${QA_PREFIX}${RUN_ID}-`) || now - new Date(u.created_at).getTime() > STALE_MS),
    );
    for (const u of qa) {
      await admin.from("organizations").delete().eq("created_by", u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
    if (data.users.length < 200) break;
  }
}
