"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** `icon` llega ya renderizado (<Icon />): no se pueden pasar componentes/funciones del servidor al cliente. */
export function SidebarLink({
  href,
  label,
  icon,
  exact,
  badge,
  also,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  badge?: { count: number; label: string };
  /** Otros prefijos de ruta que también marcan el enlace como activo. */
  also?: string[];
}) {
  const pathname = usePathname();
  const active =
    (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)) || (also ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors [&_svg]:size-4",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground [&_svg]:text-sidebar-primary"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      {icon}
      {label}
      {badge && (
        <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-semibold text-white tabular-nums" data-testid="badge-atencion">
          {badge.count}
          <span className="sr-only"> {badge.label}</span>
        </span>
      )}
    </Link>
  );
}
