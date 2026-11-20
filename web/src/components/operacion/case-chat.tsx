"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertCircle, ArrowRightLeft, Check, CheckCheck, Clock, FileText, Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMessageAction, setSuggestionStateAction } from "@/lib/actions/operacion";
import { authorKind, STATUS_LABEL, windowState } from "@/lib/casos";
import type { CaseEvent, ChatMessage, Suggestion } from "@/lib/data/operacion";
import { dayKey, formatDate, formatTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/use-realtime";
import { cn } from "@/lib/utils";
import { useNow, type MemberLite } from "./bits";

const MESSAGE_SELECT = "id, direction, author, type, body, media_path, media_mime, status, error, created_at";
const PAGE = 50;

export type ChatHandle = { focusComposer: () => void; applySuggestion: (index: number) => void };

type Props = {
  slug: string;
  caseId: string;
  messages: ChatMessage[];
  hasMore: boolean;
  events: CaseEvent[];
  suggestions: Suggestion[];
  channel: string;
  lastInboundAt: string | null;
  members: MemberLite[];
  readOnly: boolean;
};

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map(a.map((x) => [x.id, x]));
  for (const x of b) map.set(x.id, { ...map.get(x.id), ...x });
  return [...map.values()];
}

export const CaseChat = forwardRef<ChatHandle, Props>(function CaseChat(props, ref) {
  const { slug, caseId, channel, lastInboundAt, members, readOnly } = props;
  const [messages, setMessages] = useState(props.messages);
  const [srcMessages, setSrcMessages] = useState(props.messages);
  if (srcMessages !== props.messages) {
    setSrcMessages(props.messages);
    setMessages((cur) => mergeById(cur, props.messages));
  }
  const [hasMore, setHasMore] = useState(props.hasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [suggestions, setSuggestions] = useState(props.suggestions);
  const [srcSugg, setSrcSugg] = useState(props.suggestions);
  if (srcSugg !== props.suggestions) {
    setSrcSugg(props.suggestions);
    setSuggestions(props.suggestions);
  }
  const [suggStatus, setSuggStatus] = useState<"idle" | "loading" | "unavailable">("idle");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [sending, startSend] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const now = useNow(60_000);
  const win = windowState(lastInboundAt, channel, now);
  const blocked = readOnly || !win.open;

  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const actorName = (actor: string) =>
    actor === "teo" ? "Teo" : actor === "sistema" ? "Sistema" : actor.startsWith("user:") ? memberName.get(actor.slice(5)) ?? "Un operador" : actor;

  async function signIfNeeded(m: ChatMessage): Promise<ChatMessage> {
    if (!m.media_path || m.media_url) return m;
    const { data } = await createClient().storage.from("media").createSignedUrl(m.media_path, 3600);
    return { ...m, media_url: data?.signedUrl ?? null };
  }

  useRealtime(
    `case:${caseId}`,
    [
      { table: "messages", filter: `case_id=eq.${caseId}` },
      { table: "ai_suggestions", filter: `case_id=eq.${caseId}` },
    ],
    async (table, payload) => {
      const row = payload.new as Record<string, unknown>;
      if (!row?.id) return;
      if (table === "messages") {
        const m = await signIfNeeded(row as unknown as ChatMessage);
        setMessages((cur) => mergeById(cur, [m]));
      } else {
        const s = row as unknown as Suggestion;
        setSuggestions((cur) => {
          const rest = cur.filter((x) => x.id !== s.id);
          return s.state === "nueva" ? [s, ...rest].slice(0, 3) : rest;
        });
      }
    },
  );

  const sorted = useMemo(() => [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)), [messages]);
  const oldest = sorted[0]?.created_at;
  const timeline = useMemo(() => {
    type Item = { kind: "msg"; at: string; m: ChatMessage } | { kind: "evt"; at: string; e: CaseEvent };
    const items: Item[] = [
      ...sorted.map((m) => ({ kind: "msg" as const, at: m.created_at, m })),
      ...props.events.filter((e) => !hasMore || !oldest || e.created_at >= oldest).map((e) => ({ kind: "evt" as const, at: e.created_at, e })),
    ];
    items.sort((a, b) => a.at.localeCompare(b.at));
    return items.map((it, i) => ({ ...it, showDay: i === 0 || dayKey(items[i - 1].at) !== dayKey(it.at) }));
  }, [sorted, props.events, hasMore, oldest]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [timeline.length]);

  async function loadOlder() {
    if (!oldest) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const { data, error } = await createClient()
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("case_id", caseId)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    setLoadingOlder(false);
    if (error) {
      toast.error("No pudimos cargar mensajes anteriores.");
      return;
    }
    const older = await Promise.all(((data ?? []) as ChatMessage[]).map(signIfNeeded));
    stickToBottom.current = false;
    setHasMore(older.length === PAGE);
    setMessages((cur) => mergeById(older, cur));
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  function applySuggestion(index: number) {
    const s = suggestions[index];
    if (!s || blocked) return;
    setPicked(s);
    setText(s.text);
    requestAnimationFrame(() => composer.current?.focus());
  }

  useImperativeHandle(ref, () => ({ focusComposer: () => composer.current?.focus(), applySuggestion }));

  async function discard(s: Suggestion) {
    setSuggestions((cur) => cur.filter((x) => x.id !== s.id));
    if (picked?.id === s.id) setPicked(null);
    const res = await setSuggestionStateAction(slug, { id: s.id, state: "descartada" });
    if (!res.ok) toast.error(res.error);
  }

  async function requestSuggestions() {
    setSuggStatus("loading");
    const supabase = createClient();
    try {
      const { error } = await supabase.functions.invoke("agent/suggest", { body: { case_id: caseId } });
      if (error) throw error;
      const { data } = await supabase.from("ai_suggestions").select("id, text, state, created_at").eq("case_id", caseId).eq("state", "nueva").order("created_at", { ascending: false }).limit(3);
      setSuggestions((data ?? []) as Suggestion[]);
      setSuggStatus("idle");
    } catch {
      setSuggStatus("unavailable");
    }
  }

  function send() {
    const body = text.trim();
    if (!body || blocked || sending) return;
    const suggestion = picked ? { id: picked.id, text: picked.text } : undefined;
    startSend(async () => {
      const res = await sendMessageAction(slug, { caseId, body, suggestion });
      if (!res.ok) {
        toast.error("No se envió el mensaje", { description: res.error });
        return;
      }
      setText("");
      if (picked) setSuggestions((cur) => cur.filter((x) => x.id !== picked.id));
      setPicked(null);
      stickToBottom.current = true;
      if (res.id) {
        const optimistic: ChatMessage = {
          id: res.id, direction: "out", author: "user:me", type: "text", body, media_path: null, media_mime: null,
          status: channel === "whatsapp" ? "queued" : "sent", error: null, created_at: new Date().toISOString(),
        };
        setMessages((cur) => (cur.some((m) => m.id === res.id) ? cur : [...cur, optimistic]));
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
        {channel === "simulador" ? (
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Simulador</span>
        ) : win.open ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium" suppressHydrationWarning>
            <Clock className="size-3" aria-hidden /> Ventana abierta · quedan {win.hoursLeft} h
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive" role="status">
            <AlertCircle className="size-3" aria-hidden /> Ventana cerrada: solo plantilla
          </span>
        )}
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-64 flex-1 space-y-2 overflow-y-auto bg-[color-mix(in_oklch,var(--background),var(--secondary)_12%)] px-3 py-3"
        role="log"
        aria-label="Conversación"
        aria-live="polite"
      >
        {hasMore && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder && <Loader2 className="animate-spin" aria-hidden />} Cargar mensajes anteriores
            </Button>
          </div>
        )}
        {timeline.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay mensajes en este caso.</p>}
        {timeline.map((it) => {
          const showDay = it.showDay;
          return (
            <div key={it.kind === "msg" ? it.m.id : `e${it.e.id}`}>
              {showDay && (
                <p className="my-2 text-center text-[11px] font-medium text-muted-foreground" suppressHydrationWarning>
                  <span className="rounded-full bg-card px-2 py-0.5 shadow-xs">{formatDate(it.at)}</span>
                </p>
              )}
              {it.kind === "evt" ? (
                <p className="flex items-center justify-center gap-1.5 py-1 text-center text-xs text-muted-foreground" data-testid="evento-caso">
                  <ArrowRightLeft className="size-3" aria-hidden />
                  <span>
                    {actorName(it.e.actor)} cambió el estado {it.e.from_status ? `de “${STATUS_LABEL[it.e.from_status]}” ` : ""}a “{it.e.to_status ? STATUS_LABEL[it.e.to_status] : "—"}”
                    {it.e.reason ? ` · ${it.e.reason}` : ""}
                  </span>
                  <span suppressHydrationWarning>· {formatTime(it.e.created_at)}</span>
                </p>
              ) : (
                <Bubble m={it.m} authorLabel={it.m.author === "user:me" ? "Tú" : actorName(it.m.author)} />
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-border bg-card p-2">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Sugerencias de Teo" role="group">
          {suggestions.map((s, i) => (
            <span key={s.id} className="inline-flex max-w-full items-center rounded-full bg-secondary text-secondary-foreground">
              <button
                type="button"
                onClick={() => applySuggestion(i)}
                disabled={blocked}
                className="max-w-[16rem] cursor-pointer truncate rounded-l-full py-1 pr-1 pl-2.5 text-left text-xs outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed sm:max-w-md"
                title={s.text}
              >
                <span className="mr-1 font-semibold" aria-hidden>{i + 1}</span>
                <span className="sr-only">Usar sugerencia {i + 1}: </span>
                {s.text}
              </button>
              <button
                type="button"
                onClick={() => discard(s)}
                disabled={readOnly}
                aria-label={`Descartar sugerencia ${i + 1}`}
                className="cursor-pointer rounded-r-full py-1 pr-2 pl-1 outline-none hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <Button variant="ghost" size="xs" onClick={requestSuggestions} disabled={readOnly || suggStatus === "loading"}>
            {suggStatus === "loading" ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            Pedir sugerencias
          </Button>
          {suggStatus === "unavailable" && (
            <span className="text-xs text-muted-foreground" role="status">Sugerencias no disponibles</span>
          )}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="sr-only" htmlFor={`composer-${caseId}`}>Escribe una respuesta</label>
          <textarea
            id={`composer-${caseId}`}
            ref={composer}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!e.target.value) setPicked(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            disabled={blocked}
            placeholder={readOnly ? "Solo lectura" : !win.open ? "Ventana de 24 h cerrada: solo se pueden enviar plantillas" : "Escribe una respuesta… (Enter envía, Shift+Enter salto de línea)"}
            className="max-h-40 min-h-10 flex-1 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button type="submit" variant="cta" size="lg" disabled={blocked || sending || !text.trim()}>
            {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            Enviar
          </Button>
        </form>
      </div>
    </div>
  );
});

function Ticks({ m }: { m: ChatMessage }) {
  if (m.direction !== "out") return null;
  const label: Record<string, string> = { queued: "En cola", sent: "Enviado", delivered: "Entregado", read: "Leído", failed: "No enviado" };
  const icon =
    m.status === "queued" ? <Clock className="size-3" aria-hidden /> :
    m.status === "sent" ? <Check className="size-3" aria-hidden /> :
    m.status === "delivered" ? <CheckCheck className="size-3" aria-hidden /> :
    m.status === "read" ? <CheckCheck className="size-3 text-info" aria-hidden /> :
    m.status === "failed" ? <AlertCircle className="size-3 text-destructive" aria-hidden /> : null;
  return (
    <span className="inline-flex items-center" title={label[m.status] ?? m.status} data-testid="estado-mensaje" data-status={m.status}>
      {icon}
      <span className="sr-only">{label[m.status] ?? m.status}</span>
    </span>
  );
}

function Media({ m }: { m: ChatMessage }) {
  if (!m.media_path) return null;
  if (!m.media_url) return <p className="text-xs italic opacity-70">Archivo no disponible</p>;
  const mime = m.media_mime ?? "";
  if (m.type === "image" || mime.startsWith("image/")) {
    return (
      <a href={m.media_url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, temporal */}
        <img src={m.media_url} alt="Imagen enviada en el chat" className="max-h-60 rounded-md object-contain" loading="lazy" />
      </a>
    );
  }
  if (m.type === "audio" || mime.startsWith("audio/")) return <audio controls src={m.media_url} className="max-w-full" />;
  return (
    <a href={m.media_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-2">
      <FileText className="size-4" aria-hidden /> Ver documento
    </a>
  );
}

function Bubble({ m, authorLabel }: { m: ChatMessage; authorLabel: string }) {
  const kind = authorKind(m.author === "user:me" ? "user:me" : m.author);
  if (kind === "sistema") {
    return <p className="py-1 text-center text-xs text-muted-foreground italic">{m.body}</p>;
  }
  const mine = m.direction === "out";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")} data-testid="mensaje" data-author={kind}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm shadow-xs sm:max-w-[70%]",
          kind === "cliente" && "rounded-tl-sm border border-border bg-card",
          kind === "teo" && "rounded-tr-sm bg-secondary text-secondary-foreground",
          kind === "operador" && "rounded-tr-sm bg-primary text-primary-foreground",
        )}
      >
        {mine && <p className="mb-0.5 text-[11px] font-semibold opacity-80">{authorLabel}</p>}
        <Media m={m} />
        {m.body && <p className="break-words whitespace-pre-wrap">{m.body}</p>}
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-75">
          <span suppressHydrationWarning>{formatTime(m.created_at)}</span>
          <Ticks m={m} />
        </p>
        {m.status === "failed" && (
          <p className="mt-0.5 text-[11px] font-medium">
            {m.error === "ventana_cerrada" ? "No enviado: la ventana de 24 h está cerrada." : `No enviado${m.error ? `: ${m.error}` : ""}`}
          </p>
        )}
      </div>
    </div>
  );
}
