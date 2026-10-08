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
  item    uuid;
  kid     uuid := gen_random_uuid();
  aid     uuid := gen_random_uuid();
  cid     uuid := gen_random_uuid();
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

  -- 5f. Owner, 8 Oct 2026: staff add a kism to an item while stocking in —
  -- the variant, its own detail and its cars...
  select product_id into item from public.product_variants where id = variant;
  insert into public.product_variants (id, product_id, variant_name, sku, retail_price, is_active)
  values (kid, item, 'Test kism', 'TEST-KISM-' || left(kid::text, 8), 100, true);
  insert into public.spec_values (product_id, variant_id, spec_definition_id, display_value)
  values (item, kid, (select id from public.spec_definitions limit 1), 'X');
  insert into public.product_fitments (product_id, variant_id, model_id)
  values (item, kid, (select id from public.vehicle_models limit 1));
  raise notice 'PASS  staff can add a kism with its detail and cars'; pass := pass + 1;

  -- 5g. ...but neither make nor change the item itself.
  begin
    insert into public.products (family_id, name) values ((select family_id from public.products where id = item), 'Staff item');
    raise notice 'FAIL  staff made an item directly'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  staff cannot make an item directly'; pass := pass + 1;
  end;
  update public.products set name = 'badla hua' where id = item;
  if (select name <> 'badla hua' from public.products where id = item) then
    raise notice 'PASS  staff cannot change an item'; pass := pass + 1;
  else
    raise notice 'FAIL  staff renamed an item'; fail := fail + 1;
  end if;
  begin
    insert into public.spec_values (product_id, variant_id, spec_definition_id, display_value)
    values (item, null, (select id from public.spec_definitions limit 1), 'Y');
    raise notice 'FAIL  staff changed the item''s shared detail'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  staff cannot add to the item''s shared detail'; pass := pass + 1;
  end;
  update public.product_variants set retail_price = 1 where id = variant;
  if (select retail_price <> 1 from public.product_variants where id = variant) then
    raise notice 'PASS  staff cannot change a kism''s rate'; pass := pass + 1;
  else
    raise notice 'FAIL  staff changed a kism rate'; fail := fail + 1;
  end if;

  -- 6b. Owner, 8 Oct 2026: staff ask to put the stock right; only the owner
  -- makes it so.
  insert into public.stock_adjustments (id, doc_date, location_id, reason, status, submitted_at, submitted_by, created_by)
  values (aid, current_date, godown, 'audit', 'draft', now(), staff, staff);
  insert into public.stock_adjustment_lines (adjustment_id, variant_id, qty_delta, system_qty, counted_qty, reason_code)
  values (aid, variant, 2, 5, 7, 'found');
  raise notice 'PASS  staff can ask for a stock correction'; pass := pass + 1;
  begin
    update public.stock_adjustments set status = 'posted', doc_no = 'TEST/ADJ' where id = aid;
    raise notice 'FAIL  staff posted their own stock correction'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  staff cannot approve a stock correction'; pass := pass + 1;
  end;
  begin
    insert into public.stock_adjustments (doc_date, location_id, reason, status, created_by)
    values (current_date, godown, 'audit', 'posted', staff);
    raise notice 'FAIL  staff wrote a stock correction straight in'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  staff cannot write a correction straight in'; pass := pass + 1;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  begin
    update public.stock_adjustment_lines set qty_delta = 50 where adjustment_id = aid;
    raise notice 'FAIL  another staff member changed the correction'; fail := fail + 1;
  exception when insufficient_privilege then
    raise notice 'PASS  another staff member cannot change the correction'; pass := pass + 1;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);

  -- 6c. A correction of an approved entry is an ordinary entry for staff.
  insert into public.purchases (id, doc_type, supplier_id, location_id, status, submitted_at, submitted_by, corrects_purchase_id)
  values (cid, 'purchase', sup, godown, 'draft', now(), staff, pid);
  raise notice 'PASS  staff can send a correction of an entry'; pass := pass + 1;

  -- 6d. Staff ask for a change to a kism; it waits for the owner.
  insert into public.change_requests (kind, status, payload, submitted_by, submitted_at, revision)
  values ('edit_kism', 'pending', '{"name":"x","edit_variant_id":"y","price":1}', staff, now(), 1);
  raise notice 'PASS  staff can ask to change a kism'; pass := pass + 1;

  -- 6e. An app too old to write correctly does not write (8 Oct 2026).
  perform set_config('role', 'postgres', true);
  update public.app_settings set value = '2026100901'::jsonb where id = 'min_app_build';
  perform set_config('role', 'authenticated', true);
  begin
    perform public.apply_crud('[]'::jsonb);
    raise notice 'FAIL  an old app could still upload'; fail := fail + 1;
  exception when raise_exception then
    raise notice 'PASS  an app without its build cannot upload'; pass := pass + 1;
  end;
  begin
    perform public.apply_crud_v2('[]'::jsonb, 2026100800);
    raise notice 'FAIL  an older build could still upload'; fail := fail + 1;
  exception when raise_exception then
    raise notice 'PASS  an older build cannot upload'; pass := pass + 1;
  end;
  if public.apply_crud_v2('[]'::jsonb, 2026100901) = '[]'::jsonb then
    raise notice 'PASS  the current build uploads'; pass := pass + 1;
  else
    raise notice 'FAIL  the current build was refused'; fail := fail + 1;
  end if;

  -- 7. The owner approves it.
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  update public.stock_adjustments set status = 'posted', doc_no = 'TEST/ADJ', approved_by = owner where id = aid;
  if (select status = 'posted' from public.stock_adjustments where id = aid) then
    raise notice 'PASS  the owner approves a stock correction'; pass := pass + 1;
  else
    raise notice 'FAIL  owner approval of a correction did not post'; fail := fail + 1;
  end if;
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
