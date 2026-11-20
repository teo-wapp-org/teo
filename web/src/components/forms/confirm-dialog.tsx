"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Botón que pide confirmación antes de una acción destructiva. */
export function ConfirmButton({
  trigger,
  title,
  description,
  confirmLabel = "Eliminar",
  onConfirm,
  disabled,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => Promise<boolean | void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} disabled={disabled} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const ok = await onConfirm();
                if (ok !== false) setOpen(false);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
