// Versión de la Graph API por defecto. La efectiva sale del ajuste meta.graph_version (panel /admin).
export const GRAPH_VERSION = "v24.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const graphBase = (version?: string | null) => `https://graph.facebook.com/${version || GRAPH_VERSION}`;

/** Ventana de atención al cliente de Meta: texto libre solo dentro de 24 h del último mensaje del cliente. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Debounce del agente (FICHA §10.4). Valor por defecto; el efectivo es ai.debounce_seconds. */
export const INBOUND_DEBOUNCE_SECONDS = 4;

/** Envíos: reintentos máximos por mensaje antes de marcarlo failed. */
export const MAX_SEND_ATTEMPTS = 5;
