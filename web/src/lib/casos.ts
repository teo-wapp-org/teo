/**
 * Lógica pura del tablero de casos (cliente y servidor). FICHA §6.
 * Las transiciones replican `public.case_transition_allowed` para validar en la UI antes de llamar
 * a `transition_case` (el backend sigue siendo la única autoridad).
 */

export type CaseStatus =
  | "nuevo"
  | "en_conversacion"
  | "cotizacion"
  | "esperando_pago"
  | "pago_por_confirmar"
  | "confirmado"
  | "requiere_atencion"
  | "cerrado_ganado"
  | "cerrado_perdido"
  | "resuelto";
export type CaseType = "venta" | "consulta" | "postventa" | "reclamo";
export type HandledBy = "teo" | "humano";

export const CLOSED_STATUSES: readonly CaseStatus[] = ["cerrado_ganado", "cerrado_perdido", "resuelto"];
export const OPEN_STATUSES: readonly CaseStatus[] = [
  "nuevo",
  "en_conversacion",
  "cotizacion",
  "esperando_pago",
  "pago_por_confirmar",
  "confirmado",
  "requiere_atencion",
];

export const STATUS_LABEL: Record<CaseStatus, string> = {
  nuevo: "Nuevo",
  en_conversacion: "En conversación",
  cotizacion: "Cotización",
  esperando_pago: "Esperando pago",
  pago_por_confirmar: "Pago por confirmar",
  confirmado: "Confirmado",
  requiere_atencion: "Requiere atención",
  cerrado_ganado: "Cerrado (ganado)",
  cerrado_perdido: "Cerrado (perdido)",
  resuelto: "Resuelto",
};

export const TYPE_LABEL: Record<CaseType, string> = {
  venta: "Venta",
  consulta: "Consulta",
  postventa: "Postventa",
  reclamo: "Reclamo",
};

/** Clases de color por estado (punto y chip). Nunca verde como texto sobre claro. */
export const STATUS_DOT: Record<CaseStatus, string> = {
  nuevo: "bg-cta/50",
  en_conversacion: "bg-chart-3",
  cotizacion: "bg-warning/60",
  esperando_pago: "bg-warning",
  pago_por_confirmar: "bg-info",
  confirmado: "bg-cta",
  requiere_atencion: "bg-destructive",
  cerrado_ganado: "bg-muted-foreground",
  cerrado_perdido: "bg-muted-foreground",
  resuelto: "bg-muted-foreground",
};

export type ColumnId = Exclude<CaseStatus, "cerrado_ganado" | "cerrado_perdido" | "resuelto"> | "cerrado";

export type Column = { id: ColumnId; label: string; statuses: readonly CaseStatus[] };

export const COLUMNS: readonly Column[] = [
  ...OPEN_STATUSES.map((s) => ({ id: s as ColumnId, label: STATUS_LABEL[s], statuses: [s] as const })),
  { id: "cerrado", label: "Cerrado", statuses: CLOSED_STATUSES },
];

export function columnOf(status: CaseStatus): ColumnId {
  return CLOSED_STATUSES.includes(status) ? "cerrado" : (status as ColumnId);
}

export function isClosed(status: CaseStatus) {
  return CLOSED_STATUSES.includes(status);
}

const ALLOWED: ReadonlyArray<readonly [CaseStatus, CaseStatus]> = [
  ["nuevo", "en_conversacion"], ["nuevo", "cotizacion"], ["nuevo", "resuelto"], ["nuevo", "cerrado_perdido"],
  ["en_conversacion", "cotizacion"], ["en_conversacion", "esperando_pago"], ["en_conversacion", "resuelto"], ["en_conversacion", "cerrado_perdido"],
  ["cotizacion", "en_conversacion"], ["cotizacion", "esperando_pago"], ["cotizacion", "cerrado_perdido"],
  ["esperando_pago", "cotizacion"], ["esperando_pago", "pago_por_confirmar"], ["esperando_pago", "cerrado_perdido"],
  ["pago_por_confirmar", "esperando_pago"], ["pago_por_confirmar", "confirmado"],
  ["confirmado", "cerrado_ganado"],
];

/** Réplica de `public.case_transition_allowed`. */
export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  if (from === to) return false;
  if (isClosed(from)) return false;
  if (to === "requiere_atencion") return true;
  if (from === "requiere_atencion") return to !== "nuevo";
  return ALLOWED.some(([a, b]) => a === from && b === to);
}

const ALL_STATUSES: readonly CaseStatus[] = [...OPEN_STATUSES, ...CLOSED_STATUSES];

export function allowedTargets(from: CaseStatus): CaseStatus[] {
  return ALL_STATUSES.filter((to) => canTransition(from, to));
}

