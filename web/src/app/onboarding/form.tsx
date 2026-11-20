"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganization } from "./actions";

const RUBROS = ["Comida y bebidas", "Ropa y accesorios", "Tecnología", "Belleza y cuidado personal", "Hogar", "Servicios", "Otro"];

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createOrganization, {});
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre de tu negocio</Label>
        <Input id="name" name="name" required minLength={2} maxLength={120} placeholder="Ej. Café Ñandú" className="h-11" />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">¿A qué se dedica?</legend>
        <div className="flex flex-wrap gap-2">
          {RUBROS.map((r) => (
            <label key={r} className="cursor-pointer">
              <input type="radio" name="rubro" value={r} className="peer sr-only" />
              <span className="inline-block rounded-full border border-border px-3 py-1.5 text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:bg-muted">
                {r}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
      <Button type="submit" variant="cta" className="h-11 w-full text-base" disabled={pending}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
        Crear mi comercio
      </Button>
    </form>
  );
}
