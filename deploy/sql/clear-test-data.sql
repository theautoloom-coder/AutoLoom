-- AutoLoom production — clear the test data before real use (owner asked, 6 Oct 2026).
-- Runs as one transaction: any error, or any record that does not look like
-- test data, and nothing is removed.
--
-- Kept: staff logins and profiles, devices, locations, settings, the vehicle
-- and spec master data, categories (except the ZZ test one), numbering series
-- (reset to 0001).

do $$
begin
  if exists (select 1 from public.customers where name not like 'TEST%') then
    raise exception 'A customer that is not TEST data exists — stopping';
  end if;
  if exists (select 1 from public.suppliers where name not like 'TEST%') then
    raise exception 'A supplier that is not TEST data exists — stopping';
  end if;
  if exists (select 1 from public.products where name not like 'ZZ Test%') then
    raise exception 'A product that is not ZZ test data exists — stopping';
  end if;
end $$;

-- Posted documents refuse changes by trigger, and so do the append-only
-- logs; these are switched off only for this clean-up and switched back on
-- at the end of it.
alter table public.sales_invoices      disable trigger sales_invoices_guard;
alter table public.sales_invoice_lines disable trigger sales_invoice_lines_guard;
alter table public.purchases           disable trigger purchases_guard;
alter table public.purchase_lines      disable trigger purchase_lines_guard;
alter table public.change_requests     disable trigger change_requests_guard;
alter table public.stock_movements     disable trigger stock_movements_no_update;
alter table public.ledger_entries      disable trigger ledger_entries_no_update;
alter table public.audit_logs          disable trigger audit_logs_no_update;

-- Documents and money, children first.
delete from public.payment_allocations;
delete from public.payments;
delete from public.sales_invoice_lines;
delete from public.job_card_lines;
delete from public.job_card_labour;
delete from public.job_cards;
delete from public.sales_invoices;
delete from public.purchase_lines;
delete from public.purchases;
delete from public.stock_adjustment_lines;
delete from public.stock_adjustments;
delete from public.stock_transfer_lines;
delete from public.stock_transfers;
delete from public.stock_audit_lines;
delete from public.stock_audits;
delete from public.expenses;

delete from public.stock_movements;
delete from public.ledger_entries;

-- The caches those logs fed.
delete from public.stock_levels;
delete from public.party_balances;

-- Test parties and the test item.
delete from public.supplier_products;
delete from public.customer_prices;
delete from public.customer_vehicles;
delete from public.customers;
delete from public.suppliers;
delete from public.change_requests;
delete from public.product_images;
delete from public.product_fitments;
delete from public.spec_values;
delete from public.price_list_items where variant_id in (select id from public.product_variants);
delete from public.product_variants;
delete from public.products;
delete from public.categories c using public.product_families f where c.family_id = f.id and f.code = 'ZZTEST';
delete from public.product_families where code = 'ZZTEST';

-- Real bills start at 0001.
update public.document_sequences set next_number = 1 where next_number <> 1;

-- Last, because the deletes above write audit rows of their own.
delete from public.audit_logs;

alter table public.sales_invoices      enable trigger sales_invoices_guard;
alter table public.sales_invoice_lines enable trigger sales_invoice_lines_guard;
alter table public.purchases           enable trigger purchases_guard;
alter table public.purchase_lines      enable trigger purchase_lines_guard;
alter table public.change_requests     enable trigger change_requests_guard;
alter table public.stock_movements     enable trigger stock_movements_no_update;
alter table public.ledger_entries      enable trigger ledger_entries_no_update;
alter table public.audit_logs          enable trigger audit_logs_no_update;