/** Mensaje humano para un movimiento no permitido. */
export function transitionError(from: CaseStatus, to: CaseStatus): string {
  if (isClosed(from)) return "El caso ya está cerrado: no se puede mover.";
  if (to === "nuevo") return "Un caso no puede volver a “Nuevo”.";
  const targets = allowedTargets(from).map((s) => `“${STATUS_LABEL[s]}”`);
  return `De “${STATUS_LABEL[from]}” no se puede pasar a “${STATUS_LABEL[to]}”. Opciones: ${targets.join(", ")}.`;
}

/** Traduce los errores de la base (`invalid_transition`, `forbidden`, …) a texto para el operador. */
export function dbErrorMessage(message: string | undefined | null): string {
  const m = message ?? "";
  if (m.includes("invalid_transition")) return "Ese cambio de estado no está permitido.";
  if (m.includes("forbidden")) return "No tienes permiso para esta acción.";
  if (m.includes("payment_already_reviewed")) return "Este pago ya fue revisado.";
  if (m.includes("not_found")) return "No encontramos el registro.";
  return "No pudimos completar la acción. Intenta de nuevo.";
}

/** Columna destino → estado destino (la columna "cerrado" no es destino de arrastre). */
export function targetStatusForColumn(col: ColumnId): CaseStatus | null {
  return col === "cerrado" ? null : col;
}

export type BoardCase = {
  id: string;
  number: number;
  status: CaseStatus;
  type: CaseType;
  estimated_amount: number | null;
  status_changed_at: string;
  assignee_id: string | null;
  handled_by: HandledBy;
  contact_name: string;
  last_message: string | null;
  last_message_at: string | null;
  tags?: string[];
};

export type BoardFilters = { mine?: boolean; userId?: string | null; type?: CaseType | "todos"; q?: string; attention?: boolean };

export function filterCases<T extends BoardCase>(cases: T[], f: BoardFilters): T[] {
  const q = (f.q ?? "").trim().toLowerCase().replace(/^#/, "");
  return cases.filter((c) => {
    if (f.mine && c.assignee_id !== f.userId) return false;
    if (f.type && f.type !== "todos" && c.type !== f.type) return false;
    if (f.attention && c.status !== "requiere_atencion") return false;
    if (q) {
      const hay = `${c.number} ${c.contact_name} ${c.last_message ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type ColumnGroup<T> = { column: Column; cases: T[]; count: number; total: number };

/** Agrupa por columna (orden fijo), ordenando por tiempo en columna (más antiguo arriba). */
export function groupByColumn<T extends BoardCase>(cases: T[], opts: { showClosed?: boolean } = {}): ColumnGroup<T>[] {
  const cols = COLUMNS.filter((c) => opts.showClosed || c.id !== "cerrado");
  return cols.map((column) => {
    const list = cases
      .filter((c) => columnOf(c.status) === column.id)
      .sort((a, b) => a.status_changed_at.localeCompare(b.status_changed_at));
    return { column, cases: list, count: list.length, total: sumAmounts(list) };
  });
}

export function sumAmounts(cases: Pick<BoardCase, "estimated_amount">[]): number {
  return Math.round(cases.reduce((acc, c) => acc + (Number(c.estimated_amount) || 0), 0) * 100) / 100;
}

/** Nombre visible de un contacto: nombre > perfil de WhatsApp > teléfono formateado. */
export function contactDisplayName(c: { name?: string | null; profile_name?: string | null; wa_id?: string | null }): string {
  return c.name?.trim() || c.profile_name?.trim() || formatPhone(c.wa_id) || "Sin nombre";
}

export function formatPhone(waId: string | null | undefined): string {
  if (!waId) return "";
  const d = waId.replace(/\D/g, "");
  if (d.startsWith("593") && d.length === 12) return `+593 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return `+${d}`;
}

/** Ventana de 24 h de Meta desde el último mensaje del cliente. */
export function windowState(lastInboundAt: string | null | undefined, channel: string, now = Date.now()) {
  if (channel === "simulador") return { open: true, hoursLeft: null as number | null };
  if (!lastInboundAt) return { open: false, hoursLeft: 0 };
  const left = new Date(lastInboundAt).getTime() + 24 * 3600_000 - now;
  return { open: left > 0, hoursLeft: left > 0 ? Math.ceil(left / 3600_000) : 0 };
}

/** Estado inicial de un mensaje del operador según el canal (contrato con el equipo de WhatsApp). */
export function outboundStatus(channel: string): "queued" | "sent" {
  return channel === "whatsapp" ? "queued" : "sent";
}

export type MessageAuthorKind = "cliente" | "teo" | "operador" | "sistema";
export function authorKind(author: string): MessageAuthorKind {
  if (author === "cliente") return "cliente";
  if (author === "teo") return "teo";
  if (author.startsWith("user:")) return "operador";
  return "sistema";
}

/** Estado de una sugerencia tras enviar: igual al texto = usada; distinto = editada. */
export function suggestionOutcome(suggestion: string, sent: string): "usada" | "editada" {
  return suggestion.trim() === sent.trim() ? "usada" : "editada";
}
