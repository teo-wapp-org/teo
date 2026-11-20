"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bot, ChevronDown, Keyboard, Loader2, UserRound, UserRoundPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assignCaseAction, setHandledByAction, transitionCaseAction } from "@/lib/actions/operacion";
import { allowedTargets, STATUS_LABEL, TYPE_LABEL, type BoardCase, type CaseStatus } from "@/lib/casos";
import type { CaseDetailData } from "@/lib/data/operacion";
import { formatMoney } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/use-realtime";
import { cn } from "@/lib/utils";
import { MemberAvatar, StatusBadge, StatusDot, TimeAgo, type MemberLite } from "./bits";
import { CaseChat, type ChatHandle } from "./case-chat";
import { ContactForm, HistoryPanel, OrderPanel, Panel, PaymentsPanel, TagList } from "./case-side";

type Props = {
  slug: string;
  orgId: string;
  userId: string;
  data: CaseDetailData;
  members: MemberLite[];
  queue: Pick<BoardCase, "id" | "number" | "status" | "contact_name" | "last_message_at">[];
  readOnly: boolean;
};

type Tab = "chat" | "cliente" | "casos";

export function CaseWorkspace({ slug, orgId, userId, data, members, queue, readOnly }: Props) {
  const { kase } = data;
  const router = useRouter();
  const chat = useRef<ChatHandle>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [pending, start] = useTransition();
  const handled = kase.conversation.handled_by;
  const assignee = members.find((m) => m.id === kase.assignee_id) ?? null;
  const name = kase.contact.name || kase.contact.profile_name || `+${kase.contact.wa_id}`;
  const base = `/app/${slug}`;

  // Cambios del caso y de sus pagos en vivo (otro operador, Teo o el backend).
  useRealtime(
    `case-meta:${kase.id}`,
    [
      { table: "cases", filter: `id=eq.${kase.id}`, event: "UPDATE" },
      { table: "payments", filter: `org_id=eq.${orgId}` },
    ],
    (table, payload) => {
      const row = payload.new as Record<string, unknown>;
      if (table === "cases" && row.status !== kase.status) router.refresh();
      if (table === "payments" && (data.order?.id === row.order_id || payload.eventType === "INSERT")) router.refresh();
    },
  );

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    if (readOnly) {
      toast.error("Modo solo lectura.");
      return;
    }
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(success);
      else toast.error(res.error ?? "No se pudo completar la acción.");
    });
  }

  const toggleHandled = () =>
    run(
      () => setHandledByAction(slug, { caseId: kase.id, to: handled === "teo" ? "humano" : "teo" }),
      handled === "teo" ? "Tomaste el caso. Teo solo sugerirá respuestas." : "Caso devuelto a Teo.",
    );
  const transition = (to: CaseStatus | null) =>
    run(() => transitionCaseAction(slug, { caseId: kase.id, to }), to ? `Caso movido a “${STATUS_LABEL[to]}”` : "El caso volvió a su estado anterior");
  const assign = (id: string | null) =>
    run(() => assignCaseAction(slug, { caseId: kase.id, userId: id }), id ? "Caso asignado" : "Asignación quitada");

  // Atajos: J/K navegar, R responder, 1–3 sugerencias, E escalar / devolver a Teo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=dialog]") || t.isContentEditable)) return;
      const idx = queue.findIndex((q) => q.id === kase.id);
      if (e.key === "j" || e.key === "k") {
        const next = queue[idx + (e.key === "j" ? 1 : -1)];
        if (next) router.push(`${base}/casos/${next.number}`);
      } else if (e.key === "r") {
        e.preventDefault();
        setTab("chat");
        chat.current?.focusComposer();
      } else if (["1", "2", "3"].includes(e.key)) {
        setTab("chat");
        chat.current?.applySuggestion(Number(e.key) - 1);
      } else if (e.key === "e") {
        if (kase.status === "requiere_atencion") {
          run(() => setHandledByAction(slug, { caseId: kase.id, to: "teo" }), "Caso devuelto a Teo.");
        } else if (allowedTargets(kase.status).includes("requiere_atencion")) {
          run(() => transitionCaseAction(slug, { caseId: kase.id, to: "requiere_atencion", reason: "escalado por operador" }), "Caso escalado a “Requiere atención”");
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const targets = allowedTargets(kase.status);

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-4rem)]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href={`${base}/casos`} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))} aria-label="Volver a casos">
          <ArrowLeft aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">
            <span className="text-muted-foreground tabular-nums">#{kase.number}</span> {name}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{TYPE_LABEL[kase.type]}</span>
            {kase.estimated_amount ? <span className="font-semibold text-foreground">{formatMoney(kase.estimated_amount)}</span> : null}
            <span>en el estado hace <TimeAgo iso={kase.status_changed_at} mode="duration" /></span>
          </p>
        </div>
        <StatusBadge status={kase.status} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="atiende">
            {handled === "teo" ? <Bot className="size-4" aria-hidden /> : <UserRound className="size-4" aria-hidden />}
            Atiende: <span className="font-semibold text-foreground">{handled === "teo" ? "Teo" : "Humano"}</span>
          </span>
          <button
            type="button"
            onClick={toggleHandled}
            disabled={pending || readOnly}
            className={cn(buttonVariants({ variant: handled === "teo" ? "default" : "secondary", size: "sm" }))}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {handled === "teo" ? "Tomar caso" : "Devolver a Teo"}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} disabled={readOnly}>
              {assignee ? <MemberAvatar member={assignee} /> : <UserRoundPlus aria-hidden />}
              <span className="max-w-28 truncate">{assignee ? assignee.name : "Asignar"}</span>
              <ChevronDown aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Asignar caso</DropdownMenuLabel>
                {kase.assignee_id !== userId && <DropdownMenuItem onClick={() => assign(userId)}>Asignarme</DropdownMenuItem>}
                {members.filter((m) => m.id !== userId).map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => assign(m.id)}>{m.name}</DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              {kase.assignee_id && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => assign(null)}>Quitar asignación</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} disabled={readOnly || targets.length === 0}>
              Cambiar estado <ChevronDown aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Mover a…</DropdownMenuLabel>
                {kase.status === "requiere_atencion" && (
                  <DropdownMenuItem onClick={() => transition(null)}>
                    Volver a “{STATUS_LABEL[kase.previous_status ?? "en_conversacion"]}”
                  </DropdownMenuItem>
                )}
                {targets.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => transition(s)}>
                    <StatusDot status={s} /> {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div role="tablist" aria-label="Secciones del caso" className="grid grid-cols-3 rounded-lg bg-muted p-0.5 lg:hidden">
        {(["chat", "cliente", "casos"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            aria-controls={`tab-${t}`}
            onClick={() => setTab(t)}
            className={cn("h-8 rounded-md text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50", tab === t ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {t === "chat" ? "Chat" : t === "cliente" ? "Cliente y pedido" : "Otros casos"}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[230px_minmax(0,1fr)_340px]">
        <nav
          id="tab-casos"
          aria-label="Casos abiertos"
          className={cn("min-h-0 overflow-y-auto rounded-xl border border-border bg-card p-2 lg:hidden xl:block", tab !== "casos" && "hidden")}
        >
          <p className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground">
            Casos abiertos
            <span className="inline-flex items-center gap-1 font-normal" title="J / K para navegar"><Keyboard className="size-3" aria-hidden /> J/K</span>
          </p>
          <ul className="space-y-0.5">
            {queue.map((q) => (
              <li key={q.id}>
                <Link
                  href={`${base}/casos/${q.number}`}
                  aria-current={q.id === kase.id ? "page" : undefined}
                  className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted", q.id === kase.id && "bg-secondary font-semibold")}
                >
                  <StatusDot status={q.status} />
                  <span className="truncate">{q.contact_name}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">#{q.number}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section
          id="tab-chat"
          aria-label="Chat del caso"
          className={cn("flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-card lg:min-h-0", tab !== "chat" && "hidden lg:flex")}
        >
          <CaseChat
            ref={chat}
            slug={slug}
            caseId={kase.id}
            messages={data.messages}
            hasMore={data.hasMore}
            events={data.events}
            suggestions={data.suggestions}
            channel={kase.conversation.channel}
            lastInboundAt={kase.conversation.last_inbound_at}
            members={members}
            readOnly={readOnly}
          />
        </section>

        <aside id="tab-cliente" aria-label="Cliente y pedido" className={cn("min-h-0 space-y-3 overflow-y-auto", tab !== "cliente" && "hidden lg:block")}>
          <Panel title="Cliente" action={<Link href={`${base}/clientes/${kase.contact.id}`} className="text-xs underline underline-offset-2">Ver ficha</Link>}>
            <div className="mb-2"><TagList tags={kase.contact.tags} /></div>
            <ContactForm key={kase.contact.id} slug={slug} contact={kase.contact} readOnly={readOnly} />
          </Panel>
          {data.payments.some((p) => p.status === "pendiente") && (
            <PaymentsPanel slug={slug} payments={data.payments} orderTotal={data.order?.total ?? null} readOnly={readOnly} />
          )}
          <OrderPanel order={data.order} />
          {!data.payments.some((p) => p.status === "pendiente") && (
            <PaymentsPanel slug={slug} payments={data.payments} orderTotal={data.order?.total ?? null} readOnly={readOnly} />
          )}
          <HistoryPanel slug={slug} history={data.history} />
        </aside>
      </div>
    </div>
  );
}
