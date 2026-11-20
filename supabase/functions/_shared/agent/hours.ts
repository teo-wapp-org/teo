// Horarios de tiendas: { "lun": [{"open":"09:00","close":"18:00"}], ..., "dom": [] } en la zona del comercio.

export const DAYS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;
export type Day = (typeof DAYS)[number];
export type Hours = Partial<Record<Day, { open: string; close: string }[]>>;

const DAY_LABEL: Record<Day, string> = { lun: "Lun", mar: "Mar", mie: "Mié", jue: "Jue", vie: "Vie", sab: "Sáb", dom: "Dom" };

/** Día de la semana y minutos desde medianoche en la zona horaria dada. */
export function localParts(now: Date, timeZone = "America/Guayaquil"): { day: Day; minutes: number; label: string } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const label = new Intl.DateTimeFormat("es-EC", { timeZone, dateStyle: "full", timeStyle: "short" }).format(now);
  return { day: DAYS[idx], minutes: Number(parts.hour) * 60 + Number(parts.minute), label };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function isOpenNow(hours: Hours | null | undefined, now: Date, timeZone?: string): boolean | null {
  if (!hours || Object.keys(hours).length === 0) return null; // sin horario registrado
  const { day, minutes } = localParts(now, timeZone);
  return (hours[day] ?? []).some((r) => {
    const o = toMin(r.open);
    const c = toMin(r.close);
    return c > o ? minutes >= o && minutes < c : minutes >= o || minutes < c; // soporta cruce de medianoche
  });
}

export function formatHours(hours: Hours | null | undefined): string {
  if (!hours || Object.keys(hours).length === 0) return "sin horario registrado";
  const order: Day[] = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
  return order
    .map((d) => `${DAY_LABEL[d]} ${hours[d]?.length ? hours[d]!.map((r) => `${r.open}-${r.close}`).join(", ") : "cerrado"}`)
    .join("; ");
}
