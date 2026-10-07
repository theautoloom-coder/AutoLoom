-- AutoLoom as a wholesaler (owner, 6 Oct 2026): the server, not just the app,
-- keeps staff stock waiting for approval, partner money to the partners, and
-- a staff member's moves to "into the kharab corner" only.
--
--   docker exec -i supabase_db_Autogrid psql -U postgres -d postgres < supabase/tests/wholesale.sql
--
-- Runs as a staff member and then as the owner. Wrapped in a transaction that
-- is rolled back, so it leaves the local data as it was.

\set QUIET on
\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;

do $$
declare
  staff   uuid := 'd281e2a1-09c3-40da-990b-e12c14cf84de';  -- Counter Sales, now staff
  owner   uuid;
  sup     uuid;
  godown  uuid;
  kharab  uuid;
  variant uuid;
  pid     uuid := gen_random_uuid();
  tid     uuid := gen_random_uuid();
  rid     uuid := gen_random_uuid();
  other   uuid;
  pass    int := 0;
  fail    int := 0;
  ok      boolean;
begin
  select id into owner from public.profiles where role = 'owner' limit 1;
  select id into other from public.profiles where role = 'staff' and id <> staff limit 1;
  select id into sup from public.suppliers limit 1;
  select id into godown from public.locations where type = 'warehouse' and is_active limit 1;
  select id into kharab from public.locations where type = 'damaged' limit 1;
  select id into variant from public.product_variants limit 1;
  -- An old role left behind must grant nothing.
  insert into public.profile_roles (profile_id, role) values (staff, 'purchase') on conflict do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. Staff write the stock in, as a submitted draft.
  insert into public.purchases (id, doc_type, supplier_id, location_id, status, submitted_at, submitted_by)
  values (pid, 'purchase', sup, godown, 'draft', now(), staff);
  insert into public.purchase_lines (purchase_id, line_no, variant_id, description, qty, rate)
  values (pid, 1, variant, 'test', 3, 0);
  raise notice 'PASS  staff can write stock in for approval'; pass := pass + 1;

  -- 2. ...but cannot post it themselves.
  begin
    update public.purchases set status = 'posted', doc_no = 'TEST/1' where id = pid;
    raise notice 'FAIL  staff posted their own stock entry'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  staff cannot approve their own stock'; pass := pass + 1;
  end;

  -- 3. Partner money is the partners'.
  begin
    insert into public.payments (direction, party_type, party_id, amount, mode, status)
    values ('in', 'partner', staff, 1000, 'cash', 'posted');
    raise notice 'FAIL  staff wrote a partner entry'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  staff cannot write partner money'; pass := pass + 1;
  end;

  -- 4. The leftover 'purchase' role does not hand out supplier payments.
  if not public.has_permission('payment.pay_supplier') then
    raise notice 'PASS  a retired role grants nothing'; pass := pass + 1;
  else
    raise notice 'FAIL  retired role still pays suppliers'; fail := fail + 1;
  end if;

  -- 5. Staff may put maal into the kharab corner...
  insert into public.stock_transfers (id, from_location_id, to_location_id, status) values (tid, godown, kharab, 'draft');
  insert into public.stock_transfer_lines (transfer_id, variant_id, qty) values (tid, variant, 1);
  raise notice 'PASS  staff can move maal into kharab'; pass := pass + 1;

  -- 6. ...and nowhere else.
  begin
    insert into public.stock_transfers (from_location_id, to_location_id, status) values (kharab, godown, 'draft');
    raise notice 'FAIL  staff moved maal out of kharab'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  staff cannot move maal anywhere else'; pass := pass + 1;
  end;

  -- 5b. While it waits, its writer may still change it.
  update public.purchase_lines set qty = 4 where purchase_id = pid;
  update public.purchases set revised_at = now(), notes = 'ek aur mila' where id = pid;
  if (select qty from public.purchase_lines where purchase_id = pid) = 4 then
    raise notice 'PASS  staff can fix their own entry while in review'; pass := pass + 1;
  else
    raise notice 'FAIL  staff edit in review did not land'; fail := fail + 1;
  end if;

  -- 5c. ...but cannot refuse it or approve it.
  begin
    update public.purchases set status = 'cancelled', cancel_reason = 'x' where id = pid;
    raise notice 'FAIL  staff refused their own entry'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  staff cannot refuse an entry'; pass := pass + 1;
  end;

  -- 5d. A second staff member cannot touch it.
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  begin
    update public.purchase_lines set qty = 99 where purchase_id = pid;
    raise notice 'FAIL  another staff member changed the entry'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  another staff member cannot change it'; pass := pass + 1;
  end;
  begin
    delete from public.purchases where id = pid;
    raise notice 'FAIL  another staff member deleted the entry'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  another staff member cannot delete it'; pass := pass + 1;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);

  -- 5e. A new-item request changed while pending is a new revision.
  insert into public.change_requests (id, kind, status, payload, submitted_by, submitted_at, revision)
  values (rid, 'new_item', 'pending', '{"name":"Test bulb","price":100}', staff, now(), 1);
  update public.change_requests set payload = '{"name":"Test bulb H4","price":120}' where id = rid;
  if (select revision = 2 and revised_at is not null from public.change_requests where id = rid) then
    raise notice 'PASS  editing a pending request counts as a revision'; pass := pass + 1;
  else
    raise notice 'FAIL  pending request edit not marked'; fail := fail + 1;
  end if;

  -- 7. The owner approves it.
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  update public.purchases set status = 'posted', doc_no = 'TEST/1', approved_by = owner where id = pid;
  select status = 'posted' into ok from public.purchases where id = pid;
  if ok then
    raise notice 'PASS  the owner approves it'; pass := pass + 1;
  else
    raise notice 'FAIL  owner approval did not post'; fail := fail + 1;
  end if;

  -- 7b. Once approved, its writer can no longer change it.
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  begin
    update public.purchase_lines set qty = 1 where purchase_id = pid;
    raise notice 'FAIL  staff changed an approved entry'; fail := fail + 1;
  exception when others then
    -- Either guard may answer first: the posted-lines one or the staff one.
    raise notice 'PASS  an approved entry is locked for staff'; pass := pass + 1;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);

  -- 8. ...and writes partner money.
  insert into public.payments (direction, party_type, party_id, amount, mode, status)
  values ('in', 'partner', owner, 50000, 'bank', 'posted');
  raise notice 'PASS  the owner writes partner money'; pass := pass + 1;

  raise notice '% passed, % failed', pass, fail;
  if fail > 0 then
    raise exception 'wholesale checks failed';
  end if;
end;
$$;

rollback;
