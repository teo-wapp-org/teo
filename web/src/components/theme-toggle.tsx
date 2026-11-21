"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

const subscribe = () => () => {};

/** Selector Claro / Oscuro / Sistema. `tone="sidebar"` para fondos azul Teo. */
export function ThemeToggle({ tone = "default", className }: { tone?: "default" | "sidebar"; className?: string }) {
  const { theme, setTheme } = useTheme();
  // evita desajuste de hidratación: el tema real solo se conoce en el cliente
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const current = mounted ? (theme ?? "system") : null;

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg p-0.5",
        tone === "sidebar" ? "bg-sidebar-accent/60" : "border border-border bg-muted",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "grid size-8 cursor-pointer place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              tone === "sidebar"
                ? active ? "bg-sidebar text-sidebar-primary" : "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
                : active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
