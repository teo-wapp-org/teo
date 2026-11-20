-- Teo · Dominio core: contexto del comercio, WhatsApp, clientes/casos/mensajes, pedidos/pagos, IA.
-- Ver FICHA_TECNICA §6 (máquina de estados), §7 (agente) y §11 (modelo de datos).
-- Convención: toda tabla de negocio lleva org_id; las relaciones hijas usan FK compuesta (id, org_id)
-- para que una fila nunca apunte a datos de otro comercio.

-- ─────────────────────────────────────────────────────────────
-- Tipos
-- ─────────────────────────────────────────────────────────────
create type public.case_status as enum (
  'nuevo', 'en_conversacion', 'cotizacion', 'esperando_pago', 'pago_por_confirmar',
  'confirmado', 'requiere_atencion', 'cerrado_ganado', 'cerrado_perdido', 'resuelto'
);
create type public.case_type as enum ('venta', 'consulta', 'postventa', 'reclamo');
create type public.handled_by as enum ('teo', 'humano');
create type public.agent_mode as enum ('piloto', 'copiloto');
create type public.message_direction as enum ('in', 'out');
create type public.message_status as enum ('received', 'queued', 'sent', 'delivered', 'read', 'failed');
create type public.order_status as enum ('borrador', 'confirmado', 'pagado', 'cancelado');
create type public.payment_status as enum ('pendiente', 'confirmado', 'rechazado');
create type public.payment_method_type as enum ('transferencia', 'efectivo', 'link', 'otro');
create type public.wa_account_status as enum ('pendiente', 'conectado', 'desconectado', 'error');

-- ─────────────────────────────────────────────────────────────
-- Contexto del comercio
-- ─────────────────────────────────────────────────────────────
create table public.business_profiles (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  description text,
  tone text not null default 'cercano',            -- cercano | formal | divertido
  use_usted boolean not null default false,
  use_emojis boolean not null default true,
  policies jsonb not null default '{}',            -- { envios, devoluciones, garantia, otros }
  faqs jsonb not null default '[]',                -- [{ q, a }]
  website text,
  instagram text,
  phone text,
  google_place_id text,
  updated_at timestamptz not null default now()
);
create trigger business_profiles_updated_at before update on public.business_profiles
  for each row execute function public.set_updated_at();

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  address text,
  city text,
  lat double precision,
  lng double precision,
  phone text,
  -- { "lun": [{"open":"09:00","close":"18:00"}], ... "dom": [] }
  hours jsonb not null default '{}',
  delivery_available boolean not null default false,
  delivery_notes text,
  google_place_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index stores_org_idx on public.stores (org_id);
