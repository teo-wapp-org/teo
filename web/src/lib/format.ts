/** Formateos del panel (es-EC, USD, America/Guayaquil). Puros: sirven en servidor, cliente y tests. */

export const TZ = "America/Guayaquil";

const money = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyCompact = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatMoney(n: number | string | null | undefined, opts: { compact?: boolean } = {}): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "—";
  return (opts.compact ? moneyCompact : money).format(v);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-EC").format(n);
}

export function formatPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)} %`;
}

/** Duración corta: "45 s", "12 min", "3 h", "2 d". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** "hace 5 min" / "ahora". */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const diff = now - new Date(iso).getTime();
  if (diff < 45_000) return "ahora";
  return `hace ${formatDuration(diff)}`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-EC", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function formatDate(iso: string, opts: { withTime?: boolean } = {}): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(opts.withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(iso));
}

/** Clave de día (YYYY-MM-DD) en la zona del comercio. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Inicio del día actual en Guayaquil (UTC-5, sin horario de verano) como ISO. */
export function startOfTodayIso(now = new Date()): string {
  return new Date(`${dayKey(now)}T00:00:00-05:00`).toISOString();
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
