-- Tests del contexto del comercio (equipo, configuración por rol). Transacción revertida.
-- Ejecutar: ./scripts/supa db query --linked -f supabase/tests/rls_contexto.sql -o table --agent=no
begin;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'owner-ctx@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c2', 'Operador-Ctx@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c3', 'admin-ctx@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000d1', 'otro-ctx@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table t_ids (k text primary key, v uuid) on commit drop;
grant all on t_ids to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

do $$
declare v_org uuid; v_res text;
begin
  select (public.create_organization('Contexto Test')).id into v_org;
  insert into t_ids values ('org', v_org);

  -- owner invita por email (sin distinguir mayúsculas)
  v_res := public.add_member_by_email(v_org, 'operador-ctx@test.teo', 'operador');
  if v_res <> 'added' then raise exception 'FAIL add operador: %', v_res; end if;
  v_res := public.add_member_by_email(v_org, 'operador-ctx@test.teo', 'operador');
  if v_res <> 'already_member' then raise exception 'FAIL already_member: %', v_res; end if;
  v_res := public.add_member_by_email(v_org, 'nadie@test.teo', 'operador');
  if v_res <> 'not_found' then raise exception 'FAIL not_found: %', v_res; end if;
  v_res := public.add_member_by_email(v_org, 'admin-ctx@test.teo', 'admin');
  if v_res <> 'added' then raise exception 'FAIL add admin: %', v_res; end if;

  if (select count(*) from public.org_members(v_org)) <> 3 then raise exception 'FAIL org_members'; end if;
  if not exists (select 1 from public.org_members(v_org) where email = 'owner-ctx@test.teo' and role = 'owner') then
    raise exception 'FAIL org_members email';
  end if;

  -- owner configura
  update public.business_profiles set description = 'Pastelería' where org_id = v_org;
  insert into public.stores (org_id, name, hours) values (v_org, 'Matriz', '{"lun":[{"open":"09:00","close":"18:00"}]}');
  insert into public.payment_methods (org_id, type, label) values (v_org, 'efectivo', 'Efectivo');
  update public.agent_settings set greeting = 'Hola' where org_id = v_org;
end $$;

-- Operador: lee pero no configura ni invita
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$
declare v_org uuid := (select v from t_ids where k = 'org'); v_n int;
begin
  if (select count(*) from public.stores where org_id = v_org) <> 1 then raise exception 'FAIL operador no lee tiendas'; end if;
  if (select count(*) from public.org_members(v_org)) <> 3 then raise exception 'FAIL operador no ve equipo'; end if;

  update public.business_profiles set description = 'hack' where org_id = v_org;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL operador editó negocio'; end if;
  update public.agent_settings set greeting = 'hack' where org_id = v_org;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL operador editó Teo'; end if;
  delete from public.payment_methods where org_id = v_org;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL operador borró formas de pago'; end if;
  begin
    insert into public.stores (org_id, name) values (v_org, 'intrusa');
    raise exception 'FAIL operador creó tienda';
  exception when insufficient_privilege then null; end;
  begin
    perform public.add_member_by_email(v_org, 'otro-ctx@test.teo', 'operador');
    raise exception 'FAIL operador invitó';
  exception when insufficient_privilege then null; end;
end $$;

-- Admin: configura e invita, pero no puede crear owners
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$
declare v_org uuid := (select v from t_ids where k = 'org'); v_n int;
begin
  update public.agent_settings set mode = 'copiloto' where org_id = v_org;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL admin no editó Teo'; end if;
  begin
    perform public.add_member_by_email(v_org, 'otro-ctx@test.teo', 'owner');
    raise exception 'FAIL admin creó owner';
  exception when insufficient_privilege then null; end;
end $$;

-- Ajeno: no ve nada ni puede invitar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare v_org uuid := (select v from t_ids where k = 'org');
begin
  if (select count(*) from public.stores) + (select count(*) from public.payment_methods)
     + (select count(*) from public.business_profiles where org_id = v_org) <> 0 then
    raise exception 'FAIL fuga entre comercios';
  end if;
  begin
    perform * from public.org_members(v_org);
    raise exception 'FAIL ajeno vio equipo';
  exception when insufficient_privilege then null; end;
  begin
    perform public.add_member_by_email(v_org, 'otro-ctx@test.teo', 'operador');
    raise exception 'FAIL ajeno invitó';
  exception when insufficient_privilege then null; end;
end $$;

-- Límite de usuarios del plan (Gratis: 1)
reset role;
update public.subscriptions set plan_id = 'gratis' where org_id = (select v from t_ids where k = 'org');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  if public.add_member_by_email((select v from t_ids where k = 'org'), 'otro-ctx@test.teo', 'operador') <> 'limit_reached' then
    raise exception 'FAIL límite de usuarios';
  end if;
end $$;

select 'RLS_CONTEXTO_OK' as resultado;
rollback;
