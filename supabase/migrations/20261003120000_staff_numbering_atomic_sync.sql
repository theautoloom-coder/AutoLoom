-- =============================================================================
-- Every staff bill after the first was thrown away — and took stock with it.
--
-- Found on the shop's phone, signed in as a counter + godown hand (not the
-- owner). The first bill of the day posted as NOI/A/26-27/0001. The second
-- one, an udhaar bill, came back as an empty draft a few seconds later.
--
-- Cause, in three parts:
--
--   1. Numbering. A document number comes from `document_sequences`: the
--      device reads next_number, uses it, writes next_number + 1. That table
--      was writable only with `admin.settings`. For anyone else the server's
--      RLS turned the counter update into an UPDATE of zero rows — not an
--      error, so nothing noticed — and the counter stayed at 1. The next
--      checkpoint put 1 back on the phone, the next bill took 0001 again, and
--      the unique index refused it. Every test so far ran as the owner, who
--      holds admin.settings, so this never once showed up.
--
--   2. The refusal was not atomic. The connector sent a transaction to the
--      server one row at a time. The bill's stock movement went first and
--      committed; the bill header went next and was refused; the rest was
--      dropped. The server now holds a sale of one piece with no bill behind
--      it — stock gone, no money, no khata entry.
--
--   3. A purchase by a godown-only hand writes the supplier's last rate to
--      `supplier_products`, which needed `party.edit` — which the godown role
--      does not have. With per-row upload that left the purchase's stock in
--      and the purchase itself out, the same shape as (2).
--
-- Fixes, in the same order:
--
--   1. Any active staff member may move a counter forward. A trigger keeps it
--      at exactly that: staff cannot change a series' prefix, year or owner,
--      and no device can ever move a counter backwards. Counters that already
--      fell behind the documents they numbered are repaired below.
--   2. `apply_crud(ops)` applies a whole device transaction in one database
--      transaction. It runs as the caller (SECURITY INVOKER), so RLS decides
--      exactly what it decided before — the only change is that a refusal now
--      refuses all of it. The app falls back to the old path if the function
--      is missing, so an APK can ship before this migration runs.
--   3. `purchase.create` may record the supplier's last rate.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Counters
-- -----------------------------------------------------------------------------
-- Safe to run twice: the production bundle promises that.
drop policy if exists document_sequences_staff_ins on public.document_sequences;
drop policy if exists document_sequences_staff_upd on public.document_sequences;

create policy document_sequences_staff_ins on public.document_sequences
  for insert to authenticated
  with check (public.is_active_staff());

create policy document_sequences_staff_upd on public.document_sequences
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create or replace function public.tg_document_sequences_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Migrations and the service role set series up however they need to.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A device opens a new financial year's series by itself on 1 April. It
    -- may not hand that series to a particular device; that is the owner's call.
    if new.owner_device_id is not null and not public.has_permission('admin.settings') then
      raise exception 'Only the owner can tie a numbering series to a device' using errcode = '42501';
    end if;
    return new;
  end if;

  if not public.has_permission('admin.settings') and
     (new.series_code, new.doc_type, new.financial_year, new.prefix, new.pad_width, new.location_id, new.owner_device_id)
       is distinct from
     (old.series_code, old.doc_type, old.financial_year, old.prefix, old.pad_width, old.location_id, old.owner_device_id) then
    raise exception 'Staff can move a counter forward, nothing else' using errcode = '42501';
  end if;

  -- Forward only, for everyone. A phone that was offline holds an older
  -- counter; when it catches up it must not drag the series back over
  -- numbers that are already printed on bills.
  new.next_number := greatest(old.next_number, new.next_number);
  return new;
end;
$$;

drop trigger if exists document_sequences_guard on public.document_sequences;
create trigger document_sequences_guard
  before insert or update on public.document_sequences
  for each row execute function public.tg_document_sequences_guard();

-- Repair counters that fell behind: next_number must be past every number
-- already issued under that prefix.
update public.document_sequences s
   set next_number = u.max_used + 1
  from (
    select s2.id, max(substr(d.doc_no, length(s2.prefix) + 1)::int) as max_used
      from public.document_sequences s2
      join (
        select doc_no from public.sales_invoices    where doc_no is not null union all
        select doc_no from public.purchases         where doc_no is not null union all
        select doc_no from public.payments          where doc_no is not null union all
        select doc_no from public.stock_adjustments where doc_no is not null union all
        select doc_no from public.stock_transfers   where doc_no is not null union all
        select doc_no from public.stock_audits      where doc_no is not null union all
        select doc_no from public.job_cards         where doc_no is not null
      ) d
        on left(d.doc_no, length(s2.prefix)) = s2.prefix
       and substr(d.doc_no, length(s2.prefix) + 1) ~ '^[0-9]{1,9}$'
     group by s2.id
  ) u
 where u.id = s.id
   and s.next_number <= u.max_used;

-- -----------------------------------------------------------------------------
-- 3. A purchase remembers the supplier's rate
-- -----------------------------------------------------------------------------
drop policy if exists supplier_products_purchase_ins on public.supplier_products;
drop policy if exists supplier_products_purchase_upd on public.supplier_products;

create policy supplier_products_purchase_ins on public.supplier_products
  for insert to authenticated
  with check (public.has_permission('purchase.create'));

create policy supplier_products_purchase_upd on public.supplier_products
  for update to authenticated
  using (public.has_permission('purchase.create'))
  with check (public.has_permission('purchase.create'));

