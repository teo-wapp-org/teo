"use client";

import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { testIntegration } from "@/app/admin/configuracion/actions";

/** Botón "Probar conexión" contra admin-ops/test/{target}. Muestra el resultado en línea. */
export function TestConnection({ target, label = "Probar conexión", disabled }: { target: "anthropic" | "google-places" | "meta" | "resend"; label?: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; detail: string; latency_ms?: number } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const r = await testIntegration(target);
            setResult(r);
            if (r.ok) toast.success("Conexión correcta");
            else toast.error("La prueba falló");
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <PlugZap aria-hidden data-icon="inline-start" />}
        {label}
      </Button>
      <div role="status" aria-live="polite">
        {result && (
          <p
            className={
              result.ok
                ? "flex items-start gap-2 rounded-lg border border-cta/40 bg-cta/10 px-3 py-2 text-sm text-foreground"
                : "flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            }
          >
            {result.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span>
              {result.ok ? "Funciona. " : "No funcionó. "}
              {result.detail}
              {result.latency_ms != null && <span className="text-muted-foreground"> · {result.latency_ms} ms</span>}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
