"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceChips, Field, NativeSelect, Section, Switch, TextInput } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import {
  AI_EFFORTS,
  AI_PROVIDERS,
  EFFORT_LABELS,
  PROVIDER_LABELS,
  type AiSettings,
  type BrandingSettings,
  type EmailSettings,
  type MetaSettings,
  type PlacesSettings,
  type SettingKey,
  type SignupSettings,
} from "@/lib/schemas/admin";
import { saveSetting } from "./actions";

/** Envoltura común: campo oculto `key`, fieldset deshabilitado para soporte y botón Guardar. */
function SettingForm({
  settingKey,
  canEdit,
  label,
  children,
}: {
  settingKey: SettingKey;
  canEdit: boolean;
  label: string;
  children: (h: ReturnType<typeof useFormAction>) => React.ReactNode;
}) {
  const h = useFormAction(saveSetting, { idPrefix: `${settingKey}-` });
  return (
    <form onSubmit={h.onSubmit} noValidate aria-label={label}>
      <input type="hidden" name="key" value={settingKey} />
      <fieldset disabled={!canEdit || h.pending} className="space-y-4">
        {children(h)}
        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" variant="cta" size="lg" className="h-10 px-5">
              {h.pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Guardar cambios
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Inteligencia artificial
// ─────────────────────────────────────────────────────────────
export function AiForm({ initial, canEdit, hasKey }: { initial: AiSettings; canEdit: boolean; hasKey: boolean }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  return (
    <SettingForm settingKey="ai" canEdit={canEdit} label="Ajustes de inteligencia artificial">
      {({ field, errors }) => (
        <>
          <Section title="Interruptor general" description="Afecta a todos los comercios a la vez.">
            <Switch
              id="ai-enabled"
              name="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              label="Teo responde"
              description="Si lo apagas, Teo deja de responder en TODOS los comercios (solo sugiere respuestas)."
            />
            {!enabled && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Con el interruptor apagado ningún cliente recibe respuestas automáticas. Úsalo solo ante una emergencia.
              </p>
            )}
          </Section>

          <Section title="Modelo" description="Proveedor y modelos que usa el agente.">
            <ChoiceChips
              name="provider"
              legend="Proveedor"
              defaultValue={initial.provider}
              options={AI_PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABELS[p] }))}
            />
            {!hasKey && <p className="text-xs text-muted-foreground">Para usar Anthropic primero guarda la API key más abajo. El modo de prueba responde con textos fijos, sin costo.</p>}
            {errors.provider && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.provider}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="ai-agent_model" label="Modelo del agente" hint="El que conversa con los clientes." error={errors.agent_model}>
                <TextInput {...field("agent_model")} defaultValue={initial.agent_model} maxLength={80} spellCheck={false} />
              </Field>
              <Field htmlFor="ai-cheap_model" label="Modelo económico" hint="Para tareas cortas: resúmenes, clasificación." error={errors.cheap_model}>
                <TextInput {...field("cheap_model")} defaultValue={initial.cheap_model} maxLength={80} spellCheck={false} />
              </Field>
            </div>
            <ChoiceChips name="effort" legend="Esfuerzo de razonamiento" defaultValue={initial.effort} options={AI_EFFORTS.map((e) => ({ value: e, label: EFFORT_LABELS[e] }))} />
          </Section>

          <Section title="Límites y tiempos">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field htmlFor="ai-max_tool_iterations" label="Máx. iteraciones de herramientas" hint="Entre 1 y 20." error={errors.max_tool_iterations}>
                <TextInput {...field("max_tool_iterations")} type="number" inputMode="numeric" min={1} max={20} defaultValue={initial.max_tool_iterations} />
              </Field>
              <Field htmlFor="ai-timeout_s" label="Tiempo máximo (s)" hint="Por respuesta. Entre 5 y 300." error={errors.timeout_s}>
                <TextInput {...field("timeout_s")} type="number" inputMode="numeric" min={5} max={300} defaultValue={Math.round(initial.timeout_ms / 1000)} />
              </Field>
              <Field htmlFor="ai-debounce_seconds" label="Espera antes de responder (s)" hint="Agrupa mensajes seguidos. Entre 0 y 60." error={errors.debounce_seconds}>
                <TextInput {...field("debounce_seconds")} type="number" inputMode="numeric" min={0} max={60} defaultValue={initial.debounce_seconds} />
              </Field>
            </div>
          </Section>
        </>
      )}
    </SettingForm>
  );
}