-- -----------------------------------------------------------------------------
-- 4. Put back stock that left on a document the server refused
--
-- The half-applied uploads in (2) left movements behind whose document is
-- still a draft: stock off the shelf on the server with no bill, purchase or
-- adjustment to show for it. Each gets a reversing movement — stock_movements
-- is append-only, so the record of what happened stays and is cancelled out.
-- Idempotent: a movement that already has its reversal is skipped.
--
-- The draft itself cannot be posted again (the leftover movement holds its
-- slot in stock_movements_ref_line_uq). Discard it on the phone — "Chhod do" —
-- and make the bill again.
-- -----------------------------------------------------------------------------
insert into public.stock_movements
  (variant_id, location_id, qty, movement_type, ref_type, ref_id, ref_line_id, unit_cost, occurred_at, reversal_of_id, note)
select m.variant_id, m.location_id, -m.qty, 'cancel_reversal', m.ref_type, m.ref_id, m.ref_line_id, m.unit_cost, now(), m.id,
       'Server ne entry nahi li thi — stock wapas'
  from public.stock_movements m
 where m.movement_type <> 'cancel_reversal'
   and (
        (m.ref_type = 'sales_invoice'    and exists (select 1 from public.sales_invoices    d where d.id = m.ref_id and d.status = 'draft'))
     or (m.ref_type = 'purchase'         and exists (select 1 from public.purchases         d where d.id = m.ref_id and d.status = 'draft'))
     or (m.ref_type = 'stock_adjustment' and exists (select 1 from public.stock_adjustments d where d.id = m.ref_id and d.status = 'draft'))
   )
   and not exists (select 1 from public.stock_movements r where r.reversal_of_id = m.id);

-- -----------------------------------------------------------------------------
-- 2. One device transaction, one database transaction
--
-- ops: [{ "op": "PUT" | "PATCH" | "DELETE", "table": "...", "id": "...", "data": {...} }]
--
-- PUT    a local INSERT. Inserted if the id is new. If the id already exists
--        this is a retry of an upload whose answer was lost: append-only rows
--        are left as they are, anything else gets the same values again.
-- PATCH  a local UPDATE of the given columns.
-- DELETE a local DELETE.
--
-- Returns the PATCHes that matched no row — usually RLS saying no to a column
-- the server maintains itself (avg_cost on a staff purchase is set by the
-- stock_movements trigger anyway). The app logs them; they are not errors,
-- because PostgREST never treated them as errors either.
-- -----------------------------------------------------------------------------
create or replace function public.apply_crud(ops jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  op       jsonb;
  t        text;
  tq       text;
  rel      regclass;
  data     jsonb;
  unknown  text;
  collist  text;
  setlist  text;
  present  boolean;
  n        int;
  ignored  jsonb := '[]'::jsonb;
begin
  if not public.is_active_staff() then
    raise exception 'Not an active staff member' using errcode = '42501';
  end if;
  if jsonb_typeof(ops) <> 'array' then
    raise exception 'ops must be an array' using errcode = '22023';
  end if;

  for op in select value from jsonb_array_elements(ops) loop
    t := op->>'table';
    rel := to_regclass(format('public.%I', t));
    if rel is null then
      raise exception 'Unknown table %', t using errcode = '42P01';
    end if;
    tq := format('public.%I', t);
    data := coalesce(op->'data', '{}'::jsonb) || jsonb_build_object('id', op->>'id');

    -- PostgREST refused a column it did not know; so does this. Dropping it
    -- quietly would be the silent loss this whole migration is about.
    select k into unknown
      from jsonb_object_keys(data) k
     where not exists (
       select 1 from pg_attribute a
        where a.attrelid = rel and a.attname = k and a.attnum > 0 and not a.attisdropped)
     limit 1;
    if unknown is not null then
      raise exception 'Column %.% does not exist', t, unknown using errcode = '42703';
    end if;

    select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
           string_agg(format('%1$I = r.%1$I', a.attname), ', ' order by a.attnum)
             filter (where a.attname <> 'id')
      into collist, setlist
      from pg_attribute a
     where a.attrelid = rel and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = '' and data ? a.attname;

    case op->>'op'
      when 'PUT' then
        execute format('select exists (select 1 from %s x where x.id = (jsonb_populate_record(null::%s, $1)).id)', tq, tq)
          into present using data;
        if not present then
          execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1)', tq, collist, collist, tq)
            using data;
        elsif t not in ('stock_movements', 'ledger_entries', 'audit_logs') and setlist is not null then
          execute format('update %s x set %s from jsonb_populate_record(null::%s, $1) r where x.id = r.id', tq, setlist, tq)
            using data;
        end if;

      when 'PATCH' then
        if setlist is not null then
          execute format('update %s x set %s from jsonb_populate_record(null::%s, $1) r where x.id = r.id', tq, setlist, tq)
            using data;
          get diagnostics n = row_count;
          if n = 0 then
            ignored := ignored || jsonb_build_object('table', t, 'id', op->>'id');
          end if;
        end if;

      when 'DELETE' then
        execute format('delete from %s x where x.id = (jsonb_populate_record(null::%s, $1)).id', tq, tq)
          using data;

      else
        raise exception 'Unknown op %', op->>'op' using errcode = '22023';
    end case;
  end loop;

  return ignored;
end;
$$;

revoke all on function public.apply_crud(jsonb) from public, anon;
grant execute on function public.apply_crud(jsonb) to authenticated;

notify pgrst, 'reload schema';
