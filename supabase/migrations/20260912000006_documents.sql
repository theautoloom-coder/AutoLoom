-- =============================================================================
-- 0006 DOCUMENTS AND MONEY
-- Numbering series, sales invoices / credit notes, purchases / debit notes,
-- payments, allocations, party ledger, party balances, job cards.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Offline-safe numbering: one series row is owned by one device.
-- -----------------------------------------------------------------------------
create table public.document_sequences (
  id              uuid primary key default public.uuid_generate_v7(),
  series_code     text not null,                  -- 'A', 'B', 'W'
  doc_type        text not null check (doc_type in (
                    'sales_invoice','credit_note','purchase','debit_note','payment_in','payment_out',
                    'stock_adjustment','stock_transfer','stock_audit','job_card')),
  financial_year  text not null,                  -- '26-27'
  prefix          text not null,                  -- 'NOI/A/'
  next_number     int not null default 1,
  pad_width       int not null default 4,
  location_id     uuid references public.locations (id),
  owner_device_id uuid references public.devices (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (series_code, doc_type, financial_year)
);

-- -----------------------------------------------------------------------------
-- Sales invoices and credit notes
-- -----------------------------------------------------------------------------
create table public.sales_invoices (
  id                     uuid primary key default public.uuid_generate_v7(),
  doc_type               text not null default 'invoice' check (doc_type in ('invoice','credit_note')),
  doc_no                 text,                    -- assigned at post
  doc_date               date not null default current_date,
  customer_id            uuid not null references public.customers (id),
  customer_vehicle_id    uuid references public.customer_vehicles (id),
  location_id            uuid not null references public.locations (id),
  price_list_id          uuid references public.price_lists (id),
  -- frozen customer facts
  customer_name          text,
  customer_gstin         text,
  customer_state_code    text,
  place_of_supply_state  text,
  is_interstate          boolean not null default false,
  is_b2b                 boolean not null default false,
  -- totals
  subtotal               numeric(14,2) not null default 0,   -- sum(qty*rate)
  discount_total         numeric(14,2) not null default 0,
  taxable_total          numeric(14,2) not null default 0,
  cgst_total             numeric(14,2) not null default 0,
  sgst_total             numeric(14,2) not null default 0,
  igst_total             numeric(14,2) not null default 0,
  other_charges          numeric(14,2) not null default 0,
  round_off              numeric(14,2) not null default 0,
  grand_total            numeric(14,2) not null default 0,
  paid_total             numeric(14,2) not null default 0,
  -- terms
  payment_mode           text check (payment_mode in ('cash','upi','card','bank','cheque','credit','mixed')),
  credit_days            int not null default 0,
  due_date               date,
  -- lifecycle
  status                 text not null default 'draft' check (status in ('draft','posted','cancelled')),
  posted_at              timestamptz,
  cancelled_at           timestamptz,
  cancelled_by           uuid,
  cancel_reason          text,
  against_invoice_id     uuid references public.sales_invoices (id),   -- credit note -> original invoice
  credit_flag            boolean not null default false,               -- credit limit exceeded at post
  credit_override_by     uuid,
  salesperson_id         uuid,
  notes                  text,
  created_by             uuid,
  device_id              uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index sales_invoices_doc_no_uq on public.sales_invoices (doc_type, doc_no) where doc_no is not null;
create index sales_invoices_customer_idx on public.sales_invoices (customer_id, doc_date desc);
create index sales_invoices_date_idx on public.sales_invoices (doc_date desc);
create index sales_invoices_status_idx on public.sales_invoices (status);

create table public.sales_invoice_lines (
  id                   uuid primary key default public.uuid_generate_v7(),
  invoice_id           uuid not null references public.sales_invoices (id) on delete cascade,
  line_no              int not null default 1,
  variant_id           uuid not null references public.product_variants (id),
  description          text not null,             -- frozen: "XYZ Ultra LED H4 60W"
  hsn_code             text,
  qty                  numeric(12,3) not null check (qty > 0),
  unit_code            text,
  mrp                  numeric(14,2),
  list_price           numeric(14,2),             -- resolved price before manual change
  rate                 numeric(14,2) not null,    -- actual unit rate (pre-tax)
  discount_pct         numeric(6,3) not null default 0,
  discount_amt         numeric(14,2) not null default 0,
  taxable_value        numeric(14,2) not null default 0,
  tax_rate_pct         numeric(5,2) not null default 0,
  cgst                 numeric(14,2) not null default 0,
  sgst                 numeric(14,2) not null default 0,
  igst                 numeric(14,2) not null default 0,
  line_total           numeric(14,2) not null default 0,
  unit_cost_at_sale    numeric(14,4) not null default 0,  -- frozen avg_cost for margin
  price_source         text check (price_source in ('retail','dealer','wholesale','price_list','customer','manual')),
  override_approved_by uuid,
  return_condition     text check (return_condition in ('sellable','damaged')),   -- credit notes only
  against_line_id      uuid references public.sales_invoice_lines (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index sales_invoice_lines_invoice_idx on public.sales_invoice_lines (invoice_id);
create index sales_invoice_lines_variant_idx on public.sales_invoice_lines (variant_id);

-- -----------------------------------------------------------------------------
-- Purchases and debit notes (purchase returns)
-- -----------------------------------------------------------------------------
create table public.purchases (
  id                    uuid primary key default public.uuid_generate_v7(),
  doc_type              text not null default 'purchase' check (doc_type in ('purchase','debit_note')),
  doc_no                text,
  doc_date              date not null default current_date,
  supplier_id           uuid not null references public.suppliers (id),
  supplier_invoice_no   text,
  supplier_invoice_date date,
  location_id           uuid not null references public.locations (id),
  supplier_name         text,
  supplier_gstin        text,
  supplier_state_code   text,
  is_interstate         boolean not null default false,
  subtotal              numeric(14,2) not null default 0,
  discount_total        numeric(14,2) not null default 0,
  taxable_total         numeric(14,2) not null default 0,
  cgst_total            numeric(14,2) not null default 0,
  sgst_total            numeric(14,2) not null default 0,
  igst_total            numeric(14,2) not null default 0,
  other_charges         numeric(14,2) not null default 0,   -- freight etc., spread into landed cost
  round_off             numeric(14,2) not null default 0,
  grand_total           numeric(14,2) not null default 0,
  paid_total            numeric(14,2) not null default 0,
  due_date              date,
  status                text not null default 'draft' check (status in ('draft','posted','cancelled')),
  posted_at             timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          uuid,
  cancel_reason         text,
  against_purchase_id   uuid references public.purchases (id),
  notes                 text,
  created_by            uuid,
  device_id             uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index purchases_doc_no_uq on public.purchases (doc_type, doc_no) where doc_no is not null;
create index purchases_supplier_idx on public.purchases (supplier_id, doc_date desc);
create index purchases_date_idx on public.purchases (doc_date desc);

create table public.purchase_lines (
  id               uuid primary key default public.uuid_generate_v7(),
  purchase_id      uuid not null references public.purchases (id) on delete cascade,
  line_no          int not null default 1,
  variant_id       uuid not null references public.product_variants (id),
  description      text not null,
  hsn_code         text,
  qty              numeric(12,3) not null check (qty > 0),
  unit_code        text,
  rate             numeric(14,2) not null,
  discount_pct     numeric(6,3) not null default 0,
  discount_amt     numeric(14,2) not null default 0,
  taxable_value    numeric(14,2) not null default 0,
  tax_rate_pct     numeric(5,2) not null default 0,
  cgst             numeric(14,2) not null default 0,
  sgst             numeric(14,2) not null default 0,
  igst             numeric(14,2) not null default 0,
  line_total       numeric(14,2) not null default 0,
  landed_unit_cost numeric(14,4) not null default 0,   -- (taxable + share of other charges) / qty
  mrp              numeric(14,2),
  batch_no         text,
  warranty_months  int,
  against_line_id  uuid references public.purchase_lines (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index purchase_lines_purchase_idx on public.purchase_lines (purchase_id);
create index purchase_lines_variant_idx on public.purchase_lines (variant_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Payments (in from customers, out to suppliers) and allocations
-- -----------------------------------------------------------------------------
create table public.payments (
  id             uuid primary key default public.uuid_generate_v7(),
  direction      text not null check (direction in ('in','out')),
  party_type     text not null check (party_type in ('customer','supplier')),
  party_id       uuid not null,
  doc_no         text,
  payment_date   date not null default current_date,
  amount         numeric(14,2) not null check (amount > 0),
  mode           text not null check (mode in ('cash','upi','card','bank','cheque','adjustment')),
  reference_no   text,
  bank_name      text,
  notes          text,
  status         text not null default 'posted' check (status in ('posted','cancelled','bounced')),
  cancelled_at   timestamptz,
  cancel_reason  text,
  received_by    uuid,
  created_by     uuid,
  device_id      uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index payments_party_idx on public.payments (party_type, party_id, payment_date desc);

create table public.payment_allocations (
  id         uuid primary key default public.uuid_generate_v7(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  doc_type   text not null check (doc_type in ('sales_invoice','purchase','credit_note','debit_note')),
  doc_id     uuid not null,
  amount     numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_allocations_doc_idx on public.payment_allocations (doc_type, doc_id);

-- -----------------------------------------------------------------------------
-- Party ledger: append-only. Customer outstanding = sum(debit) - sum(credit).
-- Supplier payable = sum(credit) - sum(debit).
-- -----------------------------------------------------------------------------
create table public.ledger_entries (
  id             uuid primary key default public.uuid_generate_v7(),
  party_type     text not null check (party_type in ('customer','supplier')),
  party_id       uuid not null,
  entry_date     date not null default current_date,
  doc_type       text not null check (doc_type in (
                   'opening','sales_invoice','credit_note','payment_in',
                   'purchase','debit_note','payment_out','adjustment','cancel_reversal')),
  doc_id         uuid,
  doc_no         text,
  debit          numeric(14,2) not null default 0,
  credit         numeric(14,2) not null default 0,
  narration      text,
  reversal_of_id uuid references public.ledger_entries (id),
  created_by     uuid,
  device_id      uuid,
  created_at     timestamptz not null default now(),
  check (debit >= 0 and credit >= 0)
);
create index ledger_entries_party_idx on public.ledger_entries (party_type, party_id, entry_date);
create index ledger_entries_doc_idx on public.ledger_entries (doc_type, doc_id);
create unique index ledger_entries_doc_uq on public.ledger_entries (doc_type, doc_id, party_id)
  where doc_id is not null and reversal_of_id is null;

-- Server cache (trigger in 0007)
create table public.party_balances (
  id             uuid primary key default public.uuid_generate_v7(),
  party_type     text not null,
  party_id       uuid not null,
  balance        numeric(14,2) not null default 0,    -- customer: receivable, supplier: payable
  last_txn_at    timestamptz,
  updated_at     timestamptz not null default now(),
  unique (party_type, party_id)
);

-- -----------------------------------------------------------------------------
-- Workshop job cards (Phase 2 UI; schema in place)
-- -----------------------------------------------------------------------------
create table public.job_cards (
  id                  uuid primary key default public.uuid_generate_v7(),
  doc_no              text,
  doc_date            date not null default current_date,
  customer_id         uuid not null references public.customers (id),
  customer_vehicle_id uuid references public.customer_vehicles (id),
  location_id         uuid not null references public.locations (id),   -- workshop
  technician_id       uuid,
  requirement         text,
  odometer_km         int,
  status              text not null default 'open' check (status in ('open','in_progress','ready','closed','cancelled')),
  parts_total         numeric(14,2) not null default 0,
  labour_total        numeric(14,2) not null default 0,
  discount_total      numeric(14,2) not null default 0,
  tax_total           numeric(14,2) not null default 0,
  grand_total         numeric(14,2) not null default 0,
  invoice_id          uuid references public.sales_invoices (id),
  closed_at           timestamptz,
  notes               text,
  created_by          uuid,
  device_id           uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.job_card_lines (
  id          uuid primary key default public.uuid_generate_v7(),
  job_card_id uuid not null references public.job_cards (id) on delete cascade,
  variant_id  uuid not null references public.product_variants (id),
  description text not null,
  qty         numeric(12,3) not null check (qty > 0),
  rate        numeric(14,2) not null default 0,
  tax_rate_pct numeric(5,2) not null default 0,
  line_total  numeric(14,2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.job_card_labour (
  id          uuid primary key default public.uuid_generate_v7(),
  job_card_id uuid not null references public.job_cards (id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null default 0,
  sac_code    text,
  tax_rate_pct numeric(5,2) not null default 0,
  technician_id uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Views
-- -----------------------------------------------------------------------------
create or replace view public.v_party_outstanding as
select
  party_type,
  party_id,
  case when party_type = 'customer' then sum(debit) - sum(credit) else sum(credit) - sum(debit) end as outstanding,
  max(entry_date) as last_entry_date
from public.ledger_entries
group by party_type, party_id;

create or replace view public.v_customer_overdue as
select
  i.customer_id,
  sum(i.grand_total - i.paid_total) as overdue_amount,
  min(i.due_date) as oldest_due_date
from public.sales_invoices i
where i.doc_type = 'invoice' and i.status = 'posted'
  and i.due_date < current_date and i.grand_total > i.paid_total
group by i.customer_id;

create trigger document_sequences_updated_at   before update on public.document_sequences   for each row execute function public.tg_set_updated_at();
create trigger sales_invoices_updated_at       before update on public.sales_invoices       for each row execute function public.tg_set_updated_at();
create trigger sales_invoice_lines_updated_at  before update on public.sales_invoice_lines  for each row execute function public.tg_set_updated_at();
create trigger purchases_updated_at            before update on public.purchases            for each row execute function public.tg_set_updated_at();
create trigger purchase_lines_updated_at       before update on public.purchase_lines       for each row execute function public.tg_set_updated_at();
create trigger payments_updated_at             before update on public.payments             for each row execute function public.tg_set_updated_at();
create trigger payment_allocations_updated_at  before update on public.payment_allocations  for each row execute function public.tg_set_updated_at();
create trigger job_cards_updated_at            before update on public.job_cards            for each row execute function public.tg_set_updated_at();
create trigger job_card_lines_updated_at       before update on public.job_card_lines       for each row execute function public.tg_set_updated_at();
create trigger job_card_labour_updated_at      before update on public.job_card_labour      for each row execute function public.tg_set_updated_at();

create trigger sales_invoices_audit after update or delete on public.sales_invoices for each row execute function public.tg_audit_row();
create trigger purchases_audit      after update or delete on public.purchases      for each row execute function public.tg_audit_row();
create trigger payments_audit       after update or delete on public.payments       for each row execute function public.tg_audit_row();
