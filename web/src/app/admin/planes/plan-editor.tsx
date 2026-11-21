"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PlanCard } from "@/components/plan-card";
import { Field, Section, Switch, TextInput } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { FEATURE_LABELS } from "@/lib/plans-shared";
import { savePlan } from "./actions";

export type PlanRow = {
  id: string;
  name: string;
  price_usd_month: number;
  teo_messages_month: number;
  max_users: number | null;
  max_stores: number | null;
  max_products: number | null;
  features: string[];
  highlighted: boolean;
  active: boolean;
  sort_order: number;
};

const str = (n: number | null) => (n == null ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function PlanEditor({ plan, mode, canEdit }: { plan: PlanRow; mode: "create" | "update"; canEdit: boolean }) {
  const router = useRouter();
  const { pending, onSubmit, errors, field } = useFormAction(savePlan, {
    idPrefix: "plan-",
    onSuccess: (s) => {
      if (mode === "create" && s.id) router.push(`/admin/planes/${s.id}`);
    },
  });
  const [v, setV] = useState({
    id: plan.id,
    name: plan.name,
    price: String(plan.price_usd_month),
    messages: String(plan.teo_messages_month),
    users: str(plan.max_users),
    stores: str(plan.max_stores),
    products: str(plan.max_products),
    sort: String(plan.sort_order),
    highlighted: plan.highlighted,
    active: plan.active,
    features: plan.features,
  });
  const set = <K extends keyof typeof v>(k: K) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const preview = {
    id: v.id,
    name: v.name,
    price_usd_month: Number(v.price.replace(",", ".")) || 0,
    teo_messages_month: Number(v.messages) || 0,
    max_users: num(v.users),
    max_stores: num(v.stores),
    max_products: num(v.products),
    features: v.features,
    highlighted: v.highlighted,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form onSubmit={onSubmit} noValidate aria-label="Editar plan">
        <input type="hidden" name="mode" value={mode} />
        {mode === "update" && <input type="hidden" name="id" value={v.id} />}
        <fieldset disabled={!canEdit || pending} className="space-y-6">
          <Section title="Datos del plan">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="plan-name" label="Nombre" error={errors.name}>
                <TextInput {...field("name")} value={v.name} onChange={set("name")} maxLength={40} required />
              </Field>
              <Field
                htmlFor="plan-id"
                label="Identificador"
                hint={mode === "create" ? "Minúsculas y guiones. No se puede cambiar después. Ej. negocio-plus" : "No se puede cambiar."}
                error={errors.id}
              >
                <TextInput {...field("id")} name={mode === "create" ? "id" : undefined} value={v.id} onChange={set("id")} readOnly={mode === "update"} maxLength={30} spellCheck={false} />
              </Field>
              <Field htmlFor="plan-price_usd_month" label="Precio mensual (USD)" error={errors.price_usd_month}>
                <TextInput {...field("price_usd_month")} value={v.price} onChange={set("price")} inputMode="decimal" />
              </Field>
              <Field htmlFor="plan-teo_messages_month" label="Mensajes de Teo al mes" error={errors.teo_messages_month}>
                <TextInput {...field("teo_messages_month")} value={v.messages} onChange={set("messages")} type="number" min={0} inputMode="numeric" />
              </Field>
            </div>
          </Section>

          <Section title="Límites" description="Déjalo vacío para que sea ilimitado.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field htmlFor="plan-max_users" label="Máx. usuarios" error={errors.max_users}>
                <TextInput {...field("max_users")} value={v.users} onChange={set("users")} type="number" min={0} inputMode="numeric" placeholder="Ilimitado" />
              </Field>
              <Field htmlFor="plan-max_stores" label="Máx. tiendas" error={errors.max_stores}>
                <TextInput {...field("max_stores")} value={v.stores} onChange={set("stores")} type="number" min={0} inputMode="numeric" placeholder="Ilimitado" />
              </Field>
              <Field htmlFor="plan-max_products" label="Máx. productos" error={errors.max_products}>
                <TextInput {...field("max_products")} value={v.products} onChange={set("products")} type="number" min={0} inputMode="numeric" placeholder="Ilimitado" />
              </Field>
            </div>
          </Section>

          <Section title="Funciones incluidas">
            <fieldset>
              <legend className="sr-only">Funciones incluidas</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(FEATURE_LABELS).map(([k, label]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-secondary/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                    <input
                      type="checkbox"
                      name="features"
                      value={k}
                      checked={v.features.includes(k)}
                      onChange={(e) => setV((p) => ({ ...p, features: e.target.checked ? [...p.features, k] : p.features.filter((f) => f !== k) }))}
                      className="size-4 accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section title="Publicación">
            <div className="grid gap-3 sm:grid-cols-2">
              <Switch id="plan-active" name="active" checked={v.active} onChange={set("active")} label="Activo" description="Visible en la landing y disponible para nuevos comercios." />
              <Switch id="plan-highlighted" name="highlighted" checked={v.highlighted} onChange={set("highlighted")} label="Destacado" description="Se muestra como “Más elegido”." />
            </div>
            <Field htmlFor="plan-sort_order" label="Orden" hint="Los planes se muestran de menor a mayor." error={errors.sort_order} className="max-w-40">
              <TextInput {...field("sort_order")} value={v.sort} onChange={set("sort")} type="number" min={0} inputMode="numeric" />
            </Field>
          </Section>

          {canEdit && (
            <div className="sticky bottom-4 z-10 flex justify-end">
              <Button type="submit" variant="cta" size="lg" className="h-11 px-6 text-base shadow-md">
                {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {mode === "create" ? "Crear plan" : "Guardar plan"}
              </Button>
            </div>
          )}
        </fieldset>
      </form>
      <aside aria-label="Vista previa" className="space-y-2 lg:sticky lg:top-6 lg:self-start">
        <p className="text-sm font-medium text-muted-foreground">Vista previa en la landing</p>
        <div className="pt-3">
          <PlanCard plan={preview} preview />
        </div>
        {!v.active && <p className="text-xs text-muted-foreground">Este plan está inactivo: no aparece en la landing.</p>}
      </aside>
    </div>
  );
}
