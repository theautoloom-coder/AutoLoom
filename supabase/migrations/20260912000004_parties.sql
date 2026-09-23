-- =============================================================================
-- 0004 PARTIES AND PRICING
-- Price lists, customers, suppliers, customer-specific prices, customer vehicles.
-- =============================================================================

create table public.price_lists (
  id         uuid primary key default public.uuid_generate_v7(),
  code       text not null unique,                -- 'retail' | 'dealer' | 'wholesale' | custom
  name       text not null,
  price_column text not null default 'retail_price'
    check (price_column in ('retail_price','dealer_price','wholesale_price')),
  is_default boolean not null default false,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.price_list_items (
  id             uuid primary key default public.uuid_generate_v7(),
  price_list_id  uuid not null references public.price_lists (id) on delete cascade,
  variant_id     uuid not null references public.product_variants (id) on delete cascade,
  price          numeric(14,2) not null,
  effective_from date not null default current_date,
  created_by     uuid,
  device_id      uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (price_list_id, variant_id, effective_from)
);

create table public.customers (
  id                   uuid primary key default public.uuid_generate_v7(),
  code                 text not null unique,      -- 'C0001' or their own code
  name                 text not null,             -- display name
  business_name        text,
  owner_name           text,
  mobile               text,
  alt_phone            text,
  email                text,
  gstin                text,
  pan                  text,
  address_line1        text,
  address_line2        text,
  city                 text,
  state_code           text,                      -- '09' UP, '07' DL ...
  state_name           text,
  pincode              text,
  customer_type        text not null default 'retail'
    check (customer_type in ('retail','dealer','wholesale','workshop','other')),
  price_list_id        uuid references public.price_lists (id),
  credit_limit         numeric(14,2) not null default 0,
  credit_days          int not null default 0,
  opening_balance      numeric(14,2) not null default 0,
  opening_balance_date date,
  notes                text,
  search_text          text not null default '',
  is_active            boolean not null default true,
  created_by           uuid,
  device_id            uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index customers_search_trgm_idx on public.customers using gin (search_text gin_trgm_ops);
create index customers_mobile_idx on public.customers (mobile);

create table public.customer_prices (
  id             uuid primary key default public.uuid_generate_v7(),
  customer_id    uuid not null references public.customers (id) on delete cascade,
  variant_id     uuid not null references public.product_variants (id) on delete cascade,
  price          numeric(14,2) not null,
  effective_from date not null default current_date,
  approved_by    uuid,
  created_by     uuid,
  device_id      uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (customer_id, variant_id, effective_from)
);

create table public.suppliers (
  id                   uuid primary key default public.uuid_generate_v7(),
  code                 text not null unique,
  name                 text not null,
  company_name         text,
  contact_person       text,
  mobile               text,
  alt_phone            text,
  email                text,
  gstin                text,
  pan                  text,
  address_line1        text,
  address_line2        text,
  city                 text,
  state_code           text,
  state_name           text,
  pincode              text,
  payment_terms_days   int not null default 0,
  opening_balance      numeric(14,2) not null default 0,
  opening_balance_date date,
  notes                text,
  search_text          text not null default '',
  is_active            boolean not null default true,
  created_by           uuid,
  device_id            uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index suppliers_search_trgm_idx on public.suppliers using gin (search_text gin_trgm_ops);

create table public.supplier_products (
  id           uuid primary key default public.uuid_generate_v7(),
  supplier_id  uuid not null references public.suppliers (id) on delete cascade,
  variant_id   uuid not null references public.product_variants (id) on delete cascade,
  supplier_sku text,
  last_rate    numeric(14,2),
  last_date    date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (supplier_id, variant_id)
);

-- Real cars belonging to customers (for workshop history and vehicle-number search)
create table public.customer_vehicles (
  id                 uuid primary key default public.uuid_generate_v7(),
  customer_id        uuid not null references public.customers (id) on delete cascade,
  registration_no    text not null,               -- 'UP16AB1234' (normalised: uppercase, no spaces)
  model_id           uuid references public.vehicle_models (id),
  generation_id      uuid references public.vehicle_generations (id),
  vehicle_variant_id uuid references public.vehicle_variants (id),
  color              text,
  notes              text,
  created_by         uuid,
  device_id          uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index customer_vehicles_reg_idx on public.customer_vehicles (registration_no);
create index customer_vehicles_customer_idx on public.customer_vehicles (customer_id);

create trigger price_lists_updated_at       before update on public.price_lists       for each row execute function public.tg_set_updated_at();
create trigger price_list_items_updated_at  before update on public.price_list_items  for each row execute function public.tg_set_updated_at();
create trigger customers_updated_at         before update on public.customers         for each row execute function public.tg_set_updated_at();
create trigger customer_prices_updated_at   before update on public.customer_prices   for each row execute function public.tg_set_updated_at();
create trigger suppliers_updated_at         before update on public.suppliers         for each row execute function public.tg_set_updated_at();
create trigger supplier_products_updated_at before update on public.supplier_products for each row execute function public.tg_set_updated_at();
create trigger customer_vehicles_updated_at before update on public.customer_vehicles for each row execute function public.tg_set_updated_at();

create trigger customers_audit        after update or delete on public.customers        for each row execute function public.tg_audit_row();
create trigger suppliers_audit        after update or delete on public.suppliers        for each row execute function public.tg_audit_row();
create trigger customer_prices_audit  after insert or update or delete on public.customer_prices  for each row execute function public.tg_audit_row();
create trigger price_list_items_audit after insert or update or delete on public.price_list_items for each row execute function public.tg_audit_row();
