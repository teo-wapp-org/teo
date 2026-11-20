-- Tests del catálogo: límite de productos por plan, permisos por rol y Storage. Transacción revertida.
-- Ejecutar: ./scripts/supa db query --linked -f supabase/tests/rls_catalogo.sql -o table --agent=no
begin;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'owner-cat@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c2', 'operador-cat@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000d1', 'otro-cat@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- Storage bloquea DELETE directo salvo con esta bandera (aquí solo para probar las políticas)
select set_config('storage.allow_delete_query', 'true', true);

create temp table t_ids (k text primary key, v uuid) on commit drop;
grant all on t_ids to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

do $$
declare v_org uuid; v_cat uuid; v_prod uuid;
begin
  select (public.create_organization('Catálogo Test')).id into v_org;
  insert into t_ids values ('org', v_org);
  insert into public.memberships (org_id, user_id, role) values (v_org, '00000000-0000-0000-0000-0000000000c2', 'operador');

  insert into public.product_categories (org_id, name) values (v_org, 'Tortas') returning id into v_cat;
  insert into public.products (org_id, category_id, name, price, sku) values (v_org, v_cat, 'Torta', 10, 'T-1') returning id into v_prod;
  insert into public.product_variants (org_id, product_id, name, price) values (v_org, v_prod, 'Grande', 15);
  insert into public.product_media (org_id, product_id, storage_path) values (v_org, v_prod, v_org || '/' || v_prod || '/a.png');
  insert into t_ids values ('prod', v_prod);

  -- sku único por comercio
  begin
    insert into public.products (org_id, name, price, sku) values (v_org, 'Otra', 1, 'T-1');
    raise exception 'FAIL sku duplicado';
  exception when unique_violation then null; end;
end $$;

-- Límite del plan: bajar a Gratis (30) como superusuario y llenar hasta el tope
reset role;
do $$
declare v_org uuid := (select v from t_ids where k = 'org');
begin
  update public.subscriptions set plan_id = 'gratis' where org_id = v_org;
  -- sin claims de usuario (backend/migraciones) no hay límite
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.products (org_id, name, price) select v_org, 'Relleno ' || g, 1 from generate_series(1, 29) g;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare v_org uuid := (select v from t_ids where k = 'org');
begin
  if (select count(*) from public.products where org_id = v_org) <> 30 then raise exception 'FAIL relleno'; end if;
  begin
    insert into public.products (org_id, name, price) values (v_org, 'El 31', 1);
    raise exception 'FAIL superó el límite del plan';
  exception when check_violation then
    if sqlerrm not like 'plan_limit_products%' then raise; end if;
  end;
  -- editar sí se puede aunque esté en el tope
  update public.products set price = 2 where org_id = v_org and name = 'Relleno 1';
  if (select price from public.products where org_id = v_org and name = 'Relleno 1') <> 2 then raise exception 'FAIL editar en el tope'; end if;
end $$;

-- Plan ilimitado (Pro): sin tope
reset role;
update public.subscriptions set plan_id = 'pro' where org_id = (select v from t_ids where k = 'org');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  insert into public.products (org_id, name, price) values ((select v from t_ids where k = 'org'), 'El 31', 1);
end $$;

-- Storage: el owner sube, lista y borra en su carpeta; no en carpetas ajenas
do $$
declare v_org uuid := (select v from t_ids where k = 'org'); v_prod uuid := (select v from t_ids where k = 'prod');
begin
  insert into storage.objects (bucket_id, name, owner_id) values ('catalogo', v_org || '/' || v_prod || '/foto.png', '00000000-0000-0000-0000-0000000000c1');
  if (select count(*) from storage.objects where bucket_id = 'catalogo' and name like v_org || '/%') <> 1 then raise exception 'FAIL owner no ve sus fotos'; end if;
  delete from storage.objects where bucket_id = 'catalogo' and name = v_org || '/' || v_prod || '/foto.png';
  if exists (select 1 from storage.objects where bucket_id = 'catalogo' and name like v_org || '/%') then raise exception 'FAIL owner no borró su foto'; end if;
  insert into storage.objects (bucket_id, name, owner_id) values ('catalogo', v_org || '/' || v_prod || '/foto2.png', '00000000-0000-0000-0000-0000000000c1');
  begin
    insert into storage.objects (bucket_id, name) values ('catalogo', gen_random_uuid() || '/x/intruso.png');
    raise exception 'FAIL subió a carpeta ajena';
  exception when insufficient_privilege then null; end;
end $$;

-- Operador: lee el catálogo, pero no lo cambia ni sube fotos
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$
declare v_org uuid := (select v from t_ids where k = 'org'); v_prod uuid := (select v from t_ids where k = 'prod');
begin
  if (select count(*) from public.products where org_id = v_org) < 31 then raise exception 'FAIL operador no lee productos'; end if;
  if (select count(*) from public.product_variants) <> 1 or (select count(*) from public.product_media) <> 1 then raise exception 'FAIL operador no lee variantes/fotos'; end if;
  begin
    insert into public.products (org_id, name, price) values (v_org, 'del operador', 1);
    raise exception 'FAIL operador creó producto';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.product_categories (org_id, name) values (v_org, 'del operador');
    raise exception 'FAIL operador creó categoría';
  exception when insufficient_privilege then null; end;
  delete from public.products where org_id = v_org;
  delete from public.product_categories where org_id = v_org;
  if (select count(*) from public.products where org_id = v_org) < 31 or not exists (select 1 from public.product_categories where org_id = v_org)
  then raise exception 'FAIL operador borró catálogo'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('catalogo', v_org || '/' || v_prod || '/op.png');
    raise exception 'FAIL operador subió foto';
  exception when insufficient_privilege then null; end;
  delete from storage.objects where bucket_id = 'catalogo' and name like v_org || '/%';
  if not exists (select 1 from storage.objects where bucket_id = 'catalogo' and name like v_org || '/%') then raise exception 'FAIL operador borró foto'; end if;
end $$;

-- Otro usuario: no ve ni toca el catálogo ajeno
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare v_org uuid := (select v from t_ids where k = 'org');
begin
  if (select count(*) from public.products) + (select count(*) from public.product_categories)
     + (select count(*) from public.product_variants) + (select count(*) from public.product_media) <> 0
  then raise exception 'FAIL fuga de catálogo entre comercios'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'catalogo' and name like v_org || '/%') then raise exception 'FAIL ve fotos ajenas en Storage'; end if;
  update public.products set price = 0 where org_id = v_org;
end $$;

-- Owner confirma que el intruso no cambió nada y borra el producto (cascada a variantes y fotos)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare v_prod uuid := (select v from t_ids where k = 'prod');
begin
  if exists (select 1 from public.products where price = 0) then raise exception 'FAIL intruso cambió precios'; end if;
  delete from public.products where id = v_prod;
  if exists (select 1 from public.product_variants where product_id = v_prod) or exists (select 1 from public.product_media where product_id = v_prod)
  then raise exception 'FAIL cascada de borrado'; end if;
end $$;

select 'RLS_CATALOGO_OK' as resultado;
rollback;
