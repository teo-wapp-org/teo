-- Teo · Configuración de la plataforma administrable desde /admin (superadmin).
-- Contrato:
--   · Ajustes no secretos → public.platform_settings (key, value jsonb). Claves permitidas en platform_setting_keys().
--   · Secretos → Vault con nombre 'platform:<nombre>'; public.platform_secrets guarda solo metadatos (últimos 4, quién, cuándo).
--   · Lectura para el panel admin: admin_get_platform_config() (superadmin y soporte; nunca devuelve secretos).
--   · Escritura: admin_set_setting / admin_set_secret / admin_delete_secret (solo superadmin; todo queda en admin_audit_log).
--   · Backend (Edge Functions, service_role): get_platform_config() (ajustes) y get_platform_secret(nombre).
--   · Público (landing/registro/panel del comercio): public_platform_config() → solo valores no sensibles.
--   · Comercios: admin_update_subscription, admin_reset_usage, admin_set_agent_enabled.
--   · Equipo Teo: admin_add_platform_admin(email, rol), admin_remove_platform_admin(user_id).
--   · Planes: superadmin puede insertar/actualizar public.plans (RLS).

-- ─────────────────────────────────────────────────────────────
-- Ajustes
-- ─────────────────────────────────────────────────────────────
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.platform_setting_keys()
returns text[] language sql immutable set search_path = '' as $$
  select array['ai', 'meta', 'signup', 'places', 'email', 'branding']::text[];
$$;

-- Valores por defecto (no pisa lo existente)
insert into public.platform_settings (key, value) values
  ('ai', jsonb_build_object(
      'enabled', true,                 -- interruptor global: si false, Teo no responde en ningún comercio (solo sugiere)
      'provider', 'fake',              -- anthropic | fake
      'agent_model', 'claude-opus-5-5',
      'cheap_model', 'claude-haiku-5-5',
      'effort', 'low',                 -- low | medium | high
      'max_tool_iterations', 6,
      'timeout_ms', 45000,
      'debounce_seconds', 4)),
  ('meta', jsonb_build_object(
      'app_id', null,
      'es_config_id', null,
      'graph_version', 'v24.0',
      'manual_connection_enabled', true)),
  ('signup', jsonb_build_object(
      'enabled', true,
      'require_email_confirmation', false,
      'trial_plan', 'negocio',
      'trial_days', 14)),
  ('places', jsonb_build_object('enabled', true)),
  ('email', jsonb_build_object('from_name', 'Teo', 'from_email', null)),
  ('branding', jsonb_build_object('support_email', 'teowapp@gmail.com'))
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Secretos (metadatos; el valor vive en Vault)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.platform_secrets (
  name text primary key,
  vault_secret_id uuid not null,
  last4 text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.platform_secret_names()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'anthropic_api_key',
    'google_places_api_key',
    'meta_app_secret',
    'whatsapp_verify_token',
    'resend_api_key',
    'supabase_management_token'
  ]::text[];
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS: nadie accede directo a estas tablas salvo service_role; todo pasa por funciones.
-- ─────────────────────────────────────────────────────────────
alter table public.platform_settings enable row level security;
alter table public.platform_secrets enable row level security;
drop policy if exists platform_settings_read on public.platform_settings;
create policy platform_settings_read on public.platform_settings for select to authenticated using (public.is_platform_admin());
drop policy if exists platform_secrets_read on public.platform_secrets;
create policy platform_secrets_read on public.platform_secrets for select to authenticated using (public.is_platform_admin());
grant select on public.platform_settings, public.platform_secrets to authenticated;
grant all on public.platform_settings, public.platform_secrets to service_role;

-- ─────────────────────────────────────────────────────────────
-- Lectura
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_get_platform_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'settings', coalesce((select jsonb_object_agg(key, value) from public.platform_settings), '{}'::jsonb),
    'secrets', (
      select coalesce(jsonb_object_agg(n, case when s.name is null then null else jsonb_build_object(
        'last4', s.last4, 'updated_at', s.updated_at, 'updated_by', s.updated_by) end), '{}'::jsonb)
      from unnest(public.platform_secret_names()) n
      left join public.platform_secrets s on s.name = n
    )
  );
end $$;

create or replace function public.get_platform_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.platform_settings;
$$;

