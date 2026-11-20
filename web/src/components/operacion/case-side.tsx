"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileText, Loader2, Package, Receipt, Tag, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { reviewPaymentAction, updateContactAction } from "@/lib/actions/operacion";
import { formatPhone, STATUS_LABEL, TYPE_LABEL } from "@/lib/casos";
import type { CaseDetailData, Contact, Order, Payment } from "@/lib/data/operacion";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusDot } from "./bits";

export function Panel({ title, icon, children, className, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  const id = `panel-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("rounded-xl border border-border bg-card p-3", className)}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 id={id} className="text-sm font-semibold">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

const field = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

export function ContactForm({ slug, contact, readOnly, startEditing = false }: { slug: string; contact: Contact; readOnly: boolean; startEditing?: boolean }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(startEditing);
  if (!editing) {
    return (
      <div className="space-y-2 text-sm">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">WhatsApp</dt>
          <dd className="font-medium tabular-nums">{formatPhone(contact.wa_id)}</dd>
          <dt className="text-muted-foreground">Nombre</dt>
          <dd className="truncate">{contact.name || contact.profile_name || "—"}</dd>
          <dt className="text-muted-foreground">Correo</dt>
          <dd className="truncate">{contact.email || "—"}</dd>
          <dt className="text-muted-foreground">Dirección</dt>
          <dd>{contact.address || "—"}</dd>
          {contact.notes && (
            <>
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="whitespace-pre-wrap">{contact.notes}</dd>
            </>
          )}
        </dl>
        {contact.ai_summary && <p className="rounded-lg bg-secondary/60 p-2 text-xs"><span className="font-semibold">Resumen de Teo:</span> {contact.ai_summary}</p>}
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Editar datos</Button>
        )}
      </div>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const tags = String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
        start(async () => {
          const res = await updateContactAction(slug, {
            contactId: contact.id,
            name: String(fd.get("name") ?? ""),
            email: String(fd.get("email") ?? ""),
            address: String(fd.get("address") ?? ""),
            notes: String(fd.get("notes") ?? ""),
            tags,
          });
          if (res.ok) {
            toast.success("Cliente actualizado");
            setEditing(false);
          } else toast.error(res.error);
        });
      }}
    >
      <p className="text-xs text-muted-foreground">
        WhatsApp: <span className="font-medium text-foreground tabular-nums">{formatPhone(contact.wa_id)}</span>
        {contact.profile_name && contact.profile_name !== contact.name ? ` · perfil “${contact.profile_name}”` : ""}
      </p>
      <Field label="Nombre"><input name="name" defaultValue={contact.name ?? ""} className={field} disabled={readOnly} maxLength={120} /></Field>
      <Field label="Correo"><input name="email" type="email" defaultValue={contact.email ?? ""} className={field} disabled={readOnly} /></Field>
      <Field label="Dirección"><input name="address" defaultValue={contact.address ?? ""} className={field} disabled={readOnly} /></Field>
      <Field label="Etiquetas (separadas por coma)"><input name="tags" defaultValue={contact.tags.join(", ")} className={field} disabled={readOnly} /></Field>
      <Field label="Notas"><textarea name="notes" defaultValue={contact.notes ?? ""} rows={2} className={cn(field, "h-auto py-1.5")} disabled={readOnly} /></Field>
      {contact.ai_summary && <p className="rounded-lg bg-secondary/60 p-2 text-xs"><span className="font-semibold">Resumen de Teo:</span> {contact.ai_summary}</p>}
      {!readOnly && (
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="cta" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} Guardar cliente
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Etiquetas">
      {tags.map((t) => (
        <li key={t} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
          <Tag className="size-3" aria-hidden />{t}
        </li>
      ))}
    </ul>
  );
}

const ORDER_STATUS: Record<string, string> = { borrador: "Borrador", confirmado: "Confirmado", pagado: "Pagado", cancelado: "Cancelado" };

export function OrderPanel({ order }: { order: Order | null }) {
  return (
    <Panel title="Pedido actual" icon={<Package className="size-4" aria-hidden />} action={order ? <span className="text-xs text-muted-foreground">{ORDER_STATUS[order.status] ?? order.status}</span> : null}>
      {!order ? (
        <p className="text-sm text-muted-foreground">Sin pedido todavía. Teo lo arma cuando el cliente elige productos.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <table className="w-full">
            <caption className="sr-only">Ítems del pedido</caption>
            <thead className="sr-only"><tr><th>Producto</th><th>Cantidad</th><th>Subtotal</th></tr></thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="py-0.5 pr-2">{i.name}</td>
                  <td className="py-0.5 pr-2 text-muted-foreground tabular-nums">×{i.quantity}</td>
                  <td className="py-0.5 text-right tabular-nums">{formatMoney(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="space-y-0.5 border-t border-border pt-2 text-xs">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatMoney(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Envío</dt><dd className="tabular-nums">{formatMoney(order.shipping)}</dd></div>
            <div className="flex justify-between text-sm font-semibold"><dt>Total</dt><dd className="tabular-nums" data-testid="total-pedido">{formatMoney(order.total)}</dd></div>
          </dl>
          {order.delivery && (order.delivery.modo || order.delivery.direccion) && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{order.delivery.modo === "retiro" ? "Retiro en tienda" : "Envío"}</span>
              {order.delivery.direccion ? ` · ${order.delivery.direccion}` : ""}
              {order.delivery.referencia ? ` (${order.delivery.referencia})` : ""}
              {order.delivery.fecha ? ` · ${order.delivery.fecha}` : ""}
            </p>
          )}
          {order.notes && <p className="text-xs">{order.notes}</p>}
        </div>
      )}
    </Panel>
  );
}

const EXTRACTION_LABEL: Record<string, string> = { monto: "Monto", fecha: "Fecha", banco: "Banco", referencia: "Referencia", confianza: "Confianza" };

function extractionValue(k: string, v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (k === "monto") return formatMoney(Number(v));
  if (k === "confianza" && typeof v === "number") return `${Math.round(v * (v <= 1 ? 100 : 1))} %`;
  return String(v);
}

export function PaymentsPanel({ slug, payments, orderTotal, readOnly }: { slug: string; payments: Payment[]; orderTotal: number | null; readOnly: boolean }) {
  return (
    <Panel title="Pagos" icon={<Receipt className="size-4" aria-hidden />}>
      {!payments.length ? (
        <p className="text-sm text-muted-foreground">Aún no hay comprobantes.</p>
      ) : (
        <ul className="space-y-3">
          {payments.map((p) => <PaymentItem key={p.id} slug={slug} p={p} orderTotal={orderTotal} readOnly={readOnly} />)}
        </ul>
      )}
    </Panel>
  );
}

function PaymentItem({ slug, p, orderTotal, readOnly }: { slug: string; p: Payment; orderTotal: number | null; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const extraction = (p.ai_extraction ?? {}) as Record<string, unknown>;
  const keys = Object.keys(extraction).filter((k) => k in EXTRACTION_LABEL);
  const mismatch = orderTotal !== null && typeof extraction.monto === "number" && Math.abs(Number(extraction.monto) - orderTotal) > 0.009;

  function review(approve: boolean) {
    start(async () => {
      const res = await reviewPaymentAction(slug, { paymentId: p.id, approve, reason: approve ? undefined : reason });
      if (res.ok) {
        toast.success(approve ? "Pago confirmado. El caso pasó a “Confirmado”." : "Pago rechazado. El caso volvió a “Esperando pago”.");
        setOpen(false);
      } else toast.error(res.error);
    });
  }

  const statusChip =
    p.status === "pendiente" ? "bg-info/15 text-foreground" : p.status === "confirmado" ? "bg-cta/25 text-foreground" : "bg-destructive/10 text-destructive";

  return (
    <li className="space-y-2 rounded-lg border border-border p-2" data-testid="pago">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={cn("rounded-full px-2 py-0.5 font-semibold", statusChip)}>
          {p.status === "pendiente" ? "Por revisar" : p.status === "confirmado" ? "Confirmado" : "Rechazado"}
        </span>
        <span className="text-muted-foreground" suppressHydrationWarning>{formatDate(p.created_at, { withTime: true })}</span>
      </div>
      {p.receipt_url ? (
        p.receipt_mime === "application/pdf" ? (
          <a href={p.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm underline underline-offset-2">
            <FileText className="size-4" aria-hidden /> Ver comprobante (PDF)
          </a>
        ) : (
          <a href={p.receipt_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-border bg-muted" aria-label="Abrir comprobante en tamaño completo">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, temporal */}
            <img src={p.receipt_url} alt="Comprobante de pago" className="max-h-56 w-full object-contain" loading="lazy" />
          </a>
        )
      ) : p.receipt_path ? (
        <p className="text-xs text-muted-foreground">Comprobante no disponible.</p>
      ) : null}
      {(keys.length > 0 || p.declared_amount !== null) && (
        <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
          {p.declared_amount !== null && (
            <>
              <dt className="text-muted-foreground">Monto declarado</dt>
              <dd className="text-right tabular-nums">{formatMoney(p.declared_amount)}</dd>
            </>
          )}
          {keys.map((k) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{EXTRACTION_LABEL[k]} (IA)</dt>
              <dd className="text-right tabular-nums">{extractionValue(k, extraction[k])}</dd>
            </div>
          ))}
        </dl>
      )}
      {mismatch && <p className="text-xs font-medium text-destructive">El monto leído no coincide con el total del pedido.</p>}
      {p.status === "rechazado" && p.rejection_reason && <p className="text-xs">Motivo: {p.rejection_reason}</p>}
      {p.status === "pendiente" && !readOnly && (
        <div className="flex gap-2">
          <Button variant="cta" size="sm" className="flex-1" disabled={pending} onClick={() => review(true)}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Confirmar pago
          </Button>
          <Button variant="destructive" size="sm" disabled={pending} onClick={() => setOpen(true)}>
            <XCircle aria-hidden /> Rechazar
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar comprobante</DialogTitle>
            <DialogDescription>El caso vuelve a “Esperando pago”. Cuéntale al cliente qué pasó.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Motivo del rechazo</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={cn(field, "h-auto py-1.5")} placeholder="Ej.: el monto no coincide con el pedido" />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => review(false)}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} Rechazar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function HistoryPanel({ slug, history }: { slug: string; history: CaseDetailData["history"] }) {
  return (
    <Panel title="Historial de casos">
      {!history.length ? (
        <p className="text-sm text-muted-foreground">Es su primer caso.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {history.map((h) => (
            <li key={h.id}>
              <Link href={`/app/${slug}/casos/${h.number}`} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
                <StatusDot status={h.status} />
                <span className="font-medium tabular-nums">#{h.number}</span>
                <span className="truncate text-muted-foreground">{STATUS_LABEL[h.status]} · {TYPE_LABEL[h.type]}</span>
                <span className="ml-auto text-xs text-muted-foreground" suppressHydrationWarning>{formatDate(h.opened_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
