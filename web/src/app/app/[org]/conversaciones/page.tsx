import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Search, UserRound } from "lucide-react";
import { z } from "zod";
import { EmptyState, StatusDot } from "@/components/operacion/bits";
import { Bubble } from "@/components/operacion/case-chat";
import { buttonVariants } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth";
import { CLOSED_STATUSES, contactDisplayName, STATUS_LABEL, type CaseStatus } from "@/lib/casos";
import { getMembers, MESSAGE_SELECT, messagePreview, signMedia, type ChatMessage } from "@/lib/data/operacion";
import { cleanSearch, formatDate, formatTime, truncate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversaciones" };

type Row = {
  id: string;
  channel: string;
  handled_by: "teo" | "humano";
  last_message_at: string | null;
  contact: { id: string; name: string | null; profile_name: string | null; wa_id: string };
  messages: { body: string | null; type: string; direction: "in" | "out"; created_at: string }[];
  cases: { number: number; status: CaseStatus }[];
};

export default async function ConversacionesPage({ params, searchParams }: PageProps<"/app/[org]/conversaciones">) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { org } = await requireOrg(slug);
  const q = cleanSearch(typeof sp.q === "string" ? sp.q : "");
  const selected = typeof sp.c === "string" ? sp.c : null;
  if (selected && !z.uuid().safeParse(selected).success) notFound();
  const supabase = await createClient();
  const base = `/app/${org.slug}`;

  let query = supabase
    .from("conversations")
    .select(
      "id, channel, handled_by, last_message_at, " +
        "contact:contacts!conversations_contact_id_org_id_fkey!inner(id, name, profile_name, wa_id), " +
        "messages!messages_conversation_id_org_id_fkey(body, type, direction, created_at), " +
        "cases!cases_conversation_id_org_id_fkey(number, status)",
    )
    .eq("org_id", org.id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" })
    .order("number", { referencedTable: "cases", ascending: false })
    .limit(60);
  if (q) query = query.or(`name.ilike.%${q}%,profile_name.ilike.%${q}%,wa_id.ilike.%${q}%`, { referencedTable: "contacts" });
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];

  let history: { row: Row; messages: ChatMessage[] } | null = null;
  if (selected) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, channel, handled_by, last_message_at, contact:contacts!conversations_contact_id_org_id_fkey(id, name, profile_name, wa_id), cases!cases_conversation_id_org_id_fkey(number, status)")
      .eq("org_id", org.id)
      .eq("id", selected)
      .maybeSingle();
    if (!conv) notFound();
    const { data: msgs } = await supabase.from("messages").select(MESSAGE_SELECT).eq("org_id", org.id).eq("conversation_id", selected).order("created_at", { ascending: false }).limit(50);
    const messages = ((msgs ?? []) as ChatMessage[]).reverse();
    const urls = await signMedia(messages.map((m) => m.media_path));
    for (const m of messages) m.media_url = m.media_path ? urls[m.media_path] ?? null : null;
    history = { row: { ...(conv as unknown as Row), messages: [] }, messages };
  }
  const members = history ? await getMembers(org.id) : [];
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const authorLabel = (a: string) => (a === "teo" ? "Teo" : a.startsWith("user:") ? memberName.get(a.slice(5)) ?? "Operador" : a);
  const openCase = (r: Pick<Row, "cases">) => (r.cases ?? []).find((c) => !CLOSED_STATUSES.includes(c.status));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Conversaciones</h1>
        <p className="text-sm text-muted-foreground">Todas las conversaciones, de la más reciente a la más antigua.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section aria-label="Bandeja" className={cn("rounded-xl border border-border bg-card", history && "hidden lg:block")}>
          <form className="border-b border-border p-2" role="search">
            <label className="relative block">
              <span className="sr-only">Buscar conversaciones</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Buscar por nombre o teléfono"
                className="h-8 w-full rounded-lg border border-input bg-background pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
          </form>
          {rows.length === 0 ? (
            <EmptyState title={q ? "Sin resultados" : "Aún no hay conversaciones"}>
              {q ? "Prueba con otro nombre o número." : "Cuando un cliente escriba, verás la conversación aquí."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const last = r.messages?.[0];
                const open = openCase(r);
                const waiting = last?.direction === "in";
                const href = open ? `${base}/casos/${open.number}` : `${base}/conversaciones?c=${r.id}`;
                return (
                  <li key={r.id}>
                    <Link href={href} className={cn("flex gap-3 px-3 py-2.5 hover:bg-muted/60", selected === r.id && "bg-secondary/60")} data-testid="conversacion">
                      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground" aria-hidden>
                        {r.handled_by === "teo" ? <Bot className="size-4" /> : <UserRound className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={cn("truncate text-sm", waiting ? "font-bold" : "font-medium")}>{contactDisplayName(r.contact)}</span>
                          {r.last_message_at && <span className="ml-auto shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>{formatTime(r.last_message_at)}</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {last?.direction === "out" ? "Tú/Teo: " : ""}
                          {truncate(messagePreview(last) ?? "Sin mensajes", 80)}
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          {open ? (
                            <span className="inline-flex items-center gap-1"><StatusDot status={open.status} />#{open.number} · {STATUS_LABEL[open.status]}</span>
                          ) : (
                            <span>Sin caso abierto</span>
                          )}
                          {waiting && <span className="ml-auto rounded-full bg-destructive px-1.5 py-px font-semibold text-white">Sin responder</span>}
                          {r.channel === "simulador" && <span className="rounded bg-muted px-1">Simulador</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Historial" className={cn("flex min-h-[60vh] flex-col rounded-xl border border-border bg-card", !history && "hidden lg:flex")}>
          {!history ? (
            <EmptyState title="Elige una conversación" className="my-auto">
              Si tiene un caso abierto, te llevamos directo al caso. Si no, verás su historial aquí.
            </EmptyState>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border p-3">
                <Link href={`${base}/conversaciones`} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "lg:hidden")} aria-label="Volver a la bandeja">
                  <ArrowLeft aria-hidden />
                </Link>
                <h2 className="font-semibold">{contactDisplayName(history.row.contact)}</h2>
                <Link href={`${base}/clientes/${history.row.contact.id}`} className="ml-auto text-xs underline underline-offset-2">Ver ficha</Link>
                {openCase(history.row) && (
                  <Link href={`${base}/casos/${openCase(history.row)!.number}`} className={buttonVariants({ variant: "cta", size: "sm" })}>
                    Abrir caso #{openCase(history.row)!.number}
                  </Link>
                )}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-[color-mix(in_oklch,var(--background),var(--secondary)_12%)] p-3" role="log" aria-label="Historial de la conversación">
                {history.messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sin mensajes.</p>
                ) : (
                  history.messages.map((m) => <Bubble key={m.id} m={m} authorLabel={authorLabel(m.author)} />)
                )}
              </div>
              <p className="border-t border-border p-2 text-center text-xs text-muted-foreground">
                Últimos {history.messages.length} mensajes{history.messages[0] ? ` desde el ${formatDate(history.messages[0].created_at)}` : ""}.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
