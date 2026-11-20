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

/** Id de esta corrida (lo fija playwright.config.ts y lo heredan los workers). */
const RUN_ID = () => process.env.E2E_RUN_ID ?? "local";
/** Usuarios QA de otras corridas con más de esta antigüedad se consideran huérfanos. */
const STALE_MS = 2 * 60 * 60 * 1000;

export const qaEmail = (tag: string) => `${QA_PREFIX}${tag}-r${RUN_ID()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@${QA_DOMAIN}`;

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

/**
 * Borra los usuarios QA de ESTA corrida (y los huérfanos de más de 2 h) junto con sus comercios.
 * Varias corridas (agentes/worktrees) comparten teo-dev: no se borran los usuarios de otra corrida en curso.
 */
export async function cleanupQa() {
  const admin = adminClient();
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const mine = `-r${RUN_ID()}-`;
    const qa = data.users.filter(
      (u) =>
        u.email?.startsWith(QA_PREFIX) &&
        u.email.endsWith(`@${QA_DOMAIN}`) &&
        (u.email.includes(mine) || Date.now() - new Date(u.created_at).getTime() > STALE_MS),
    );
    for (const u of qa) {
      await cleanupOrgMedia(u.id);
      await admin.from("organizations").delete().eq("created_by", u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
    if (data.users.length < 200) break;
  }
}

/** Agrega un usuario existente a un comercio con el rol dado (vía service role, solo para preparar tests). */
export async function addQaMember(orgId: string, userId: string, role: "owner" | "admin" | "operador") {
  const { error } = await adminClient().from("memberships").insert({ org_id: orgId, user_id: userId, role });
  if (error) throw error;
}

/** Borra los comprobantes sembrados (bucket privado `media`) de los comercios de un usuario QA. */
async function cleanupOrgMedia(userId: string) {
  const admin = adminClient();
  const { data: orgs } = await admin.from("organizations").select("id").eq("created_by", userId);
  for (const o of orgs ?? []) {
    const { data: files } = await admin.storage.from("media").list(`${o.id}/comprobantes`);
    if (files?.length) await admin.storage.from("media").remove(files.map((f) => `${o.id}/comprobantes/${f.name}`));
  }
}

// ─────────────────────────────────────────────────────────────
// Seed del panel operativo (Fase 4): contactos, conversaciones de simulador, casos en varios
// estados, mensajes, pedido con ítems y un pago pendiente con comprobante.
// ─────────────────────────────────────────────────────────────
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

export type SeededCase = { id: string; number: number; conversationId: string; contactId: string };
export type OperacionSeed = {
  nuevo: SeededCase;
  conversacion: SeededCase;
  esperando: SeededCase;
  porConfirmar: SeededCase;
  atencion: SeededCase;
  cerrado: SeededCase;
  paymentId: string;
};

export async function seedOperacion(orgId: string): Promise<OperacionSeed> {
  const admin = adminClient();
  const now = Date.now();
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const suffix = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");

  async function contactWithConversation(name: string, idx: number, tags: string[] = []) {
    const { data: contact, error } = await admin
      .from("contacts")
      .insert({ org_id: orgId, wa_id: `59399${idx}${suffix}`, name, profile_name: name, tags, last_message_at: ago(5) })
      .select("id")
      .single();
    if (error) throw error;
    const { data: conv, error: e2 } = await admin
      .from("conversations")
      .insert({ org_id: orgId, contact_id: contact.id, channel: "simulador", handled_by: "teo", last_inbound_at: ago(5), last_message_at: ago(5) })
      .select("id")
      .single();
    if (e2) throw e2;
    return { contactId: contact.id, conversationId: conv.id };
  }

  type CaseStatus = Database["public"]["Enums"]["case_status"];
  type CaseType = Database["public"]["Enums"]["case_type"];

  async function caseFor(
    cc: { contactId: string; conversationId: string },
    p: { status: CaseStatus; type?: CaseType; amount?: number; previous?: CaseStatus; minutesAgo: number; closed?: boolean },
    msgs: [author: string, body: string][],
  ): Promise<SeededCase> {
    const { data, error } = await admin
      .from("cases")
      .insert({
        org_id: orgId,
        contact_id: cc.contactId,
        conversation_id: cc.conversationId,
        status: p.status,
        type: p.type ?? "venta",
        estimated_amount: p.amount ?? null,
        previous_status: p.previous ?? null,
        opened_at: ago(p.minutesAgo + 30),
        status_changed_at: ago(p.minutesAgo),
        closed_at: p.closed ? ago(p.minutesAgo) : null,
      })
      .select("id, number")
      .single();
    if (error) throw error;
    const rows = msgs.map(([author, body], i) => ({
      org_id: orgId,
      conversation_id: cc.conversationId,
      case_id: data.id,
      direction: (author === "cliente" ? "in" : "out") as "in" | "out",
      author,
      type: "text",
      body,
      status: (author === "cliente" ? "received" : "sent") as "received" | "sent",
      created_at: ago(p.minutesAgo + msgs.length - i),
    }));
    if (rows.length) {
      const { error: e2 } = await admin.from("messages").insert(rows);
      if (e2) throw e2;
    }
    return { id: data.id, number: data.number, ...cc };
  }

  async function orderFor(c: SeededCase, items: [string, number, number][], status: Database["public"]["Enums"]["order_status"] = "borrador") {
    const subtotal = items.reduce((a, [, q, p]) => a + q * p, 0);
    const { data: order, error } = await admin
      .from("orders")
      .insert({ org_id: orgId, case_id: c.id, contact_id: c.contactId, status, subtotal, shipping: 0, total: subtotal, delivery: { modo: "envio", direccion: "Av. 9 de Octubre 100, Guayaquil" } })
      .select("id")
      .single();
    if (error) throw error;
    const { error: e2 } = await admin.from("order_items").insert(items.map(([name, quantity, unit_price]) => ({ org_id: orgId, order_id: order.id, name, quantity, unit_price })));
    if (e2) throw e2;
    return order.id as string;
  }

  const lucia = await contactWithConversation("Lucía Pérez", 1, ["frecuente"]);
  const pedro = await contactWithConversation("Pedro Gómez", 2);
  const maria = await contactWithConversation("María Torres", 3, ["mayorista"]);
  const carlos = await contactWithConversation("Carlos Ruiz", 4);
  const ana = await contactWithConversation("Ana León", 5);

  // El caso cerrado de Lucía va primero (#1): un contacto solo puede tener un caso abierto.
  const cerrado = await caseFor(lucia, { status: "cerrado_ganado", amount: 20, minutesAgo: 2000, closed: true }, [["cliente", "Gracias, todo llegó bien"]]);
  const closedOrder = await orderFor(cerrado, [["Bolso", 1, 20]], "pagado");
  const { error: ec } = await admin
    .from("payments")
    .insert({ org_id: orgId, order_id: closedOrder, declared_amount: 20, status: "confirmado", reviewed_at: ago(1990), created_at: ago(2000) });
  if (ec) throw ec;

  const nuevo = await caseFor(lucia, { status: "nuevo", type: "consulta", minutesAgo: 10 }, [["cliente", "Hola, ¿a qué hora abren?"]]);
  const conversacion = await caseFor(pedro, { status: "en_conversacion", amount: 15, minutesAgo: 20 }, [
    ["cliente", "¿Tienen camisetas talla M?"],
    ["teo", "¡Sí! Tenemos en azul y negro a $15."],
  ]);
  const esperando = await caseFor(maria, { status: "esperando_pago", amount: 42.5, minutesAgo: 30 }, [
    ["cliente", "Quiero 2 gorras y 1 camiseta"],
    ["teo", "Listo, el total es $42,50. Te paso los datos de pago."],
  ]);
  await orderFor(esperando, [["Gorra clásica", 2, 13.75], ["Camiseta básica", 1, 15]]);
  const porConfirmar = await caseFor(carlos, { status: "pago_por_confirmar", amount: 30, minutesAgo: 40 }, [
    ["cliente", "Ya transferí, aquí el comprobante"],
    ["teo", "Recibido, lo estamos verificando."],
  ]);
  const orderId = await orderFor(porConfirmar, [["Zapatos deportivos", 1, 30]], "confirmado");
  const receiptPath = `${orgId}/comprobantes/${porConfirmar.id}.png`;
  const up = await admin.storage.from("media").upload(receiptPath, PNG_1PX, { contentType: "image/png", upsert: true });
  if (up.error) throw up.error;
  const { data: pay, error: ep } = await admin
    .from("payments")
    .insert({
      org_id: orgId,
      order_id: orderId,
      declared_amount: 30,
      receipt_path: receiptPath,
      ai_extraction: { monto: 30, banco: "Banco Pichincha", referencia: "REF-123", fecha: "2026-11-20", confianza: 0.92 },
    })
    .select("id")
    .single();
  if (ep) throw ep;
  const atencion = await caseFor(ana, { status: "requiere_atencion", previous: "en_conversacion", type: "reclamo", minutesAgo: 50 }, [
    ["cliente", "Quiero hablar con una persona, mi pedido llegó mal"],
  ]);

  return { nuevo, conversacion, esperando, porConfirmar, atencion, cerrado, paymentId: pay.id };
}
