import Link from "next/link";
import { Clock, MapPin, Pencil, Phone, Plus, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ReadOnlyNotice } from "@/components/forms/fields";
import { requireOrg } from "@/lib/auth";
import { atLimit, getPlanLimits } from "@/lib/data/plan-limits";
import { DAY_LABELS, DAYS, formatDay, normalizeHours } from "@/lib/hours";
import { canEditConfig, readOnlyReason } from "@/lib/org-editor";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { DeleteStoreButton } from "./delete-store-button";

export const metadata = { title: "Tiendas" };

export default async function TiendasPage({ params }: PageProps<"/app/[org]/tiendas">) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const supabase = await createClient();
  const [{ data: stores }, limits] = await Promise.all([
    supabase.from("stores").select("*").eq("org_id", ctx.org.id).order("created_at"),
    getPlanLimits(supabase, ctx.org.id),
  ]);
  const list = stores ?? [];
  const canEdit = canEditConfig(ctx);
  const reason = readOnlyReason(ctx);
  const full = atLimit(list.length, limits.maxStores);
  const base = `/app/${ctx.org.slug}/tiendas`;

  const newButton = (
    <Link href={`${base}/nueva`} className={cn(buttonVariants({ variant: "cta" }), "h-10 px-4")}>
      <Plus aria-hidden data-icon="inline-start" /> Nueva tienda
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Tiendas</h1>
          <p className="text-muted-foreground">
            Dónde atiendes y en qué horario. Teo lo usa para responder “¿dónde están?” y “¿a qué hora abren?”.
          </p>
        </div>
        {canEdit && list.length > 0 && !full && newButton}
      </div>

      {reason && <ReadOnlyNotice>{reason}</ReadOnlyNotice>}

      {limits.maxStores != null && list.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {list.length} de {limits.maxStores} {limits.maxStores === 1 ? "tienda" : "tiendas"} en tu plan {limits.planName}.
        </p>
      )}
      {canEdit && full && (
        <div role="status" className="rounded-xl border border-warning/40 bg-warning/15 px-4 py-3 text-sm">
          <strong className="font-semibold">Llegaste al límite de tiendas de tu plan {limits.planName}.</strong> Sube de plan para agregar más sucursales.{" "}
          <Link href="/#precios" className="font-semibold underline underline-offset-2">
            Ver planes
          </Link>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState title="Agrega tu primera tienda" action={canEdit ? newButton : undefined}>
          Con la dirección y el horario, Teo puede decirle a tus clientes dónde encontrarte y si haces envíos.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2" aria-label="Tiendas">
          {list.map((s) => {
            const hours = normalizeHours(s.hours);
            return (
              <li key={s.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{s.name}</h2>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {!s.active && <Badge variant="secondary">Inactiva</Badge>}
                      {s.delivery_available && (
                        <Badge variant="outline">
                          <Truck aria-hidden /> Envío a domicilio
                        </Badge>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Link href={`${base}/${s.id}`} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={`Editar ${s.name}`}>
                        <Pencil aria-hidden />
                      </Link>
                      <DeleteStoreButton slug={ctx.org.slug} id={s.id} name={s.name} />
                    </div>
                  )}
                </div>
                <dl className="space-y-2 text-sm">
                  {(s.address || s.city) && (
                    <div className="flex gap-2">
                      <dt>
                        <MapPin className="size-4 text-muted-foreground" aria-label="Dirección" />
                      </dt>
                      <dd>{[s.address, s.city].filter(Boolean).join(", ")}</dd>
                    </div>
                  )}
                  {s.phone && (
                    <div className="flex gap-2">
                      <dt>
                        <Phone className="size-4 text-muted-foreground" aria-label="Teléfono" />
                      </dt>
                      <dd>{s.phone}</dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt>
                      <Clock className="size-4 text-muted-foreground" aria-label="Horario" />
                    </dt>
                    <dd className="flex-1">
                      {Object.keys(hours).length === 0 ? (
                        <span className="text-muted-foreground">Sin horario</span>
                      ) : (
                        <ul className="grid gap-0.5">
                          {DAYS.map((d) => (
                            <li key={d} className="flex justify-between gap-4">
                              <span className="text-muted-foreground">{DAY_LABELS[d]}</span>
                              <span className={hours[d]?.length ? "" : "text-muted-foreground"}>{formatDay(hours[d])}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
