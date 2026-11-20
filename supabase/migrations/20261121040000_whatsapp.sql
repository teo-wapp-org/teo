-- Teo · Integración con WhatsApp Cloud API (FICHA §8, §10.4, §13).
-- Idempotente: se puede aplicar varias veces con `./scripts/supa db query --linked -f <archivo>`.
--
--  · Token por comercio en Vault (whatsapp_accounts.token_secret_id). Nunca sale de la base salvo
--    hacia el backend (service_role) con get_whatsapp_token().
--  · Ingesta del webhook en una sola transacción: contacto + conversación + caso + mensaje (wamid único).
--  · Envío: trigger AFTER INSERT en messages (out/queued) → pg_net → Edge Function whatsapp-send,
--    autenticado con un secreto leído de Vault. Barrido de respaldo con pg_cron cada minuto.
--    Secretos de Vault esperados (se crean fuera de este archivo, nunca en el repo):
--      whatsapp_send_url     → https://<ref>.supabase.co/functions/v1/whatsapp-send
--      whatsapp_send_secret  → mismo valor que el secret WHATSAPP_SEND_SECRET de la Edge Function

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Control de envío (reclamo atómico para que trigger y barrido no envíen dos veces)
alter table public.messages add column if not exists send_attempts smallint not null default 0;
alter table public.messages add column if not exists send_claimed_at timestamptz;
create index if not exists messages_out_queued_idx on public.messages (created_at)
  where direction = 'out' and status = 'queued';

