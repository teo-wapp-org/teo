"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Valor de solo lectura con botón para copiar. */
export function CopyField({ id, label, value, hint }: { id: string; label: string; value: string; hint?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 w-full min-w-0 rounded-lg border border-input bg-muted px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button
          type="button"
          variant="outline"
          className="h-10"
          aria-label={`Copiar ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              toast.success("Copiado");
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error("No pudimos copiar. Selecciónalo y cópialo a mano.");
            }
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          <span className="hidden sm:inline">{copied ? "Copiado" : "Copiar"}</span>
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
