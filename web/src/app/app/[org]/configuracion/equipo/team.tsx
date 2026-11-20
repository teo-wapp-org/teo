"use client";

import { useRef, useTransition } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/forms/confirm-dialog";
import { Field, NativeSelect, Section, TextInput } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import type { OrgRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/schemas/contexto";
import { changeMemberRole, inviteMember, removeMember } from "../actions";

export type Member = { userId: string; role: OrgRole; name: string; email: string };

const ROLE_HELP: Record<OrgRole, string> = {
  owner: "Todo, incluido el plan y el equipo.",
  admin: "Configura el negocio, Teo, tiendas y catálogo.",
  operador: "Atiende conversaciones y confirma pagos.",
};

export function Team({
  slug,
  members,
  meId,
  myRole,
  canEdit,
  maxUsers,
  planName,
}: {
  slug: string;
  members: Member[];
  meId: string;
  myRole: OrgRole | null;
  canEdit: boolean;
  maxUsers: number | null;
  planName: string;
}) {
  const [busy, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, onSubmit, errors, field } = useFormAction(inviteMember, { onSuccess: () => formRef.current?.reset(), idPrefix: "inv-" });
  const owners = members.filter((m) => m.role === "owner").length;
  const full = maxUsers != null && members.length >= maxUsers;
  const roleOptions = (Object.keys(ROLE_LABELS) as OrgRole[]).filter((r) => r !== "owner" || myRole === "owner");

  return (
    <div className="space-y-6">
      <Section title="Tu equipo" description={maxUsers != null ? `${members.length} de ${maxUsers} usuarios en tu plan ${planName}.` : `${members.length} usuarios.`}>
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Miembros del equipo">
          {members.map((m) => {
            const isMe = m.userId === meId;
            const lastOwner = m.role === "owner" && owners <= 1;
            const canTouch = canEdit && !lastOwner && (m.role !== "owner" || myRole === "owner");
            return (
              <li key={m.userId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.name || m.email.split("@")[0]} {isMe && <span className="text-muted-foreground">(tú)</span>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canTouch ? (
                    <>
                      <label className="sr-only" htmlFor={`role-${m.userId}`}>{`Rol de ${m.email}`}</label>
                      <NativeSelect
                        id={`role-${m.userId}`}
                        className="h-9 w-40"
                        value={m.role}
                        disabled={busy}
                        onChange={(e) =>
                          start(async () => {
                            const r = await changeMemberRole(slug, m.userId, e.target.value);
                            if (r.ok && r.message) toast.success(r.message);
                            else if (!r.ok) toast.error(r.error);
                          })
                        }
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </NativeSelect>
                      <ConfirmButton
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={`Quitar a ${m.email}`}>
                            <Trash2 aria-hidden />
                          </Button>
                        }
                        title={isMe ? "¿Salir de este comercio?" : `¿Quitar a ${m.name || m.email}?`}
                        description={isMe ? "Perderás el acceso a este panel." : "Ya no podrá entrar al panel de este comercio."}
                        confirmLabel={isMe ? "Salir" : "Quitar"}
                        onConfirm={async () => {
                          const r = await removeMember(slug, m.userId);
                          if (r?.ok) toast.success(r.message);
                          else if (r) toast.error(r.error);
                          return r?.ok;
                        }}
                      />
                    </>
                  ) : (
                    <Badge variant={m.role === "owner" ? "default" : "secondary"}>{ROLE_LABELS[m.role]}</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          {(Object.keys(ROLE_HELP) as OrgRole[]).map((r) => (
            <div key={r}>
              <dt className="font-semibold text-foreground">{ROLE_LABELS[r]}</dt>
              <dd>{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {canEdit && (
        <Section title="Invitar a alguien" description="La persona debe tener una cuenta en Teo. Si aún no la tiene, pídele que se registre primero.">
          {full ? (
            <p role="status" className="rounded-xl bg-warning/15 px-4 py-3 text-sm">
              Llegaste al límite de {maxUsers} usuarios de tu plan {planName}. Sube de plan para sumar más personas.
            </p>
          ) : (
            <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start" aria-label="Invitar al equipo">
              <input type="hidden" name="slug" value={slug} />
              <Field htmlFor="inv-email" label="Correo" error={errors.email} className="flex-1">
                <TextInput {...field("email")} type="email" autoComplete="off" placeholder="nombre@correo.com" required />
              </Field>
              <Field htmlFor="inv-role" label="Rol" error={errors.role} className="sm:w-44">
                <NativeSelect {...field("role")} defaultValue="operador">
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Button type="submit" variant="cta" className="h-10 sm:mt-6" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <UserPlus aria-hidden data-icon="inline-start" />}
                Agregar
              </Button>
            </form>
          )}
        </Section>
      )}
    </div>
  );
}
