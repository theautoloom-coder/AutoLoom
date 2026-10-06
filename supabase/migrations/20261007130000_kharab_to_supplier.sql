-- =============================================================================
-- Kharab maal goes back to the supplier (owner, 6 Oct 2026)
--
-- "Jo maal damaged ya return aya hai and return jayega supplier ko usko
-- dalenge, uske badle replacement ayega to usko settle karenge — replacement
-- ya paisa adjustment dusre saman mai, dono."
--
--   1. Kharab Likho no longer writes maal off on the spot. It moves it from
--      the godown to the "Kharab maal" corner (a transfer), where it waits.
--      A staff member holds stock.damage, not stock.transfer, so they get to
--      write exactly that one kind of transfer and no other.
--   2. From the corner it goes back to the supplier as a supplier return
--      (debit note), which already takes the amount off the supplier's khata.
--   3. The supplier settles it: replacement maal (a purchase against the
--      return) and/or leaving the amount off their khata, which adjusts it
--      against other maal. settled_at marks the return as done; these three
--      columns are the only ones a posted return may still change.
-- =============================================================================

-- 1. Staff may move maal into the kharab corner, and nowhere else.
create or replace function public.is_damaged_location(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.locations where id = loc and type = 'damaged');
$$;

drop policy if exists stock_transfers_kharab_ins on public.stock_transfers;
create policy stock_transfers_kharab_ins on public.stock_transfers for insert to authenticated
  with check (public.has_permission('stock.damage') and public.is_damaged_location(to_location_id));
drop policy if exists stock_transfers_kharab_upd on public.stock_transfers;
create policy stock_transfers_kharab_upd on public.stock_transfers for update to authenticated
  using (public.has_permission('stock.damage') and public.is_damaged_location(to_location_id))
  with check (public.has_permission('stock.damage') and public.is_damaged_location(to_location_id));
drop policy if exists stock_transfers_kharab_del on public.stock_transfers;
create policy stock_transfers_kharab_del on public.stock_transfers for delete to authenticated
  using (public.has_permission('stock.damage') and public.is_damaged_location(to_location_id) and status = 'draft');

create or replace function public.is_kharab_transfer(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stock_transfers st
     where st.id = t and public.is_damaged_location(st.to_location_id));
$$;

drop policy if exists stock_transfer_lines_kharab_ins on public.stock_transfer_lines;
create policy stock_transfer_lines_kharab_ins on public.stock_transfer_lines for insert to authenticated
  with check (public.has_permission('stock.damage') and public.is_kharab_transfer(transfer_id));
drop policy if exists stock_transfer_lines_kharab_upd on public.stock_transfer_lines;
create policy stock_transfer_lines_kharab_upd on public.stock_transfer_lines for update to authenticated
  using (public.has_permission('stock.damage') and public.is_kharab_transfer(transfer_id))
  with check (public.has_permission('stock.damage') and public.is_kharab_transfer(transfer_id));
drop policy if exists stock_transfer_lines_kharab_del on public.stock_transfer_lines;
create policy stock_transfer_lines_kharab_del on public.stock_transfer_lines for delete to authenticated
  using (public.has_permission('stock.damage') and public.is_kharab_transfer(transfer_id));

-- 3. Settling a supplier return.
alter table public.purchases add column if not exists settled_at timestamptz;
alter table public.purchases add column if not exists settled_by uuid;
alter table public.purchases add column if not exists settle_note text;

create or replace function public.tg_guard_posted_document()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'posted' and new.status = 'posted' then
    -- only these may change after posting
    if (to_jsonb(new) - 'paid_total' - 'updated_at' - 'notes' - 'credit_flag' - 'credit_override_by' - 'invoice_id'
                      - 'settled_at' - 'settled_by' - 'settle_note')
       is distinct from
       (to_jsonb(old) - 'paid_total' - 'updated_at' - 'notes' - 'credit_flag' - 'credit_override_by' - 'invoice_id'
                      - 'settled_at' - 'settled_by' - 'settle_note') then
      raise exception 'Posted % % cannot be edited. Cancel it or issue a credit/debit note.', tg_table_name, old.doc_no;
    end if;
  end if;
  if old.status = 'cancelled' then
    raise exception 'Cancelled % % cannot be changed.', tg_table_name, old.doc_no;
  end if;
  return new;
end;
$$;
