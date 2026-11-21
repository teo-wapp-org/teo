"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Section, Switch, Textarea, TextInput } from "@/components/forms/fields";
import { HoursEditor } from "@/components/forms/hours-editor";
import { useFormAction } from "@/components/forms/use-form-action";
import { DAYS, hasAnyHours, type WeekHours } from "@/lib/hours";
import type { PlaceSearchResult, StoreDraft } from "@/lib/places-map";
import { placeDraftAction, saveStore, searchPlacesAction } from "./actions";

export type StoreInitial = {
  id?: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  hours: WeekHours;
  delivery_available: boolean;
  delivery_notes: string;
  active: boolean;
  lat: number | null;
  lng: number | null;
  google_place_id: string;
};

export const DEFAULT_STORE_HOURS: WeekHours = Object.fromEntries(
  DAYS.map((d) => [d, d === "dom" ? [] : d === "sab" ? [{ open: "09:00", close: "13:00" }] : [{ open: "09:00", close: "18:00" }]]),
);

/** Estado de la importación de Google Places: deshabilitada (con motivo) o disponible. */
export type PlacesAvailability = { enabled: true } | { enabled: false; reason: string; label: string };

export function StoreForm({ slug, initial, places }: { slug: string; initial: StoreInitial; places?: PlacesAvailability }) {
  const router = useRouter();
  const list = `/app/${slug}/tiendas`;
  const [values, setValues] = useState(initial);
  const [version, setVersion] = useState(0); // remonta los campos no controlados al importar
  const [hours, setHours] = useState<WeekHours>(hasAnyHours(initial.hours) ? initial.hours : DEFAULT_STORE_HOURS);
  const [delivery, setDelivery] = useState(initial.delivery_available);
  const [imported, setImported] = useState(false);
  const { pending, onSubmit, errors, field } = useFormAction(saveStore, {
    onSuccess: () => {
      router.push(list);
      router.refresh();
    },
  });

  const applyDraft = (d: StoreDraft) => {
    setValues((v) => ({ ...v, name: d.name || v.name, address: d.address, city: d.city, phone: d.phone, lat: d.lat, lng: d.lng, google_place_id: d.google_place_id }));
    if (hasAnyHours(d.hours)) setHours(Object.fromEntries(DAYS.map((day) => [day, d.hours[day] ?? []])));
    setVersion((n) => n + 1);
    setImported(true);
  };

  return (
    <div className="space-y-6">
      {places && <PlacesImport slug={slug} availability={places} onPick={applyDraft} />}

      {imported && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          Trajimos los datos de Google. Revísalos y corrige lo que haga falta antes de guardar.
        </p>
      )}

      <form onSubmit={onSubmit} noValidate aria-label="Datos de la tienda" key={version}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={values.id ?? ""} />
        <input type="hidden" name="hours" value={JSON.stringify(hours)} />
        <input type="hidden" name="lat" value={values.lat ?? ""} />
        <input type="hidden" name="lng" value={values.lng ?? ""} />
        <input type="hidden" name="google_place_id" value={values.google_place_id} />
        <fieldset disabled={pending} className="space-y-6">
          <Section title="Datos de la tienda">
            <Field htmlFor="name" label="Nombre" hint="Ej. Matriz, Sucursal Cumbayá." error={errors.name}>
              <TextInput {...field("name")} defaultValue={values.name} maxLength={120} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field htmlFor="address" label="Dirección" error={errors.address}>
                <TextInput {...field("address")} defaultValue={values.address} maxLength={300} placeholder="Ej. Av. Amazonas N24-03 y Colón" />
              </Field>
              <Field htmlFor="city" label="Ciudad" error={errors.city}>
                <TextInput {...field("city")} defaultValue={values.city} maxLength={80} placeholder="Ej. Quito" />
              </Field>
            </div>
            <Field htmlFor="phone" label="Teléfono" error={errors.phone} className="sm:max-w-xs">
              <TextInput {...field("phone")} type="tel" defaultValue={values.phone} maxLength={30} placeholder="+593 99 999 9999" />
            </Field>
            {values.lat != null && values.lng != null && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden /> Ubicación de Google guardada ({values.lat.toFixed(5)}, {values.lng.toFixed(5)})
              </p>
            )}
            <Switch id="active" name="active" defaultChecked={values.active} label="Tienda activa" description="Si la desactivas, Teo no la menciona." />
          </Section>

          <Section title="Horario" description="Marca los días que abres. Puedes tener varios turnos por día.">
            <HoursEditor idPrefix="store" value={hours} onChange={setHours} disabled={pending} />
            {errors.hours && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.hours}
              </p>
            )}
          </Section>

          <Section title="Envíos">
            <Switch
              id="delivery_available"
              name="delivery_available"
              checked={delivery}
              onChange={(e) => setDelivery(e.target.checked)}
              label="Hace envíos a domicilio"
              description="Teo ofrecerá entrega a domicilio desde esta tienda."
            />
            {delivery && (
              <Field htmlFor="delivery_notes" label="Detalles del envío" hint="Zonas, costo y tiempos. Ej. Norte de Quito $2,50, entrega en 2 horas." error={errors.delivery_notes}>
                <Textarea {...field("delivery_notes")} defaultValue={initial.delivery_notes} maxLength={1000} rows={3} />
              </Field>
            )}
          </Section>

          <div className="sticky-actions -mx-2 flex justify-end rounded-xl bg-background/85 p-2 backdrop-blur supports-backdrop-filter:bg-background/70 gap-2">
            <Link href={list} className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 bg-card px-5" })}>
              Cancelar
            </Link>
            <Button type="submit" variant="cta" size="lg" className="h-11 px-6 text-base shadow-md">
              {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Guardar tienda
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

function PlacesImport({ slug, availability, onPick }: { slug: string; availability: PlacesAvailability; onPick: (d: StoreDraft) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [picking, startPick] = useTransition();
  const disabled = !availability.enabled;

  const search = () =>
    startSearch(async () => {
      setError(null);
      const r = await searchPlacesAction(slug, query);
      if (r.ok) setResults(r.data);
      else {
        setResults(null);
        setError(r.error);
      }
    });

  return (
    <Section title="Importar desde Google" description="Busca tu negocio en Google Maps y trae dirección, teléfono y horario en un clic.">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="places-query" className="sr-only">
          Buscar tu negocio en Google
        </label>
        <input
          id="places-query"
          type="search"
          value={query}
          disabled={disabled || searching}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Ej. Café Ñandú Quito"
          className="h-10 w-full flex-1 rounded-lg border border-input bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 md:text-sm"
        />
        <Button type="button" variant="outline" className="h-10" disabled={disabled || searching || query.trim().length < 3} onClick={search}>
          {searching ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search aria-hidden data-icon="inline-start" />}
          {availability.enabled ? "Buscar en Google" : availability.label}
        </Button>
      </div>
      {!availability.enabled && <p className="text-xs text-muted-foreground">{availability.reason}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {results && results.length === 0 && <p className="text-sm text-muted-foreground">No encontramos resultados. Prueba con el nombre y la ciudad.</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Resultados de Google">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={picking}
                onClick={() =>
                  startPick(async () => {
                    const d = await placeDraftAction(slug, r.id);
                    if (d.ok) {
                      onPick(d.data);
                      setResults(null);
                      toast.success("Datos importados. Revísalos antes de guardar.");
                    } else toast.error(d.error);
                  })
                }
                className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium">{r.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{r.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