create or replace function public.get_platform_secret(p_name text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select ds.decrypted_secret into v
  from public.platform_secrets s join vault.decrypted_secrets ds on ds.id = s.vault_secret_id
  where s.name = p_name;
  return v;
end $$;

-- Solo valores seguros para exponer a cualquiera (landing, registro, panel del comercio)
create or replace function public.public_platform_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'signup_enabled', coalesce((select (value ->> 'enabled')::boolean from public.platform_settings where key = 'signup'), true),
    'trial_days', coalesce((select (value ->> 'trial_days')::int from public.platform_settings where key = 'signup'), 14),
    'meta_app_id', (select value ->> 'app_id' from public.platform_settings where key = 'meta'),
    'meta_es_config_id', (select value ->> 'es_config_id' from public.platform_settings where key = 'meta'),
    'meta_graph_version', coalesce((select value ->> 'graph_version' from public.platform_settings where key = 'meta'), 'v24.0'),
    'whatsapp_manual_connection', coalesce((select (value ->> 'manual_connection_enabled')::boolean from public.platform_settings where key = 'meta'), true),
    'places_available', coalesce((select (value ->> 'enabled')::boolean from public.platform_settings where key = 'places'), true)
                        and exists (select 1 from public.platform_secrets where name = 'google_places_api_key'),
    'support_email', (select value ->> 'support_email' from public.platform_settings where key = 'branding')
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Escritura (superadmin, auditado)
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb;
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (p_key = any (public.platform_setting_keys())) then raise exception 'unknown_setting %', p_key using errcode = '22023'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'setting_must_be_object' using errcode = '22023'; end if;

  -- Validaciones por clave
  if p_key = 'ai' then
    if coalesce(p_value ->> 'provider', 'fake') not in ('anthropic', 'fake') then raise exception 'invalid_provider' using errcode = '22023'; end if;
    if coalesce(p_value ->> 'effort', 'low') not in ('low', 'medium', 'high') then raise exception 'invalid_effort' using errcode = '22023'; end if;
    if (p_value ->> 'provider') = 'anthropic' and not exists (select 1 from public.platform_secrets where name = 'anthropic_api_key') then
      raise exception 'anthropic_key_missing' using errcode = '22023';
    end if;
  elsif p_key = 'signup' then
    if (p_value ? 'trial_plan') and not exists (select 1 from public.plans where id = p_value ->> 'trial_plan') then
      raise exception 'invalid_trial_plan' using errcode = '22023';
    end if;
  end if;

  select value into v_old from public.platform_settings where key = p_key;
  -- merge: se conservan las subclaves no enviadas
  insert into public.platform_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = public.platform_settings.value || excluded.value, updated_by = auth.uid(), updated_at = now()
  returning value into v_new;

  perform public.log_admin_action('platform.setting', null, p_key, jsonb_build_object('before', v_old, 'after', v_new));
  return v_new;
end $$;

create or replace function public.admin_set_secret(p_name text, p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_vault_name text := 'platform:' || p_name;
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (p_name = any (public.platform_secret_names())) then raise exception 'unknown_secret %', p_name using errcode = '22023'; end if;
  if p_value is null or char_length(trim(p_value)) < 8 then raise exception 'secret_too_short' using errcode = '22023'; end if;

  select vault_secret_id into v_id from public.platform_secrets where name = p_name;
  if v_id is null then
    select id into v_id from vault.secrets where name = v_vault_name;
  end if;
  if v_id is null then
    v_id := vault.create_secret(trim(p_value), v_vault_name, 'Teo · secreto de plataforma');
  else
    perform vault.update_secret(v_id, trim(p_value), v_vault_name, 'Teo · secreto de plataforma');
  end if;

  insert into public.platform_secrets (name, vault_secret_id, last4, updated_by, updated_at)
  values (p_name, v_id, right(trim(p_value), 4), auth.uid(), now())
  on conflict (name) do update set vault_secret_id = excluded.vault_secret_id, last4 = excluded.last4, updated_by = auth.uid(), updated_at = now();

  perform public.log_admin_action('platform.secret_set', null, p_name, jsonb_build_object('last4', right(trim(p_value), 4)));
end $$;

create or replace function public.admin_delete_secret(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select vault_secret_id into v_id from public.platform_secrets where name = p_name;
  delete from public.platform_secrets where name = p_name;
  if v_id is not null then delete from vault.secrets where id = v_id; end if;
  -- si la IA estaba en anthropic y se borra la key, vuelve a fake para no romper respuestas
  if p_name = 'anthropic_api_key' then
    update public.platform_settings set value = value || '{"provider":"fake"}'::jsonb where key = 'ai' and value ->> 'provider' = 'anthropic';
  end if;
  perform public.log_admin_action('platform.secret_delete', null, p_name, '{}'::jsonb);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Comercios (superadmin, auditado)
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_update_subscription(
  p_org uuid, p_plan text, p_status public.subscription_status, p_trial_ends_at timestamptz default null, p_period_end timestamptz default null
) returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare v_old public.subscriptions; v_new public.subscriptions;
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans where id = p_plan) then raise exception 'invalid_plan' using errcode = '22023'; end if;
  select * into v_old from public.subscriptions where org_id = p_org;
  insert into public.subscriptions (org_id, plan_id, status, trial_ends_at, current_period_end)
  values (p_org, p_plan, p_status, p_trial_ends_at, coalesce(p_period_end, now() + interval '1 month'))
  on conflict (org_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    trial_ends_at = excluded.trial_ends_at,
    current_period_end = coalesce(p_period_end, public.subscriptions.current_period_end)
  returning * into v_new;
  perform public.log_admin_action('org.subscription', p_org, p_plan,
    jsonb_build_object('before', to_jsonb(v_old), 'after', to_jsonb(v_new)));
  return v_new;
end $$;

create or replace function public.admin_reset_usage(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.usage_counters set teo_messages = 0, extra_messages = 0 where org_id = p_org;
  perform public.log_admin_action('org.reset_usage', p_org, null, '{}'::jsonb);
end $$;

create or replace function public.admin_set_agent_enabled(p_org uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.agent_settings set enabled = p_enabled where org_id = p_org;
  perform public.log_admin_action('org.agent_enabled', p_org, null, jsonb_build_object('enabled', p_enabled));
end $$;

-- ─────────────────────────────────────────────────────────────
-- Equipo Teo
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_list_platform_admins()
returns table (user_id uuid, email text, full_name text, role public.platform_role, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select pa.user_id, u.email::text, p.full_name, pa.role, pa.created_at
    from public.platform_admins pa
    join auth.users u on u.id = pa.user_id
    left join public.profiles p on p.id = pa.user_id
    order by pa.created_at;
end $$;

create or replace function public.admin_add_platform_admin(p_email text, p_role public.platform_role)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then return 'not_found'; end if;
  insert into public.platform_admins (user_id, role, created_by) values (v_user, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;
  perform public.log_admin_action('platform.admin_add', null, lower(trim(p_email)), jsonb_build_object('role', p_role));
  return 'added';
end $$;

create or replace function public.admin_remove_platform_admin(p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then return 'cannot_remove_self'; end if;
  if (select role from public.platform_admins where user_id = p_user) = 'superadmin'
     and (select count(*) from public.platform_admins where role = 'superadmin') <= 1 then
    return 'last_superadmin';
  end if;
  delete from public.platform_admins where user_id = p_user;
  perform public.log_admin_action('platform.admin_remove', null, p_user::text, '{}'::jsonb);
  return 'removed';
end $$;

-- ─────────────────────────────────────────────────────────────
-- Planes editables por superadmin
-- ─────────────────────────────────────────────────────────────
drop policy if exists plans_admin_read on public.plans;
create policy plans_admin_read on public.plans for select to authenticated using (public.is_platform_admin());
drop policy if exists plans_admin_insert on public.plans;
create policy plans_admin_insert on public.plans for insert to authenticated with check (public.is_superadmin());
drop policy if exists plans_admin_update on public.plans;
create policy plans_admin_update on public.plans for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
grant insert, update on public.plans to authenticated;

create or replace function public.plans_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_platform_admin() then
    perform public.log_admin_action('platform.plan_' || lower(tg_op), null, new.id,
      jsonb_build_object('before', case when tg_op = 'UPDATE' then to_jsonb(old) end, 'after', to_jsonb(new)));
  end if;
  return new;
end $$;
drop trigger if exists plans_audit on public.plans;
create trigger plans_audit after insert or update on public.plans for each row execute function public.plans_audit();

-- create_organization usa el plan y días de prueba configurados
create or replace function public.create_organization(p_name text, p_rubro text default null)
returns public.organizations
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_base text;
  v_slug text;
  v_i int := 0;
  v_org public.organizations;
  v_signup jsonb := coalesce((select value from public.platform_settings where key = 'signup'), '{}'::jsonb);
  v_plan text := coalesce(v_signup ->> 'trial_plan', 'negocio');
  v_days int := coalesce((v_signup ->> 'trial_days')::int, 14);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.plans where id = v_plan and active) then v_plan := 'negocio'; end if;

  v_base := trim(both '-' from regexp_replace(lower(extensions.unaccent(coalesce(p_name, ''))), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'comercio'; end if;
  v_slug := v_base;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_i := v_i + 1;
    v_slug := v_base || '-' || v_i;
  end loop;

  insert into public.organizations (name, slug, rubro, created_by)
  values (trim(p_name), v_slug, nullif(trim(p_rubro), ''), v_uid)
  returning * into v_org;

  insert into public.memberships (org_id, user_id, role) values (v_org.id, v_uid, 'owner');

  insert into public.subscriptions (org_id, plan_id, status, trial_ends_at)
  values (v_org.id, v_plan, case when v_days > 0 then 'trial'::public.subscription_status else 'active'::public.subscription_status end,
          case when v_days > 0 then now() + make_interval(days => v_days) end);

  return v_org;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Privilegios de funciones
-- ─────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_get_platform_config()',
    'public.admin_set_setting(text, jsonb)',
    'public.admin_set_secret(text, text)',
    'public.admin_delete_secret(text)',
    'public.admin_update_subscription(uuid, text, public.subscription_status, timestamptz, timestamptz)',
    'public.admin_reset_usage(uuid)',
    'public.admin_set_agent_enabled(uuid, boolean)',
    'public.admin_list_platform_admins()',
    'public.admin_add_platform_admin(text, public.platform_role)',
    'public.admin_remove_platform_admin(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke execute on function public.get_platform_config() from public, anon, authenticated;
grant execute on function public.get_platform_config() to service_role;
revoke execute on function public.get_platform_secret(text) from public, anon, authenticated;
grant execute on function public.get_platform_secret(text) to service_role;
revoke execute on function public.public_platform_config() from public;
grant execute on function public.public_platform_config() to anon, authenticated, service_role;
revoke execute on function public.plans_audit() from public, anon, authenticated;
revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
