"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Banknote, Landmark, Link2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmButton } from "@/components/forms/confirm-dialog";
import { EmptyState, Field, NativeSelect, Switch, Textarea, TextInput } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import type { ActionState } from "@/lib/action-state";
import { deletePaymentMethod, movePaymentMethod, savePaymentMethod, setPaymentMethodActive } from "../actions";

export type PaymentMethodRow = {
  id: string;
  type: "transferencia" | "efectivo" | "link" | "otro";
  label: string;
  instructions: string;
  active: boolean;
  details: Record<string, string>;
};

const TYPE_LABEL: Record<PaymentMethodRow["type"], string> = { transferencia: "Transferencia", efectivo: "Efectivo", link: "Link de pago", otro: "Otro" };
const TYPE_ICON = { transferencia: Landmark, efectivo: Banknote, link: Link2, otro: Banknote } as const;

function summary(r: PaymentMethodRow) {
  const d = r.details;
  if (r.type === "transferencia") return [d.banco, d.tipo_cuenta && `Cuenta de ${d.tipo_cuenta}`, d.numero && `N.º ${d.numero}`, d.titular].filter(Boolean).join(" · ");
  if (r.type === "link") return d.url ?? "";
  return d.notas ?? "";
}

export function PaymentMethods({ slug, rows, canEdit }: { slug: string; rows: PaymentMethodRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<PaymentMethodRow | "new" | null>(null);
  const [busy, start] = useTransition();

  const run = (p: Promise<ActionState>) =>
    start(async () => {
      const r = await p;
      if (r.ok && r.message) toast.success(r.message);
      else if (!r.ok && r.error) toast.error(r.error);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Formas de pago</h2>
          <p className="text-sm text-muted-foreground">Teo las comparte con tus clientes cuando están listos para pagar.</p>
        </div>
        {canEdit && rows.length > 0 && (
          <Button variant="cta" onClick={() => setEditing("new")}>
            <Plus aria-hidden data-icon="inline-start" /> Agregar forma de pago
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Aún no tienes formas de pago"
          action={
            canEdit && (
              <Button variant="cta" onClick={() => setEditing("new")}>
                <Plus aria-hidden data-icon="inline-start" /> Agregar forma de pago
              </Button>
            )
          }
        >
          Agrega tu cuenta para transferencias, pago en efectivo o un link de pago. Teo se las enviará a tus clientes.
        </EmptyState>
      ) : (
        <ul className="space-y-3" aria-label="Formas de pago" aria-busy={busy}>
          {rows.map((r, i) => {
            const Icon = TYPE_ICON[r.type];
            return (
              <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{r.label}</h3>
                      <Badge variant="outline">{TYPE_LABEL[r.type]}</Badge>
                      {!r.active && <Badge variant="secondary">Inactiva</Badge>}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{summary(r) || "Sin detalles"}</p>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-1">
                    <label className="mr-2 flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        role="switch"
                        className="size-4 accent-primary"
                        checked={r.active}
                        disabled={busy}
                        onChange={(e) => run(setPaymentMethodActive(slug, r.id, e.target.checked))}
                        aria-label={`Activa: ${r.label}`}
                      />
                      Activa
                    </label>
                    <Button variant="ghost" size="icon" disabled={busy || i === 0} onClick={() => run(movePaymentMethod(slug, r.id, "up"))} aria-label={`Subir ${r.label}`}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={busy || i === rows.length - 1} onClick={() => run(movePaymentMethod(slug, r.id, "down"))} aria-label={`Bajar ${r.label}`}>
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)} aria-label={`Editar ${r.label}`}>
                      <Pencil aria-hidden />
                    </Button>
                    <ConfirmButton
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Eliminar ${r.label}`}>
                          <Trash2 aria-hidden />
                        </Button>
                      }
                      title={`¿Eliminar “${r.label}”?`}
                      description="Teo dejará de ofrecerla a tus clientes."
                      onConfirm={async () => {
                        const res = await deletePaymentMethod(slug, r.id);
                        if (res.ok) toast.success(res.message);
                        else toast.error(res.error);
                        return res.ok;
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nueva forma de pago" : "Editar forma de pago"}</DialogTitle>
            <DialogDescription>Revisa bien los datos: Teo los enviará tal cual.</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <PaymentForm key={editing === "new" ? "new" : editing.id} slug={slug} row={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentForm({ slug, row, onDone }: { slug: string; row: PaymentMethodRow | null; onDone: () => void }) {
  const { pending, onSubmit, errors, field } = useFormAction(savePaymentMethod, { onSuccess: onDone, idPrefix: "pm-" });
  const [type, setType] = useState<PaymentMethodRow["type"]>(row?.type ?? "transferencia");
  const d = row?.details ?? {};

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Forma de pago">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="id" value={row?.id ?? ""} />
      <fieldset disabled={pending} className="space-y-4">
        <Field htmlFor="pm-type" label="Tipo" error={errors.type}>
          <NativeSelect {...field("type")} value={type} onChange={(e) => setType(e.target.value as PaymentMethodRow["type"])}>
            <option value="transferencia">Transferencia bancaria</option>
            <option value="efectivo">Efectivo</option>
            <option value="link">Link de pago</option>
          </NativeSelect>
        </Field>
        <Field htmlFor="pm-label" label="Nombre" hint="Así la verán tus clientes." error={errors.label}>
          <TextInput {...field("label")} defaultValue={row?.label} maxLength={80} placeholder={type === "transferencia" ? "Ej. Transferencia Banco Pichincha" : type === "link" ? "Ej. Pago con tarjeta" : "Ej. Efectivo contra entrega"} />
        </Field>

        {type === "transferencia" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="pm-banco" label="Banco" error={errors.banco}>
              <TextInput {...field("banco")} defaultValue={d.banco} maxLength={80} />
            </Field>
            <Field htmlFor="pm-tipo_cuenta" label="Tipo de cuenta" error={errors.tipo_cuenta}>
              <NativeSelect {...field("tipo_cuenta")} defaultValue={d.tipo_cuenta ?? "ahorros"}>
                <option value="ahorros">Ahorros</option>
                <option value="corriente">Corriente</option>
              </NativeSelect>
            </Field>
            <Field htmlFor="pm-numero" label="Número de cuenta" error={errors.numero}>
              <TextInput {...field("numero")} defaultValue={d.numero} inputMode="numeric" maxLength={40} />
            </Field>
            <Field htmlFor="pm-titular" label="Titular" error={errors.titular}>
              <TextInput {...field("titular")} defaultValue={d.titular} maxLength={120} />
            </Field>
            <Field htmlFor="pm-identificacion" label="Cédula o RUC" error={errors.identificacion}>
              <TextInput {...field("identificacion")} defaultValue={d.identificacion} inputMode="numeric" maxLength={20} />
            </Field>
            <Field htmlFor="pm-email" label="Correo (opcional)" error={errors.email}>
              <TextInput {...field("email")} type="email" defaultValue={d.email} maxLength={120} />
            </Field>
          </div>
        )}
        {type === "efectivo" && (
          <Field htmlFor="pm-notas" label="Notas" hint="Ej. Solo contra entrega en Quito. Ten el valor exacto." error={errors.notas}>
            <Textarea {...field("notas")} defaultValue={d.notas} maxLength={500} />
          </Field>
        )}
        {type === "link" && (
          <Field htmlFor="pm-url" label="Enlace de pago" error={errors.url}>
            <TextInput {...field("url")} type="url" defaultValue={d.url} placeholder="https://" />
          </Field>
        )}

        <Field htmlFor="pm-instructions" label="Instrucciones para el cliente" hint="Ej. Envía la foto del comprobante por este chat." error={errors.instructions}>
          <Textarea {...field("instructions")} defaultValue={row?.instructions} maxLength={1000} rows={2} />
        </Field>
        <Switch id="pm-active" name="active" defaultChecked={row?.active ?? true} label="Activa" description="Si la desactivas, Teo no la ofrece." />
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="cta" disabled={pending}>
          {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
          Guardar
        </Button>
      </div>
    </form>
  );
}
