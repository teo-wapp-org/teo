-- Tests de configuración de plataforma (secretos, ajustes, planes, equipo, comercios). Transacción revertida.
begin;
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'sa@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c2', 'soporte@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c3', 'comercio@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'superadmin'),
  ('00000000-0000-0000-0000-0000000000c2', 'soporte');
create temp table t_ids (k text primary key, v uuid) on commit drop;
grant all on t_ids to authenticated, anon;

set local role authenticated;

-- Comercio normal: nada de configuración de plataforma
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$
declare v_org uuid;
begin
  select (public.create_organization('Config Test')).id into v_org;
  insert into t_ids values ('org', v_org);
  begin perform public.admin_get_platform_config(); raise exception 'FAIL comercio leyó config'; exception when insufficient_privilege then null; end;
  begin perform public.admin_set_secret('anthropic_api_key', 'sk-ant-xxxxxxxxxxxx'); raise exception 'FAIL comercio escribió secreto'; exception when insufficient_privilege then null; end;
  begin perform public.get_platform_secret('anthropic_api_key'); raise exception 'FAIL comercio leyó secreto'; exception when insufficient_privilege then null; end;
  if (select count(*) from public.platform_secrets) <> 0 then raise exception 'FAIL comercio ve metadatos de secretos'; end if;
  update public.plans set price_usd_month = 0 where id = 'pro';
  if (select price_usd_month from public.plans where id = 'pro') = 0 then raise exception 'FAIL comercio cambió precios'; end if;
  if (public.public_platform_config() ->> 'signup_enabled') is null then raise exception 'FAIL config pública'; end if;
end $$;

-- Soporte: puede leer, no escribir
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$ begin
  perform public.admin_get_platform_config();
  begin perform public.admin_set_setting('ai', '{"effort":"high"}'); raise exception 'FAIL soporte escribió'; exception when insufficient_privilege then null; end;
end $$;

-- Superadmin: escribe todo y queda auditado; nunca ve el valor del secreto
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare v_cfg jsonb; v_org uuid := (select v from t_ids where k = 'org');
begin
  begin perform public.admin_set_setting('ai', '{"provider":"anthropic"}'); raise exception 'FAIL anthropic sin key'; exception when invalid_parameter_value then null; end;
  perform public.admin_set_secret('anthropic_api_key', 'sk-ant-test-1234567890-WXYZ');
  perform public.admin_set_setting('ai', '{"provider":"anthropic","effort":"medium"}');
  v_cfg := public.admin_get_platform_config();
  if v_cfg #>> '{settings,ai,provider}' <> 'anthropic' then raise exception 'FAIL provider'; end if;
  if v_cfg #>> '{settings,ai,agent_model}' <> 'claude-opus-5-5' then raise exception 'FAIL merge perdió subclaves'; end if;
  if v_cfg #>> '{secrets,anthropic_api_key,last4}' <> 'WXYZ' then raise exception 'FAIL last4'; end if;
  if v_cfg::text like '%sk-ant-test%' then raise exception 'FAIL secreto expuesto'; end if;
  begin perform public.admin_set_setting('hackeo', '{}'); raise exception 'FAIL clave desconocida'; exception when invalid_parameter_value then null; end;

  perform public.admin_delete_secret('anthropic_api_key');
  if (public.admin_get_platform_config() #>> '{settings,ai,provider}') <> 'fake' then raise exception 'FAIL fallback a fake'; end if;

  update public.plans set price_usd_month = 41 where id = 'negocio';
  if (select price_usd_month from public.plans where id = 'negocio') <> 41 then raise exception 'FAIL superadmin no editó plan'; end if;

  perform public.admin_update_subscription(v_org, 'pro', 'active');
  if (select plan_id from public.subscriptions where org_id = v_org) <> 'pro' then raise exception 'FAIL suscripción'; end if;
  perform public.admin_set_agent_enabled(v_org, false);
  if (select enabled from public.agent_settings where org_id = v_org) then raise exception 'FAIL pausar Teo'; end if;
  perform public.admin_reset_usage(v_org);

  if public.admin_add_platform_admin('comercio@test.teo', 'soporte') <> 'added' then raise exception 'FAIL agregar admin'; end if;
  if public.admin_remove_platform_admin('00000000-0000-0000-0000-0000000000c1') <> 'cannot_remove_self' then raise exception 'FAIL quitarse a sí mismo'; end if;
  if public.admin_add_platform_admin('nadie@test.teo', 'soporte') <> 'not_found' then raise exception 'FAIL not_found'; end if;

  if (select count(*) from public.admin_audit_log where admin_id = '00000000-0000-0000-0000-0000000000c1') < 8 then
    raise exception 'FAIL auditoría (%)', (select count(*) from public.admin_audit_log where admin_id = '00000000-0000-0000-0000-0000000000c1');
  end if;
end $$;

-- service_role puede leer secretos y config
reset role;
set local role service_role;
do $$ begin
  if (public.get_platform_config() -> 'ai') is null then raise exception 'FAIL get_platform_config'; end if;
end $$;

select 'RLS_CONFIG_OK' as resultado;
rollback;
