"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, ShieldCheck, Trash2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { CopyField } from "@/components/admin/copy-field";
import { ConfirmButton } from "@/components/forms/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteSecret, saveSecret } from "@/app/admin/configuracion/actions";
import { randomToken } from "@/lib/admin/labels";
import { timeAgo } from "@/lib/format";
import type { SecretMeta, SecretName } from "@/lib/schemas/admin";

/**
 * Secreto de plataforma (vive en Vault). Muestra solo si está configurado y sus últimos 4 caracteres.
 * Nunca precarga ni muestra el valor guardado: el campo sirve solo para reemplazarlo.
 */
export function SecretField({
  name,
  label,
  description,
  meta,
  canEdit,
  generate = false,
}: {
  name: SecretName;
  label: string;
  description?: React.ReactNode;
  meta: SecretMeta;
  canEdit: boolean;
  generate?: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputId = `secret-${name}`;
  const statusId = `${inputId}-status`;

  const save = (v: string, onOk?: () => void) =>
    start(async () => {
      const r = await saveSecret(name, v);
      if (r.ok) {
        setValue("");
        setError(null);
        toast.success(r.message ?? "Secreto guardado");
        onOk?.();
      } else {
        setError(r.fieldErrors?.value ?? r.error ?? "No pudimos guardar el secreto.");
        toast.error(r.error ?? "No pudimos guardar el secreto.");
      }
    });

  return (
    <div className="space-y-3 rounded-xl border border-border p-4" data-testid={`secret-${name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4" aria-hidden /> {label}
          </p>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
        <p id={statusId} className="text-xs" suppressHydrationWarning>
          {meta ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-medium text-secondary-foreground">
              <ShieldCheck className="size-3.5" aria-hidden />
              Configurado <span className="font-mono">••••{meta.last4}</span>
              <span className="font-normal opacity-80">· actualizado {timeAgo(meta.updated_at)}</span>
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">No configurado</span>
          )}
        </p>
      </div>

      {generated && (
        <div role="alert" className="space-y-2 rounded-lg border border-cta/40 bg-cta/10 p-3">
          <CopyField id={`${inputId}-generated`} label="Token generado" value={generated} hint="Cópialo ahora y pégalo en Meta. Por seguridad no lo volverás a ver." />
          <Button type="button" size="sm" variant="ghost" onClick={() => setGenerated(null)}>
            Ya lo copié
          </Button>
        </div>
      )}

      {canEdit && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) save(value);
          }}
        >
          <label htmlFor={inputId} className="block text-sm font-medium">
            {meta ? "Reemplazar valor" : "Valor"}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={inputId}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={value}
              disabled={pending}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder={meta ? "Pega el nuevo valor para reemplazarlo" : "Pega el valor aquí"}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${inputId}-error` : statusId}
              className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 font-mono text-base outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
            />
            <div className="flex shrink-0 gap-2">
              <Button type="submit" className="h-10" disabled={pending || !value.trim()}>
                {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Guardar
              </Button>
              {generate && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={pending}
                  onClick={() => {
                    const t = randomToken(32);
                    save(t, () => setGenerated(t));
                  }}
                >
                  <WandSparkles aria-hidden data-icon="inline-start" /> Generar
                </Button>
              )}
              {meta && (
                <ConfirmButton
                  title={`¿Eliminar ${label}?`}
                  description="Las funciones que lo usan dejarán de funcionar hasta que guardes uno nuevo."
                  confirmLabel="Eliminar"
                  onConfirm={async () => {
                    const r = await deleteSecret(name);
                    if (r.ok) toast.success(r.message ?? "Secreto eliminado");
                    else toast.error(r.error ?? "No pudimos eliminarlo");
                    return r.ok;
                  }}
                  trigger={
                    <Button type="button" variant="destructive" className="h-10" disabled={pending}>
                      <Trash2 aria-hidden data-icon="inline-start" /> Eliminar
                    </Button>
                  }
                />
              )}
            </div>
          </div>
          {error && (
            <p id={`${inputId}-error`} role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
