import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, MessageCircle } from "lucide-react";
import { z } from "zod";
import { AgentToggleButton, OrgStatusButton, ResetUsageButton, SubscriptionForm } from "@/components/admin/org-actions";
import { ReadOnlyNotice, Section } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { ORG_STATUS_CLS, ORG_STATUS_LABELS, SUBSCRIPTION_LABELS } from "@/lib/schemas/admin";
import { createClient } from "@/lib/supabase/server";

const ROLE_LABELS: Record<string, string> = { owner: "Dueño", admin: "Admin", operador: "Operador" };
const WA_LABELS: Record<string, string> = { pendiente: "Pendiente", conectado: "Conectado", desconectado: "Desconectado", error: "Con error" };

export default async function AdminComercioPage({ params }: PageProps<"/admin/comercios/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const role = await requirePlatformAdmin();
  const canEdit = role === "superadmin";
  const supabase = await createClient();

  const { data: org } = await supabase.from("organizations").select("id, name, slug, rubro, status, created_at, timezone, currency").eq("id", id).maybeSingle();
  if (!org) notFound();

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [members, sub, usage, agent, wa, cases, messages, sales, runs, plans] = await Promise.all([
    supabase.rpc("org_members", { p_org: id }),
    supabase.from("subscriptions").select("plan_id, status, trial_ends_at, current_period_start, current_period_end, plan:plans(name, teo_messages_month)").eq("org_id", id).maybeSingle(),
    supabase.from("usage_counters").select("period_start, teo_messages, extra_messages").eq("org_id", id).order("period_start", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("agent_settings").select("enabled, mode").eq("org_id", id).maybeSingle(),
    supabase.from("whatsapp_accounts").select("status, display_phone_number, verified_name, quality_rating, connected_at").eq("org_id", id).order("created_at", { ascending: false }),
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("org_id", id).gte("opened_at", since),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("org_id", id).gte("created_at", since),
    supabase.from("orders").select("total").eq("org_id", id).in("status", ["confirmado", "pagado"]).gte("created_at", since).limit(5000),
    supabase.from("agent_runs").select("id, created_at, kind, model, input_tokens, output_tokens, latency_ms, error").eq("org_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("plans").select("id, name, active").order("sort_order"),
  ]);

  const plan = sub.data?.plan as unknown as { name: string; teo_messages_month: number } | null;
  const used = usage.data?.teo_messages ?? 0;
  const quota = plan?.teo_messages_month ?? 0;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const salesTotal = (sales.data ?? []).reduce((a, o) => a + Number(o.total), 0);
  const waAccounts = wa.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Comercios
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-3xl font-bold">
              {org.name}
              <Badge className={ORG_STATUS_CLS[org.status]}>{ORG_STATUS_LABELS[org.status]}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              /{org.slug}
              {org.rubro ? ` · ${org.rubro}` : ""} · alta {formatDate(org.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/app/${org.slug}`} className={buttonVariants({ variant: "outline" })}>
              <Eye aria-hidden data-icon="inline-start" /> Ver como
            </Link>
            {canEdit && <OrgStatusButton orgId={org.id} name={org.name} status={org.status} />}
          </div>
        </div>
      </div>
      {!canEdit && <ReadOnlyNotice>Tu rol es de soporte: puedes ver este comercio, pero no cambiarlo.</ReadOnlyNotice>}

      <section aria-label="Métricas de los últimos 30 días" className="grid gap-4 sm:grid-cols-3">
        {[
          { k: "Casos (30 días)", v: formatNumber(cases.count ?? 0) },
          { k: "Mensajes (30 días)", v: formatNumber(messages.count ?? 0) },
          { k: "Ventas confirmadas (30 días)", v: `${formatNumber(sales.data?.length ?? 0)} · ${formatMoney(salesTotal)}` },
        ].map((s) => (
          <div key={s.k} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{s.k}</p>
            <p className="mt-1 font-heading text-2xl font-bold">{s.v}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Suscripción" description={plan ? `Plan ${plan.name} · ${SUBSCRIPTION_LABELS[sub.data!.status]}` : "Sin suscripción"}>
          {canEdit ? (
            <SubscriptionForm orgId={org.id} plans={plans.data ?? []} current={sub.data} />
          ) : (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Prueba hasta</dt>
              <dd>{sub.data?.trial_ends_at ? formatDate(sub.data.trial_ends_at) : "—"}</dd>
              <dt className="text-muted-foreground">Fin del período</dt>
              <dd>{sub.data?.current_period_end ? formatDate(sub.data.current_period_end) : "—"}</dd>
            </dl>
          )}
        </Section>

        <div className="space-y-6">
          <Section title="Uso del mes" description={usage.data ? `Desde el ${formatDate(usage.data.period_start)}` : "Aún no hay uso registrado"}>
            <div className="space-y-2">
              <p className="text-sm" data-testid="usage-text">
                <span className="font-heading text-2xl font-bold tabular-nums">{formatNumber(used)}</span>
                <span className="text-muted-foreground"> de {formatNumber(quota)} mensajes de Teo</span>
                {(usage.data?.extra_messages ?? 0) > 0 && <span className="text-muted-foreground"> · {formatNumber(usage.data!.extra_messages)} extra</span>}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Uso del cupo">
                <div className={pct >= 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${pct}%` }} />
              </div>
            </div>
            {canEdit && <ResetUsageButton orgId={org.id} />}
          </Section>

          <Section title="Teo en este comercio">
            <p className="text-sm">
              {agent.data?.enabled ? (
                <Badge className="bg-cta text-cta-foreground">Activo</Badge>
              ) : (
                <Badge variant="outline">En pausa</Badge>
              )}{" "}
              <span className="text-muted-foreground">Modo {agent.data?.mode === "copiloto" ? "copiloto" : "piloto automático"}</span>
            </p>
            {canEdit && agent.data && <AgentToggleButton orgId={org.id} enabled={agent.data.enabled} />}
          </Section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Equipo del comercio">
          {(members.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin miembros.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(members.data ?? []).map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.full_name || m.email}</span>
                    <span className="block truncate text-muted-foreground">{m.email}</span>
                  </span>
                  <Badge variant="secondary">{ROLE_LABELS[m.role] ?? m.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="WhatsApp">
          {waAccounts.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageCircle className="size-4" aria-hidden /> Aún no conecta un número.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {waAccounts.map((w, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{w.display_phone_number ?? "Número pendiente"}</span>
                    {w.verified_name && <span className="text-muted-foreground"> · {w.verified_name}</span>}
                    {w.quality_rating && <span className="text-muted-foreground"> · calidad {w.quality_rating}</span>}
                  </span>
                  <Badge variant={w.status === "conectado" ? "secondary" : "outline"}>{WA_LABELS[w.status] ?? w.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Últimas ejecuciones de Teo" description="Las 10 más recientes de agent_runs.">
        {(runs.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Teo aún no ha trabajado en este comercio.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Tokens (entrada/salida)</TableHead>
                  <TableHead className="text-right">Latencia</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.created_at, { withTime: true })}</TableCell>
                    <TableCell>{r.kind}</TableCell>
                    <TableCell className="font-mono text-xs">{r.model ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.input_tokens ?? 0)} / {formatNumber(r.output_tokens ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.latency_ms != null ? `${formatNumber(r.latency_ms)} ms` : "—"}</TableCell>
                    <TableCell className="max-w-60 truncate text-destructive" title={r.error ?? undefined}>
                      {r.error ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
