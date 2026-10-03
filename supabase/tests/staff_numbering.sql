-- Staff bills get their own numbers, and a refused upload leaves nothing behind.
--
--   docker exec -i supabase_db_Autogrid psql -U postgres -d postgres < supabase/tests/staff_numbering.sql
--
-- Runs as the Counter Sales user — not the owner, which is the whole point:
-- every earlier test ran as the owner and the counter bug never showed. Wrapped
-- in a transaction that is rolled back, so it leaves the local data as it was.

\set QUIET on
\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;

do $$
declare
  sales   uuid := 'd281e2a1-09c3-40da-990b-e12c14cf84de';  -- Counter Sales
  seq     uuid;
  before  int;
  after   int;
  variant uuid;
  loc     uuid;
  mv      uuid := gen_random_uuid();
  adj     uuid := gen_random_uuid();
  led     uuid := gen_random_uuid();
  cust    uuid;
  res     jsonb;
  pass    int := 0;
  fail    int := 0;
begin
  select id, next_number into seq, before from public.document_sequences
   where doc_type = 'sales_invoice' order by financial_year desc limit 1;
  select id into variant from public.product_variants limit 1;
  select id into loc from public.locations where type = 'shop' limit 1;
  select id into cust from public.customers limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', sales, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. The counter moves for a salesman.
  update public.document_sequences set next_number = before + 1 where id = seq;
  select next_number into after from public.document_sequences where id = seq;
  if after = before + 1 then
    raise notice 'PASS  staff can move the counter forward'; pass := pass + 1;
  else
    raise notice 'FAIL  counter stayed at % (expected %)', after, before + 1; fail := fail + 1;
  end if;

  -- 2. ...and never backwards, even when a stale phone asks it to.
  update public.document_sequences set next_number = 1 where id = seq;
  select next_number into after from public.document_sequences where id = seq;
  if after = before + 1 then
    raise notice 'PASS  a stale phone cannot drag the counter back'; pass := pass + 1;
  else
    raise notice 'FAIL  counter went back to %', after; fail := fail + 1;
  end if;

  -- 3. Staff move the number; they do not rename the series.
  begin
    update public.document_sequences set prefix = 'HACK/' where id = seq;
    raise notice 'FAIL  staff changed the prefix'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  staff cannot change the prefix'; pass := pass + 1;
  end;

  -- 4. A refused write takes the whole transaction with it. The movement goes
  --    first and is perfectly valid; the damage write-off after it is not
  --    allowed for a salesman. Before apply_crud the movement stayed.
  begin
    perform public.apply_crud(jsonb_build_array(
      jsonb_build_object('op', 'PUT', 'table', 'stock_movements', 'id', mv, 'data', jsonb_build_object(
        'variant_id', variant, 'location_id', loc, 'qty', -1, 'movement_type', 'sale', 'unit_cost', 10, 'occurred_at', now())),
      jsonb_build_object('op', 'PUT', 'table', 'stock_adjustments', 'id', adj, 'data', jsonb_build_object(
        'location_id', loc, 'reason', 'damage', 'status', 'draft', 'doc_date', current_date))
    ));
    raise notice 'FAIL  a salesman wrote a damage write-off'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  the refused write raised 42501'; pass := pass + 1;
  end;
  if exists (select 1 from public.stock_movements where id = mv) then
    raise notice 'FAIL  the stock movement survived its refused transaction'; fail := fail + 1;
  else
    raise notice 'PASS  nothing from the refused transaction remains'; pass := pass + 1;
  end if;

  -- 5. A retried upload is harmless, including for append-only rows.
  res := public.apply_crud(jsonb_build_array(
    jsonb_build_object('op', 'PUT', 'table', 'ledger_entries', 'id', led, 'data', jsonb_build_object(
      'party_type', 'customer', 'party_id', cust, 'entry_date', current_date, 'doc_type', 'opening',
      'doc_no', 'TEST', 'debit', 5, 'credit', 0, 'narration', 'apply_crud test'))));
  begin
    res := public.apply_crud(jsonb_build_array(
      jsonb_build_object('op', 'PUT', 'table', 'ledger_entries', 'id', led, 'data', jsonb_build_object(
        'party_type', 'customer', 'party_id', cust, 'entry_date', current_date, 'doc_type', 'opening',
        'doc_no', 'TEST', 'debit', 5, 'credit', 0, 'narration', 'apply_crud test'))));
    if (select count(*) from public.ledger_entries where id = led) = 1 then
      raise notice 'PASS  a retried append-only row is accepted once'; pass := pass + 1;
    else
      raise notice 'FAIL  retry duplicated the khata entry'; fail := fail + 1;
    end if;
  exception when others then
    raise notice 'FAIL  retry of an append-only row raised: %', sqlerrm; fail := fail + 1;
  end;

  -- 6. A column the server maintains itself: refused quietly, reported back.
  res := public.apply_crud(jsonb_build_array(
    jsonb_build_object('op', 'PATCH', 'table', 'product_variants', 'id', variant, 'data', jsonb_build_object('avg_cost', 1))));
  if jsonb_array_length(res) = 1 and res->0->>'table' = 'product_variants' then
    raise notice 'PASS  an update RLS skipped is reported, not fatal'; pass := pass + 1;
  else
    raise notice 'FAIL  expected one ignored update, got %', res; fail := fail + 1;
  end if;

  -- 7. Schema drift is loud.
  begin
    perform public.apply_crud(jsonb_build_array(
      jsonb_build_object('op', 'PATCH', 'table', 'customers', 'id', cust, 'data', jsonb_build_object('no_such_column', 1))));
    raise notice 'FAIL  an unknown column was dropped silently'; fail := fail + 1;
  exception when undefined_column then
    raise notice 'PASS  an unknown column raises 42703'; pass := pass + 1;
  end;

  raise notice '% passed, % failed', pass, fail;
  if fail > 0 then
    raise exception 'staff_numbering: % failed', fail;
  end if;
end;
$$;

rollback;