-- ─────────────────────────────────────────────────────────────
-- Conexión del número (panel) y token en Vault
-- ─────────────────────────────────────────────────────────────
create or replace function public.connect_whatsapp_account(
  p_org uuid,
  p_phone_number_id text,
  p_waba_id text,
  p_token text,
  p_display_phone text default null,
  p_verified_name text default null,
  p_status public.wa_account_status default 'pendiente',
  p_quality_rating text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_acc public.whatsapp_accounts;
  v_secret uuid;
begin
  if not v_is_service and not public.has_org_role(p_org, array['owner','admin']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(p_phone_number_id, '') !~ '^[0-9]{5,30}$' then
    raise exception 'phone_number_id inválido' using errcode = '22023';
  end if;
  if p_waba_id is not null and p_waba_id !~ '^[0-9]{5,30}$' then
    raise exception 'waba_id inválido' using errcode = '22023';
  end if;
  if coalesce(length(p_token), 0) < 20 then
    raise exception 'token inválido' using errcode = '22023';
  end if;
  if p_status not in ('pendiente', 'conectado') then
    raise exception 'estado inválido' using errcode = '22023';
  end if;
  -- el número no puede estar conectado a otro comercio
  if exists (select 1 from public.whatsapp_accounts where phone_number_id = p_phone_number_id and org_id <> p_org) then
    raise exception 'phone_number_id ya registrado en otro comercio' using errcode = '23505';
  end if;

  -- Fase 1: un número por comercio. Se reutiliza la fila existente (mantiene el historial de conversaciones).
  select * into v_acc from public.whatsapp_accounts
  where org_id = p_org order by (phone_number_id = p_phone_number_id) desc nulls last, created_at limit 1
  for update;

  if v_acc.id is null then
    insert into public.whatsapp_accounts (org_id) values (p_org) returning * into v_acc;
  end if;

  if v_acc.token_secret_id is not null and exists (select 1 from vault.secrets where id = v_acc.token_secret_id) then
    perform vault.update_secret(v_acc.token_secret_id, p_token);
    v_secret := v_acc.token_secret_id;
  else
    v_secret := vault.create_secret(p_token, 'wa_token_' || v_acc.id::text, 'Token de WhatsApp Cloud API del comercio ' || p_org::text);
  end if;

  update public.whatsapp_accounts set
    phone_number_id = p_phone_number_id,
    waba_id = p_waba_id,
    display_phone_number = coalesce(p_display_phone, case when phone_number_id = p_phone_number_id then display_phone_number end),
    verified_name = coalesce(p_verified_name, case when phone_number_id = p_phone_number_id then verified_name end),
    quality_rating = p_quality_rating,
    token_secret_id = v_secret,
    status = p_status,
    connected_at = case when p_status = 'conectado' then now() else null end
  where id = v_acc.id;

  return v_acc.id;
end $$;
revoke execute on function public.connect_whatsapp_account(uuid, text, text, text, text, text, public.wa_account_status, text) from public, anon;
grant execute on function public.connect_whatsapp_account(uuid, text, text, text, text, text, public.wa_account_status, text) to authenticated, service_role;

create or replace function public.disconnect_whatsapp_account(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.has_org_role(p_org, array['owner','admin']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for r in select id, token_secret_id from public.whatsapp_accounts where org_id = p_org for update loop
    if r.token_secret_id is not null then
      delete from vault.secrets where id = r.token_secret_id;
    end if;
    update public.whatsapp_accounts
      set status = 'desconectado', token_secret_id = null, connected_at = null
      where id = r.id;
  end loop;
end $$;
revoke execute on function public.disconnect_whatsapp_account(uuid) from public, anon;
grant execute on function public.disconnect_whatsapp_account(uuid) to authenticated, service_role;

-- Solo el backend (Edge Functions) lee el token en claro.
create or replace function public.get_whatsapp_token(p_account uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select s.decrypted_secret into v
  from public.whatsapp_accounts a join vault.decrypted_secrets s on s.id = a.token_secret_id
  where a.id = p_account;
  return v;
end $$;
revoke execute on function public.get_whatsapp_token(uuid) from public, anon, authenticated;
grant execute on function public.get_whatsapp_token(uuid) to service_role;

-- Al borrar una cuenta (p. ej. por cascada al borrar el comercio) no quedan tokens huérfanos en Vault.
create or replace function public.whatsapp_accounts_drop_secret()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.token_secret_id is not null then
    delete from vault.secrets where id = old.token_secret_id;
  end if;
  return old;
end $$;
revoke execute on function public.whatsapp_accounts_drop_secret() from public, anon, authenticated;
drop trigger if exists whatsapp_accounts_drop_secret on public.whatsapp_accounts;
create trigger whatsapp_accounts_drop_secret after delete on public.whatsapp_accounts
  for each row execute function public.whatsapp_accounts_drop_secret();

-- ─────────────────────────────────────────────────────────────
-- Ingesta (webhook, service_role)
-- ─────────────────────────────────────────────────────────────
-- Cuenta conectada para un phone_number_id (el webhook ignora números desconocidos o no conectados).
create or replace function public.resolve_whatsapp_account(p_phone_number_id text)
returns table (account_id uuid, org_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.id, a.org_id
  from public.whatsapp_accounts a join public.organizations o on o.id = a.org_id
  where a.phone_number_id = p_phone_number_id and a.status = 'conectado' and o.status <> 'suspendido';
$$;
revoke execute on function public.resolve_whatsapp_account(text) from public, anon, authenticated;
grant execute on function public.resolve_whatsapp_account(text) to service_role;

-- Guarda un mensaje entrante: upsert de contacto y conversación, caso 'nuevo' si no hay abierto,
-- e inserción idempotente por wamid. inserted=false si el wamid ya existía (reintento de Meta).
create or replace function public.ingest_whatsapp_message(
  p_account uuid,
  p_wa_id text,
  p_profile_name text,
  p_wamid text,
  p_type text,
  p_body text,
  p_payload jsonb,
  p_sent_at timestamptz default null
) returns table (message_id uuid, conversation_id uuid, case_id uuid, org_id uuid, inserted boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_contact uuid;
  v_conv uuid;
  v_case uuid;
  v_msg uuid;
  v_ts timestamptz := least(coalesce(p_sent_at, now()), now());
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select a.org_id into v_org from public.whatsapp_accounts a where a.id = p_account;
  if v_org is null then raise exception 'cuenta desconocida' using errcode = '22023'; end if;

  -- reintento de Meta: no tocar nada
  select m.id, m.conversation_id, m.case_id into v_msg, v_conv, v_case from public.messages m where m.wamid = p_wamid;
  if v_msg is not null then
    return query select v_msg, v_conv, v_case, v_org, false;
    return;
  end if;

  insert into public.contacts as c (org_id, wa_id, profile_name, last_message_at)
  values (v_org, p_wa_id, nullif(p_profile_name, ''), v_ts)
  on conflict (org_id, wa_id) do update set
    profile_name = coalesce(excluded.profile_name, c.profile_name),
    last_message_at = greatest(c.last_message_at, excluded.last_message_at)
  returning c.id into v_contact;

  insert into public.conversations as cv (org_id, contact_id, whatsapp_account_id, channel, last_inbound_at, last_message_at)
  values (v_org, v_contact, p_account, 'whatsapp', v_ts, v_ts)
  on conflict (org_id, contact_id, channel) do update set
    whatsapp_account_id = excluded.whatsapp_account_id,
    last_inbound_at = greatest(cv.last_inbound_at, excluded.last_inbound_at),
    last_message_at = greatest(cv.last_message_at, excluded.last_message_at)
  returning cv.id into v_conv;

  select k.id into v_case from public.cases k
  where k.org_id = v_org and k.contact_id = v_contact
    and k.status not in ('cerrado_ganado', 'cerrado_perdido', 'resuelto');
  if v_case is null then
    insert into public.cases (org_id, contact_id, conversation_id)
    values (v_org, v_contact, v_conv)
    on conflict (org_id, contact_id) where status not in ('cerrado_ganado', 'cerrado_perdido', 'resuelto') do nothing
    returning id into v_case;
    if v_case is null then  -- carrera con otro mensaje del mismo contacto
      select k.id into v_case from public.cases k
      where k.org_id = v_org and k.contact_id = v_contact
        and k.status not in ('cerrado_ganado', 'cerrado_perdido', 'resuelto');
    else
      insert into public.case_events (org_id, case_id, actor, to_status, reason)
      values (v_org, v_case, 'sistema', 'nuevo', 'mensaje entrante de WhatsApp');
    end if;
  end if;

  insert into public.messages (org_id, conversation_id, case_id, direction, author, type, body, wamid, status, payload, created_at)
  values (v_org, v_conv, v_case, 'in', 'cliente', p_type, p_body, p_wamid, 'received', p_payload, v_ts)
  on conflict (wamid) do nothing
  returning id into v_msg;

  if v_msg is null then  -- carrera con un reintento simultáneo
    select m.id into v_msg from public.messages m where m.wamid = p_wamid;
    return query select v_msg, v_conv, v_case, v_org, false;
    return;
  end if;
  return query select v_msg, v_conv, v_case, v_org, true;
end $$;
revoke execute on function public.ingest_whatsapp_message(uuid, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_whatsapp_message(uuid, text, text, text, text, text, jsonb, timestamptz) to service_role;

-- Status de mensajes salientes (sent/delivered/read/failed). Nunca retrocede (los webhooks llegan desordenados).
create or replace function public.apply_whatsapp_status(p_wamid text, p_status text, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_rank constant jsonb := '{"queued":0,"sent":1,"delivered":2,"read":3}';
  v_new public.message_status;
  v_updated int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'delivered', 'read', 'failed') then return false; end if;
  v_new := p_status::public.message_status;
  update public.messages m set
    status = v_new,
    error = case when v_new = 'failed' then coalesce(p_error, 'failed') else m.error end
  where m.wamid = p_wamid and m.direction = 'out'
    and (
      v_new = 'failed' and m.status <> 'read'
      or (v_new <> 'failed' and m.status <> 'failed' and coalesce((v_rank ->> m.status::text)::int, 0) < (v_rank ->> p_status)::int)
    );
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end $$;
revoke execute on function public.apply_whatsapp_status(text, text, text) from public, anon, authenticated;
grant execute on function public.apply_whatsapp_status(text, text, text) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Envío (Edge Function whatsapp-send)
-- ─────────────────────────────────────────────────────────────
-- Reclama mensajes salientes de WhatsApp para enviarlos. p_message = uno concreto (trigger);
-- null = barrido de los 'queued' con más de 20 s. Un reclamo vence a los 2 min (función caída).
create or replace function public.claim_whatsapp_outbound(p_message uuid default null, p_limit integer default 20)
returns setof public.messages
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  update public.messages m set send_claimed_at = now(), send_attempts = m.send_attempts + 1
  where m.id in (
    select x.id from public.messages x
    join public.conversations c on c.id = x.conversation_id
    where x.direction = 'out' and x.status = 'queued' and c.channel = 'whatsapp'
      and (x.send_claimed_at is null or x.send_claimed_at < now() - interval '2 minutes')
      and (case when p_message is null then x.created_at < now() - interval '20 seconds' else x.id = p_message end)
    order by x.created_at
    limit greatest(p_limit, 1)
    for update of x skip locked
  )
  returning m.*;
end $$;
revoke execute on function public.claim_whatsapp_outbound(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_outbound(uuid, integer) to service_role;

-- Llama a la Edge Function con pg_net. Sin secretos en Vault (entorno sin configurar) no hace nada.
create or replace function public.whatsapp_send_invoke(p_body jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'whatsapp_send_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'whatsapp_send_secret';
  if v_url is null or v_secret is null then return null; end if;
  return net.http_post(
    url := v_url,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-teo-send-secret', v_secret),
    timeout_milliseconds := 10000
  );
end $$;
revoke execute on function public.whatsapp_send_invoke(jsonb) from public, anon, authenticated;

create or replace function public.messages_dispatch_whatsapp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.conversations c where c.id = new.conversation_id and c.channel = 'whatsapp') then
    begin
      perform public.whatsapp_send_invoke(jsonb_build_object('message_id', new.id));
    exception when others then
      -- nunca bloquear el insert: el barrido de pg_cron lo reintenta
      raise warning 'whatsapp_send_invoke falló: %', sqlerrm;
    end;
  end if;
  return null;
end $$;
revoke execute on function public.messages_dispatch_whatsapp() from public, anon, authenticated;
drop trigger if exists messages_dispatch_whatsapp on public.messages;
create trigger messages_dispatch_whatsapp after insert on public.messages
  for each row when (new.direction = 'out' and new.status = 'queued')
  execute function public.messages_dispatch_whatsapp();

create or replace function public.whatsapp_send_sweep()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.direction = 'out' and m.status = 'queued' and c.channel = 'whatsapp'
      and m.created_at < now() - interval '20 seconds'
  ) then
    perform public.whatsapp_send_invoke(jsonb_build_object('sweep', true));
  end if;
end $$;
revoke execute on function public.whatsapp_send_sweep() from public, anon, authenticated;

select cron.schedule('whatsapp-send-sweep', '* * * * *', 'select public.whatsapp_send_sweep()');
