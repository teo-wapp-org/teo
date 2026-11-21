// Versión de la Graph API de Meta por defecto. La efectiva es el ajuste meta.graph_version
// (public_platform_config().meta_graph_version), administrado desde /admin.
export const GRAPH_VERSION = "v24.0";
export const graphBase = (version?: string | null) => `https://graph.facebook.com/${version || GRAPH_VERSION}`;

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
