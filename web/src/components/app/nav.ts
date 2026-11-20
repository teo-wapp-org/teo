import { BarChart3, Home, Layers, MessageCircle, Package, Settings, Store, Users } from "lucide-react";

export const ORG_NAV = [
  { slug: "", label: "Inicio", icon: Home },
  { slug: "casos", label: "Casos", icon: Layers },
  { slug: "conversaciones", label: "Conversaciones", icon: MessageCircle },
  { slug: "clientes", label: "Clientes", icon: Users },
  { slug: "catalogo", label: "Catálogo", icon: Package },
  { slug: "tiendas", label: "Tiendas", icon: Store },
  { slug: "metricas", label: "Métricas", icon: BarChart3 },
  { slug: "configuracion", label: "Configuración", icon: Settings },
] as const;

export const PLACEHOLDER_SECTIONS = new Set(["conversaciones", "clientes", "catalogo", "metricas"]);
