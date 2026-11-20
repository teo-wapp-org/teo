"use client";

import { useEffect, useRef } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Sub = { table: string; filter?: string; event?: "INSERT" | "UPDATE" | "DELETE" | "*" };
type Row = Record<string, unknown>;

/**
 * Suscripción a cambios de Postgres con la sesión del usuario (RLS filtra lo que llega).
 * `subs` debe ser estable en contenido; el callback puede cambiar sin re-suscribir.
 */
export function useRealtime(channel: string, subs: Sub[], onChange: (table: string, payload: RealtimePostgresChangesPayload<Row>) => void) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  const key = JSON.stringify(subs);

  useEffect(() => {
    const supabase = createClient();
    const list = JSON.parse(key) as Sub[];
    let cancelled = false;
    let ch: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      ch = supabase.channel(`${channel}:${Math.random().toString(36).slice(2, 8)}`);
      for (const s of list) {
        ch.on(
          "postgres_changes" as never,
          { event: s.event ?? "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) } as never,
          ((payload: RealtimePostgresChangesPayload<Row>) => cb.current(s.table, payload)) as never,
        );
      }
      ch.subscribe();
    })();

    return () => {
      cancelled = true;
      if (ch) supabase.removeChannel(ch);
    };
  }, [channel, key]);
}