create trigger stores_updated_at before update on public.stores
  for each row execute function public.set_updated_at();

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 200),
  description text,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'USD',
  sku text,
  stock integer check (stock is null or stock >= 0),  -- null = no se controla
  attributes jsonb not null default '{}',
  active boolean not null default true,
  search_tsv tsvector generated always as (
    setweight(to_tsvector('spanish', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(description, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (category_id, org_id) references public.product_categories (id, org_id) on delete set null (category_id)
);
create index products_org_idx on public.products (org_id, active);
create index products_tsv_idx on public.products using gin (search_tsv);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create unique index products_org_sku_idx on public.products (org_id, sku) where sku is not null;
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  product_id uuid not null,
  name text not null,                     -- p. ej. "Talla M / Rojo"
  price numeric(12, 2) check (price is null or price >= 0),  -- null = precio del producto
  stock integer check (stock is null or stock >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  unique (id, org_id),
  foreign key (product_id, org_id) references public.products (id, org_id) on delete cascade
);
create index product_variants_product_idx on public.product_variants (product_id);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  product_id uuid not null,
  storage_path text not null,             -- bucket "catalogo": {org_id}/{product_id}/{archivo}
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (product_id, org_id) references public.products (id, org_id) on delete cascade
);
create index product_media_product_idx on public.product_media (product_id, sort_order);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  type public.payment_method_type not null,
  label text not null,                    -- "Transferencia Banco Pichincha"
  -- transferencia: { banco, tipo_cuenta, numero, titular, identificacion, email }
  -- link: { url }, efectivo: { notas }
  details jsonb not null default '{}',
  instructions text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create index payment_methods_org_idx on public.payment_methods (org_id);

create table public.agent_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  enabled boolean not null default true,
  mode public.agent_mode not null default 'piloto',
  display_name text not null default 'Teo',
  greeting text,
  out_of_hours_message text,
  -- horario de atención de Teo; vacío = 24/7
  business_hours jsonb not null default '{}',
  escalation_keywords text[] not null default array['humano', 'persona', 'asesor', 'reclamo'],
  escalation_amount_usd numeric(12, 2),
  payment_expiry_hours integer not null default 48 check (payment_expiry_hours between 1 and 720),
  extra_instructions text,
  updated_at timestamptz not null default now()
);
create trigger agent_settings_updated_at before update on public.agent_settings
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- WhatsApp
-- ─────────────────────────────────────────────────────────────
create table public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  waba_id text,
  phone_number_id text unique,
  display_phone_number text,
  verified_name text,
  token_secret_id uuid,                   -- vault.secrets.id del access token del comercio
  status public.wa_account_status not null default 'pendiente',
  quality_rating text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index whatsapp_accounts_org_idx on public.whatsapp_accounts (org_id);
create trigger whatsapp_accounts_updated_at before update on public.whatsapp_accounts
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Clientes, conversaciones, casos, mensajes
-- ─────────────────────────────────────────────────────────────
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  wa_id text not null,                    -- teléfono E.164 sin "+"
  name text,
  profile_name text,                      -- nombre de perfil de WhatsApp
  email text,
  address text,
  tags text[] not null default '{}',
  notes text,
  ai_summary text,
  opt_in_marketing boolean not null default false,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, wa_id)
);
create index contacts_org_last_idx on public.contacts (org_id, last_message_at desc);
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  contact_id uuid not null,
  whatsapp_account_id uuid,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'simulador')),
  handled_by public.handled_by not null default 'teo',
  last_inbound_at timestamptz,            -- ventana de 24 h de Meta
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, contact_id, channel),
  foreign key (contact_id, org_id) references public.contacts (id, org_id) on delete cascade,
  foreign key (whatsapp_account_id, org_id) references public.whatsapp_accounts (id, org_id) on delete set null (whatsapp_account_id)
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  number integer not null,                -- correlativo por comercio (#123)
  contact_id uuid not null,
  conversation_id uuid not null,
  type public.case_type not null default 'consulta',
  status public.case_status not null default 'nuevo',
  previous_status public.case_status,     -- para volver desde requiere_atencion
  assignee_id uuid references auth.users (id) on delete set null,
  priority smallint not null default 0,
  estimated_amount numeric(12, 2),
  summary text,
  close_reason text,
  opened_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, number),
  foreign key (contact_id, org_id) references public.contacts (id, org_id) on delete cascade,
  foreign key (conversation_id, org_id) references public.conversations (id, org_id) on delete cascade
);
create unique index cases_one_open_per_contact on public.cases (org_id, contact_id)
  where status not in ('cerrado_ganado', 'cerrado_perdido', 'resuelto');
create index cases_board_idx on public.cases (org_id, status, status_changed_at desc);
create trigger cases_updated_at before update on public.cases
  for each row execute function public.set_updated_at();

