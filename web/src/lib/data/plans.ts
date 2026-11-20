import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Plan = {
  id: string;
  name: string;
  price_usd_month: number;
  teo_messages_month: number;
  max_users: number | null;
  max_stores: number | null;
  max_products: number | null;
  features: string[];
  highlighted: boolean;
};

export async function getPlans(): Promise<Plan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plans").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, price_usd_month: Number(p.price_usd_month) })) as Plan[];
}

export const FEATURE_LABELS: Record<string, string> = {
  kanban: "Tablero de clientes por estado",
  chat: "Chat en vivo desde el panel",
  sugerencias: "Respuestas sugeridas por Teo",
  copiloto: "Modo copiloto y paso a humano",
  sello_teo: "Sello “Atendido por Teo”",
  importar_catalogo: "Importa tu catálogo (CSV/Excel)",
  google_places: "Datos desde tu perfil de Google",
  lectura_comprobantes: "Lectura de comprobantes con IA",
  metricas_completas: "Métricas completas",
  metricas_avanzadas: "Métricas avanzadas y exportación",
  integraciones: "Integraciones con CRM y API",
  multi_numero: "Varios números de WhatsApp",
  soporte_dedicado: "Soporte dedicado",
};

export const fmtLimit = (n: number | null, unit: string) => (n == null ? `${unit} ilimitados` : `${n.toLocaleString("es-EC")} ${unit}`);