// ─────────────────────────────────────────────────────────────
// WhatsApp / Meta
// ─────────────────────────────────────────────────────────────
export function MetaForm({ initial, canEdit }: { initial: MetaSettings; canEdit: boolean }) {
  return (
    <SettingForm settingKey="meta" canEdit={canEdit} label="Ajustes de WhatsApp y Meta">
      {({ field, errors }) => (
        <Section title="App de Meta" description="Datos públicos de la app que conecta los números de WhatsApp de los comercios.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="meta-app_id" label="App ID" hint="En developers.facebook.com → tu app → Configuración básica." error={errors.app_id}>
              <TextInput {...field("app_id")} defaultValue={initial.app_id ?? ""} inputMode="numeric" placeholder="Ej. 1234567890123456" />
            </Field>
            <Field htmlFor="meta-es_config_id" label="Config ID de Embedded Signup" hint="En Facebook Login para empresas → Configuraciones." error={errors.es_config_id}>
              <TextInput {...field("es_config_id")} defaultValue={initial.es_config_id ?? ""} inputMode="numeric" />
            </Field>
            <Field htmlFor="meta-graph_version" label="Versión de Graph API" hint="Formato v24.0" error={errors.graph_version}>
              <TextInput {...field("graph_version")} defaultValue={initial.graph_version} />
            </Field>
          </div>
          <Switch
            id="meta-manual_connection_enabled"
            name="manual_connection_enabled"
            defaultChecked={initial.manual_connection_enabled}
            label="Permitir conexión manual"
            description="Los comercios pueden pegar su token y phone number ID si Embedded Signup no está disponible."
          />
        </Section>
      )}
    </SettingForm>
  );
}

// ─────────────────────────────────────────────────────────────
// Google Places
// ─────────────────────────────────────────────────────────────
export function PlacesForm({ initial, canEdit }: { initial: PlacesSettings; canEdit: boolean }) {
  return (
    <SettingForm settingKey="places" canEdit={canEdit} label="Ajustes de Google Places">
      {() => (
        <Section title="Disponibilidad" description="Permite a los comercios traer sus datos desde su perfil de Google.">
          <Switch
            id="places-enabled"
            name="enabled"
            defaultChecked={initial.enabled}
            label="Google Places habilitado"
            description="Solo funciona si además hay una API key guardada."
          />
        </Section>
      )}
    </SettingForm>
  );
}

// ─────────────────────────────────────────────────────────────
// Registro y acceso
// ─────────────────────────────────────────────────────────────
export function SignupForm({ initial, canEdit, plans }: { initial: SignupSettings; canEdit: boolean; plans: { id: string; name: string; active: boolean }[] }) {
  return (
    <SettingForm settingKey="signup" canEdit={canEdit} label="Ajustes de registro">
      {({ field, errors }) => (
        <Section title="Registro de comercios" description="Cómo entran los comercios nuevos a Teo.">
          <Switch id="signup-enabled" name="enabled" defaultChecked={initial.enabled} label="Registro abierto" description="Si lo apagas, nadie nuevo puede crear un comercio desde la web." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="signup-trial_plan" label="Plan de prueba" hint="El plan con el que arranca cada comercio nuevo." error={errors.trial_plan}>
              <NativeSelect {...field("trial_plan")} defaultValue={initial.trial_plan}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.active ? "" : " (inactivo)"}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field htmlFor="signup-trial_days" label="Días de prueba" hint="0 = sin prueba, entra directo al plan." error={errors.trial_days}>
              <TextInput {...field("trial_days")} type="number" inputMode="numeric" min={0} max={90} defaultValue={initial.trial_days} />
            </Field>
          </div>
          <Switch
            id="signup-require_email_confirmation"
            name="require_email_confirmation"
            defaultChecked={initial.require_email_confirmation}
            label="Exigir confirmación de correo"
            description="El comercio debe confirmar su correo antes de entrar al panel."
          />
        </Section>
      )}
    </SettingForm>
  );
}

// ─────────────────────────────────────────────────────────────
// Correo
// ─────────────────────────────────────────────────────────────
export function EmailForm({ initial, canEdit }: { initial: EmailSettings; canEdit: boolean }) {
  return (
    <SettingForm settingKey="email" canEdit={canEdit} label="Ajustes de correo">
      {({ field, errors }) => (
        <Section title="Remitente" description="Así ven los comercios los correos que envía Teo.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="email-from_name" label="Nombre del remitente" error={errors.from_name}>
              <TextInput {...field("from_name")} defaultValue={initial.from_name} maxLength={60} />
            </Field>
            <Field htmlFor="email-from_email" label="Correo del remitente" hint="Debe ser de un dominio verificado en Resend." error={errors.from_email}>
              <TextInput {...field("from_email")} type="email" defaultValue={initial.from_email ?? ""} placeholder="hola@tudominio.com" />
            </Field>
          </div>
        </Section>
      )}
    </SettingForm>
  );
}

// ─────────────────────────────────────────────────────────────
// Marca y soporte
// ─────────────────────────────────────────────────────────────
export function BrandingForm({ initial, canEdit }: { initial: BrandingSettings; canEdit: boolean }) {
  return (
    <SettingForm settingKey="branding" canEdit={canEdit} label="Ajustes de marca y soporte">
      {({ field, errors }) => (
        <Section title="Soporte" description="Se muestra a los comercios cuando necesitan ayuda.">
          <Field htmlFor="branding-support_email" label="Correo de soporte" error={errors.support_email}>
            <TextInput {...field("support_email")} type="email" defaultValue={initial.support_email ?? ""} placeholder="soporte@teo.ec" />
          </Field>
        </Section>
      )}
    </SettingForm>
  );
}
