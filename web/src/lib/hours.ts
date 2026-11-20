/**
 * Horario semanal de Teo y de las tiendas. Formato guardado en DB (stores.hours, agent_settings.business_hours):
 *   { "lun": [{ "open": "09:00", "close": "18:00" }], ..., "dom": [] }
 * Un día sin turnos (o ausente) = cerrado. Un objeto vacío `{}` = sin horario definido.
 * Funciones puras (sin dependencias de servidor) para poder probarlas con Vitest.
 */
import { z } from "zod";

export const DAYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
export type Day = (typeof DAYS)[number];
export type Shift = { open: string; close: string };
export type WeekHours = Partial<Record<Day, Shift[]>>;

export const DAY_LABELS: Record<Day, string> = {
  lun: "Lunes",
  mar: "Martes",
  mie: "Miércoles",
  jue: "Jueves",
  vie: "Viernes",
  sab: "Sábado",
  dom: "Domingo",
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ShiftSchema = z.object({ open: z.string().regex(TIME), close: z.string().regex(TIME) });

export const WeekHoursSchema = z
  .object(Object.fromEntries(DAYS.map((d) => [d, z.array(ShiftSchema).max(4).optional()])) as Record<Day, z.ZodOptional<z.ZodArray<typeof ShiftSchema>>>)
  .strict()
  .superRefine((week, ctx) => {
    for (const d of DAYS) {
      const msg = shiftsError(week[d] ?? []);
      if (msg) ctx.addIssue({ code: "custom", message: `${DAY_LABELS[d]}: ${msg}`, path: [d] });
    }
  });

/** Valida turnos de un día: cada turno abre antes de cerrar y no se cruzan. Devuelve el error o null. */
export function shiftsError(shifts: Shift[]): string | null {
  const sorted = [...shifts].sort((a, b) => a.open.localeCompare(b.open));
  for (let i = 0; i < sorted.length; i++) {
    if (!TIME.test(sorted[i].open) || !TIME.test(sorted[i].close)) return "usa el formato HH:MM";
    if (sorted[i].open >= sorted[i].close) return "la hora de cierre debe ser después de la de apertura";
    if (i > 0 && sorted[i].open < sorted[i - 1].close) return "los turnos se cruzan";
  }
  return null;
}

/** Normaliza lo que venga de la DB (jsonb) a un WeekHours limpio con turnos ordenados. */
export function normalizeHours(raw: unknown): WeekHours {
  const out: WeekHours = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  for (const d of DAYS) {
    const v = obj[d];
    if (!Array.isArray(v)) continue;
    out[d] = v
      .filter((s): s is Shift => !!s && typeof s === "object" && TIME.test((s as Shift).open) && TIME.test((s as Shift).close))
      .map((s) => ({ open: s.open, close: s.close }))
      .sort((a, b) => a.open.localeCompare(b.open));
  }
  return out;
}

export const hasAnyHours = (h: WeekHours) => DAYS.some((d) => (h[d]?.length ?? 0) > 0);

/** Resumen corto por día, p. ej. "09:00–13:00, 15:00–19:00" o "Cerrado". */
export function formatDay(shifts: Shift[] | undefined): string {
  if (!shifts?.length) return "Cerrado";
  return shifts.map((s) => `${s.open}–${s.close}`).join(", ");
}

// ─────────────────────────────────────────────────────────────
// Google Places (API New): regularOpeningHours.periods → WeekHours
// ─────────────────────────────────────────────────────────────
export type PlacesPoint = { day: number; hour?: number; minute?: number };
export type PlacesPeriod = { open: PlacesPoint; close?: PlacesPoint };

// Google: day 0 = domingo … 6 = sábado
const GOOGLE_DAY: Day[] = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
const hhmm = (h = 0, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const END_OF_DAY = "23:59";

/**
 * Convierte los periodos de Google a nuestro formato.
 * - Sin `close` → abierto 24 horas todos los días.
 * - Si cierra otro día (pasa medianoche), se parte en dos turnos: hasta 23:59 y desde 00:00 del día siguiente.
 * - Días sin periodos quedan como cerrados (lista vacía).
 */
export function placesPeriodsToHours(periods: PlacesPeriod[] | undefined | null): WeekHours {
  const week: Record<Day, Shift[]> = { lun: [], mar: [], mie: [], jue: [], vie: [], sab: [], dom: [] };
  if (!periods?.length) return {};

  for (const p of periods) {
    if (!p.open || p.open.day == null) continue;
    if (!p.close) {
      for (const d of DAYS) week[d] = [{ open: "00:00", close: END_OF_DAY }];
      return week;
    }
    const open = hhmm(p.open.hour, p.open.minute);
    const close = hhmm(p.close.hour, p.close.minute);
    const startDay = ((p.open.day % 7) + 7) % 7;
    const endDay = ((p.close.day % 7) + 7) % 7;

    if (startDay === endDay && close > open) {
      week[GOOGLE_DAY[startDay]].push({ open, close });
      continue;
    }
    // Cruza medianoche (uno o varios días)
    week[GOOGLE_DAY[startDay]].push({ open, close: END_OF_DAY });
    let d = (startDay + 1) % 7;
    let guard = 0;
    while (d !== endDay && guard++ < 7) {
      week[GOOGLE_DAY[d]].push({ open: "00:00", close: END_OF_DAY });
      d = (d + 1) % 7;
    }
    if (close > "00:00") week[GOOGLE_DAY[endDay]].push({ open: "00:00", close });
  }

  for (const d of DAYS) week[d] = mergeShifts(week[d]);
  return week;
}

/** Ordena y une turnos contiguos o solapados (p. ej. 00:00–02:00 + 00:00–23:59). */
export function mergeShifts(shifts: Shift[]): Shift[] {
  const sorted = [...shifts].sort((a, b) => a.open.localeCompare(b.open));
  const out: Shift[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.open <= last.close) {
      if (s.close > last.close) last.close = s.close;
    } else out.push({ ...s });
  }
  return out;
}
