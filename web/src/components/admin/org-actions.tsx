"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Ban, Bot, BotOff, CircleCheck, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/forms/confirm-dialog";
import { Field, NativeSelect, TextInput } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { resetUsage, setAgentEnabled, setOrgStatus, updateSubscription } from "@/app/admin/actions";
import type { ActionState } from "@/lib/action-state";
import { ORG_STATUS_LABELS, SUBSCRIPTION_LABELS, SUBSCRIPTION_STATUSES, toDateInput } from "@/lib/schemas/admin";

const report = (r: ActionState) => {
  if (r.ok) toast.success(r.message ?? "Listo");
  else toast.error(r.error ?? "No pudimos completar la acción");
  return !!r.ok;
};

export function OrgStatusButton({ orgId, name, status, size = "default" }: { orgId: string; name: string; status: string; size?: "default" | "sm" }) {
  const suspended = status === "suspendido";
  return (
    <ConfirmButton
      title={suspended ? `¿Reactivar ${name}?` : `¿Suspender ${name}?`}
      description={
        suspended
          ? "El comercio vuelve a entrar a su panel y Teo puede responder de nuevo."
          : "El comercio no podrá usar su panel y Teo dejará de responder a sus clientes hasta que lo reactives."
      }
      confirmLabel={suspended ? "Reactivar" : "Suspender"}
      confirmVariant={suspended ? "default" : "destructive"}
      onConfirm={async () => report(await setOrgStatus({ orgId, status: suspended ? "activo" : "suspendido" }))}
      trigger={
        <Button size={size} variant={suspended ? "outline" : "destructive"}>
          {suspended ? <CircleCheck aria-hidden data-icon="inline-start" /> : <Ban aria-hidden data-icon="inline-start" />}
          {suspended ? "Reactivar" : "Suspender"}
        </Button>
      }
    />
  );
}

export function AgentToggleButton({ orgId, enabled }: { orgId: string; enabled: boolean }) {
  return (
    <ConfirmButton
      title={enabled ? "¿Pausar a Teo en este comercio?" : "¿Activar a Teo en este comercio?"}
      description={enabled ? "Teo dejará de responder y de sugerir mensajes hasta que lo actives." : "Teo vuelve a atender a los clientes según el modo configurado por el comercio."}
      confirmLabel={enabled ? "Pausar" : "Activar"}
      confirmVariant={enabled ? "destructive" : "default"}
      onConfirm={async () => report(await setAgentEnabled(orgId, !enabled))}
      trigger={
        <Button variant="outline">
          {enabled ? <BotOff aria-hidden data-icon="inline-start" /> : <Bot aria-hidden data-icon="inline-start" />}
          {enabled ? "Pausar a Teo" : "Activar a Teo"}
        </Button>
      }
    />
  );
}

export function ResetUsageButton({ orgId }: { orgId: string }) {
  return (
    <ConfirmButton
      title="¿Reiniciar el uso del mes?"
      description="El contador de mensajes de Teo de este período vuelve a cero. Queda registrado en la auditoría."
      confirmLabel="Reiniciar uso"
      confirmVariant="default"
      onConfirm={async () => report(await resetUsage(orgId))}
      trigger={
        <Button variant="outline">
          <RotateCcw aria-hidden data-icon="inline-start" /> Reiniciar uso
        </Button>
      }
    />
  );
}

export function SubscriptionForm({
  orgId,
  plans,
  current,
}: {
  orgId: string;
  plans: { id: string; name: string; active: boolean }[];
  current: { plan_id: string; status: string; trial_ends_at: string | null; current_period_end: string | null } | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(current?.status ?? "trial");
  const err = (k: string) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `sub-${k}-error` } : {});
  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} aria-label="Suscripción" className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="sub-plan" label="Plan" error={errors.plan}>
          <NativeSelect id="sub-plan" name="plan" defaultValue={current?.plan_id ?? plans[0]?.id} {...err("plan")}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.active ? "" : " (inactivo)"}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field htmlFor="sub-status" label="Estado" error={errors.status}>
          <NativeSelect id="sub-status" name="status" value={status} onChange={(e) => setStatus(e.target.value)} {...err("status")}>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUBSCRIPTION_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field htmlFor="sub-trial_ends_at" label="Prueba hasta" hint={status === "trial" ? "Para extender la prueba, elige una fecha posterior." : "Solo aplica en estado “En prueba”."} error={errors.trial_ends_at}>
          <TextInput id="sub-trial_ends_at" name="trial_ends_at" type="date" defaultValue={toDateInput(current?.trial_ends_at)} {...err("trial_ends_at")} />
        </Field>
        <Field htmlFor="sub-period_end" label="Fin del período" hint="Vacío = se mantiene el actual." error={errors.period_end}>
          <TextInput id="sub-period_end" name="period_end" type="date" defaultValue={toDateInput(current?.current_period_end)} {...err("period_end")} />
        </Field>
      </div>
      <div className="flex justify-end">
        <ConfirmButton
          title="¿Guardar cambios de la suscripción?"
          description="El comercio verá el nuevo plan, estado y fechas de inmediato. Queda registrado en la auditoría."
          confirmLabel="Guardar"
          confirmVariant="default"
          onConfirm={async () => {
            if (!formRef.current) return false;
            const r = await updateSubscription({}, new FormData(formRef.current));
            setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
            return report(r);
          }}
          trigger={<Button>Guardar suscripción</Button>}
        />
      </div>
    </form>
  );
}

/** Búsqueda y filtros de la tabla de comercios (en la URL: ?q=&estado=&plan=). */
export function OrgFilters({ plans }: { plans: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };
  const pushRef = useRef(push);
  useEffect(() => {
    pushRef.current = push;
  });
  useEffect(() => {
    if (q === (sp.get("q") ?? "")) return;
    const t = setTimeout(() => pushRef.current({ q }), 300);
    return () => clearTimeout(t);
  }, [q, sp]);

  return (
    <div role="search" className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
      <div className="relative">
        <label htmlFor="org-q" className="sr-only">
          Buscar comercio
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <TextInput id="org-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o enlace" className="pl-9" />
      </div>
      <div>
        <label htmlFor="org-estado" className="sr-only">
          Estado
        </label>
        <NativeSelect id="org-estado" value={sp.get("estado") ?? ""} onChange={(e) => push({ estado: e.target.value })}>
          <option value="">Todos los estados</option>
          {Object.entries(ORG_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div>
        <label htmlFor="org-plan" className="sr-only">
          Plan
        </label>
        <NativeSelect id="org-plan" value={sp.get("plan") ?? ""} onChange={(e) => push({ plan: e.target.value })}>
          <option value="">Todos los planes</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
