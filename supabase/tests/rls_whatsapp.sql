-- Tests de WhatsApp: conexión (Vault), permisos, ingesta idempotente, statuses y reclamo de envío.
-- Transacción revertida. Ejecutar: ./scripts/supa db query --linked -f supabase/tests/rls_whatsapp.sql -o table --agent=no
begin;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'wa-owner@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c2', 'wa-operador@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000d1', 'wa-otro@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table t_ids (k text primary key, v uuid) on commit drop;
grant all on t_ids to authenticated, anon, service_role;

set local role authenticated;

-- Owner A conecta su número (pendiente); el token queda en Vault y no se puede leer.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare v_org uuid; v_acc uuid; v_tok text;
begin
  select (public.create_organization('WA Test A')).id into v_org;
  insert into t_ids values ('org', v_org);
  insert into public.memberships (org_id, user_id, role) values (v_org, '00000000-0000-0000-0000-0000000000c2', 'operador');

  v_acc := public.connect_whatsapp_account(v_org, '990000000001', '880000000001', 'EAAG-token-de-prueba-0001-xxxxxxxx', '+593 99 000 0001', 'WA Test A');
  insert into t_ids values ('acc', v_acc);
  if (select status from public.whatsapp_accounts where id = v_acc) <> 'pendiente' then raise exception 'FAIL estado inicial'; end if;
  if (select token_secret_id from public.whatsapp_accounts where id = v_acc) is null then raise exception 'FAIL token no guardado en Vault'; end if;

  -- reconectar actualiza la misma fila y el mismo secreto
  if public.connect_whatsapp_account(v_org, '990000000001', '880000000001', 'EAAG-token-de-prueba-0002-xxxxxxxx') <> v_acc then
    raise exception 'FAIL reconexión creó otra cuenta';
  end if;
  if (select display_phone_number from public.whatsapp_accounts where id = v_acc) <> '+593 99 000 0001' then raise exception 'FAIL perdió el número visible'; end if;

  begin
    v_tok := public.get_whatsapp_token(v_acc);
    raise exception 'FAIL usuario leyó el token';
  exception when insufficient_privilege then null; end;

  begin
    perform public.connect_whatsapp_account(v_org, 'abc', null, 'EAAG-token-de-prueba-0003-xxxxxxxx');
    raise exception 'FAIL phone_number_id inválido aceptado';
  exception when invalid_parameter_value then null; end;
end $$;

-- el rol authenticated no puede leer Vault directamente
do $$
begin
  perform 1 from vault.decrypted_secrets limit 1;
  raise exception 'FAIL authenticated lee vault';
exception when insufficient_privilege then null; end $$;

-- Operador: ve la cuenta pero no puede conectar, editar ni desconectar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$
declare v_org uuid := (select v from t_ids where k = 'org');
begin
  if not exists (select 1 from public.whatsapp_accounts where org_id = v_org) then raise exception 'FAIL operador no ve la cuenta'; end if;
  begin
    perform public.connect_whatsapp_account(v_org, '990000000009', null, 'EAAG-token-de-prueba-0009-xxxxxxxx');
    raise exception 'FAIL operador conectó';
  exception when insufficient_privilege then null; end;
  begin
    perform public.disconnect_whatsapp_account(v_org);
    raise exception 'FAIL operador desconectó';
  exception when insufficient_privilege then null; end;
  update public.whatsapp_accounts set status = 'conectado' where org_id = v_org;
  if exists (select 1 from public.whatsapp_accounts where org_id = v_org and status = 'conectado') then raise exception 'FAIL operador cambió el estado'; end if;
  begin
    perform public.ingest_whatsapp_message((select v from t_ids where k = 'acc'), '593991112233', 'X', 'wamid.x', 'text', 'hola', '{}');
    raise exception 'FAIL usuario ingirió mensaje';
  exception when insufficient_privilege then null; end;
end $$;

-- Otro comercio: no ve la cuenta ni puede tomar el mismo número
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare v_org_b uuid;
begin
  select (public.create_organization('WA Test B')).id into v_org_b;
  if exists (select 1 from public.whatsapp_accounts where org_id = (select v from t_ids where k = 'org')) then raise exception 'FAIL fuga entre comercios'; end if;
  begin
    perform public.connect_whatsapp_account(v_org_b, '990000000001', null, 'EAAG-token-de-prueba-0004-xxxxxxxx');
    raise exception 'FAIL número robado';
  exception when unique_violation then null; end;
  begin
    perform public.connect_whatsapp_account((select v from t_ids where k = 'org'), '990000000002', null, 'EAAG-token-de-prueba-0005-xxxxxxxx');
    raise exception 'FAIL conectó en comercio ajeno';
  exception when insufficient_privilege then null; end;
end $$;

-- Backend (service_role): conectar, resolver, ingerir, statuses, reclamo de envío
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := (select v from t_ids where k = 'org');
  v_acc uuid := (select v from t_ids where k = 'acc');
  r record; r2 record; r3 record; v_out uuid; v_n int;
