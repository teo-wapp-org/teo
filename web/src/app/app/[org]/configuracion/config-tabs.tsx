"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "", label: "Negocio" },
  { path: "/pagos", label: "Formas de pago" },
  { path: "/teo", label: "Teo" },
  { path: "/equipo", label: "Equipo" },
  { path: "/whatsapp", label: "WhatsApp" },
];

/** Pestañas de Configuración como rutas hijas (cada pestaña tiene URL propia). */
export function ConfigTabs({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de configuración" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-xl bg-muted p-1">
        {TABS.map((t) => {
          const href = `${base}${t.path}`;
          const active = pathname === href;
          return (
            <li key={t.path}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
