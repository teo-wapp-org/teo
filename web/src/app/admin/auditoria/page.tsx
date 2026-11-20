import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AuditoriaPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, action, target, metadata, created_at, admin_id, org:organizations(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Auditoría</h1>
        <p className="text-muted-foreground">Últimas 200 acciones del equipo Teo.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Comercio</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString("es-EC")}</TableCell>
                <TableCell className="font-medium">{r.action}</TableCell>
                <TableCell>{(r.org as unknown as { name: string } | null)?.name ?? "—"}</TableCell>
                <TableCell className="max-w-md truncate font-mono text-xs">{JSON.stringify(r.metadata)}</TableCell>
              </TableRow>
            ))}
            {(data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Sin acciones registradas.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
