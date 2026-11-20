-- Tests de aislamiento (RLS) de las fundaciones. Todo corre en una transacción y se revierte.
-- Ejecutar:  ./scripts/supa db query --linked -f supabase/tests/rls_fundaciones.sql
begin;

-- Usuarios ficticios
insert into auth.users (id, email, aud, role, instance_id)
values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000c', 'admin@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id, role) values ('00000000-0000-0000-0000-00000000000c', 'superadmin');

-- Usuario A crea su comercio
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.create_organization('Tienda Ñandú Café', 'cafeteria');

do $$ begin
  if (select count(*) from public.organizations) <> 1 then raise exception 'FAIL A debe ver 1 org'; end if;
  if (select slug from public.organizations limit 1) <> 'tienda-nandu-cafe' then raise exception 'FAIL slug'; end if;
  if (select role from public.memberships limit 1) <> 'owner' then raise exception 'FAIL owner'; end if;
  if (select plan_id || ':' || status from public.subscriptions limit 1) <> 'negocio:trial' then raise exception 'FAIL trial'; end if;
end $$;

-- A no puede auto-promoverse a superadmin ni leer auditoría
do $$ begin
  begin
    insert into public.platform_admins (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'superadmin');
    raise exception 'FAIL A se hizo superadmin';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.admin_audit_log) <> 0 then raise exception 'FAIL A ve auditoría'; end if;
end $$;

-- Usuario B: no ve nada de A
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.organizations) <> 0 then raise exception 'FAIL B ve org de A'; end if;
  if (select count(*) from public.memberships) <> 0 then raise exception 'FAIL B ve membresías de A'; end if;
  if (select count(*) from public.subscriptions) <> 0 then raise exception 'FAIL B ve suscripción de A'; end if;
  update public.organizations set name = 'hackeado';
  if exists (select 1 from public.organizations where name = 'hackeado') then raise exception 'FAIL B modificó'; end if;
end $$;

-- B intenta meterse como miembro de la org de A
do $$
declare v_org uuid;
begin
  reset role;
  select id into v_org from public.organizations limit 1;
  set local role authenticated;
  begin
    insert into public.memberships (org_id, user_id, role) values (v_org, '00000000-0000-0000-0000-00000000000b', 'owner');
    raise exception 'FAIL B se unió a org ajena';
  exception when insufficient_privilege then null; end;
end $$;

-- Anon: solo ve planes
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  if (select count(*) from public.plans) <> 4 then raise exception 'FAIL anon no ve planes'; end if;
  begin
    perform count(*) from public.organizations;
    raise exception 'FAIL anon puede consultar orgs';
  exception when insufficient_privilege then null; end;
end $$;

-- Superadmin: ve todo, cambia estado y queda auditado
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$
declare v_org uuid;
begin
  if (select count(*) from public.organizations) <> 1 then raise exception 'FAIL admin no ve orgs'; end if;
  select id into v_org from public.organizations limit 1;
  perform public.admin_set_org_status(v_org, 'suspendido');
  if (select status from public.organizations where id = v_org) <> 'suspendido' then raise exception 'FAIL estado'; end if;
  if (select count(*) from public.admin_audit_log where org_id = v_org) <> 1 then raise exception 'FAIL auditoría'; end if;
end $$;

select 'RLS_FUNDACIONES_OK' as resultado;
rollback;
