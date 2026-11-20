-- Teo · Worker del agente: lease por conversación + invocación periódica de la Edge Function agent-runner.
-- Idempotente. FICHA §10.4.
--
-- Secretos (NO van en este archivo; se crean una vez por entorno con vault.create_secret):
--   teo_agent_runner_url  → https://<ref>.supabase.co/functions/v1/agent-runner
--   teo_cron_secret       → mismo valor que el secret TEO_CRON_SECRET de las Edge Functions
-- Sin esos secretos el cron no hace nada (invoke_agent_runner devuelve null).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ─────────────────────────────────────────────────────────────
-- Lease por conversación. try_lock_conversation (advisory xact lock) solo vive dentro de UNA
-- transacción, y cada RPC de PostgREST es su propia transacción: no protege un turno del agente
-- que dura varios segundos. Este lease sí (vence solo si el worker muere).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.agent_locks (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  locked_until timestamptz not null
);
alter table public.agent_locks enable row level security; -- sin políticas: solo service_role
revoke all on public.agent_locks from anon, authenticated;
grant all on public.agent_locks to service_role;

create or replace function public.claim_conversation(p_conversation uuid, p_seconds integer default 90)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  insert into public.agent_locks as l (conversation_id, locked_until)
  values (p_conversation, now() + make_interval(secs => greatest(p_seconds, 1)))
  on conflict (conversation_id) do update set locked_until = excluded.locked_until
    where l.locked_until < now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

create or replace function public.release_conversation(p_conversation uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.agent_locks where conversation_id = p_conversation;
$$;

revoke execute on function public.claim_conversation(uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_conversation(uuid) from public, anon, authenticated;
grant execute on function public.claim_conversation(uuid, integer) to service_role;
grant execute on function public.release_conversation(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Invocación del worker (pg_net) con URL y secreto desde Vault. Solo llama si hay trabajo en la cola.
-- ─────────────────────────────────────────────────────────────
create or replace function public.invoke_agent_runner()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
  v_pending bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'teo_agent_runner_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'teo_cron_secret';
  if v_url is null or v_secret is null then return null; end if;

  select queue_length into v_pending from pgmq.metrics('inbound');
  if coalesce(v_pending, 0) = 0 then return null; end if;

  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-teo-cron-secret', v_secret),
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function public.invoke_agent_runner() from public, anon, authenticated;
grant execute on function public.invoke_agent_runner() to service_role;

-- cron.schedule con el mismo nombre actualiza el job existente (idempotente)
select cron.schedule('teo-agent-runner', '10 seconds', 'select public.invoke_agent_runner()');
