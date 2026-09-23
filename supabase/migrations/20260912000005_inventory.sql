-- =============================================================================
-- 0005 INVENTORY
-- Append-only stock movements (the only source of stock), server-maintained
-- stock_levels cache, adjustments, transfers, audits.
-- =============================================================================

create table public.stock_movements (
  id             uuid primary key default public.uuid_generate_v7(),
  variant_id     uuid not null references public.product_variants (id),
  location_id    uuid not null references public.locations (id),
  qty            numeric(12,3) not null,          -- signed: + in, - out
  movement_type  text not null check (movement_type in (
                   'opening','purchase','purchase_return','sale','sale_return',
                   'damage','adjustment','transfer_out','transfer_in',
                   'job_consumption','free_issue','reservation','reservation_release',
                   'cancel_reversal')),
  ref_type       text,                            -- 'purchase' | 'sales_invoice' | 'stock_transfer' | ...
  ref_id         uuid,
  ref_line_id    uuid,
  unit_cost      numeric(14,4) not null default 0,
  batch_no       text,
  serial_no      text,
  occurred_at    timestamptz not null default now(),
  reversal_of_id uuid references public.stock_movements (id),
  note           text,
  created_by     uuid,
  device_id      uuid,
  created_at     timestamptz not null default now()
);
create index stock_movements_variant_loc_idx on public.stock_movements (variant_id, location_id);
create index stock_movements_ref_idx on public.stock_movements (ref_type, ref_id);
create index stock_movements_occurred_idx on public.stock_movements (occurred_at desc);
-- idempotency: one movement per (ref line, type) unless it is a reversal
create unique index stock_movements_ref_line_uq
  on public.stock_movements (ref_type, ref_line_id, movement_type, location_id)
  where ref_line_id is not null and reversal_of_id is null;

-- Server-maintained cache (trigger in 0007). Devices treat it as read-only.
create table public.stock_levels (
  id               uuid primary key default public.uuid_generate_v7(),
  variant_id       uuid not null references public.product_variants (id) on delete cascade,
  location_id      uuid not null references public.locations (id),
  qty              numeric(12,3) not null default 0,
  reserved_qty     numeric(12,3) not null default 0,
  last_movement_at timestamptz,
  updated_at       timestamptz not null default now(),
  unique (variant_id, location_id)
);

-- -----------------------------------------------------------------------------
-- Adjustments (damage, missing, found, opening, audit correction)
-- -----------------------------------------------------------------------------
create table public.stock_adjustments (
  id          uuid primary key default public.uuid_generate_v7(),
  doc_no      text,
  doc_date    date not null default current_date,
  location_id uuid not null references public.locations (id),
  reason      text not null check (reason in ('opening','damage','missing','found','wrong_entry','counting_error','audit','free_issue','other')),
  notes       text,
  status      text not null default 'draft' check (status in ('draft','posted','cancelled')),
  approved_by uuid,
  posted_at   timestamptz,
  created_by  uuid,
  device_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.stock_adjustment_lines (
  id            uuid primary key default public.uuid_generate_v7(),
  adjustment_id uuid not null references public.stock_adjustments (id) on delete cascade,
  variant_id    uuid not null references public.product_variants (id),
  qty_delta     numeric(12,3) not null,           -- signed
  unit_cost     numeric(14,4) not null default 0,
  reason_code   text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index stock_adjustment_lines_adj_idx on public.stock_adjustment_lines (adjustment_id);

-- -----------------------------------------------------------------------------
-- Transfers between locations
-- -----------------------------------------------------------------------------
create table public.stock_transfers (
  id               uuid primary key default public.uuid_generate_v7(),
  doc_no           text,
  doc_date         date not null default current_date,
  from_location_id uuid not null references public.locations (id),
  to_location_id   uuid not null references public.locations (id),
  status           text not null default 'draft' check (status in ('draft','dispatched','received','cancelled')),
  notes            text,
  dispatched_at    timestamptz,
  dispatched_by    uuid,
  received_at      timestamptz,
  received_by      uuid,
  created_by       uuid,
  device_id        uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create table public.stock_transfer_lines (
  id          uuid primary key default public.uuid_generate_v7(),
  transfer_id uuid not null references public.stock_transfers (id) on delete cascade,
  variant_id  uuid not null references public.product_variants (id),
  qty         numeric(12,3) not null check (qty > 0),
  unit_cost   numeric(14,4) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index stock_transfer_lines_transfer_idx on public.stock_transfer_lines (transfer_id);

-- -----------------------------------------------------------------------------
-- Physical stock audit sessions
-- -----------------------------------------------------------------------------
create table public.stock_audits (
  id          uuid primary key default public.uuid_generate_v7(),
  doc_no      text,
  location_id uuid not null references public.locations (id),
  name        text not null,
  filter_family_id uuid references public.product_families (id),
  filter_brand_id  uuid references public.brands (id),
  status      text not null default 'open' check (status in ('open','review','closed','cancelled')),
  started_at  timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   uuid,
  adjustment_id uuid references public.stock_adjustments (id),
  notes       text,
  created_by  uuid,
  device_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.stock_audit_lines (
  id          uuid primary key default public.uuid_generate_v7(),
  audit_id    uuid not null references public.stock_audits (id) on delete cascade,
  variant_id  uuid not null references public.product_variants (id),
  system_qty  numeric(12,3) not null default 0,   -- snapshot at session start
  counted_qty numeric(12,3),
  difference  numeric(12,3) generated always as (coalesce(counted_qty, 0) - system_qty) stored,
  reason_code text,
  counted_by  uuid,
  counted_at  timestamptz,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (audit_id, variant_id)
);

-- -----------------------------------------------------------------------------
-- Views
-- -----------------------------------------------------------------------------
create or replace view public.v_stock_by_variant as
select
  variant_id,
  sum(qty) as qty,
  sum(qty * unit_cost) filter (where qty > 0) as inbound_value
from public.stock_movements
group by variant_id;

create or replace view public.v_stock_by_location as
select variant_id, location_id, sum(qty) as qty
from public.stock_movements
group by variant_id, location_id;

create or replace view public.v_low_stock as
select
  pv.id as variant_id,
  pv.sku,
  p.name as product_name,
  pv.variant_name,
  coalesce(s.qty, 0) as qty,
  pv.min_stock,
  pv.reorder_level,
  pv.reorder_qty
from public.product_variants pv
join public.products p on p.id = pv.product_id
left join public.v_stock_by_variant s on s.variant_id = pv.id
where pv.is_active and coalesce(s.qty, 0) <= greatest(pv.min_stock, pv.reorder_level);

create trigger stock_adjustments_updated_at      before update on public.stock_adjustments      for each row execute function public.tg_set_updated_at();
create trigger stock_adjustment_lines_updated_at before update on public.stock_adjustment_lines for each row execute function public.tg_set_updated_at();
create trigger stock_transfers_updated_at        before update on public.stock_transfers        for each row execute function public.tg_set_updated_at();
create trigger stock_transfer_lines_updated_at   before update on public.stock_transfer_lines   for each row execute function public.tg_set_updated_at();
create trigger stock_audits_updated_at           before update on public.stock_audits           for each row execute function public.tg_set_updated_at();
create trigger stock_audit_lines_updated_at      before update on public.stock_audit_lines      for each row execute function public.tg_set_updated_at();

create trigger stock_adjustments_audit after insert or update on public.stock_adjustments for each row execute function public.tg_audit_row();
create trigger stock_movements_audit   after insert on public.stock_movements for each row
  when (new.movement_type in ('adjustment','damage','cancel_reversal','free_issue')) execute function public.tg_audit_row();
