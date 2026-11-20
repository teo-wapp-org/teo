import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Layers, ShoppingBag } from "lucide-react";
import { z } from "zod";
import { StatusDot } from "@/components/operacion/bits";
import { ContactForm, Panel, TagList } from "@/components/operacion/case-side";
import { buttonVariants } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth";
import { contactDisplayName, formatPhone, STATUS_LABEL, TYPE_LABEL, type CaseStatus, type CaseType } from "@/lib/casos";
import type { Contact } from "@/lib/data/operacion";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ficha del cliente" };

const ORDER_STATUS: Record<string, string> = { borrador: "Borrador", confirmado: "Confirmado", pagado: "Pagado", cancelado: "Cancelado" };

export default async function ClientePage({ params }: PageProps<"/app/[org]/clientes/[id]">) {
  const { org: slug, id } = await params;
  const { org, impersonating } = await requireOrg(slug);
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contacts")
    .select("id, wa_id, name, profile_name, email, address, tags, notes, ai_summary, created_at, last_message_at")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const contact = { ...(c as unknown as Contact), tags: (c.tags as string[]) ?? [] };

  const [cases, orders] = await Promise.all([
    supabase.from("cases").select("id, number, status, type, estimated_amount, opened_at").eq("org_id", org.id).eq("contact_id", id).order("opened_at", { ascending: false }).limit(100),
    supabase
      .from("orders")
      .select("id, status, total, created_at, case:cases!orders_case_id_org_id_fkey(number), items:order_items!order_items_order_id_org_id_fkey(name, quantity)")
      .eq("org_id", org.id)
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const caseRows = (cases.data ?? []) as { id: string; number: number; status: CaseStatus; type: CaseType; estimated_amount: number | null; opened_at: string }[];
  const orderRows = (orders.data ?? []) as unknown as { id: string; status: string; total: number; created_at: string; case: { number: number } | null; items: { name: string; quantity: number }[] }[];
  const paid = orderRows.filter((o) => o.status === "pagado");
  const totalSpent = paid.reduce((a, o) => a + Number(o.total), 0);
  const base = `/app/${org.slug}`;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`${base}/clientes`} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))} aria-label="Volver a clientes">
          <ArrowLeft aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{contactDisplayName(contact)}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">{formatPhone(contact.wa_id)}</p>
        </div>
        <TagList tags={contact.tags} />
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen del cliente">
        {[
          { k: "Total gastado", v: formatMoney(totalSpent), id: "total-gastado" },
          { k: "Compras", v: String(paid.length) },
          { k: "Casos", v: String(caseRows.length) },
          { k: "Cliente desde", v: formatDate(c.created_at as string) },
        ].map((s) => (
          <div key={s.k} className="rounded-xl border border-border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{s.k}</dt>
            <dd className="mt-0.5 font-heading text-xl font-bold tabular-nums" data-testid={s.id}>{s.v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="Casos" icon={<Layers className="size-4" aria-hidden />}>
            {caseRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin casos.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {caseRows.map((k) => (
                  <li key={k.id}>
                    <Link href={`${base}/casos/${k.number}`} className="flex items-center gap-2 px-1 py-2 hover:bg-muted/50">
                      <StatusDot status={k.status} />
                      <span className="font-medium tabular-nums">#{k.number}</span>
                      <span className="text-muted-foreground">{STATUS_LABEL[k.status]} · {TYPE_LABEL[k.type]}</span>
                      {k.estimated_amount ? <span className="ml-auto tabular-nums">{formatMoney(k.estimated_amount)}</span> : <span className="ml-auto" />}
                      <span className="w-24 text-right text-xs text-muted-foreground">{formatDate(k.opened_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Compras y pedidos" icon={<ShoppingBag className="size-4" aria-hidden />}>
            {orderRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pedidos todavía.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {orderRows.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 px-1 py-2">
                    <span className={cn("rounded-full px-2 py-px text-xs font-semibold", o.status === "pagado" ? "bg-cta/25" : o.status === "cancelado" ? "bg-destructive/10 text-destructive" : "bg-muted")}>
                      {ORDER_STATUS[o.status] ?? o.status}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ") || "Sin ítems"}</span>
                    {o.case && <Link href={`${base}/casos/${o.case.number}`} className="text-xs underline underline-offset-2">#{o.case.number}</Link>}
                    <span className="font-medium tabular-nums">{formatMoney(o.total)}</span>
                    <span className="w-24 text-right text-xs text-muted-foreground">{formatDate(o.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <Panel title="Datos del cliente">
          <ContactForm slug={org.slug} contact={contact} readOnly={impersonating} />
        </Panel>
      </div>
    </div>
  );
}