create table public.case_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  case_id uuid not null,
  actor text not null,                    -- 'teo' | 'sistema' | 'user:<uuid>'
  from_status public.case_status,
  to_status public.case_status,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (case_id, org_id) references public.cases (id, org_id) on delete cascade
);
create index case_events_case_idx on public.case_events (case_id, created_at);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  conversation_id uuid not null,
  case_id uuid,
  direction public.message_direction not null,
  author text not null,                   -- 'cliente' | 'teo' | 'user:<uuid>' | 'sistema'
  type text not null default 'text',      -- text | image | document | audio | location | interactive | template | reaction
  body text,
  media_path text,                        -- bucket "media": {org_id}/...
  media_mime text,
  wamid text unique,                      -- idempotencia (Meta)
  status public.message_status not null default 'received',
  error text,
  payload jsonb,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, org_id) references public.conversations (id, org_id) on delete cascade,
  foreign key (case_id, org_id) references public.cases (id, org_id) on delete set null (case_id)
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_case_idx on public.messages (case_id, created_at);

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  case_id uuid not null,
  message_id uuid references public.messages (id) on delete set null,
  text text not null,
  actions jsonb not null default '[]',
  state text not null default 'nueva' check (state in ('nueva', 'usada', 'editada', 'descartada')),
  created_at timestamptz not null default now(),
  foreign key (case_id, org_id) references public.cases (id, org_id) on delete cascade
);
create index ai_suggestions_case_idx on public.ai_suggestions (case_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Pedidos y pagos
-- ─────────────────────────────────────────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  case_id uuid not null,
  contact_id uuid not null,
  store_id uuid,
  status public.order_status not null default 'borrador',
  subtotal numeric(12, 2) not null default 0,
  shipping numeric(12, 2) not null default 0 check (shipping >= 0),
  total numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  delivery jsonb not null default '{}',   -- { modo: retiro|envio, direccion, referencia, fecha }
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (case_id, org_id) references public.cases (id, org_id) on delete cascade,
  foreign key (contact_id, org_id) references public.contacts (id, org_id) on delete cascade,
  foreign key (store_id, org_id) references public.stores (id, org_id) on delete set null (store_id)
);
create unique index orders_one_open_per_case on public.orders (case_id) where status in ('borrador', 'confirmado');
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null,
  product_id uuid,
  variant_id uuid,
  name text not null,                     -- nombre congelado
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),  -- precio congelado del backend
  subtotal numeric(12, 2) generated always as (quantity * unit_price) stored,
  foreign key (order_id, org_id) references public.orders (id, org_id) on delete cascade,
  foreign key (product_id, org_id) references public.products (id, org_id) on delete set null (product_id),
  foreign key (variant_id, org_id) references public.product_variants (id, org_id) on delete set null (variant_id)
);
create index order_items_order_idx on public.order_items (order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null,
  payment_method_id uuid,
  declared_amount numeric(12, 2),
  receipt_path text,                      -- bucket "media"
  receipt_message_id uuid references public.messages (id) on delete set null,
  ai_extraction jsonb,                    -- { monto, fecha, banco, referencia, confianza }
  status public.payment_status not null default 'pendiente',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  foreign key (order_id, org_id) references public.orders (id, org_id) on delete cascade,
  foreign key (payment_method_id, org_id) references public.payment_methods (id, org_id) on delete set null (payment_method_id)
);
create index payments_order_idx on public.payments (order_id);

