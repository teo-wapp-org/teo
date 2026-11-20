// Versión de la Graph API de Meta. Mantener igual que supabase/functions/_shared/whatsapp/constants.ts.
export const GRAPH_VERSION = "v24.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type WaAccountStatus = "pendiente" | "conectado" | "desconectado" | "error";

export const STATUS_LABEL: Record<WaAccountStatus, string> = {
  pendiente: "Pendiente de verificación",
  conectado: "Conectado",
  desconectado: "Desconectado",
  error: "Con error",
};

export const QUALITY_LABEL: Record<string, string> = {
  GREEN: "Alta",
  YELLOW: "Media",
  RED: "Baja",
  UNKNOWN: "Sin datos",
};
