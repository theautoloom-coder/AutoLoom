-- =============================================================================
-- 0012 PACK SIZE AND WARRANTY
--
-- Two findings from the September audit, both of which cost real money:
--
--   Pack size. A 7D mat is a set of 5 or 7 pieces, LED bulbs go in pairs, a
--   seat cover is a set of 9. Everything was counted in "pcs", so the moment
--   staff entered one and meant the other, stock drifted and never came back.
--   pack_size records how many pieces make up the unit that is SOLD; stock
--   stays in pieces (so movements, costing and reports are unchanged) and the
--   UI multiplies at the point of sale.
--
--   Warranty. LED bulbs, Android screens and reverse cameras carry 6-12 months
--   and they do fail. The customer arrives with the part and no bill. Storing
--   the period on the variant lets the customer page answer "warranty mein hai
--   ya nahi" from the sale date, with no new bookkeeping for staff.
-- =============================================================================

alter table public.product_variants
  add column if not exists pack_size numeric(12,3) not null default 1,
  add column if not exists pack_label text,
  add column if not exists warranty_months int not null default 0;

alter table public.product_variants
  add constraint product_variants_pack_size_positive check (pack_size > 0),
  add constraint product_variants_warranty_months_sane check (warranty_months >= 0 and warranty_months <= 120);

comment on column public.product_variants.pack_size is
  'Pieces per sold unit. 1 = sold loose. 7 = a 7-piece mat set.';
comment on column public.product_variants.pack_label is
  'What the customer calls that unit: set, pair, box. Null means pieces.';
comment on column public.product_variants.warranty_months is
  'Months of warranty from the invoice date. 0 = none.';
