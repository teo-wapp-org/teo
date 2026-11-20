-- Catálogo: límite de productos por plan y lectura de Storage para gestionar fotos. Idempotente.
--
-- 1) Límite del plan (plans.max_products, null = ilimitado). El panel ya lo chequea antes de crear/importar;
--    este trigger lo hace cumplir también si alguien inserta directo por la API con su sesión.
--    Solo aplica a usuarios del panel (rol 'authenticated'); el backend (service_role) y las migraciones no se limitan.
create or replace function public.enforce_product_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
  v_used integer;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  -- Serializa inserciones del mismo comercio para que dos pestañas no se salten el límite.
  perform pg_advisory_xact_lock(hashtext('products_limit:' || new.org_id::text));

  select p.max_products into v_max
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.org_id = new.org_id;

  if v_max is null then
    return new;
  end if;

  select count(*) into v_used from public.products where org_id = new.org_id;
  if v_used >= v_max then
    raise exception 'plan_limit_products: tu plan permite % productos', v_max
      using errcode = 'check_violation', hint = 'Sube de plan para agregar más productos.';
  end if;
  return new;
end $$;

revoke execute on function public.enforce_product_limit() from public, anon, authenticated;

drop trigger if exists products_enforce_limit on public.products;
create trigger products_enforce_limit before insert on public.products
  for each row execute function public.enforce_product_limit();

-- 2) Storage "catalogo": la API de Storage necesita SELECT para listar, borrar (remove) y reemplazar archivos.
--    Lectura para miembros del comercio y equipo Teo (las URLs públicas siguen funcionando para WhatsApp).
drop policy if exists catalogo_read on storage.objects;
create policy catalogo_read on storage.objects for select to authenticated
  using (
    bucket_id = 'catalogo'
    and (public.is_org_member(((storage.foldername(name))[1])::uuid) or public.is_platform_admin())
  );
