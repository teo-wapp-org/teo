import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrgFilters, OrgStatusButton } from "@/components/admin/org-actions";
import { requirePlatformAdmin } from "@/lib/auth";
import { cleanSearch, formatDate } from "@/lib/format";
import { ORG_STATUS_CLS as STATUS_CLS } from "@/lib/schemas/admin";
import { createClient } from "@/lib/supabase/server";


const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const role = await requirePlatformAdmin();
  const sp = await searchParams;
  const q = norm(cleanSearch(sp.q));
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const planF = typeof sp.plan === "string" ? sp.plan : "";

  const supabase = await createClient();
  const [{ data: orgs, error }, { data: plans }] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, name, slug, rubro, status, created_at, memberships(count), subscription:subscriptions(status, plan_id, trial_ends_at, plan:plans(name)), wa:whatsapp_accounts(status, display_phone_number)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("plans").select("id, name").order("sort_order"),
  ]);
  if (error) throw error;

  type Sub = { status: string; plan_id: string; plan: { name: string } } | null;
  type Wa = { status: string; display_phone_number: string | null }[];
  const all = (orgs ?? []).map((o) => ({
    ...o,
    sub: o.subscription as unknown as Sub,
    members: (o.memberships as unknown as { count: number }[])?.[0]?.count ?? 0,
    wa: ((o.wa as unknown as Wa) ?? []).find((w) => w.status === "conectado") ?? null,
  }));
  const list = all.filter(
    (o) =>
      (!q || norm(o.name).includes(q) || o.slug.includes(q)) &&
      (!estado || o.status === estado) &&
      (!planF || o.sub?.plan_id === planF),
  );

  const total = all.length;
  const activos = all.filter((o) => o.status === "activo").length;
  const onboarding = all.filter((o) => o.status === "onboarding").length;
  const filtered = !!(q || estado || planF);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Comercios</h1>
        <p className="text-muted-foreground">Todos los comercios registrados en Teo.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { k: "Total", v: total },
          { k: "Activos", v: activos },
          { k: "En onboarding", v: onboarding },
        ].map((s) => (
          <div key={s.k} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{s.k}</p>
            <p className="mt-1 font-heading text-3xl font-bold">{s.v}</p>
          </div>
        ))}
      </div>
      <Suspense>
        <OrgFilters plans={plans ?? []} />
      </Suspense>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Comercio</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Usuarios</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link href={`/admin/comercios/${o.id}`} className="group inline-flex items-center gap-1 font-medium hover:underline">
                    {o.name}
                    <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    /{o.slug}
                    {o.rubro ? ` · ${o.rubro}` : ""}
                  </p>
                </TableCell>
                <TableCell>{o.sub ? `${o.sub.plan.name}${o.sub.status === "trial" ? " (prueba)" : ""}` : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{o.wa ? (o.wa.display_phone_number ?? "Conectado") : "Sin conectar"}</TableCell>
                <TableCell>{o.members}</TableCell>
                <TableCell>
                  <Badge className={STATUS_CLS[o.status]}>{o.status}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Link href={`/app/${o.slug}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm whitespace-nowrap hover:bg-muted">
                      <Eye className="size-4" aria-hidden /> Ver como
                    </Link>
                    {role === "superadmin" && <OrgStatusButton orgId={o.id} name={o.name} status={o.status} size="sm" />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {list.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {filtered ? "Ningún comercio coincide con esa búsqueda." : "Aún no hay comercios registrados."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
