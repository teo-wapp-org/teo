-- Cola de mensajes entrantes (webhook WhatsApp → worker del agente). Contrato entre fases:
--   productor: public.enqueue_inbound(org_id, conversation_id, delay_seconds)   (webhook / simulador)
--   consumidor: public.read_inbound(qty, vt_seconds) → filas (msg_id, read_ct, org_id, conversation_id)
--               public.delete_inbound(msg_id) al terminar; si falla, el mensaje reaparece tras vt.
-- Solo service_role (backend). Debounce: el productor encola con delay (~4 s) y el consumidor agrupa
-- todos los mensajes nuevos de la conversación en un solo turno (lock por conversación).
create extension if not exists pgmq;
select pgmq.create('inbound') where not exists (select 1 from pgmq.list_queues() where queue_name = 'inbound');

create or replace function public.enqueue_inbound(p_org uuid, p_conversation uuid, p_delay integer default 4)
returns bigint language sql security definer set search_path = '' as $$
  select pgmq.send('inbound', jsonb_build_object('org_id', p_org, 'conversation_id', p_conversation), greatest(p_delay, 0));
$$;

create or replace function public.read_inbound(p_qty integer default 10, p_vt integer default 60)
returns table (msg_id bigint, read_ct integer, org_id uuid, conversation_id uuid)
language sql security definer set search_path = '' as $$
  select r.msg_id, r.read_ct, (r.message ->> 'org_id')::uuid, (r.message ->> 'conversation_id')::uuid
  from pgmq.read('inbound', p_vt, p_qty) r;
$$;

create or replace function public.delete_inbound(p_msg_id bigint)
returns boolean language sql security definer set search_path = '' as $$
  select pgmq.delete('inbound', p_msg_id);
$$;

-- Lock por conversación para que dos workers no respondan a la vez (válido durante la transacción).
create or replace function public.try_lock_conversation(p_conversation uuid)
returns boolean language sql security definer set search_path = '' as $$
  select pg_try_advisory_xact_lock(hashtext('conv:' || p_conversation::text));
$$;

revoke execute on function public.enqueue_inbound(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.read_inbound(integer, integer) from public, anon, authenticated;
revoke execute on function public.delete_inbound(bigint) from public, anon, authenticated;
revoke execute on function public.try_lock_conversation(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_inbound(uuid, uuid, integer) to service_role;
grant execute on function public.read_inbound(integer, integer) to service_role;
grant execute on function public.delete_inbound(bigint) to service_role;
grant execute on function public.try_lock_conversation(uuid) to service_role;
