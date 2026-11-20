-- Teo · Fundaciones: organizaciones (comercios), membresías, superadmins, auditoría, planes y suscripciones.
-- Reglas: RLS en todas las tablas; nunca políticas USING (true); la service_role ya salta RLS.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Tipos
-- ─────────────────────────────────────────────────────────────
create type public.org_role as enum ('owner', 'admin', 'operador');
create type public.org_status as enum ('onboarding', 'activo', 'suspendido');
create type public.platform_role as enum ('superadmin', 'soporte');
create type public.subscription_status as enum ('trial', 'active', 'past_due', 'canceled');

-- ─────────────────────────────────────────────────────────────
-- Utilidades
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Perfiles de usuario (1:1 con auth.users)
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Planes (catálogo público) — ver FICHA_TECNICA §17.1
-- ─────────────────────────────────────────────────────────────
create table public.plans (
  id text primary key,                 -- 'gratis' | 'emprende' | 'negocio' | 'pro'
  name text not null,
  price_usd_month numeric(10, 2) not null,
  teo_messages_month integer not null, -- cupo de respuestas de Teo
  max_users integer,                   -- null = ilimitado
  max_stores integer,
  max_products integer,
  features text[] not null default '{}',
  highlighted boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true
);

insert into public.plans (id, name, price_usd_month, teo_messages_month, max_users, max_stores, max_products, features, highlighted, sort_order) values
  ('gratis',   'Gratis',   0,   100,   1,    1,    30,   array['kanban','chat','sugerencias','copiloto','sello_teo'], false, 1),
  ('emprende', 'Emprende', 19,  1000,  2,    1,    200,  array['kanban','chat','sugerencias','copiloto','importar_catalogo','google_places'], false, 2),
  ('negocio',  'Negocio',  39,  3000,  5,    3,    1000, array['kanban','chat','sugerencias','copiloto','importar_catalogo','google_places','lectura_comprobantes','metricas_completas'], true, 3),
  ('pro',      'Pro',      99,  10000, null, null, null, array['kanban','chat','sugerencias','copiloto','importar_catalogo','google_places','lectura_comprobantes','metricas_avanzadas','integraciones','multi_numero','soporte_dedicado'], false, 4);

-- ─────────────────────────────────────────────────────────────
-- Organizaciones (comercios) y membresías
-- ─────────────────────────────────────────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  rubro text,
  status public.org_status not null default 'onboarding',
  timezone text not null default 'America/Guayaquil',
  currency text not null default 'USD',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'operador',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- ─────────────────────────────────────────────────────────────
-- Equipo Teo (superadmins) y auditoría
-- ─────────────────────────────────────────────────────────────
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.platform_role not null default 'soporte',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  org_id uuid references public.organizations (id) on delete set null,
  target text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_audit_log_org_idx on public.admin_audit_log (org_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Suscripciones y consumo
-- ─────────────────────────────────────────────────────────────
create table public.subscriptions (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status public.subscription_status not null default 'trial',
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '1 month'),
  provider text,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.usage_counters (
  org_id uuid not null references public.organizations (id) on delete cascade,
  period_start date not null,
  teo_messages integer not null default 0,
  extra_messages integer not null default 0,
  primary key (org_id, period_start)
);

-- ─────────────────────────────────────────────────────────────
-- Helpers de autorización (security definer para evitar recursión de RLS)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid() and role = 'superadmin');
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role = any (p_roles)
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: crear comercio (owner + suscripción trial Negocio 14 días)
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_organization(p_name text, p_rubro text default null)
returns public.organizations
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_base text;
  v_slug text;
  v_i int := 0;
  v_org public.organizations;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

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
  values (v_org.id, 'negocio', 'trial', now() + interval '14 days');

  return v_org;
end $$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_admins enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_counters enable row level security;

-- profiles: cada uno el suyo; compañeros de organización pueden verse; admins de plataforma ven todo
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_platform_admin()
  or exists (
    select 1 from public.memberships m1
    join public.memberships m2 on m1.org_id = m2.org_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  )
);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- plans: catálogo público (landing)
create policy plans_read on public.plans for select to anon, authenticated using (active);

-- organizations
create policy orgs_select on public.organizations for select to authenticated
  using (public.is_org_member(id) or public.is_platform_admin());
create policy orgs_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner','admin']::public.org_role[]) or public.is_superadmin())
  with check (public.has_org_role(id, array['owner','admin']::public.org_role[]) or public.is_superadmin());
-- insert solo vía create_organization(); delete solo superadmin
create policy orgs_delete on public.organizations for delete to authenticated using (public.is_superadmin());

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
create policy memberships_write on public.memberships for all to authenticated
  using (public.has_org_role(org_id, array['owner','admin']::public.org_role[]) or public.is_superadmin())
  with check (public.has_org_role(org_id, array['owner','admin']::public.org_role[]) or public.is_superadmin());

-- platform_admins: solo el equipo Teo los ve; solo superadmin los gestiona
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (public.is_platform_admin());
create policy platform_admins_write on public.platform_admins for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- admin_audit_log: lectura equipo Teo; escritura solo vía función log_admin_action
create policy audit_select on public.admin_audit_log for select to authenticated
  using (public.is_platform_admin());

-- subscriptions / usage: miembros leen; cambios solo superadmin o backend (service_role)
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
create policy subscriptions_admin_write on public.subscriptions for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
create policy usage_select on public.usage_counters for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────
-- Auditoría de acciones del equipo Teo
-- ─────────────────────────────────────────────────────────────
create or replace function public.log_admin_action(p_action text, p_org uuid default null, p_target text default null, p_metadata jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.admin_audit_log (admin_id, action, org_id, target, metadata)
  values (auth.uid(), p_action, p_org, p_target, coalesce(p_metadata, '{}'));
end $$;

revoke all on function public.log_admin_action(text, uuid, text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, uuid, text, jsonb) to authenticated;

-- Superadmin: cambiar estado de un comercio (queda auditado)
create or replace function public.admin_set_org_status(p_org uuid, p_status public.org_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.organizations set status = p_status where id = p_org;
  perform public.log_admin_action('org.set_status', p_org, null, jsonb_build_object('status', p_status));
end $$;

revoke all on function public.admin_set_org_status(uuid, public.org_status) from public, anon;
grant execute on function public.admin_set_org_status(uuid, public.org_status) to authenticated;

-- Los helpers no deben ser invocables por anon
revoke all on function public.is_platform_admin() from anon;
revoke all on function public.is_superadmin() from anon;
revoke all on function public.is_org_member(uuid) from anon;
revoke all on function public.has_org_role(uuid, public.org_role[]) from anon;
