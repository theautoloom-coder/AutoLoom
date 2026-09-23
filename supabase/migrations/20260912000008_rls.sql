-- =============================================================================
-- 0008 ROW LEVEL SECURITY + POWERSYNC REPLICATION
-- Every authenticated, active staff member can READ the business data (they
-- need it offline). WRITE is gated by role_permissions.
-- =============================================================================

-- Helper: is the caller an active staff member?
create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

-- -----------------------------------------------------------------------------
-- Apply RLS to every public table
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I enable row level security', t);
    -- read: any active staff member
    execute format($p$
      create policy %I on public.%I for select to authenticated
      using (public.is_active_staff())
    $p$, t || '_read', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Write policies, grouped by the permission that governs them
-- -----------------------------------------------------------------------------
create or replace function public.apply_write_policy(p_table text, p_permission text)
returns void
language plpgsql
as $$
begin
  execute format($p$
    create policy %I on public.%I for insert to authenticated
    with check (public.has_permission(%L))
  $p$, p_table || '_ins', p_table, p_permission);

  execute format($p$
    create policy %I on public.%I for update to authenticated
    using (public.has_permission(%L)) with check (public.has_permission(%L))
  $p$, p_table || '_upd', p_table, p_permission, p_permission);

  execute format($p$
    create policy %I on public.%I for delete to authenticated
    using (public.has_permission(%L))
  $p$, p_table || '_del', p_table, p_permission);
end;
$$;

do $$
declare
  m record;
begin
  for m in
    select * from (values
      -- catalogue
      ('product_families','catalog.edit'), ('spec_definitions','catalog.edit'), ('spec_options','catalog.edit'),
      ('categories','catalog.edit'), ('brands','catalog.edit'), ('units','catalog.edit'),
      ('hsn_codes','catalog.edit'), ('tax_rates','admin.settings'),
      ('products','catalog.edit'), ('product_variants','catalog.edit'), ('spec_values','catalog.edit'),
      ('product_images','catalog.edit'),
      -- vehicles
      ('vehicle_makes','catalog.edit'), ('vehicle_models','catalog.edit'), ('vehicle_model_aliases','catalog.edit'),
      ('vehicle_generations','catalog.edit'), ('vehicle_variants','catalog.edit'),
      ('product_fitments','catalog.edit'), ('vehicle_spec_map','catalog.edit'),
      -- pricing
      ('price_lists','catalog.edit_price'), ('price_list_items','catalog.edit_price'),
      ('customer_prices','catalog.edit_price'),
      -- parties
      ('customers','party.edit'), ('suppliers','party.edit'), ('supplier_products','party.edit'),
      ('customer_vehicles','party.edit'),
      -- inventory
      ('stock_adjustments','stock.adjust'), ('stock_adjustment_lines','stock.adjust'),
      ('stock_transfers','stock.transfer'), ('stock_transfer_lines','stock.transfer'),
      ('stock_audits','stock.count'), ('stock_audit_lines','stock.count'),
      -- documents
      ('sales_invoices','sale.create'), ('sales_invoice_lines','sale.create'),
      ('purchases','purchase.create'), ('purchase_lines','purchase.create'),
      ('job_cards','jobcard.edit'), ('job_card_lines','jobcard.edit'), ('job_card_labour','jobcard.edit'),
      -- admin
      ('locations','admin.settings'), ('company_settings','admin.settings'), ('app_settings','admin.settings'),
      ('role_permissions','admin.users'), ('document_sequences','admin.settings')
    ) as t(tbl, perm)
  loop
    perform public.apply_write_policy(m.tbl, m.perm);
  end loop;
end;
$$;

-- Append-only tables: insert allowed to any active staff (the triggers block
-- update/delete regardless of policy).
do $$
declare
  t text;
begin
  foreach t in array array['stock_movements','ledger_entries','audit_logs'] loop
    execute format($p$
      create policy %I on public.%I for insert to authenticated
      with check (public.is_active_staff())
    $p$, t || '_ins', t);
  end loop;
end;
$$;

-- Payments: receiving and paying are separate permissions
create policy payments_ins on public.payments for insert to authenticated
  with check (
    (direction = 'in'  and public.has_permission('payment.receive')) or
    (direction = 'out' and public.has_permission('payment.pay_supplier'))
  );
create policy payments_upd on public.payments for update to authenticated
  using (public.has_permission('payment.receive') or public.has_permission('payment.pay_supplier'))
  with check (public.has_permission('payment.receive') or public.has_permission('payment.pay_supplier'));

create policy payment_allocations_ins on public.payment_allocations for insert to authenticated
  with check (public.has_permission('payment.receive') or public.has_permission('payment.pay_supplier'));
create policy payment_allocations_del on public.payment_allocations for delete to authenticated
  using (public.has_permission('payment.receive') or public.has_permission('payment.pay_supplier'));

-- Profiles: a user may update their own name/pin; admins manage everyone.
create policy profiles_self_upd on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_permission('admin.users'))
  with check (id = auth.uid() or public.has_permission('admin.users'));
create policy profiles_admin_ins on public.profiles for insert to authenticated
  with check (public.has_permission('admin.users'));

-- Devices: a user registers and updates their own device.
create policy devices_own_ins on public.devices for insert to authenticated
  with check (user_id = auth.uid() or public.has_permission('admin.users'));
create policy devices_own_upd on public.devices for update to authenticated
  using (user_id = auth.uid() or public.has_permission('admin.users'))
  with check (user_id = auth.uid() or public.has_permission('admin.users'));

-- Derived caches are written only by SECURITY DEFINER triggers; no client policy.

-- -----------------------------------------------------------------------------
-- PowerSync: replication role + publication
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'powersync_role') then
    create role powersync_role with replication bypassrls login password 'powersync_local_dev';
  end if;
end;
$$;

grant usage on schema public to powersync_role;
grant select on all tables in schema public to powersync_role;
alter default privileges in schema public grant select on tables to powersync_role;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'powersync') then
    create publication powersync for table
      public.company_settings, public.app_settings, public.profiles, public.role_permissions,
      public.devices, public.locations, public.units,
      public.tax_rates, public.hsn_codes,
      public.product_families, public.spec_definitions, public.spec_options,
      public.categories, public.brands, public.products, public.product_variants,
      public.spec_values, public.product_images,
      public.vehicle_makes, public.vehicle_models, public.vehicle_model_aliases,
      public.vehicle_generations, public.vehicle_variants, public.product_fitments,
      public.vehicle_spec_map,
      public.price_lists, public.price_list_items, public.customers, public.customer_prices,
      public.suppliers, public.supplier_products, public.customer_vehicles,
      public.stock_movements, public.stock_levels,
      public.stock_adjustments, public.stock_adjustment_lines,
      public.stock_transfers, public.stock_transfer_lines,
      public.stock_audits, public.stock_audit_lines,
      public.document_sequences,
      public.sales_invoices, public.sales_invoice_lines,
      public.purchases, public.purchase_lines,
      public.payments, public.payment_allocations,
      public.ledger_entries, public.party_balances,
      public.job_cards, public.job_card_lines, public.job_card_labour;
  end if;
end;
$$;
