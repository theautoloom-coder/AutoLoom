-- =============================================================================
-- 0015 NULLABLE LOCATION ON DRAFT DOCUMENTS
--
-- The same failure as 0011, one column over. Every document screen creates a
-- blank draft the moment it opens and lets the user fill it in afterwards. With
-- `location_id` "not null", a session whose working location is not yet known
-- has that first insert rejected (23502); PowerSync reverts the local row, and
-- the screen waits for a draft that will never arrive — "Preparing draft…",
-- for ever, with nothing on screen to say why.
--
-- A profile with no `default_location_id` is completely ordinary — the owner's
-- own profile has none — so this was not an edge case, it was every fresh
-- install. The client now falls back to the shop's first location, and this
-- makes the schema agree: a draft may not know its location yet, a posted
-- document must.
--
-- job_cards and stock_audits have no draft state (they open at 'open'), so
-- they are simply made nullable, exactly as job_cards.customer_id was in 0011.
-- =============================================================================

alter table public.sales_invoices alter column location_id drop not null;
alter table public.sales_invoices
  add constraint sales_invoices_location_required_when_posted
  check (status = 'draft' or location_id is not null);

alter table public.purchases alter column location_id drop not null;
alter table public.purchases
  add constraint purchases_location_required_when_posted
  check (status = 'draft' or location_id is not null);

alter table public.stock_adjustments alter column location_id drop not null;
alter table public.stock_adjustments
  add constraint stock_adjustments_location_required_when_posted
  check (status = 'draft' or location_id is not null);

-- A transfer needs both ends, and needs them to differ, but only once it moves.
alter table public.stock_transfers alter column from_location_id drop not null;
alter table public.stock_transfers alter column to_location_id drop not null;
alter table public.stock_transfers
  add constraint stock_transfers_locations_required_when_sent
  check (
    status = 'draft'
    or (from_location_id is not null and to_location_id is not null)
  );

alter table public.job_cards alter column location_id drop not null;
alter table public.stock_audits alter column location_id drop not null;
