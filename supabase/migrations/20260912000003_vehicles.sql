-- =============================================================================
-- 0003 VEHICLES AND FITMENT
-- =============================================================================

create table public.vehicle_makes (
  id         uuid primary key default public.uuid_generate_v7(),
  name       text not null unique,
  code       text not null unique,                -- 'HYU', 'MSZ'
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicle_models (
  id         uuid primary key default public.uuid_generate_v7(),
  make_id    uuid not null references public.vehicle_makes (id),
  name       text not null,
  code       text not null,                       -- 'CRETA' used in SKU templates
  body_type  text,                                -- hatchback / sedan / suv / muv / pickup
  segment    text,
  search_text text not null default '',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (make_id, name),
  unique (make_id, code)
);
create index vehicle_models_search_trgm_idx on public.vehicle_models using gin (search_text gin_trgm_ops);

-- 'Scorpio-N' vs 'Scorpio N', 'WagonR' vs 'Wagon R'
create table public.vehicle_model_aliases (
  id       uuid primary key default public.uuid_generate_v7(),
  model_id uuid not null references public.vehicle_models (id) on delete cascade,
  alias    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, alias)
);

create table public.vehicle_generations (
  id          uuid primary key default public.uuid_generate_v7(),
  model_id    uuid not null references public.vehicle_models (id) on delete cascade,
  name        text not null,                      -- '2nd Gen', '2024 Facelift'
  year_from   int not null,
  year_to     int,                                -- null = current
  is_facelift boolean not null default false,
  body_type   text,
  seating     int,
  notes       text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (model_id, name)
);

create table public.vehicle_variants (
  id            uuid primary key default public.uuid_generate_v7(),
  generation_id uuid not null references public.vehicle_generations (id) on delete cascade,
  name          text not null,                    -- 'SX(O) 1.5 Diesel AT'
  fuel          text,                             -- petrol / diesel / cng / electric / hybrid
  transmission  text,                             -- mt / at / amt / cvt / dct
  engine        text,
  seating       int,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (generation_id, name)
);

-- -----------------------------------------------------------------------------
-- Product <-> vehicle fitment. Any level of precision.
-- -----------------------------------------------------------------------------
create table public.product_fitments (
  id                 uuid primary key default public.uuid_generate_v7(),
  product_id         uuid not null references public.products (id) on delete cascade,
  variant_id         uuid references public.product_variants (id) on delete cascade,   -- null = whole product
  model_id           uuid not null references public.vehicle_models (id),
  generation_id      uuid references public.vehicle_generations (id),                  -- null = all generations
  vehicle_variant_id uuid references public.vehicle_variants (id),                     -- null = all trims
  year_from          int,
  year_to            int,
  position           text,                        -- front / rear / left / right / both / full_set / boot
  notes              text,
  created_by         uuid,
  device_id          uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index product_fitments_product_idx on public.product_fitments (product_id);
create index product_fitments_variant_idx on public.product_fitments (variant_id);
create index product_fitments_model_idx   on public.product_fitments (model_id, generation_id);

-- Vehicle -> socket/size facts: Creta 2024 'Low beam' = H7. Phase 2 UI, schema now.
create table public.vehicle_spec_map (
  id                 uuid primary key default public.uuid_generate_v7(),
  generation_id      uuid not null references public.vehicle_generations (id) on delete cascade,
  spec_definition_id uuid not null references public.spec_definitions (id),
  position_label     text not null,               -- 'Low beam', 'High beam', 'Fog', 'Parking'
  option_id          uuid references public.spec_options (id),
  value_text         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index vehicle_spec_map_gen_idx on public.vehicle_spec_map (generation_id);

-- Convenience view: one row per fitment with resolved names
create or replace view public.v_fitment_expanded as
select
  f.id,
  f.product_id,
  f.variant_id,
  mk.name as make_name,
  vm.name as model_name,
  vg.name as generation_name,
  coalesce(f.year_from, vg.year_from) as year_from,
  coalesce(f.year_to,   vg.year_to)   as year_to,
  vv.name as vehicle_variant_name,
  f.position
from public.product_fitments f
join public.vehicle_models vm on vm.id = f.model_id
join public.vehicle_makes mk on mk.id = vm.make_id
left join public.vehicle_generations vg on vg.id = f.generation_id
left join public.vehicle_variants vv on vv.id = f.vehicle_variant_id;

create trigger vehicle_makes_updated_at         before update on public.vehicle_makes         for each row execute function public.tg_set_updated_at();
create trigger vehicle_models_updated_at        before update on public.vehicle_models        for each row execute function public.tg_set_updated_at();
create trigger vehicle_model_aliases_updated_at before update on public.vehicle_model_aliases for each row execute function public.tg_set_updated_at();
create trigger vehicle_generations_updated_at   before update on public.vehicle_generations   for each row execute function public.tg_set_updated_at();
create trigger vehicle_variants_updated_at      before update on public.vehicle_variants      for each row execute function public.tg_set_updated_at();
create trigger product_fitments_updated_at      before update on public.product_fitments      for each row execute function public.tg_set_updated_at();
create trigger vehicle_spec_map_updated_at      before update on public.vehicle_spec_map      for each row execute function public.tg_set_updated_at();
