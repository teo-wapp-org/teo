// Logs estructurados (JSON de una línea). No registrar tokens ni el contenido de los mensajes.
export type LogLevel = "info" | "warn" | "error";
export type Logger = (level: LogLevel, event: string, data?: Record<string, unknown>) => void;

/** Log JSON de una línea. No registrar tokens ni el contenido de los mensajes. */
export const log: Logger = (level, event, data = {}) => {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

/** Oculta el teléfono para los logs: 593991234567 → 5939…4567 */
export function maskPhone(p?: string | null): string {
  if (!p) return "";
  return p.length <= 8 ? "…" + p.slice(-2) : `${p.slice(0, 4)}…${p.slice(-4)}`;
}
