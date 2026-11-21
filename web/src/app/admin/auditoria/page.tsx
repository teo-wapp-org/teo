import Link from "next/link";
import { Filter } from "lucide-react";
import { NativeSelect } from "@/components/forms/fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AUDIT_ACTION_LABELS, auditActionLabel, auditTargetLabel, describeAuditMetadata } from "@/lib/admin/labels";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Auditoría · Admin" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AuditoriaPage({ searchParams }: PageProps<"/admin/auditoria">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const accion = typeof sp.accion === "string" && AUDIT_ACTION_LABELS[sp.accion] ? sp.accion : "";
  const comercio = typeof sp.comercio === "string" && UUID.test(sp.comercio) ? sp.comercio : "";

  const supabase = await createClient();
  let query = supabase
    .from("admin_audit_log")
    .select("id, action, target, metadata, created_at, admin_id, org_id, org:organizations(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (accion) query = query.eq("action", accion);
  if (comercio) query = query.eq("org_id", comercio);

  const [{ data, error }, { data: admins }, { data: orgs }] = await Promise.all([
    query,
    supabase.rpc("admin_list_platform_admins"),
    supabase.from("organizations").select("id, name").order("name").limit(500),
  ]);
  if (error) throw error;
  const emailOf = new Map((admins ?? []).map((a) => [a.user_id, a.email]));
  const filtered = !!(accion || comercio);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Auditoría</h1>
        <p className="text-muted-foreground">Últimas 200 acciones del equipo Teo{filtered ? " que coinciden con los filtros" : ""}.</p>
      </div>

      <form method="get" role="search" aria-label="Filtrar auditoría" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:w-72">
          <label htmlFor="f-accion" className="block text-sm font-medium">
            Acción
          </label>
          <NativeSelect id="f-accion" name="accion" defaultValue={accion}>
            <option value="">Todas las acciones</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5 sm:w-72">
          <label htmlFor="f-comercio" className="block text-sm font-medium">
            Comercio
          </label>
          <NativeSelect id="f-comercio" name="comercio" defaultValue={comercio}>
            <option value="">Todos los comercios</option>
            {(orgs ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="h-10">
            <Filter aria-hidden data-icon="inline-start" /> Filtrar
          </Button>
          {filtered && (
            <Link href="/admin/auditoria" className={buttonVariants({ variant: "ghost", className: "h-10" })}>
              Limpiar
            </Link>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Quién</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Comercio</TableHead>
              <TableHead>Objetivo</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((r) => {
              const changes = describeAuditMetadata(r.metadata);
              const org = r.org as unknown as { name: string } | null;
              return (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.created_at, { withTime: true })}</TableCell>
                  <TableCell className="max-w-48 truncate" title={r.admin_id ?? undefined}>
                    {r.admin_id ? (emailOf.get(r.admin_id) ?? <span className="text-muted-foreground">Ex miembro del equipo</span>) : "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {auditActionLabel(r.action)}
                    <span className="block font-mono text-[11px] font-normal text-muted-foreground">{r.action}</span>
                  </TableCell>
                  <TableCell>
                    {org && r.org_id ? (
                      <Link className="hover:underline" href={`/admin/comercios/${r.org_id}`}>
                        {org.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-40 truncate">{auditTargetLabel(r.action, r.target)}</TableCell>
                  <TableCell className="min-w-56">
                    {changes.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <details className="group">
                        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                          {changes.length === 1 ? "1 cambio" : `${changes.length} cambios`}
                        </summary>
                        <ul className="mt-2 space-y-1 text-xs">
                          {changes.map((c) => (
                            <li key={c.key} className="break-words">
                              <span className="font-medium">{c.key}:</span>{" "}
                              {c.before !== undefined && (
                                <>
                                  <span className="text-muted-foreground line-through">{c.before}</span> →{" "}
                                </>
                              )}
                              <span>{c.after}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {(data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {filtered ? "No hay acciones con esos filtros." : "Sin acciones registradas."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
