import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CLOSED_STATUSES, contactDisplayName, type BoardCase, type CaseStatus, type CaseType, type HandledBy } from "@/lib/casos";

/** Cargas de datos del panel operativo. Siempre con la sesión del usuario (RLS) y filtrando por org_id. */

export type Member = { id: string; name: string; avatar_url: string | null; role: string };

export async function getMembers(orgId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data: ms } = await supabase.from("memberships").select("user_id, role").eq("org_id", orgId);
  const ids = (ms ?? []).map((m) => m.user_id as string);
  if (!ids.length) return [];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  return (ms ?? []).map((m) => {
    const p = byId.get(m.user_id as string);
    return { id: m.user_id as string, name: (p?.full_name as string | null)?.trim() || "Miembro del equipo", avatar_url: (p?.avatar_url as string | null) ?? null, role: m.role as string };
  });
}

type ContactLite = { name: string | null; profile_name: string | null; wa_id: string; tags: string[] | null };
type CaseRow = {
  id: string;
  number: number;
  status: CaseStatus;
  type: CaseType;
  estimated_amount: number | null;
  status_changed_at: string;
  assignee_id: string | null;
  contact: ContactLite | null;
  conversation: { handled_by: HandledBy } | null;
  messages: { body: string | null; type: string; created_at: string }[] | null;
};

const CASE_CARD_SELECT =
  "id, number, status, type, estimated_amount, status_changed_at, assignee_id, " +
  "contact:contacts!cases_contact_id_org_id_fkey(name, profile_name, wa_id, tags), " +
  "conversation:conversations!cases_conversation_id_org_id_fkey(handled_by), " +
  "messages!messages_case_id_org_id_fkey(body, type, created_at)";

export function messagePreview(m: { body: string | null; type: string } | undefined | null): string | null {
  if (!m) return null;
  if (m.body) return m.body;
  const t: Record<string, string> = { image: "Imagen", document: "Documento", audio: "Audio", location: "Ubicación", template: "Plantilla" };
  return t[m.type] ?? "Mensaje";
}

function toBoardCase(r: CaseRow): BoardCase {
  const last = r.messages?.[0];
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    type: r.type,
    estimated_amount: r.estimated_amount === null ? null : Number(r.estimated_amount),
    status_changed_at: r.status_changed_at,
    assignee_id: r.assignee_id,
    handled_by: r.conversation?.handled_by ?? "teo",
    contact_name: r.contact ? contactDisplayName(r.contact) : "Sin nombre",
    last_message: messagePreview(last),
    last_message_at: last?.created_at ?? null,
    tags: r.contact?.tags ?? [],
  };
}

/** Casos del tablero: abiertos (y, si se pide, los últimos 100 cerrados), con su último mensaje. */
export async function getBoardCases(orgId: string, opts: { closed?: boolean } = {}): Promise<BoardCase[]> {
  const supabase = await createClient();
  const base = () =>
    supabase
      .from("cases")
      .select(CASE_CARD_SELECT)
      .eq("org_id", orgId)
      .order("created_at", { referencedTable: "messages", ascending: false })
      .limit(1, { referencedTable: "messages" });

  const open = base().not("status", "in", `(${CLOSED_STATUSES.join(",")})`).order("status_changed_at").limit(500);
  const closed = opts.closed
    ? base().in("status", [...CLOSED_STATUSES]).order("closed_at", { ascending: false }).limit(100)
    : null;
  const [a, b] = await Promise.all([open, closed]);
  if (a.error) throw a.error;
  if (b?.error) throw b.error;
  return [...((a.data ?? []) as unknown as CaseRow[]), ...((b?.data ?? []) as unknown as CaseRow[])].map(toBoardCase);
}

export async function countAttention(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("cases").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "requiere_atencion");
  return count ?? 0;
}

