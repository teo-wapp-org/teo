"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Eye, Search, Store } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type SwitcherOrg = { id: string; name: string; slug: string; status: string; member: boolean };

const STATUS: Record<string, string> = { onboarding: "En configuración", activo: "Activo", suspendido: "Suspendido" };

/** Mantiene la sección actual al cambiar de comercio (/app/a/casos/12 → /app/b/casos). Fuera de /app va al inicio. */
function targetHref(pathname: string, slug: string) {
  if (!pathname.startsWith("/app/")) return `/app/${slug}`;
  const section = pathname.replace(/^\/app\/[^/]+/, "").split("/")[1];
  return section ? `/app/${slug}/${section}` : `/app/${slug}`;
}

export function OrgSwitcher({
  orgs,
  currentSlug,
  variant = "sidebar",
  label = "Comercio",
  placeholder = "Elegir comercio",
}: {
  orgs: SwitcherOrg[];
  currentSlug?: string;
  variant?: "sidebar" | "light";
  label?: string;
  placeholder?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = orgs.find((o) => o.slug === currentSlug);
  const isAdminList = orgs.some((o) => !o.member);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? orgs.filter((o) => o.name.toLowerCase().includes(t) || o.slug.includes(t)) : orgs;
  }, [orgs, q]);

  if (orgs.length <= 1 && current) {
    return (
      <div className={cn("min-w-0 rounded-lg px-3 py-2", variant === "sidebar" ? "bg-sidebar-accent/60" : "")}>
        <p className={cn("text-xs", variant === "sidebar" ? "text-sidebar-foreground/60" : "text-muted-foreground")}>{label}</p>
        <p className={cn("truncate text-sm font-semibold", variant === "sidebar" && "text-sidebar-accent-foreground")}>{current.name}</p>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
      <DialogTrigger
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          variant === "sidebar" ? "bg-sidebar-accent/60 hover:bg-sidebar-accent" : "border border-border bg-card hover:bg-muted",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block text-xs", variant === "sidebar" ? "text-sidebar-foreground/60" : "text-muted-foreground")}>{label}</span>
          <span className={cn("block truncate text-sm font-semibold", variant === "sidebar" && "text-sidebar-accent-foreground")}>
            {current?.name ?? placeholder}
          </span>
        </span>
        <ChevronsUpDown className={cn("size-4 shrink-0", variant === "sidebar" ? "text-sidebar-foreground/60" : "text-muted-foreground")} aria-hidden />
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isAdminList ? "Cambiar de comercio" : "Tus comercios"}</DialogTitle>
        </DialogHeader>
        <label className="relative block">
          <span className="sr-only">Buscar comercio</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre…"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <ul className="-mx-2 max-h-[55dvh] overflow-y-auto" aria-label="Comercios">
          {filtered.map((o) => (
            <li key={o.id}>
              <Link
                href={targetHref(pathname, o.slug)}
                onClick={() => setOpen(false)}
                aria-current={o.slug === currentSlug ? "page" : undefined}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                  {o.member ? <Store className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{o.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {STATUS[o.status] ?? o.status}{!o.member ? " · ver como equipo Teo" : ""}
                  </span>
                </span>
                {o.slug === currentSlug && <Check className="size-4 shrink-0" aria-hidden />}
              </Link>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">Sin resultados.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
