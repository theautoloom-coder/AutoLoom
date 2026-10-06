-- =============================================================================
-- Whoever receives the maal may write down who it came from.
--
-- Stock Chadhao lets the person receiving stock type a new supplier's name and
-- carry on. For the godown role that was a trap: making a supplier needed
-- `party.edit`, which the godown does not hold. The phone took it, the server
-- refused the supplier (RLS), then refused the purchase that pointed at it
-- (foreign key) — the stock-in was gone, with a toast to say so. A full-day
-- run as the godown user found it.
--
-- The same shape waits for the workshop role: it bills (`sale.create`) without
-- `party.edit`, and the bill's "+ Naya banao" makes a grahak.
--
-- So the person doing the job may CREATE the party the job needs. Editing an
-- existing supplier or grahak — their credit limit, their opening balance —
-- stays with `party.edit`, exactly as before.
-- =============================================================================

drop policy if exists suppliers_purchase_ins on public.suppliers;
create policy suppliers_purchase_ins on public.suppliers
  for insert to authenticated
  with check (public.has_permission('purchase.create'));

drop policy if exists customers_sale_ins on public.customers;
create policy customers_sale_ins on public.customers
  for insert to authenticated
  with check (public.has_permission('sale.create'));

-- A new party may carry an opening balance, written as a ledger entry; that
-- table already accepts inserts from any active staff member.
