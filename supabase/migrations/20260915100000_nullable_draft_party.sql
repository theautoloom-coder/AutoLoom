-- =============================================================================
-- 0011 NULLABLE PARTY ON DRAFT DOCUMENTS
--
-- The device UI creates a blank draft the instant the user opens "New bill" /
-- "Receive purchase" / "New job card", then lets them pick the customer or
-- supplier a moment later. With customer_id/supplier_id "not null" that first
-- sync of the still-blank draft was rejected by Postgres (23502) and
-- PowerSync discarded the upload — leaving the device stuck on "Preparing…"
-- forever, since the reverted local row never resolves.
--
-- The app already refuses to POST a document without a party (see the
-- "Choose the customer/supplier" guards in invoice/edit.tsx, purchase/edit.tsx
-- and job-card/edit.tsx), so the fix is to only require the party once the
-- document leaves 'draft'. job_cards has no draft stage, so it's just made
-- nullable — a job card is unusable until a customer is picked anyway, and
-- postJobCard reads customer_id off an already-existing job card.
-- =============================================================================

alter table public.sales_invoices alter column customer_id drop not null;
alter table public.sales_invoices
  add constraint sales_invoices_customer_required_when_posted
  check (status = 'draft' or customer_id is not null);

alter table public.purchases alter column supplier_id drop not null;
alter table public.purchases
  add constraint purchases_supplier_required_when_posted
  check (status = 'draft' or supplier_id is not null);

alter table public.job_cards alter column customer_id drop not null;
