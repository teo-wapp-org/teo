/**
 * Checklist de inicio del comercio (FICHA §5.1), calculada con datos reales.
 * `buildChecklist` es pura (se prueba con Vitest); `loadChecklistData` consulta con el cliente con sesión (RLS).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type ChecklistData = {
  stores: number;
  products: number;
  activePaymentMethods: number;
  agentCustomized: boolean;
  whatsappConnected: boolean;
};

export type ChecklistStepId = "comercio" | "tiendas" | "catalogo" | "pagos" | "teo" | "whatsapp";
export type ChecklistStep = { id: ChecklistStepId; label: string; done: boolean; path: string };

export function buildChecklist(d: ChecklistData): ChecklistStep[] {
  return [
    { id: "comercio", label: "Crea tu comercio", done: true, path: "" },
    { id: "tiendas", label: "Agrega tus tiendas y horarios", done: d.stores > 0, path: "/tiendas" },
    { id: "catalogo", label: "Carga tu catálogo", done: d.products > 0, path: "/catalogo" },
    { id: "pagos", label: "Configura tus formas de pago", done: d.activePaymentMethods > 0, path: "/configuracion/pagos" },
    { id: "teo", label: "Personaliza a Teo", done: d.agentCustomized, path: "/configuracion/teo" },
    { id: "whatsapp", label: "Conecta tu WhatsApp", done: d.whatsappConnected, path: "/configuracion/whatsapp" },
  ];
}

/**
 * Teo cuenta como personalizado si tiene saludo o si su configuración se guardó después de crear el comercio
 * (las filas por defecto se crean con el comercio; damos 1 minuto de margen).
 */
export function isAgentCustomized(agent: { greeting: string | null; updated_at: string } | null, orgCreatedAt: string | null): boolean {
  if (!agent) return false;
  if (agent.greeting?.trim()) return true;
  if (!orgCreatedAt) return false;
  return new Date(agent.updated_at).getTime() - new Date(orgCreatedAt).getTime() > 60_000;
}

export async function loadChecklistData(supabase: SupabaseClient<Database>, orgId: string): Promise<ChecklistData> {
  const count = { count: "exact", head: true } as const;
  const [stores, products, payments, agent, org, wa] = await Promise.all([
    supabase.from("stores").select("id", count).eq("org_id", orgId),
    supabase.from("products").select("id", count).eq("org_id", orgId),
    supabase.from("payment_methods").select("id", count).eq("org_id", orgId).eq("active", true),
    supabase.from("agent_settings").select("greeting, updated_at").eq("org_id", orgId).maybeSingle(),
    supabase.from("organizations").select("created_at").eq("id", orgId).maybeSingle(),
    supabase.from("whatsapp_accounts").select("id", count).eq("org_id", orgId).eq("status", "conectado"),
  ]);
  return {
    stores: stores.count ?? 0,
    products: products.count ?? 0,
    activePaymentMethods: payments.count ?? 0,
    agentCustomized: isAgentCustomized(agent.data, org.data?.created_at ?? null),
    whatsappConnected: (wa.count ?? 0) > 0,
  };
}
