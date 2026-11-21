"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { AlertTriangle, Bot, Info, Loader2, RotateCcw, SendHorizontal, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CASE_STATUS, formatUsd } from "@/lib/case-status";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SimMessage = {
  id: string;
  direction: "in" | "out";
  author: string;
  type: string;
  body: string | null;
  media_url: string | null;
  created_at: string;
};

type SimState = {
  replies: { messageId: string; type: string; body: string }[];
  skipped: "humano" | "ia_pausada" | "desactivado" | "copiloto" | "cupo_agotado" | "suspendido" | "sin_mensajes" | null;
  handled_by: "teo" | "humano";
  agent: { enabled: boolean; mode: "piloto" | "copiloto" };
  case: { id: string; number: number; status: string; type: string; open: boolean } | null;
  order: {
    status: string;
    items: { name: string; quantity: number; unit_price: number; subtotal: number }[];
    subtotal: number;
    shipping: number;
    total: number;
  } | null;
  messages: SimMessage[];
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" });

function notices(s: SimState | null): { tone: "info" | "warn"; text: string }[] {
  if (!s) return [];
  const out: { tone: "info" | "warn"; text: string }[] = [];
  if (!s.agent.enabled) out.push({ tone: "warn", text: "Teo está desactivado: no responde, solo sugiere al equipo." });
  if (s.agent.mode === "copiloto") out.push({ tone: "info", text: "Teo está en modo copiloto: genera sugerencias y una persona envía las respuestas." });
  if (s.handled_by === "humano") out.push({ tone: "warn", text: "La conversación pasó a una persona del equipo. Teo solo sugiere respuestas." });
  if (s.skipped === "cupo_agotado") out.push({ tone: "warn", text: "Se agotaron los mensajes de tu plan: Teo pasó a modo copiloto." });
  if (s.skipped === "ia_pausada") out.push({ tone: "warn", text: "El equipo de Teo pausó las respuestas automáticas por un momento: Teo solo sugiere." });
  if (s.skipped === "suspendido") out.push({ tone: "warn", text: "El comercio está suspendido: Teo no responde." });
  return out;
}

export function Simulator({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [state, setState] = useState<SimState | null>(null);
  const [pending, setPending] = useState<SimMessage | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const call = useCallback(
    async (body: { text?: string; reset?: boolean }) => {
      setBusy(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data, error } = await supabase.functions.invoke<SimState>("agent/simulate", { body: { org_id: orgId, ...body } });
        if (error) {
          let msg = "No pudimos hablar con Teo. Intenta de nuevo.";
          if (error instanceof FunctionsHttpError) {
            const j = await error.context.json().catch(() => null);
            if (j?.error === "sin_acceso") msg = "No tienes acceso a este comercio.";
          }
          throw new Error(msg);
        }
        setState(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado");
      } finally {
        setPending(null);
        setBusy(false);
      }
    },
    [orgId],
  );

  // Estado inicial (historial del simulador). setState solo dentro del callback asíncrono.
  useEffect(() => {
    let alive = true;
    createClient()
      .functions.invoke<SimState>("agent/simulate", { body: { org_id: orgId } })
      .then(({ data, error }) => {
        if (!alive) return;
        if (data) setState(data);
        if (error) setError("No pudimos cargar el simulador. Intenta de nuevo.");
      });
    return () => {
      alive = false;
    };
  }, [orgId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [state, pending, busy]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    setPending({ id: "pending", direction: "in", author: "cliente", type: "text", body: t, media_url: null, created_at: new Date().toISOString() });
    await call({ text: t });
  };

  const messages = [...(state?.messages ?? []), ...(pending ? [pending] : [])];
  const status = state?.case ? CASE_STATUS[state.case.status] : null;
  const avisos = notices(state);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Chat estilo WhatsApp */}
      <section aria-label="Chat de prueba" className="flex h-[70dvh] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex items-center gap-3 bg-navy px-4 py-3 text-navy-foreground">
          <Image src="/brand/personaje.png" alt="" width={320} height={327} className="size-9 rounded-full bg-white/10 object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{orgName}</p>
            <p className="text-xs text-navy-foreground/70" aria-live="polite">{busy ? "escribiendo…" : "Atendido por Teo · simulador"}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="text-navy-foreground hover:bg-white/10 hover:text-navy-foreground" disabled={busy} onClick={() => call({ reset: true })}>
            <RotateCcw aria-hidden /> Reiniciar conversación
          </Button>
        </header>

        <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto bg-muted px-3 py-4 sm:px-6" role="log" aria-label="Mensajes">
          {messages.length === 0 && !busy && (
            <div className="mx-auto mt-10 max-w-sm rounded-xl bg-card p-4 text-center text-sm text-muted-foreground shadow-sm">
              <Bot className="mx-auto mb-2 size-6 text-foreground" aria-hidden />
              Escribe un mensaje como si fueras un cliente. Por ejemplo: “hola, ¿qué tienen?”
            </div>
          )}
          {messages.map((m) => {
            const mine = m.direction === "in"; // quien prueba juega el rol del cliente
            const human = m.author.startsWith("user:");
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  data-testid={mine ? "msg-cliente" : "msg-teo"}
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                    mine ? "rounded-br-sm bg-secondary text-secondary-foreground" : "rounded-bl-sm bg-card text-card-foreground",
                    m.id === "pending" && "opacity-70",
                  )}
                >
                  {!mine && (
                    <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                      {human ? <UserRound className="size-3" aria-hidden /> : <Bot className="size-3" aria-hidden />}
                      {human ? "Equipo" : "Teo"}
                    </p>
                  )}
                  {m.type === "image" && m.media_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.media_url} alt={m.body ?? "Foto del producto"} className="mb-1 max-h-60 rounded-lg" />
                  ) : null}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{time(m.created_at)}</p>
                </div>
              </div>
            );
          })}
          {busy && pending && (
            <div className="flex justify-start" aria-hidden>
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
                <Loader2 className="size-3 animate-spin" /> Teo está escribiendo…
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="border-t border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
        )}
        <form onSubmit={send} className="flex items-center gap-2 border-t border-border bg-card p-3">
          <label htmlFor="sim-text" className="sr-only">Escribe un mensaje</label>
          <input
            id="sim-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe un mensaje"
            autoComplete="off"
            maxLength={2000}
            className="h-10 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button type="submit" variant="cta" size="icon-lg" className="rounded-full" disabled={busy || !text.trim()} aria-label="Enviar">
            <SendHorizontal aria-hidden />
          </Button>
        </form>
      </section>

      {/* Panel lateral: caso, pedido y avisos */}
      <aside className="space-y-4" aria-label="Estado de la conversación">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Estado del caso</h2>
          {state?.case && status ? (
            <div className="mt-2 space-y-1">
              <span data-testid="case-status" className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold", status.chip)}>
                <span className={cn("size-2.5 rounded-full", status.dot)} aria-hidden />
                {status.label}
              </span>
              <p className="text-xs text-muted-foreground">Caso #{state.case.number} · {state.case.type}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Aún no hay un caso. Se abre con el primer mensaje.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Pedido</h2>
          {state?.order && state.order.items.length ? (
            <div className="mt-2 space-y-2 text-sm">
              <ul className="space-y-1">
                {state.order.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-2">
                    <span>{i.quantity} × {i.name}</span>
                    <span className="tabular-nums">{formatUsd(i.subtotal)}</span>
                  </li>
                ))}
              </ul>
              {state.order.shipping > 0 && (
                <p className="flex justify-between text-muted-foreground"><span>Envío</span><span className="tabular-nums">{formatUsd(state.order.shipping)}</span></p>
              )}
              <p className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>Total</span>
                <span data-testid="order-total" className="tabular-nums">{formatUsd(state.order.total)}</span>
              </p>
              <p className="text-xs text-muted-foreground">Pedido {state.order.status === "borrador" ? "en borrador" : state.order.status}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Sin pedido todavía.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4" aria-live="polite">
          <h2 className="text-sm font-semibold text-muted-foreground">Avisos</h2>
          {avisos.length ? (
            <ul className="mt-2 space-y-2">
              {avisos.map((a) => (
                <li key={a.text} className={cn("flex gap-2 rounded-lg p-2 text-sm", a.tone === "warn" ? "bg-warning/15" : "bg-info/10")}>
                  {a.tone === "warn" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden />}
                  {a.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Teo responde en piloto automático.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
