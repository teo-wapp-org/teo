import Link from "next/link";
import { Pencil, Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/forms/fields";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Planes · Admin" };

const lim = (n: number | null) => (n == null ? "∞" : n.toLocaleString("es-EC"));

export default async function AdminPlanesPage() {
  const role = await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: plans, error } = await supabase.from("plans").select("*").order("sort_order");
  if (error) throw error;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Planes</h1>
          <p className="text-muted-foreground">Precios, cupos y funciones. Lo que cambies aquí se ve al instante en la landing.</p>
        </div>
        {role === "superadmin" && (
          <Link href="/admin/planes/nuevo" className={buttonVariants({ variant: "cta" })}>
            <Plus aria-hidden data-icon="inline-start" /> Nuevo plan
          </Link>
        )}
      </div>
      {!plans?.length ? (
        <EmptyState title="Aún no hay planes">Crea el primero para que aparezca en la landing.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Mensajes/mes</TableHead>
                <TableHead className="text-right">Usuarios · Tiendas · Productos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Orden</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="flex items-center gap-1.5 font-medium">
                      {p.name}
                      {p.highlighted && <Star className="size-3.5 fill-current" aria-label="Destacado" />}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{p.id}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(Number(p.price_usd_month))}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.teo_messages_month.toLocaleString("es-EC")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {lim(p.max_users)} · {lim(p.max_stores)} · {lim(p.max_products)}
                  </TableCell>
                  <TableCell>{p.active ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.sort_order}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/planes/${p.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`${role === "superadmin" ? "Editar" : "Ver"} plan ${p.name}`}>
                      <Pencil aria-hidden data-icon="inline-start" /> {role === "superadmin" ? "Editar" : "Ver"}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
