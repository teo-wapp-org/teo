"use client";

import { useRef, useTransition } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/forms/confirm-dialog";
import { Field, NativeSelect, Section, TextInput } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { PLATFORM_ROLE_LABELS, PLATFORM_ROLES } from "@/lib/schemas/admin";
import { addTeamMember, changeTeamRole, removeTeamMember } from "./actions";

export type TeamRow = { user_id: string; email: string; full_name: string | null; role: "superadmin" | "soporte"; created_at: string };

export function AddMemberForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, onSubmit, errors, field } = useFormAction(addTeamMember, { idPrefix: "team-", onSuccess: () => formRef.current?.reset() });
  return (
    <Section title="Agregar al equipo" description="La persona debe tener una cuenta en Teo. Si no la tiene, pídele que se registre primero.">
      <form ref={formRef} onSubmit={onSubmit} noValidate aria-label="Agregar al equipo Teo" className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-start">
        <Field htmlFor="team-email" label="Correo" error={errors.email}>
          <TextInput {...field("email")} type="email" autoComplete="off" placeholder="persona@teo.ec" required />
        </Field>
        <Field htmlFor="team-role" label="Rol" error={errors.role}>
          <NativeSelect {...field("role")} defaultValue="soporte">
            {PLATFORM_ROLES.map((r) => (
              <option key={r} value={r}>
                {PLATFORM_ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit" className="h-10 sm:mt-6.5" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <UserPlus aria-hidden data-icon="inline-start" />}
          Agregar
        </Button>
      </form>
    </Section>
  );
}

export function TeamList({ rows, meId, canEdit }: { rows: TeamRow[]; meId: string; canEdit: boolean }) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Equipo Teo">
      {rows.map((r) => {
        const me = r.user_id === meId;
        return (
          <li key={r.user_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-testid="team-row">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {r.full_name || r.email}
                {me && <Badge variant="secondary" className="ml-2">Tú</Badge>}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {r.email} · desde {formatDate(r.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={`role-${r.user_id}`} className="sr-only">
                Rol de {r.email}
              </label>
              <NativeSelect
                id={`role-${r.user_id}`}
                className="h-9 w-auto"
                value={r.role}
                disabled={!canEdit || me || pending}
                onChange={(e) =>
                  start(async () => {
                    const res = await changeTeamRole({ userId: r.user_id, email: r.email, role: e.target.value });
                    if (res.ok) toast.success(res.message ?? "Rol actualizado");
                    else toast.error(res.error ?? "No pudimos cambiar el rol");
                  })
                }
              >
                {PLATFORM_ROLES.map((x) => (
                  <option key={x} value={x}>
                    {PLATFORM_ROLE_LABELS[x]}
                  </option>
                ))}
              </NativeSelect>
              {canEdit && !me && (
                <ConfirmButton
                  title={`¿Quitar a ${r.email} del equipo Teo?`}
                  description="Perderá el acceso al panel de administración. Su cuenta y sus comercios no se borran."
                  confirmLabel="Quitar"
                  onConfirm={async () => {
                    const res = await removeTeamMember(r.user_id);
                    if (res.ok) toast.success(res.message ?? "Listo");
                    else toast.error(res.error ?? "No pudimos quitarlo");
                    return res.ok;
                  }}
                  trigger={
                    <Button variant="destructive" size="icon" aria-label={`Quitar a ${r.email}`}>
                      <Trash2 aria-hidden />
                    </Button>
                  }
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
