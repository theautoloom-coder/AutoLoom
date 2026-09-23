-- =============================================================================
-- 0002 CATALOGUE
-- Product families, dynamic specification templates, categories, brands,
-- HSN, tax rates, products, variants (SKUs), spec values, images.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tax and HSN
-- -----------------------------------------------------------------------------
create table public.tax_rates (
  id             uuid primary key default public.uuid_generate_v7(),
  name           text not null,                  -- 'GST 18%'
  rate_pct       numeric(5,2) not null,          -- 18.00
  cgst_pct       numeric(5,2) not null,          -- 9.00
  sgst_pct       numeric(5,2) not null,          -- 9.00
  igst_pct       numeric(5,2) not null,          -- 18.00
  cess_pct       numeric(5,2) not null default 0,
  effective_from date not null default '2017-07-01',
  effective_to   date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.hsn_codes (
  id                  uuid primary key default public.uuid_generate_v7(),
  code                text not null unique,
  description         text,
  default_tax_rate_id uuid references public.tax_rates (id),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Product families and their specification templates
-- -----------------------------------------------------------------------------
create table public.product_families (
  id                  uuid primary key default public.uuid_generate_v7(),
  code                text not null unique,       -- 'LED', 'MAT', 'HORN'
  name                text not null,
  description         text,
  sku_prefix          text not null,              -- 'LED'
  sku_template        text not null default '{FAMILY}-{BRAND}-{AXES}',
  default_hsn_code    text,
  default_unit_id     uuid references public.units (id),
  default_tax_rate_id uuid references public.tax_rates (id),
  is_fitment_required boolean not null default false,   -- mats: yes, bulbs: no
  icon                text,
  sort_order          int not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.spec_definitions (
  id                    uuid primary key default public.uuid_generate_v7(),
  family_id             uuid not null references public.product_families (id) on delete cascade,
  code                  text not null,            -- 'socket', 'wattage' (stable key)
  name                  text not null,            -- 'Socket / Base'
  data_type             text not null check (data_type in ('text','number','boolean','select','multiselect')),
  unit                  text,                     -- 'W', 'V', 'lm', 'K', 'dB', 'mm'
  is_required           boolean not null default false,
  is_variant_axis       boolean not null default false,   -- differs per variant
  is_filterable         boolean not null default true,
  show_in_variant_name  boolean not null default false,
  help_text             text,
  sort_order            int not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (family_id, code)
);

create table public.spec_options (
  id                 uuid primary key default public.uuid_generate_v7(),
  spec_definition_id uuid not null references public.spec_definitions (id) on delete cascade,
  value              text not null,               -- 'H4'
  code               text,                        -- short code for SKU, e.g. 'BLK'
  aliases            text,                        -- '9005|HB3' searchable synonyms
  sort_order         int not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (spec_definition_id, value)
);

-- -----------------------------------------------------------------------------
-- Categories (level 1 = category, level 2 = subcategory), brands
-- -----------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default public.uuid_generate_v7(),
  family_id  uuid references public.product_families (id),
  parent_id  uuid references public.categories (id),
  name       text not null,
  level      int not null default 1 check (level in (1,2)),
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_parent_idx on public.categories (parent_id);

create table public.brands (
  id         uuid primary key default public.uuid_generate_v7(),
  name       text not null unique,
  code       text not null unique,                -- 'XYZ' used in SKU
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Products and variants
-- -----------------------------------------------------------------------------
create table public.products (
  id               uuid primary key default public.uuid_generate_v7(),
  family_id        uuid not null references public.product_families (id),
  category_id      uuid references public.categories (id),
  subcategory_id   uuid references public.categories (id),
  brand_id         uuid references public.brands (id),
  name             text not null,
  description      text,
  hsn_code         text,
  unit_id          uuid references public.units (id),
  tax_rate_id      uuid references public.tax_rates (id),
  is_universal_fit boolean not null default false,
  search_text      text not null default '',
  is_active        boolean not null default true,
  created_by       uuid,
  device_id        uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index products_family_idx on public.products (family_id);
create index products_brand_idx  on public.products (brand_id);
create index products_search_trgm_idx on public.products using gin (search_text gin_trgm_ops);

create table public.product_variants (
  id                 uuid primary key default public.uuid_generate_v7(),
  product_id         uuid not null references public.products (id) on delete cascade,
  variant_name       text not null,               -- 'H4 60W' (auto from axis specs, editable)
  sku                text not null unique,
  barcode            text unique,
  mrp                numeric(14,2),
  retail_price       numeric(14,2) not null default 0,
  wholesale_price    numeric(14,2),
  dealer_price       numeric(14,2),
  min_selling_price  numeric(14,2),
  min_stock          numeric(12,3) not null default 0,
  reorder_level      numeric(12,3) not null default 0,
  reorder_qty        numeric(12,3) not null default 0,
  last_purchase_cost numeric(14,2) not null default 0,
  avg_cost           numeric(14,4) not null default 0,
  search_text        text not null default '',
  sort_order         int not null default 0,
  is_active          boolean not null default true,
  created_by         uuid,
  device_id          uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants (product_id);
create index product_variants_search_trgm_idx on public.product_variants using gin (search_text gin_trgm_ops);

-- One row per (product or variant) x spec. variant_id NULL = product-level (inherited).
create table public.spec_values (
  id                 uuid primary key default public.uuid_generate_v7(),
  product_id         uuid not null references public.products (id) on delete cascade,
  variant_id         uuid references public.product_variants (id) on delete cascade,
  spec_definition_id uuid not null references public.spec_definitions (id),
  value_text         text,
  value_number       numeric(14,4),
  value_bool         boolean,
  option_id          uuid references public.spec_options (id),
  option_ids         text,                        -- multiselect: comma-separated option ids
  display_value      text not null default '',    -- denormalised for lists ('H4', '60 W', 'Yes')
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index spec_values_product_level_uq on public.spec_values (product_id, spec_definition_id) where variant_id is null;
create unique index spec_values_variant_level_uq on public.spec_values (variant_id, spec_definition_id) where variant_id is not null;
create index spec_values_def_option_idx on public.spec_values (spec_definition_id, option_id);
create index spec_values_def_number_idx on public.spec_values (spec_definition_id, value_number);

create table public.product_images (
  id           uuid primary key default public.uuid_generate_v7(),
  product_id   uuid not null references public.products (id) on delete cascade,
  variant_id   uuid references public.product_variants (id) on delete cascade,
  storage_path text not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Effective specs of a variant: product-level rows overlaid by variant-level rows
-- -----------------------------------------------------------------------------
create or replace view public.v_variant_specs as
select
  pv.id                     as variant_id,
  pv.product_id,
  sd.id                     as spec_definition_id,
  sd.code                   as spec_code,
  sd.name                   as spec_name,
  sd.data_type,
  sd.unit,
  sd.is_variant_axis,
  sd.sort_order,
  coalesce(vv.display_value, pvl.display_value) as display_value,
  coalesce(vv.option_id,     pvl.option_id)     as option_id,
  coalesce(vv.value_number,  pvl.value_number)  as value_number,
  coalesce(vv.value_text,    pvl.value_text)    as value_text,
  coalesce(vv.value_bool,    pvl.value_bool)    as value_bool
from public.product_variants pv
join public.products p on p.id = pv.product_id
join public.spec_definitions sd on sd.family_id = p.family_id and sd.is_active
left join public.spec_values pvl on pvl.product_id = p.id and pvl.variant_id is null and pvl.spec_definition_id = sd.id
left join public.spec_values vv  on vv.variant_id = pv.id and vv.spec_definition_id = sd.id
where vv.id is not null or pvl.id is not null;

-- updated_at triggers
create trigger tax_rates_updated_at        before update on public.tax_rates        for each row execute function public.tg_set_updated_at();
create trigger hsn_codes_updated_at        before update on public.hsn_codes        for each row execute function public.tg_set_updated_at();
create trigger product_families_updated_at before update on public.product_families for each row execute function public.tg_set_updated_at();
create trigger spec_definitions_updated_at before update on public.spec_definitions for each row execute function public.tg_set_updated_at();
create trigger spec_options_updated_at     before update on public.spec_options     for each row execute function public.tg_set_updated_at();
create trigger categories_updated_at       before update on public.categories       for each row execute function public.tg_set_updated_at();
create trigger brands_updated_at           before update on public.brands           for each row execute function public.tg_set_updated_at();
create trigger products_updated_at         before update on public.products         for each row execute function public.tg_set_updated_at();
create trigger product_variants_updated_at before update on public.product_variants for each row execute function public.tg_set_updated_at();
create trigger spec_values_updated_at      before update on public.spec_values      for each row execute function public.tg_set_updated_at();
create trigger product_images_updated_at   before update on public.product_images   for each row execute function public.tg_set_updated_at();

-- price changes are sensitive
create trigger product_variants_audit after update or delete on public.product_variants for each row execute function public.tg_audit_row();
create trigger tax_rates_audit        after insert or update or delete on public.tax_rates for each row execute function public.tg_audit_row();
