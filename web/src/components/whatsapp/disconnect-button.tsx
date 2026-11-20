"use client";

import { useActionState, useState } from "react";
import { Loader2, Unplug } from "lucide-react";
import { disconnectWhatsapp, type WaActionState } from "@/app/app/[org]/configuracion/whatsapp/actions";
import { Button } from "@/components/ui/button";

export function DisconnectButton({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<WaActionState, FormData>(disconnectWhatsapp, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
        <Unplug data-icon="inline-start" />
        Desconectar
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <p className="text-sm">Teo dejará de responder en este número. ¿Seguro?</p>
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
        Sí, desconectar
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
        Cancelar
      </Button>
      {state.error && <p role="alert" className="w-full text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
