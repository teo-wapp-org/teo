"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { connectWhatsappManual, type WaActionState } from "@/app/app/[org]/configuracion/whatsapp/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ManualConnectForm({ slug, defaultPhoneNumberId, defaultWabaId }: { slug: string; defaultPhoneNumberId?: string; defaultWabaId?: string }) {
  const [state, action, pending] = useActionState<WaActionState, FormData>(connectWhatsappManual, {});
  return (
    <form action={action} className="space-y-4" aria-label="Conexión manual">
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone_number_id">Phone number ID</Label>
          <Input id="phone_number_id" name="phone_number_id" inputMode="numeric" required pattern="[0-9]{5,30}" defaultValue={defaultPhoneNumberId} placeholder="Ej. 109876543210987" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="waba_id">WhatsApp Business Account ID</Label>
          <Input id="waba_id" name="waba_id" inputMode="numeric" required pattern="[0-9]{5,30}" defaultValue={defaultWabaId} placeholder="Ej. 102345678901234" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="access_token">Token de acceso</Label>
        <Input id="access_token" name="access_token" type="password" required minLength={20} autoComplete="off" spellCheck={false} placeholder="EAAG…" />
        <p className="text-xs text-muted-foreground">Se guarda cifrado en la bóveda de Teo y no se vuelve a mostrar.</p>
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
      {state.warning && <p role="status" className="rounded-lg bg-warning/20 px-3 py-2 text-sm">{state.warning}</p>}
      {state.ok && !state.warning && <p role="status" className="rounded-lg bg-success/15 px-3 py-2 text-sm">¡Listo! Tu número quedó conectado.</p>}
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
        Guardar conexión
      </Button>
    </form>
  );
}
