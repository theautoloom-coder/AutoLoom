-- =============================================================================
-- 0007 DERIVED DATA AND INTEGRITY TRIGGERS
-- stock_levels cache, avg cost, party_balances, search_text, immutability guards.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- stock_levels cache follows stock_movements
-- -----------------------------------------------------------------------------
create or replace function public.tg_apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stock_levels (variant_id, location_id, qty, last_movement_at, updated_at)
  values (new.variant_id, new.location_id, new.qty, new.occurred_at, now())
  on conflict (variant_id, location_id) do update
    set qty              = public.stock_levels.qty + excluded.qty,
        last_movement_at = greatest(coalesce(public.stock_levels.last_movement_at, excluded.last_movement_at), excluded.last_movement_at),
        updated_at       = now();
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function public.tg_apply_stock_movement();

-- Movements are append-only.
create or replace function public.tg_block_write()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are append-only; write a reversing row instead', tg_table_name;
end;
$$;

create trigger stock_movements_no_update before update or delete on public.stock_movements
  for each row execute function public.tg_block_write();
create trigger ledger_entries_no_update before update or delete on public.ledger_entries
  for each row execute function public.tg_block_write();
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.tg_block_write();

-- -----------------------------------------------------------------------------
-- party_balances cache follows ledger_entries
-- -----------------------------------------------------------------------------
create or replace function public.tg_apply_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta numeric(14,2);
begin
  -- customer: debit increases receivable; supplier: credit increases payable
  if new.party_type = 'customer' then
    v_delta := new.debit - new.credit;
  else
    v_delta := new.credit - new.debit;
  end if;

  insert into public.party_balances (party_type, party_id, balance, last_txn_at, updated_at)
  values (new.party_type, new.party_id, v_delta, now(), now())
  on conflict (party_type, party_id) do update
    set balance     = public.party_balances.balance + excluded.balance,
        last_txn_at = now(),
        updated_at  = now();
  return new;
end;
$$;

create trigger ledger_entries_apply
  after insert on public.ledger_entries
  for each row execute function public.tg_apply_ledger_entry();

-- -----------------------------------------------------------------------------
-- Moving weighted average cost on purchase movements
-- -----------------------------------------------------------------------------
create or replace function public.tg_update_avg_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_qty  numeric(12,3);
  v_old_avg  numeric(14,4);
  v_new_avg  numeric(14,4);
begin
  if new.movement_type <> 'purchase' or new.qty <= 0 or new.unit_cost <= 0 then
    return new;
  end if;

  select coalesce(sum(qty), 0) into v_old_qty
  from public.stock_levels where variant_id = new.variant_id;
  -- the movement has already been applied by tg_apply_stock_movement
  v_old_qty := v_old_qty - new.qty;

  select avg_cost into v_old_avg from public.product_variants where id = new.variant_id;

  if v_old_qty <= 0 then
    v_new_avg := new.unit_cost;
  else
    v_new_avg := ((v_old_qty * coalesce(v_old_avg, 0)) + (new.qty * new.unit_cost)) / (v_old_qty + new.qty);
  end if;

  update public.product_variants
     set avg_cost           = v_new_avg,
         last_purchase_cost = new.unit_cost,
         updated_at         = now()
   where id = new.variant_id;

  return new;
end;
$$;

create trigger stock_movements_avg_cost
  after insert on public.stock_movements
  for each row execute function public.tg_update_avg_cost();

