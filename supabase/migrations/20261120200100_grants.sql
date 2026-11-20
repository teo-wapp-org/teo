-- Privilegios explícitos por rol (el proyecto no concede acceso por defecto a anon/authenticated).
-- RLS sigue decidiendo QUÉ filas; estos GRANT deciden QUÉ operaciones existen.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select on public.plans to anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select, insert, update, delete on public.platform_admins to authenticated;
grant select on public.admin_audit_log to authenticated;
grant select, update on public.subscriptions to authenticated;
grant select on public.usage_counters to authenticated;