-- ─────────────────────────────────────────────────────────────
-- Operación de IA
-- ─────────────────────────────────────────────────────────────
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  case_id uuid,
  kind text not null default 'reply' check (kind in ('reply', 'suggestion', 'classification', 'extraction', 'summary')),
  model text,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  latency_ms integer,
  tools jsonb not null default '[]',
  stop_reason text,
  error text,
  created_at timestamptz not null default now()
);
create index agent_runs_org_idx on public.agent_runs (org_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Lógica de dominio
-- ─────────────────────────────────────────────────────────────

-- Correlativo de casos por comercio
create or replace function public.cases_set_number()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.number is null or new.number = 0 then
    perform pg_advisory_xact_lock(hashtext('cases_number:' || new.org_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.cases where org_id = new.org_id;
  end if;
  return new;
end $$;
alter table public.cases alter column number set default 0;
create trigger cases_number before insert on public.cases
  for each row execute function public.cases_set_number();

-- ¿Puede el usuario actual operar sobre este comercio? (miembro, o backend con service_role)
create or replace function public.can_operate(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.role(), '') = 'service_role'
      or exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid());
$$;
revoke execute on function public.can_operate(uuid) from public, anon;
grant execute on function public.can_operate(uuid) to authenticated, service_role;

-- Transiciones válidas (FICHA §6.3). requiere_atencion es alcanzable/retornable desde cualquier estado abierto.
create or replace function public.case_transition_allowed(p_from public.case_status, p_to public.case_status)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_from = p_to then false
    when p_from in ('cerrado_ganado', 'cerrado_perdido', 'resuelto') then false
    when p_to = 'requiere_atencion' then true
    when p_from = 'requiere_atencion' then p_to not in ('nuevo')
    else (p_from, p_to) in (
      ('nuevo', 'en_conversacion'), ('nuevo', 'cotizacion'), ('nuevo', 'resuelto'), ('nuevo', 'cerrado_perdido'),
      ('en_conversacion', 'cotizacion'), ('en_conversacion', 'esperando_pago'), ('en_conversacion', 'resuelto'), ('en_conversacion', 'cerrado_perdido'),
      ('cotizacion', 'en_conversacion'), ('cotizacion', 'esperando_pago'), ('cotizacion', 'cerrado_perdido'),
      ('esperando_pago', 'cotizacion'), ('esperando_pago', 'pago_por_confirmar'), ('esperando_pago', 'cerrado_perdido'),
      ('pago_por_confirmar', 'esperando_pago'), ('pago_por_confirmar', 'confirmado'),
      ('confirmado', 'cerrado_ganado')
    )
  end;
$$;

-- Única puerta para cambiar el estado de un caso. Registra case_events.
create or replace function public.transition_case(p_case uuid, p_to public.case_status, p_reason text default null, p_actor text default null)
returns public.cases language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_actor text;
  v_target public.case_status := p_to;
  v_from public.case_status;
begin
  select * into v_case from public.cases where id = p_case for update;
  if not found then raise exception 'case_not_found' using errcode = 'P0002'; end if;
  v_from := v_case.status;
  if not public.can_operate(v_case.org_id) then raise exception 'forbidden' using errcode = '42501'; end if;

  v_actor := case when auth.uid() is not null then 'user:' || auth.uid()::text else coalesce(p_actor, 'sistema') end;

  -- "volver" desde requiere_atencion al estado previo
  if v_case.status = 'requiere_atencion' and p_to is null then
    v_target := coalesce(v_case.previous_status, 'en_conversacion');
  end if;

  if not public.case_transition_allowed(v_case.status, v_target) then
    raise exception 'invalid_transition % -> %', v_case.status, v_target using errcode = '22023';
  end if;

  update public.cases set
    previous_status = case when v_target = 'requiere_atencion' then v_case.status else previous_status end,
    status = v_target,
    status_changed_at = now(),
    type = case when v_target in ('cotizacion', 'esperando_pago') and type = 'consulta' then 'venta' else type end,
    closed_at = case when v_target in ('cerrado_ganado', 'cerrado_perdido', 'resuelto') then now() else null end,
    close_reason = case when v_target in ('cerrado_ganado', 'cerrado_perdido', 'resuelto') then p_reason else close_reason end
  where id = p_case
  returning * into v_case;

  insert into public.case_events (org_id, case_id, actor, from_status, to_status, reason)
  values (v_case.org_id, v_case.id, v_actor, v_from, v_target, p_reason);

  return v_case;
end $$;
revoke execute on function public.transition_case(uuid, public.case_status, text, text) from public, anon;
grant execute on function public.transition_case(uuid, public.case_status, text, text) to authenticated, service_role;

-- Recalcula totales de un pedido a partir de sus ítems (los precios NUNCA vienen del LLM)
create or replace function public.recalc_order(p_order uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not public.can_operate(v_order.org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.orders o set
    subtotal = coalesce((select sum(subtotal) from public.order_items where order_id = o.id), 0),
    total = coalesce((select sum(subtotal) from public.order_items where order_id = o.id), 0) + o.shipping
  where o.id = p_order
  returning * into v_order;
  update public.cases set estimated_amount = v_order.total where id = v_order.case_id;
  return v_order;
end $$;
revoke execute on function public.recalc_order(uuid) from public, anon;
grant execute on function public.recalc_order(uuid) to authenticated, service_role;

-- Confirmar / rechazar un pago (operador). Mueve el caso y deja traza.
create or replace function public.review_payment(p_payment uuid, p_approve boolean, p_reason text default null)
returns public.payments language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments;
  v_order public.orders;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if not public.can_operate(v_pay.org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_pay.status <> 'pendiente' then raise exception 'payment_already_reviewed' using errcode = '22023'; end if;

  update public.payments set
    status = case when p_approve then 'confirmado'::public.payment_status else 'rechazado'::public.payment_status end,
    reviewed_by = auth.uid(), reviewed_at = now(),
    rejection_reason = case when p_approve then null else p_reason end
  where id = p_payment returning * into v_pay;

  select * into v_order from public.orders where id = v_pay.order_id;
  if p_approve then
    update public.orders set status = 'pagado' where id = v_order.id;
    perform public.transition_case(v_order.case_id, 'confirmado', 'pago confirmado');
  else
    perform public.transition_case(v_order.case_id, 'esperando_pago', coalesce(p_reason, 'comprobante rechazado'));
  end if;
  return v_pay;
end $$;
revoke execute on function public.review_payment(uuid, boolean, text) from public, anon;
grant execute on function public.review_payment(uuid, boolean, text) to authenticated, service_role;

-- Consumo de mensajes de Teo (lo llama el backend del agente antes/después de responder)
create or replace function public.increment_teo_usage(p_org uuid, p_n integer default 1)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_period date; v_total integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select date_trunc('day', current_period_start)::date into v_period from public.subscriptions where org_id = p_org;
  v_period := coalesce(v_period, date_trunc('month', now())::date);
  insert into public.usage_counters (org_id, period_start, teo_messages) values (p_org, v_period, p_n)
  on conflict (org_id, period_start) do update set teo_messages = public.usage_counters.teo_messages + excluded.teo_messages
  returning teo_messages into v_total;
  return v_total;
end $$;
revoke execute on function public.increment_teo_usage(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_teo_usage(uuid, integer) to service_role;

-- Filas por defecto al crear un comercio
create or replace function public.org_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.business_profiles (org_id) values (new.id) on conflict do nothing;
  insert into public.agent_settings (org_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke execute on function public.org_defaults() from public, anon, authenticated;
create trigger organizations_defaults after insert on public.organizations
  for each row execute function public.org_defaults();

insert into public.business_profiles (org_id) select id from public.organizations on conflict do nothing;
insert into public.agent_settings (org_id) select id from public.organizations on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'business_profiles','stores','product_categories','products','product_variants','product_media',
    'payment_methods','agent_settings','whatsapp_accounts','contacts','conversations','cases','case_events',
    'messages','ai_suggestions','orders','order_items','payments','agent_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- lectura: miembros del comercio y equipo Teo
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
      using ((select public.is_org_member(org_id)) or (select public.is_platform_admin()))$p$, t);
  end loop;

  -- Configuración del comercio: escriben owner/admin
  foreach t in array array[
    'business_profiles','stores','product_categories','products','product_variants','product_media',
    'payment_methods','agent_settings'
  ] loop
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (public.has_org_role(org_id, array['owner','admin']::public.org_role[]))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
      using (public.has_org_role(org_id, array['owner','admin']::public.org_role[]))
      with check (public.has_org_role(org_id, array['owner','admin']::public.org_role[]))$p$, t);
    execute format($p$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (public.has_org_role(org_id, array['owner','admin']::public.org_role[]))$p$, t);
  end loop;

  -- Operación diaria: cualquier miembro (operadores incluidos)
  foreach t in array array['contacts','conversations','cases','messages','ai_suggestions','orders','order_items','payments'] loop
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (public.is_org_member(org_id))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
      using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))$p$, t);
  end loop;
end $$;

-- whatsapp_accounts: escritura solo owner/admin (el token va a Vault vía función de servidor)
create policy whatsapp_accounts_write on public.whatsapp_accounts for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(org_id, array['owner','admin']::public.org_role[]));
create policy whatsapp_accounts_delete on public.whatsapp_accounts for delete to authenticated
  using (public.has_org_role(org_id, array['owner','admin']::public.org_role[]));
-- case_events y agent_runs: solo lectura para usuarios (escriben funciones/backend)

-- ─────────────────────────────────────────────────────────────
-- Privilegios
-- ─────────────────────────────────────────────────────────────
grant select, insert, update, delete on
  public.business_profiles, public.stores, public.product_categories, public.products, public.product_variants,
  public.product_media, public.payment_methods, public.agent_settings
  to authenticated;
grant select, update, delete on public.whatsapp_accounts to authenticated;
grant select, insert, update on
  public.contacts, public.conversations, public.cases, public.messages, public.ai_suggestions,
  public.orders, public.order_items, public.payments
  to authenticated;
grant delete on public.order_items to authenticated;
create policy order_items_delete on public.order_items for delete to authenticated using (public.is_org_member(org_id));
grant select on public.case_events, public.agent_runs to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ─────────────────────────────────────────────────────────────
-- Realtime (Kanban y chat en vivo)
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.cases, public.messages, public.ai_suggestions, public.payments;

-- ─────────────────────────────────────────────────────────────
-- Storage
-- ─────────────────────────────────────────────────────────────
-- catalogo: fotos de productos (lectura pública: se envían por WhatsApp); ruta {org_id}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogo', 'catalogo', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
-- media: comprobantes y media de conversaciones (privado); ruta {org_id}/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 16777216)
on conflict (id) do nothing;

create policy catalogo_write on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogo' and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.org_role[]));
create policy catalogo_update on storage.objects for update to authenticated
  using (bucket_id = 'catalogo' and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.org_role[]));
create policy catalogo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalogo' and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.org_role[]));
create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and (public.is_org_member(((storage.foldername(name))[1])::uuid) or public.is_platform_admin()));
create policy media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_org_member(((storage.foldername(name))[1])::uuid));
