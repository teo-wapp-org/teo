"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceChips, Field, Section, Switch, Textarea, TextInput } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { saveBusiness } from "./actions";

export type BusinessInitial = {
  name: string;
  rubro: string;
  description: string;
  tone: "cercano" | "formal" | "divertido";
  use_usted: boolean;
  use_emojis: boolean;
  envios: string;
  devoluciones: string;
  garantia: string;
  otros: string;
  website: string;
  instagram: string;
  phone: string;
  faqs: { q: string; a: string }[];
};

const RUBROS = ["Comida y bebidas", "Ropa y accesorios", "Tecnología", "Belleza y cuidado personal", "Hogar", "Servicios", "Otro"];

export function BusinessForm({ slug, initial, canEdit }: { slug: string; initial: BusinessInitial; canEdit: boolean }) {
  const { pending, onSubmit, errors, field } = useFormAction(saveBusiness);
  const [faqs, setFaqs] = useState(initial.faqs);

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Datos del negocio">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="faqs" value={JSON.stringify(faqs)} />
      <fieldset disabled={!canEdit || pending} className="space-y-6">
        <Section title="Tu negocio" description="Así se presenta Teo cuando le preguntan por ti.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="name" label="Nombre del comercio" error={errors.name}>
              <TextInput {...field("name")} defaultValue={initial.name} required maxLength={120} />
            </Field>
            <Field htmlFor="rubro" label="Rubro" error={errors.rubro}>
              <TextInput {...field("rubro")} defaultValue={initial.rubro} list="rubros" maxLength={60} placeholder="Ej. Comida y bebidas" />
              <datalist id="rubros">
                {RUBROS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field htmlFor="description" label="Descripción" hint="Qué vendes, qué te hace especial y a quién atiendes." error={errors.description}>
            <Textarea {...field("description")} defaultValue={initial.description} rows={4} maxLength={2000} placeholder="Ej. Pastelería artesanal en Quito. Hacemos tortas por encargo y postres sin azúcar." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field htmlFor="website" label="Sitio web" error={errors.website}>
              <TextInput {...field("website")} type="url" defaultValue={initial.website} placeholder="https://" />
            </Field>
            <Field htmlFor="instagram" label="Instagram" error={errors.instagram}>
              <TextInput {...field("instagram")} defaultValue={initial.instagram} placeholder="@tunegocio" />
            </Field>
            <Field htmlFor="phone" label="Teléfono" error={errors.phone}>
              <TextInput {...field("phone")} type="tel" defaultValue={initial.phone} placeholder="+593 99 999 9999" />
            </Field>
          </div>
        </Section>

        <Section title="Cómo habla Teo" description="Teo responde con la voz de tu negocio.">
          <ChoiceChips
            name="tone"
            legend="Tono"
            defaultValue={initial.tone}
            options={[
              { value: "cercano", label: "Cercano" },
              { value: "formal", label: "Formal" },
              { value: "divertido", label: "Divertido" },
            ]}
          />
          <ChoiceChips
            name="use_usted"
            legend="Trato al cliente"
            defaultValue={initial.use_usted ? "usted" : "tu"}
            options={[
              { value: "tu", label: "Tutea (tú)" },
              { value: "usted", label: "De usted" },
            ]}
          />
          <Switch id="use_emojis" name="use_emojis" defaultChecked={initial.use_emojis} label="Usar emojis" description="Teo agrega algún emoji cuando encaja con la conversación." />
        </Section>

        <Section title="Políticas" description="Teo las usa para responder dudas antes de comprar.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="envios" label="Envíos" error={errors.envios}>
              <Textarea {...field("envios")} defaultValue={initial.envios} placeholder="Ej. Envíos en Quito en 24 h. Costo según el sector." />
            </Field>
            <Field htmlFor="devoluciones" label="Devoluciones" error={errors.devoluciones}>
              <Textarea {...field("devoluciones")} defaultValue={initial.devoluciones} placeholder="Ej. Cambios dentro de 8 días con factura." />
            </Field>
            <Field htmlFor="garantia" label="Garantía" error={errors.garantia}>
              <Textarea {...field("garantia")} defaultValue={initial.garantia} />
            </Field>
            <Field htmlFor="otros" label="Otras políticas" error={errors.otros}>
              <Textarea {...field("otros")} defaultValue={initial.otros} />
            </Field>
          </div>
        </Section>

        <Section title="Preguntas frecuentes" description="Respuestas que Teo dará tal cual.">
          {faqs.length === 0 && <p className="text-sm text-muted-foreground">Aún no tienes preguntas. Agrega las que más te hacen tus clientes.</p>}
          <ol className="space-y-3">
            {faqs.map((f, i) => (
              <li key={i} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Pregunta {i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFaqs(faqs.filter((_, j) => j !== i))} aria-label={`Eliminar pregunta ${i + 1}`}>
                    <Trash2 aria-hidden data-icon="inline-start" /> Eliminar
                  </Button>
                </div>
                <Field htmlFor={`faq-${i}-q`} label="Pregunta">
                  <TextInput id={`faq-${i}-q`} value={f.q} maxLength={300} onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
                </Field>
                <Field htmlFor={`faq-${i}-a`} label="Respuesta">
                  <Textarea id={`faq-${i}-a`} value={f.a} maxLength={1000} rows={2} onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
                </Field>
              </li>
            ))}
          </ol>
          {errors.faqs && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.faqs}
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => setFaqs([...faqs, { q: "", a: "" }])} disabled={faqs.length >= 50}>
            <Plus aria-hidden data-icon="inline-start" /> Agregar pregunta
          </Button>
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
