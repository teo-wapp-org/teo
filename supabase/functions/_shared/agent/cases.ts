// Casos: apertura, transiciones (siempre vía transition_case con p_actor='teo') y escalamiento.
import type { SupabaseClient } from "@supabase/supabase-js";

export type CaseStatus =
  | "nuevo" | "en_conversacion" | "cotizacion" | "esperando_pago" | "pago_por_confirmar"
  | "confirmado" | "requiere_atencion" | "cerrado_ganado" | "cerrado_perdido" | "resuelto";

export type CaseRow = {
  id: string;
  org_id: string;
  number: number;
  contact_id: string;
  conversation_id: string;
  type: "venta" | "consulta" | "postventa" | "reclamo";
  status: CaseStatus;
  previous_status: CaseStatus | null;
  estimated_amount: number | null;
};

export const CLOSED: CaseStatus[] = ["cerrado_ganado", "cerrado_perdido", "resuelto"];

// Espejo de case_transition_allowed (SQL) solo para planear el camino; la DB valida igual.
const EDGES: Record<string, CaseStatus[]> = {
  nuevo: ["en_conversacion", "cotizacion", "resuelto", "cerrado_perdido"],
  en_conversacion: ["cotizacion", "esperando_pago", "resuelto", "cerrado_perdido"],
  cotizacion: ["en_conversacion", "esperando_pago", "cerrado_perdido"],
  esperando_pago: ["cotizacion", "pago_por_confirmar", "cerrado_perdido"],
  pago_por_confirmar: ["esperando_pago", "confirmado"],
  confirmado: ["cerrado_ganado"],
};

export function pathTo(from: CaseStatus, to: CaseStatus): CaseStatus[] | null {
  if (from === to) return [];
  if (CLOSED.includes(from)) return null;
  if (to === "requiere_atencion") return [to];
  const queue: [CaseStatus, CaseStatus[]][] = [[from, []]];
  const seen = new Set<CaseStatus>([from]);
  while (queue.length) {
    const [s, p] = queue.shift()!;
    for (const n of EDGES[s] ?? []) {
      if (seen.has(n)) continue;
      const np = [...p, n];
      if (n === to) return np;
      seen.add(n);
      queue.push([n, np]);
    }
  }
  return null;
}

const CASE_COLS = "id, org_id, number, contact_id, conversation_id, type, status, previous_status, estimated_amount";

export async function getCase(db: SupabaseClient, orgId: string, caseId: string): Promise<CaseRow> {
  const { data, error } = await db.from("cases").select(CASE_COLS).eq("org_id", orgId).eq("id", caseId).single();
  if (error) throw new Error(`case_load: ${error.message}`);
  return data as CaseRow;
}

/** Devuelve el caso abierto del contacto o crea uno nuevo (un contacto tiene como máximo un caso abierto). */
export async function ensureOpenCase(
  db: SupabaseClient,
  p: { orgId: string; contactId: string; conversationId: string },
): Promise<CaseRow> {
  const find = async () => {
    const { data, error } = await db.from("cases").select(CASE_COLS)
      .eq("org_id", p.orgId).eq("contact_id", p.contactId)
      .not("status", "in", `(${CLOSED.join(",")})`)
      .maybeSingle();
    if (error) throw new Error(`case_find: ${error.message}`);
    return data as CaseRow | null;
  };
  const existing = await find();
  if (existing) return existing;
  const { data, error } = await db.from("cases")
    .insert({ org_id: p.orgId, contact_id: p.contactId, conversation_id: p.conversationId, type: "consulta", status: "nuevo" })
    .select(CASE_COLS).single();
  if (error) {
    // carrera: otro worker lo creó (índice único cases_one_open_per_contact)
    const again = await find();
    if (again) return again;
    throw new Error(`case_create: ${error.message}`);
  }
  await db.from("case_events").insert({ org_id: p.orgId, case_id: data.id, actor: "sistema", to_status: "nuevo", reason: "caso abierto por mensaje entrante" });
  return data as CaseRow;
}

/** Lleva el caso hasta `to` por el camino válido más corto. Lanza si no es posible. */
export async function moveCase(db: SupabaseClient, c: CaseRow, to: CaseStatus, reason: string): Promise<CaseRow> {
  const path = pathTo(c.status, to);
  if (path === null) throw new Error(`invalid_transition ${c.status} -> ${to}`);
  let cur = c;
  for (const step of path) {
    const { data, error } = await db.rpc("transition_case", { p_case: cur.id, p_to: step, p_reason: reason, p_actor: "teo" });
    if (error) throw new Error(`transition_case: ${error.message}`);
    cur = { ...cur, ...(data as CaseRow) };
  }
  return cur;
}

/** Pasa el caso a requiere_atencion y la conversación a modo humano. Idempotente. */
export async function escalateCase(db: SupabaseClient, orgId: string, caseId: string, motivo: string): Promise<CaseRow> {
  let c = await getCase(db, orgId, caseId);
  if (c.status !== "requiere_atencion" && !CLOSED.includes(c.status)) c = await moveCase(db, c, "requiere_atencion", motivo);
  const { error } = await db.from("conversations").update({ handled_by: "humano" }).eq("org_id", orgId).eq("id", c.conversation_id);
  if (error) throw new Error(`conversation_handoff: ${error.message}`);
  return c;
}
