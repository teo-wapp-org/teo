-- Endurecimiento según `supabase db advisors`.

-- 1) search_path fijo
alter function public.set_updated_at() set search_path = '';

-- 2) Funciones SECURITY DEFINER: sin EXECUTE para PUBLIC/anon.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.is_superadmin() from public, anon;
revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.has_org_role(uuid, public.org_role[]) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;

-- 3) auth.uid() evaluado una vez por consulta
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.is_platform_admin())
  or exists (
    select 1 from public.memberships m1
    join public.memberships m2 on m1.org_id = m2.org_id
    where m1.user_id = (select auth.uid()) and m2.user_id = profiles.id
  )
);
drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 4) Una política por acción (sin solapar SELECT)
drop policy memberships_write on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin']::public.org_role[]) or public.is_superadmin());
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin']::public.org_role[]) or public.is_superadmin())
  with check (public.has_org_role(org_id, array['owner','admin']::public.org_role[]) or public.is_superadmin());
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_org_role(org_id, array['owner','admin']::public.org_role[]) or public.is_superadmin());

drop policy platform_admins_write on public.platform_admins;
create policy platform_admins_insert on public.platform_admins for insert to authenticated
  with check (public.is_superadmin());
create policy platform_admins_update on public.platform_admins for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
create policy platform_admins_delete on public.platform_admins for delete to authenticated
  using (public.is_superadmin());
