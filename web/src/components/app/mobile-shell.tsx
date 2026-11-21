"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, MoreHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarLink } from "@/components/app/sidebar-link";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export type ShellItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
  exact?: boolean;
  also?: string[];
  badge?: { count: number; label: string };
};

/**
 * Navegación móvil (< md): barra superior con logo y menú, menú lateral con TODAS las secciones
 * (+ selector de comercio, acceso admin y cerrar sesión) y barra inferior con las principales + "Más".
 */
export function MobileShell({
  homeHref,
  title,
  items,
  bottomCount = 4,
  top,
  footer,
  badgeLabel,
}: {
  homeHref: string;
  title?: string;
  items: ShellItem[];
  bottomCount?: number;
  top?: React.ReactNode;
  footer?: React.ReactNode;
  badgeLabel?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Teclado virtual: al enfocar un campo de texto en móvil se marca <html data-keyboard="open">
  // (CSS oculta la barra inferior para que no flote sobre el teclado ni tape el campo).
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT" ||
        (el.tagName === "INPUT" && !["checkbox", "radio", "range", "button", "submit", "file", "color"].includes((el as HTMLInputElement).type)));
    const mq = window.matchMedia("(max-width: 47.99rem)");
    const onIn = (e: FocusEvent) => { if (mq.matches && isField(e.target)) document.documentElement.dataset.keyboard = "open"; };
    const onOut = () => {
      // el foco puede saltar a otro campo: se revisa en el siguiente tick
      setTimeout(() => { if (!isField(document.activeElement)) delete document.documentElement.dataset.keyboard; }, 0);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      delete document.documentElement.dataset.keyboard;
    };
  }, []);

  const isActive = (it: ShellItem) =>
    it.exact ? pathname === it.href || (it.also ?? []).some((p) => pathname.startsWith(p)) : pathname === it.href || pathname.startsWith(`${it.href}/`);
  const bottom = items.slice(0, bottomCount);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:hidden">
        <Logo href={homeHref} className="h-8" />
        {badgeLabel && (
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">{badgeLabel}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold">{title}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Abrir menú"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs gap-5 overflow-y-auto border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <Link href={homeHref} className="px-2 pt-1">
            <Image src="/brand/logo-oscuro.png" alt="Teo" width={600} height={271} className="h-8 w-auto" />
          </Link>
          {top}
          <nav
            aria-label="Menú"
            className="flex flex-col gap-1"
            onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}
          >
            {items.map((it) => (
              <SidebarLink key={it.href} href={it.href} label={it.label} icon={it.icon} exact={it.exact} also={it.also} badge={it.badge} />
            ))}
          </nav>
          {footer && <div className="mt-auto">{footer}</div>}
        </SheetContent>
      </Sheet>

      <nav
        aria-label="Navegación inferior"
        data-mobile-bottom-nav
        className="fixed inset-x-0 bottom-0 z-30 grid transition-transform duration-150 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${bottom.length + 1}, minmax(0, 1fr))` }}
      >
        {bottom.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={isActive(it) ? "page" : undefined}
            className={cn(
              "relative flex min-w-0 flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-[11px] font-medium [&_svg]:size-5",
              isActive(it) ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {it.icon}
            <span className="w-full truncate text-center">{it.shortLabel ?? it.label}</span>
            {it.badge && it.badge.count > 0 && (
              <span className="absolute right-[calc(50%-1.25rem)] top-1 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
                {it.badge.count}
                <span className="sr-only"> {it.badge.label}</span>
              </span>
            )}
            {isActive(it) && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-cta" aria-hidden />}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-0 cursor-pointer flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-[11px] font-medium text-muted-foreground [&_svg]:size-5"
        >
          <MoreHorizontal aria-hidden />
          <span>Más</span>
        </button>
      </nav>
    </>
  );
}