/** URLs firmadas (1 h) del bucket privado `media`. Devuelve un mapa ruta → URL. */
export async function signMedia(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!list.length) return {};
  const supabase = await createClient();
  const { data } = await supabase.storage.from("media").createSignedUrls(list, 3600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export type ChatMessage = {
  id: string;
  direction: "in" | "out";
  author: string;
  type: string;
  body: string | null;
  media_path: string | null;
  media_mime: string | null;
  status: "received" | "queued" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  created_at: string;
  media_url?: string | null;
};
export const MESSAGE_SELECT = "id, direction, author, type, body, media_path, media_mime, status, error, created_at";

export type CaseEvent = { id: number; actor: string; from_status: CaseStatus | null; to_status: CaseStatus | null; reason: string | null; created_at: string };
export type Suggestion = { id: string; text: string; state: string; created_at: string };
export type OrderItem = { id: string; name: string; quantity: number; unit_price: number; subtotal: number };
export type Order = {
  id: string;
  status: string;
  subtotal: number;
  shipping: number;
  total: number;
  delivery: { modo?: string; direccion?: string; referencia?: string; fecha?: string } | null;
  notes: string | null;
  items: OrderItem[];
};
export type Payment = {
  id: string;
  order_id: string;
  status: "pendiente" | "confirmado" | "rechazado";
  declared_amount: number | null;
  receipt_path: string | null;
  receipt_url: string | null;
  receipt_mime: string | null;
  ai_extraction: Record<string, unknown> | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
};
export type Contact = {
  id: string;
  wa_id: string;
  name: string | null;
  profile_name: string | null;
  email: string | null;
  address: string | null;
  tags: string[];
  notes: string | null;
  ai_summary: string | null;
};
export type CaseDetail = {
  id: string;
  number: number;
  status: CaseStatus;
  previous_status: CaseStatus | null;
  type: CaseType;
  assignee_id: string | null;
  estimated_amount: number | null;
  summary: string | null;
  opened_at: string;
  status_changed_at: string;
  contact: Contact;
  conversation: { id: string; channel: string; handled_by: HandledBy; last_inbound_at: string | null };
};

export function guessMime(path: string | null, mime?: string | null): string | null {
  if (mime) return mime;
  if (!path) return null;
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext && ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  return null;
}

export async function getCaseDetail(orgId: string, number: number) {
  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from("cases")
    .select(
      "id, number, status, previous_status, type, assignee_id, estimated_amount, summary, opened_at, status_changed_at, " +
        "contact:contacts!cases_contact_id_org_id_fkey(id, wa_id, name, profile_name, email, address, tags, notes, ai_summary), " +
        "conversation:conversations!cases_conversation_id_org_id_fkey(id, channel, handled_by, last_inbound_at)",
    )
    .eq("org_id", orgId)
    .eq("number", number)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;
  const kase = c as unknown as CaseDetail;

  const [msgs, events, sugg, orders, history] = await Promise.all([
    supabase.from("messages").select(MESSAGE_SELECT).eq("org_id", orgId).eq("case_id", kase.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("case_events").select("id, actor, from_status, to_status, reason, created_at").eq("org_id", orgId).eq("case_id", kase.id).order("created_at").limit(200),
    supabase.from("ai_suggestions").select("id, text, state, created_at").eq("org_id", orgId).eq("case_id", kase.id).eq("state", "nueva").order("created_at", { ascending: false }).limit(3),
    supabase
      .from("orders")
      .select("id, status, subtotal, shipping, total, delivery, notes, created_at, items:order_items!order_items_order_id_org_id_fkey(id, name, quantity, unit_price, subtotal)")
      .eq("org_id", orgId)
      .eq("case_id", kase.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("cases")
      .select("id, number, status, type, estimated_amount, opened_at")
      .eq("org_id", orgId)
      .eq("contact_id", kase.contact.id)
      .neq("id", kase.id)
      .order("opened_at", { ascending: false })
      .limit(10),
  ]);

  const orderRows = (orders.data ?? []) as unknown as (Order & { created_at: string })[];
  const order = orderRows.find((o) => o.status !== "cancelado") ?? orderRows[0] ?? null;
  let payments: Payment[] = [];
  if (order) {
    const { data } = await supabase
      .from("payments")
      .select("id, order_id, status, declared_amount, receipt_path, ai_extraction, rejection_reason, reviewed_at, created_at")
      .eq("org_id", orgId)
      .eq("order_id", order.id)
      .order("created_at", { ascending: false });
    payments = ((data ?? []) as unknown as Payment[]).map((p) => ({ ...p, receipt_url: null, receipt_mime: guessMime(p.receipt_path) }));
  }

  const messages = ((msgs.data ?? []) as ChatMessage[]).reverse();
  const urls = await signMedia([...messages.map((m) => m.media_path), ...payments.map((p) => p.receipt_path)]);
  for (const m of messages) m.media_url = m.media_path ? urls[m.media_path] ?? null : null;
  for (const p of payments) p.receipt_url = p.receipt_path ? urls[p.receipt_path] ?? null : null;

  return {
    kase: { ...kase, estimated_amount: kase.estimated_amount === null ? null : Number(kase.estimated_amount), contact: { ...kase.contact, tags: kase.contact.tags ?? [] } },
    messages,
    hasMore: (msgs.data ?? []).length === 50,
    events: (events.data ?? []) as CaseEvent[],
    suggestions: (sugg.data ?? []) as Suggestion[],
    order: order
      ? { ...order, subtotal: Number(order.subtotal), shipping: Number(order.shipping), total: Number(order.total), items: (order.items ?? []).map((i) => ({ ...i, unit_price: Number(i.unit_price), subtotal: Number(i.subtotal) })) }
      : null,
    payments: payments.map((p) => ({ ...p, declared_amount: p.declared_amount === null ? null : Number(p.declared_amount) })),
    history: (history.data ?? []) as { id: string; number: number; status: CaseStatus; type: CaseType; estimated_amount: number | null; opened_at: string }[],
  };
}
export type CaseDetailData = NonNullable<Awaited<ReturnType<typeof getCaseDetail>>>;
