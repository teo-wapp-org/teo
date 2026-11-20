"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/forms/confirm-dialog";
import { deleteStore } from "./actions";

export function DeleteStoreButton({ slug, id, name }: { slug: string; id: string; name: string }) {
  return (
    <ConfirmButton
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Eliminar ${name}`}>
          <Trash2 aria-hidden />
        </Button>
      }
      title={`¿Eliminar “${name}”?`}
      description="Teo dejará de mencionarla a tus clientes. Si solo cierra por un tiempo, mejor desactívala."
      onConfirm={async () => {
        const r = await deleteStore(slug, id);
        if (r.ok) toast.success(r.message);
        else toast.error(r.error);
        return r.ok;
      }}
    />
  );
}