begin
  if exists (select 1 from public.resolve_whatsapp_account('990000000001')) then raise exception 'FAIL resolvió una cuenta pendiente'; end if;
  perform public.connect_whatsapp_account(v_org, '990000000001', '880000000001', 'EAAG-token-de-prueba-0006-xxxxxxxx', null, null, 'conectado', 'GREEN');
  if (select account_id from public.resolve_whatsapp_account('990000000001')) <> v_acc then raise exception 'FAIL no resolvió la cuenta'; end if;
  if public.get_whatsapp_token(v_acc) <> 'EAAG-token-de-prueba-0006-xxxxxxxx' then raise exception 'FAIL token en Vault'; end if;
  if exists (select 1 from public.resolve_whatsapp_account('123456789')) then raise exception 'FAIL resolvió número desconocido'; end if;

  select * into r from public.ingest_whatsapp_message(v_acc, '593991112233', 'Ana', 'wamid.TEST1', 'text', 'Hola', '{"a":1}', now() - interval '1 minute');
  if not r.inserted then raise exception 'FAIL primer mensaje no insertado'; end if;
  select * into r2 from public.ingest_whatsapp_message(v_acc, '593991112233', 'Ana', 'wamid.TEST1', 'text', 'Hola', '{"a":1}', now());
  if r2.inserted or r2.message_id <> r.message_id then raise exception 'FAIL idempotencia por wamid'; end if;
  select * into r3 from public.ingest_whatsapp_message(v_acc, '593991112233', 'Ana María', 'wamid.TEST2', 'image', null, '{}', now());
  if not r3.inserted or r3.case_id <> r.case_id or r3.conversation_id <> r.conversation_id then raise exception 'FAIL segundo mensaje fuera del caso'; end if;

  if (select count(*) from public.messages where conversation_id = r.conversation_id) <> 2 then raise exception 'FAIL cantidad de mensajes'; end if;
  if (select count(*) from public.cases where org_id = v_org) <> 1 then raise exception 'FAIL casos duplicados'; end if;
  if (select status from public.cases where id = r.case_id) <> 'nuevo' then raise exception 'FAIL caso no nuevo'; end if;
  if (select profile_name from public.contacts where org_id = v_org and wa_id = '593991112233') <> 'Ana María' then raise exception 'FAIL profile_name'; end if;
  if (select last_inbound_at from public.conversations where id = r.conversation_id) < now() - interval '5 seconds' then raise exception 'FAIL last_inbound_at'; end if;
  if (select channel from public.conversations where id = r.conversation_id) <> 'whatsapp' then raise exception 'FAIL canal'; end if;
  if not exists (select 1 from public.case_events where case_id = r.case_id and to_status = 'nuevo') then raise exception 'FAIL evento de creación'; end if;

  -- saliente en cola: reclamo único (trigger y barrido no envían dos veces)
  insert into public.messages (org_id, conversation_id, case_id, direction, author, type, body, status)
  values (v_org, r.conversation_id, r.case_id, 'out', 'teo', 'text', '¡Hola Ana!', 'queued') returning id into v_out;
  select count(*) into v_n from public.claim_whatsapp_outbound(v_out);
  if v_n <> 1 then raise exception 'FAIL reclamo (%)', v_n; end if;
  select count(*) into v_n from public.claim_whatsapp_outbound(v_out);
  if v_n <> 0 then raise exception 'FAIL doble reclamo'; end if;
  select count(*) into v_n from public.claim_whatsapp_outbound(null);
  if v_n <> 0 then raise exception 'FAIL barrido tomó un mensaje reciente o reclamado'; end if;

  update public.messages set wamid = 'wamid.OUT1', status = 'sent' where id = v_out;
  if not public.apply_whatsapp_status('wamid.OUT1', 'read') then raise exception 'FAIL status read'; end if;
  if public.apply_whatsapp_status('wamid.OUT1', 'delivered') then raise exception 'FAIL status retrocedió'; end if;
  if (select status from public.messages where id = v_out) <> 'read' then raise exception 'FAIL status final'; end if;
  if public.apply_whatsapp_status('wamid.TEST1', 'read') then raise exception 'FAIL status sobre entrante'; end if;
  if public.apply_whatsapp_status('wamid.NOEXISTE', 'sent') then raise exception 'FAIL status de wamid inexistente'; end if;
end $$;

-- Owner desconecta: token borrado de Vault
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare v_org uuid := (select v from t_ids where k = 'org'); v_secret uuid;
begin
  select token_secret_id into v_secret from public.whatsapp_accounts where org_id = v_org;
  insert into t_ids values ('secret', v_secret);
  perform public.disconnect_whatsapp_account(v_org);
  if (select status from public.whatsapp_accounts where org_id = v_org) <> 'desconectado' then raise exception 'FAIL desconectar'; end if;
  if (select token_secret_id from public.whatsapp_accounts where org_id = v_org) is not null then raise exception 'FAIL token sigue referenciado'; end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from vault.secrets where id = (select v from t_ids where k = 'secret')) then raise exception 'FAIL token sigue en Vault'; end if;
end $$;
-- borrar la cuenta (p. ej. por cascada del comercio) limpia su secreto
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare v_secret uuid;
begin
  perform public.connect_whatsapp_account((select v from t_ids where k = 'org'), '990000000001', null, 'EAAG-token-de-prueba-0008-xxxxxxxx');
  select token_secret_id into v_secret from public.whatsapp_accounts where org_id = (select v from t_ids where k = 'org');
  delete from public.whatsapp_accounts where org_id = (select v from t_ids where k = 'org');
  if exists (select 1 from vault.secrets where id = v_secret) then raise exception 'FAIL secreto huérfano tras borrar la cuenta'; end if;
end $$;

select 'RLS_WHATSAPP_OK' as resultado;
rollback;
