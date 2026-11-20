"use client";

import { useState } from "react";
import { Bot, Loader2, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipsInput } from "@/components/forms/chips-input";
import { Field, Section, Switch, Textarea, TextInput } from "@/components/forms/fields";
import { HoursEditor } from "@/components/forms/hours-editor";
import { useFormAction } from "@/components/forms/use-form-action";
import { DAYS, hasAnyHours, type WeekHours } from "@/lib/hours";
import { cn } from "@/lib/utils";
import { saveAgentSettings } from "../actions";

type Initial = {
  enabled: boolean;
  mode: "piloto" | "copiloto";
  display_name: string;
  greeting: string;
  out_of_hours_message: string;
  business_hours: WeekHours;
  escalation_keywords: string[];
  escalation_amount_usd: string;
  payment_expiry_hours: number;
  extra_instructions: string;
};

const MODES = [
  {
    value: "piloto",
    title: "Piloto automático",
    icon: <Bot className="size-5" aria-hidden />,
    text: "Teo responde solo a tus clientes y te pasa la conversación cuando hace falta una persona.",
  },
  {
    value: "copiloto",
    title: "Copiloto",
    icon: <UserRoundCheck className="size-5" aria-hidden />,
    text: "Teo no envía nada: te sugiere respuestas y tú decides si las mandas. Ideal para tu primera semana.",
  },
] as const;

const WEEKDAYS: WeekHours = Object.fromEntries(DAYS.map((d) => [d, d === "dom" ? [] : d === "sab" ? [{ open: "09:00", close: "13:00" }] : [{ open: "09:00", close: "18:00" }]]));

export function AgentForm({ slug, initial, canEdit }: { slug: string; initial: Initial; canEdit: boolean }) {
  const { pending, onSubmit, errors, field } = useFormAction(saveAgentSettings);
  const [mode, setMode] = useState(initial.mode);
  const [always, setAlways] = useState(!hasAnyHours(initial.business_hours));
  const [hours, setHours] = useState<WeekHours>(hasAnyHours(initial.business_hours) ? initial.business_hours : WEEKDAYS);
  const [keywords, setKeywords] = useState(initial.escalation_keywords);

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Configuración de Teo">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="business_hours" value={JSON.stringify(always ? {} : hours)} />
      <input type="hidden" name="escalation_keywords" value={JSON.stringify(keywords)} />
      <fieldset disabled={!canEdit || pending} className="space-y-6">
        <Section title="Estado" description="Pausa a Teo cuando quieras atender tú directamente.">
          <Switch id="enabled" name="enabled" defaultChecked={initial.enabled} label="Teo está activo" description="Si lo apagas, Teo no responde ni sugiere mensajes." />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Modo de trabajo</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODES.map((m) => (
                <label
                  key={m.value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    mode === m.value ? "border-primary bg-secondary/40" : "border-border hover:bg-muted",
                  )}
                >
                  <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="sr-only" />
                  <span className="mt-0.5 shrink-0">{m.icon}</span>
                  <span className="space-y-1">
                    <span className="block font-semibold">{m.title}</span>
                    <span className="block text-sm text-muted-foreground">{m.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </Section>

        <Section title="Presentación" description="Lo primero que leen tus clientes.">
          <Field htmlFor="display_name" label="Nombre visible" hint="Cómo se presenta el asistente. Ej. Teo, Sofi, Asistente de Café Ñandú." error={errors.display_name}>
            <TextInput {...field("display_name")} defaultValue={initial.display_name} maxLength={40} required />
          </Field>
          <Field htmlFor="greeting" label="Saludo" error={errors.greeting}>
            <Textarea {...field("greeting")} defaultValue={initial.greeting} maxLength={500} rows={2} placeholder="Ej. ¡Hola! Soy Sofi de Café Ñandú. ¿En qué te ayudo hoy?" />
          </Field>
        </Section>

        <Section title="Horario de atención" description="Fuera de este horario, Teo responde con tu mensaje de fuera de horario.">
          <Switch
            id="always"
            checked={always}
            onChange={(e) => setAlways(e.target.checked)}
            label="Atender las 24 horas"
            description="Teo responde a cualquier hora, todos los días."
          />
          {!always && <HoursEditor idPrefix="teo" value={hours} onChange={setHours} disabled={!canEdit || pending} />}
          {errors.business_hours && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.business_hours}
            </p>
          )}
          <Field htmlFor="out_of_hours_message" label="Mensaje fuera de horario" error={errors.out_of_hours_message}>
            <Textarea
              {...field("out_of_hours_message")}
              defaultValue={initial.out_of_hours_message}
              maxLength={500}
              rows={2}
              placeholder="Ej. ¡Gracias por escribirnos! Te respondemos mañana desde las 9:00."
            />
          </Field>
        </Section>

        <Section title="Cuándo pasar a una persona" description="Teo te avisa y deja la conversación en tus manos.">
          <Field htmlFor="keywords" label="Palabras clave" hint="Escribe una palabra y presiona Enter. Ej. humano, reclamo, factura." error={errors.escalation_keywords}>
            <ChipsInput id="keywords" value={keywords} onChange={setKeywords} disabled={!canEdit || pending} placeholder="Agregar palabra" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="escalation_amount_usd" label="Pedidos desde (USD)" hint="Si un pedido supera este monto, te avisamos. Déjalo vacío para no usarlo." error={errors.escalation_amount_usd}>
              <TextInput {...field("escalation_amount_usd")} defaultValue={initial.escalation_amount_usd} inputMode="decimal" placeholder="Ej. 200" />
            </Field>
            <Field htmlFor="payment_expiry_hours" label="Horas para pagar" hint="Tiempo que espera Teo el pago antes de cerrar el pedido." error={errors.payment_expiry_hours}>
              <TextInput {...field("payment_expiry_hours")} type="number" min={1} max={720} defaultValue={initial.payment_expiry_hours} />
            </Field>
          </div>
        </Section>

        <Section title="Instrucciones extra" description="Detalles que Teo debe tener en cuenta siempre.">
          <Field htmlFor="extra_instructions" label="Instrucciones" error={errors.extra_instructions}>
            <Textarea {...field("extra_instructions")} defaultValue={initial.extra_instructions} maxLength={2000} rows={4} placeholder="Ej. Ofrece siempre la torta del mes. No prometas entregas el mismo día." />
          </Field>
        </Section>

        {canEdit && (
          <div className="sticky bottom-16 z-10 flex justify-end md:bottom-4">
            <Button type="submit" variant="cta" size="lg" className="h-11 px-6 text-base shadow-md">
              {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Guardar cambios
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
