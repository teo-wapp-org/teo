import Link from "next/link";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setOrgStatus } from "./actions";

const STATUS_CLS: Record<string, string> = {
  onboarding: "bg-secondary text-secondary-foreground",
  activo: "bg-cta text-cta-foreground",
  suspendido: "bg-destructive text-white",
};

export default async function AdminHome() {
  const role = await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, slug, rubro, status, created_at, memberships(count), subscription:subscriptions(status, trial_ends_at, plan:plans(name))")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const total = orgs?.length ?? 0;
  const activos = orgs?.filter((o) => o.status === "activo").length ?? 0;
  const onboarding = orgs?.filter((o) => o.status === "onboarding").length ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Comercios</h1>
        <p className="text-muted-foreground">Todos los comercios registrados en Teo.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[{ k: "Total", v: total }, { k: "Activos", v: activos }, { k: "En onboarding", v: onboarding }].map((s) => (
          <div key={s.k} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{s.k}</p>
            <p className="mt-1 font-heading text-3xl font-bold">{s.v}</p>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Comercio</TableHead>
              <TableHead>Rubro</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Usuarios</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(orgs ?? []).map((o) => {
              const sub = o.subscription as unknown as { status: string; plan: { name: string } } | null;
              const members = (o.memberships as unknown as { count: number }[])?.[0]?.count ?? 0;
              return (
                <TableRow key={o.id}>
                  <TableCell>
                    <p className="font-medium">{o.name}</p>
                    <p className="text-xs text-muted-foreground">/{o.slug}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.rubro ?? "—"}</TableCell>
                  <TableCell>{sub ? `${sub.plan.name}${sub.status === "trial" ? " (prueba)" : ""}` : "—"}</TableCell>
                  <TableCell>{members}</TableCell>
                  <TableCell><Badge className={STATUS_CLS[o.status]}>{o.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString("es-EC")}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Link href={`/app/${o.slug}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm hover:bg-muted">
                        <Eye className="size-4" aria-hidden /> Ver como
                      </Link>
                      {role === "superadmin" && (
                        <form action={setOrgStatus}>
                          <input type="hidden" name="orgId" value={o.id} />
                          <input type="hidden" name="status" value={o.status === "suspendido" ? "activo" : "suspendido"} />
                          <Button type="submit" size="sm" variant={o.status === "suspendido" ? "outline" : "destructive"}>
                            {o.status === "suspendido" ? "Reactivar" : "Suspender"}
                          </Button>
                        </form>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {total === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Aún no hay comercios registrados.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
