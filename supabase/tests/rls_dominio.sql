-- Tests del dominio core (RLS + máquina de estados + pedidos/pagos). Transacción revertida.
-- Ejecutar: ./scripts/supa db query --linked -f supabase/tests/rls_dominio.sql -o table --agent=no
begin;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a2', 'operador@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000b1', 'otro@test.teo', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

create temp table t_ids (k text primary key, v uuid) on commit drop;
grant all on t_ids to authenticated, anon;

do $$
declare v_org uuid; v_prod uuid; v_contact uuid; v_conv uuid; v_case uuid; v_order uuid; v_pay uuid; v_pm uuid;
begin
  select (public.create_organization('Dominio Test')).id into v_org;
  insert into t_ids values ('org', v_org);

  if not exists (select 1 from public.business_profiles where org_id = v_org) then raise exception 'FAIL defaults business_profiles'; end if;
  if not exists (select 1 from public.agent_settings where org_id = v_org) then raise exception 'FAIL defaults agent_settings'; end if;

  insert into public.products (org_id, name, price) values (v_org, 'Torta de chocolate', 18) returning id into v_prod;
  if (select count(*) from public.products where search_tsv @@ plainto_tsquery('spanish', 'tortas chocolate')) <> 1 then raise exception 'FAIL búsqueda tsv'; end if;
  insert into public.payment_methods (org_id, type, label, details) values (v_org, 'transferencia', 'Banco X', '{"numero":"123"}') returning id into v_pm;

  insert into public.contacts (org_id, wa_id, name) values (v_org, '593990000000', 'Ana') returning id into v_contact;
  insert into public.conversations (org_id, contact_id, channel) values (v_org, v_contact, 'simulador') returning id into v_conv;
  insert into public.cases (org_id, contact_id, conversation_id) values (v_org, v_contact, v_conv) returning id into v_case;
  if (select number from public.cases where id = v_case) <> 1 then raise exception 'FAIL correlativo'; end if;

  -- segundo caso abierto para el mismo contacto: prohibido
  begin
    insert into public.cases (org_id, contact_id, conversation_id) values (v_org, v_contact, v_conv);
    raise exception 'FAIL dos casos abiertos';
  exception when unique_violation then null; end;

  -- transición inválida
  begin
    perform public.transition_case(v_case, 'confirmado');
    raise exception 'FAIL transición inválida aceptada';
  exception when invalid_parameter_value then null; end;

  perform public.transition_case(v_case, 'en_conversacion');
  perform public.transition_case(v_case, 'cotizacion');
  if (select type from public.cases where id = v_case) <> 'venta' then raise exception 'FAIL tipo venta'; end if;

  -- requiere_atencion y vuelta al estado previo
  perform public.transition_case(v_case, 'requiere_atencion', 'cliente pidió humano');
  perform public.transition_case(v_case, null);
  if (select status from public.cases where id = v_case) <> 'cotizacion' then raise exception 'FAIL volver de requiere_atencion'; end if;

  insert into public.orders (org_id, case_id, contact_id, shipping) values (v_org, v_case, v_contact, 2.5) returning id into v_order;
  insert into public.order_items (org_id, order_id, product_id, name, quantity, unit_price) values (v_org, v_order, v_prod, 'Torta', 2, 18);
  perform public.recalc_order(v_order);
  if (select total from public.orders where id = v_order) <> 38.5 then raise exception 'FAIL total pedido'; end if;
  if (select estimated_amount from public.cases where id = v_case) <> 38.5 then raise exception 'FAIL monto caso'; end if;

  perform public.transition_case(v_case, 'esperando_pago');
  perform public.transition_case(v_case, 'pago_por_confirmar');
  insert into public.payments (org_id, order_id, payment_method_id, declared_amount) values (v_org, v_order, v_pm, 38.5) returning id into v_pay;
  insert into t_ids values ('case', v_case), ('pay', v_pay), ('prod', v_prod);

  -- operador como miembro
  insert into public.memberships (org_id, user_id, role) values (v_org, '00000000-0000-0000-0000-0000000000a2', 'operador');

  if (select count(*) from public.case_events where case_id = v_case) <> 6 then raise exception 'FAIL eventos (%), esperado 6', (select count(*) from public.case_events where case_id = v_case); end if;
end $$;

-- Operador: confirma el pago pero no puede tocar el catálogo
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$
declare v_pay uuid := (select v from t_ids where k = 'pay'); v_case uuid := (select v from t_ids where k = 'case');
begin
  perform public.review_payment(v_pay, true);
  if (select status from public.cases where id = v_case) <> 'confirmado' then raise exception 'FAIL pago no confirmó caso'; end if;
  update public.products set price = 0;
  if exists (select 1 from public.products where price = 0) then raise exception 'FAIL operador cambió precios'; end if;
  perform public.transition_case(v_case, 'cerrado_ganado', 'entregado');
end $$;

-- Otro usuario: no ve nada y no puede mover casos ajenos
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare v_case uuid := (select v from t_ids where k = 'case');
begin
  if (select count(*) from public.products) + (select count(*) from public.cases) + (select count(*) from public.contacts)
     + (select count(*) from public.messages) + (select count(*) from public.orders) + (select count(*) from public.payment_methods) <> 0
  then raise exception 'FAIL fuga entre comercios'; end if;
  begin
    perform public.transition_case(v_case, 'requiere_atencion');
    raise exception 'FAIL movió caso ajeno';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.products (org_id, name, price) values ((select v from t_ids where k = 'org'), 'intruso', 1);
    raise exception 'FAIL insertó en comercio ajeno';
  exception when insufficient_privilege then null; end;
end $$;

select 'RLS_DOMINIO_OK' as resultado;
rollback;
