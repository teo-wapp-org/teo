-- Teo · Equipo del comercio: listar miembros (con email) e invitar usuarios existentes por email.
-- Idempotente: se puede aplicar varias veces (create or replace).

-- Miembros del comercio con su email y nombre. Solo para miembros del comercio o equipo Teo.
create or replace function public.org_members(p_org uuid)
returns table (user_id uuid, role public.org_role, full_name text, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_org_member(p_org) or public.is_platform_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.user_id, m.role, p.full_name, u.email::text, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.org_id = p_org
    order by m.created_at;
end $$;
revoke execute on function public.org_members(uuid) from public, anon;
grant execute on function public.org_members(uuid) to authenticated;

-- Agrega a un usuario que ya tiene cuenta. Devuelve: 'added' | 'not_found' | 'already_member' | 'limit_reached'.
-- Solo owner/admin del comercio; solo un owner puede agregar a otro owner.
create or replace function public.add_member_by_email(p_org uuid, p_email text, p_role public.org_role default 'operador')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_max integer;
  v_count integer;
begin
  if not public.has_org_role(p_org, array['owner','admin']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'owner' and not public.has_org_role(p_org, array['owner']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if v_user is null then return 'not_found'; end if;
  if exists (select 1 from public.memberships where org_id = p_org and user_id = v_user) then return 'already_member'; end if;

  select pl.max_users into v_max
  from public.subscriptions s join public.plans pl on pl.id = s.plan_id
  where s.org_id = p_org;
  select count(*) into v_count from public.memberships where org_id = p_org;
  if v_max is not null and v_count >= v_max then return 'limit_reached'; end if;

  insert into public.memberships (org_id, user_id, role) values (p_org, v_user, p_role);
  return 'added';
end $$;
revoke execute on function public.add_member_by_email(uuid, text, public.org_role) from public, anon;
grant execute on function public.add_member_by_email(uuid, text, public.org_role) to authenticated;