-- -----------------------------------------------------------------------------
-- search_text builders
-- -----------------------------------------------------------------------------
create or replace function public.rebuild_product_search(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text;
begin
  select lower(concat_ws(' ',
      p.name,
      b.name, b.code,
      f.name, f.code,
      c1.name, c2.name,
      p.description,
      (select string_agg(distinct sv.display_value, ' ')
         from public.spec_values sv
        where sv.product_id = p.id and sv.variant_id is null),
      (select string_agg(distinct so.aliases, ' ')
         from public.spec_values sv
         join public.spec_options so on so.id = sv.option_id
        where sv.product_id = p.id and sv.variant_id is null),
      (select string_agg(distinct concat_ws(' ', mk.name, vm.name, vm.code, vg.name), ' ')
         from public.product_fitments pf
         join public.vehicle_models vm on vm.id = pf.model_id
         join public.vehicle_makes mk on mk.id = vm.make_id
         left join public.vehicle_generations vg on vg.id = pf.generation_id
        where pf.product_id = p.id)
    ))
    into v_text
  from public.products p
  left join public.brands b on b.id = p.brand_id
  left join public.product_families f on f.id = p.family_id
  left join public.categories c1 on c1.id = p.category_id
  left join public.categories c2 on c2.id = p.subcategory_id
  where p.id = p_product_id;

  update public.products set search_text = coalesce(v_text, ''), updated_at = now()
   where id = p_product_id and search_text is distinct from coalesce(v_text, '');

  -- A variant's search text is the product text plus its own axis values,
  -- so searching "h4" must not return the H7 variant of the same product.
  update public.product_variants pv
     set search_text = lower(concat_ws(' ',
           coalesce(v_text, ''), pv.variant_name, pv.sku, pv.barcode,
           (select string_agg(distinct sv.display_value, ' ')
              from public.spec_values sv where sv.variant_id = pv.id),
           (select string_agg(distinct so.aliases, ' ')
              from public.spec_values sv
              join public.spec_options so on so.id = sv.option_id
             where sv.variant_id = pv.id))),
         updated_at  = now()
   where pv.product_id = p_product_id;
end;
$$;

create or replace function public.tg_rebuild_product_search()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'products' then
      v_product_id := old.id;
    else
      v_product_id := old.product_id;
    end if;
  else
    if tg_table_name = 'products' then
      v_product_id := new.id;
    else
      v_product_id := new.product_id;
    end if;
  end if;

  if v_product_id is not null then
    perform public.rebuild_product_search(v_product_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger products_search after insert or update of name, description, brand_id, family_id, category_id, subcategory_id
  on public.products for each row execute function public.tg_rebuild_product_search();
create trigger spec_values_search after insert or update or delete
  on public.spec_values for each row execute function public.tg_rebuild_product_search();
create trigger product_fitments_search after insert or update or delete
  on public.product_fitments for each row execute function public.tg_rebuild_product_search();
create trigger product_variants_search after insert or update of variant_name, sku, barcode
  on public.product_variants for each row execute function public.tg_rebuild_product_search();

-- Vehicle model search text (make + model + aliases)
create or replace function public.tg_rebuild_vehicle_search()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model_id uuid;
  v_text text;
begin
  if tg_op = 'DELETE' then
    v_model_id := old.model_id;
  elsif tg_table_name = 'vehicle_models' then
    v_model_id := new.id;
  else
    v_model_id := new.model_id;
  end if;

  select lower(concat_ws(' ', mk.name, vm.name, vm.code,
           (select string_agg(a.alias, ' ') from public.vehicle_model_aliases a where a.model_id = vm.id),
           (select string_agg(concat_ws(' ', g.name, g.year_from::text, coalesce(g.year_to::text, '')), ' ')
              from public.vehicle_generations g where g.model_id = vm.id)))
    into v_text
  from public.vehicle_models vm
  join public.vehicle_makes mk on mk.id = vm.make_id
  where vm.id = v_model_id;

  update public.vehicle_models set search_text = coalesce(v_text, ''), updated_at = now()
   where id = v_model_id and search_text is distinct from coalesce(v_text, '');

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger vehicle_models_search after insert or update of name, code, make_id
  on public.vehicle_models for each row execute function public.tg_rebuild_vehicle_search();
create trigger vehicle_model_aliases_search after insert or update or delete
  on public.vehicle_model_aliases for each row execute function public.tg_rebuild_vehicle_search();

-- Party search text
create or replace function public.tg_rebuild_party_search()
returns trigger
language plpgsql
as $$
declare
  v_biz text;
begin
  if tg_table_name = 'customers' then
    v_biz := new.business_name;
  else
    v_biz := new.company_name;
  end if;
  new.search_text := lower(concat_ws(' ',
    new.name,
    v_biz,
    new.code, new.mobile, new.alt_phone, new.gstin, new.city));
  return new;
end;
$$;

create trigger customers_search before insert or update on public.customers
  for each row execute function public.tg_rebuild_party_search();
create trigger suppliers_search before insert or update on public.suppliers
  for each row execute function public.tg_rebuild_party_search();

-- Normalise vehicle registration numbers for search
create or replace function public.tg_normalise_registration()
returns trigger
language plpgsql
as $$
begin
  new.registration_no := upper(regexp_replace(coalesce(new.registration_no, ''), '[^A-Za-z0-9]', '', 'g'));
  return new;
end;
$$;

create trigger customer_vehicles_normalise before insert or update on public.customer_vehicles
  for each row execute function public.tg_normalise_registration();

-- -----------------------------------------------------------------------------
-- Posted documents are immutable except for controlled fields
-- -----------------------------------------------------------------------------
create or replace function public.tg_guard_posted_document()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'posted' and new.status = 'posted' then
    -- only these may change after posting
    if (to_jsonb(new) - 'paid_total' - 'updated_at' - 'notes' - 'credit_flag' - 'credit_override_by' - 'invoice_id')
       is distinct from
       (to_jsonb(old) - 'paid_total' - 'updated_at' - 'notes' - 'credit_flag' - 'credit_override_by' - 'invoice_id') then
      raise exception 'Posted % % cannot be edited. Cancel it or issue a credit/debit note.', tg_table_name, old.doc_no;
    end if;
  end if;
  if old.status = 'cancelled' then
    raise exception 'Cancelled % % cannot be changed.', tg_table_name, old.doc_no;
  end if;
  return new;
end;
$$;

create trigger sales_invoices_guard before update on public.sales_invoices
  for each row execute function public.tg_guard_posted_document();
create trigger purchases_guard before update on public.purchases
  for each row execute function public.tg_guard_posted_document();

create or replace function public.tg_guard_posted_lines()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_parent uuid;
begin
  if tg_table_name = 'sales_invoice_lines' then
    if tg_op = 'DELETE' then v_parent := old.invoice_id; else v_parent := new.invoice_id; end if;
    select status into v_status from public.sales_invoices where id = v_parent;
  else
    if tg_op = 'DELETE' then v_parent := old.purchase_id; else v_parent := new.purchase_id; end if;
    select status into v_status from public.purchases where id = v_parent;
  end if;

  if v_status in ('posted','cancelled') then
    raise exception 'Lines of a % document cannot be changed.', v_status;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger sales_invoice_lines_guard before update or delete on public.sales_invoice_lines
  for each row execute function public.tg_guard_posted_lines();
create trigger purchase_lines_guard before update or delete on public.purchase_lines
  for each row execute function public.tg_guard_posted_lines();

-- -----------------------------------------------------------------------------
-- Payment allocations keep paid_total in step
-- -----------------------------------------------------------------------------
create or replace function public.tg_apply_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_allocations;
  v_delta numeric(14,2);
begin
  if tg_op = 'DELETE' then
    r := old; v_delta := -old.amount;
  else
    r := new; v_delta := new.amount;
  end if;

  if r.doc_type in ('sales_invoice','credit_note') then
    update public.sales_invoices set paid_total = paid_total + v_delta, updated_at = now() where id = r.doc_id;
  else
    update public.purchases set paid_total = paid_total + v_delta, updated_at = now() where id = r.doc_id;
  end if;
  return r;
end;
$$;

create trigger payment_allocations_apply after insert or delete on public.payment_allocations
  for each row execute function public.tg_apply_allocation();

-- -----------------------------------------------------------------------------
-- Recompute helpers (nightly integrity check / repair)
-- -----------------------------------------------------------------------------
create or replace function public.recompute_stock_levels()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.stock_levels;
  insert into public.stock_levels (variant_id, location_id, qty, last_movement_at, updated_at)
  select variant_id, location_id, sum(qty), max(occurred_at), now()
  from public.stock_movements
  group by variant_id, location_id;
end;
$$;

create or replace function public.recompute_party_balances()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.party_balances;
  insert into public.party_balances (party_type, party_id, balance, last_txn_at, updated_at)
  select party_type, party_id,
         case when party_type = 'customer' then sum(debit) - sum(credit) else sum(credit) - sum(debit) end,
         max(created_at), now()
  from public.ledger_entries
  group by party_type, party_id;
end;
$$;
