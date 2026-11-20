/** Estados del caso (FICHA §6.2): etiqueta y color de su columna en el tablero. */
export const CASE_STATUS: Record<string, { label: string; dot: string; chip: string }> = {
  nuevo: { label: "Nuevo", dot: "bg-cta", chip: "bg-cta/15 text-foreground" },
  en_conversacion: { label: "En conversación", dot: "bg-secondary", chip: "bg-secondary text-secondary-foreground" },
  cotizacion: { label: "Cotización", dot: "bg-warning/60", chip: "bg-warning/25 text-foreground" },
  esperando_pago: { label: "Esperando pago", dot: "bg-warning", chip: "bg-warning/45 text-foreground" },
  pago_por_confirmar: { label: "Pago por confirmar", dot: "bg-info", chip: "bg-info/20 text-foreground" },
  confirmado: { label: "Confirmado", dot: "bg-cta", chip: "bg-cta/30 text-foreground" },
  requiere_atencion: { label: "Requiere atención", dot: "bg-destructive", chip: "bg-destructive/15 text-destructive" },
  cerrado_ganado: { label: "Cerrado (ganado)", dot: "bg-muted-foreground", chip: "bg-muted text-muted-foreground" },
  cerrado_perdido: { label: "Cerrado (perdido)", dot: "bg-muted-foreground", chip: "bg-muted text-muted-foreground" },
  resuelto: { label: "Resuelto", dot: "bg-muted-foreground", chip: "bg-muted text-muted-foreground" },
};

export const formatUsd = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
