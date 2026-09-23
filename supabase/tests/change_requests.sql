-- State-machine + RLS tests for change_requests.
--
-- Run against the local stack:
--   docker exec -i supabase_db_Autogrid psql -U postgres -d postgres < supabase/tests/change_requests.sql
--
-- It exits non-zero if any assertion fails, and cleans up the row it made.
-- Every scenario runs as a real authenticated user, through RLS, exactly as a
-- device would. Expected failures are caught and asserted on, so a rule that
-- silently stops being enforced fails the test instead of passing quietly.

\set QUIET on
\set ON_ERROR_STOP on
set client_min_messages = notice;

do $$
declare
  sales uuid := 'd281e2a1-09c3-40da-990b-e12c14cf84de';  -- no catalog.edit
  admin uuid := '4e25e4cd-22e8-47b4-a79a-2ad785ee7d77';  -- has catalog.edit
  req   uuid;
  pass  int := 0;
  fail  int := 0;

  procedure_note text;

  -- Become a signed-in device for that user.
  function_noop boolean;
begin
  -- helper inline: set the auth context
  perform set_config('request.jwt.claims',
          json_build_object('sub', sales, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  ---------------------------------------------------------------- 1. submit
  begin
    insert into change_requests (payload, submitted_by, note)
    values ('{"name":"Floor mat 7D","category":"Mats","price":2400,"qty":10}'::jsonb,
            sales, 'Naya maal aaya hai')
    returning id into req;
    raise notice 'PASS  staff can submit a proposal';
    pass := pass + 1;
  exception when others then
    raise notice 'FAIL  staff could not submit: %', sqlerrm; fail := fail + 1;
  end;

  ------------------------------------------- 2. staff cannot approve its own
  begin
    update change_requests set status = 'approved' where id = req;
    raise notice 'FAIL  staff APPROVED THEIR OWN REQUEST — security hole';
    fail := fail + 1;
  exception when others then
    raise notice 'PASS  staff blocked from approving own request (%)', sqlerrm;
    pass := pass + 1;
  end;

  ------------------------------------------ 3. staff cannot submit as someone else
  begin
    insert into change_requests (payload, submitted_by)
    values ('{"name":"forged"}'::jsonb, admin);
    raise notice 'FAIL  staff submitted a request in another user''s name';
    fail := fail + 1;
  exception when others then
    raise notice 'PASS  cannot submit on behalf of another user';
    pass := pass + 1;
  end;

  ------------------------------------------------- become the admin reviewer
  perform set_config('request.jwt.claims',
          json_build_object('sub', admin, 'role', 'authenticated')::text, true);

  ------------------------------------------------ 4. reject needs a reason
  begin
    update change_requests set status = 'rejected', review_note = '   ' where id = req;
    raise notice 'FAIL  rejected with no reason';
    fail := fail + 1;
  exception when others then
    raise notice 'PASS  rejection without a reason refused';
    pass := pass + 1;
  end;

  ------------------------------------------------ 5. reject with a reason
  begin
    update change_requests
       set status = 'rejected', review_note = 'Rate zyada hai, kharid rate likho'
     where id = req;
    perform 1 from change_requests
      where id = req and status = 'rejected' and reviewed_by = admin and reviewed_at is not null;
    if found then
      raise notice 'PASS  admin rejected, reviewer stamped automatically';
      pass := pass + 1;
    else
      raise notice 'FAIL  rejection did not stamp reviewer'; fail := fail + 1;
    end if;
  exception when others then
    raise notice 'FAIL  admin could not reject: %', sqlerrm; fail := fail + 1;
  end;

  ------------------------------------------ 6. admin cannot resubmit for staff
  begin
    update change_requests set status = 'pending' where id = req;
    raise notice 'FAIL  admin resubmitted on the staff member''s behalf';
    fail := fail + 1;
  exception when others then
    raise notice 'PASS  only the submitter may resubmit';
    pass := pass + 1;
  end;

  -------------------------------------------------- back to the staff member
  perform set_config('request.jwt.claims',
          json_build_object('sub', sales, 'role', 'authenticated')::text, true);

  --------------------------------------- 7. correct and resubmit after reject
  begin
    update change_requests
       set status = 'pending',
           payload = payload || '{"cost":1800}'::jsonb
     where id = req;
    perform 1 from change_requests
      where id = req and status = 'pending' and revision = 2
        and review_note is null and reviewed_by is null;
    if found then
      raise notice 'PASS  resubmit bumped revision to 2 and cleared the review';
      pass := pass + 1;
    else
      raise notice 'FAIL  resubmit did not reset the request properly'; fail := fail + 1;
    end if;
  exception when others then
    raise notice 'FAIL  staff could not resubmit: %', sqlerrm; fail := fail + 1;
  end;

  -------------------------------------------------------- 8. admin approves
  perform set_config('request.jwt.claims',
          json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  begin
    update change_requests
       set status = 'approved', applied_product_id = gen_random_uuid()
     where id = req;
    raise notice 'PASS  admin approved';
    pass := pass + 1;
  exception when others then
    raise notice 'FAIL  admin could not approve: %', sqlerrm; fail := fail + 1;
  end;

  ----------------------------------------- 9. cannot act on it a second time
  begin
    update change_requests set status = 'rejected', review_note = 'oops' where id = req;
    raise notice 'FAIL  an already-approved request was rejected afterwards';
    fail := fail + 1;
  exception when others then
    raise notice 'PASS  a decided request cannot be decided again';
    pass := pass + 1;
  end;

  --------------------------------------------- 10. ownership cannot be stolen
  begin
    update change_requests set submitted_by = admin where id = req;
    perform 1 from change_requests where id = req and submitted_by = sales;
    if found then
      raise notice 'PASS  submitted_by is immutable';
      pass := pass + 1;
    else
      raise notice 'FAIL  submitter was overwritten'; fail := fail + 1;
    end if;
  exception when others then
    raise notice 'PASS  submitted_by is immutable (refused)';
    pass := pass + 1;
  end;

  perform set_config('role', 'postgres', true);
  delete from change_requests where id = req;

  raise notice '----------------------------------------';
  raise notice '  % passed, % failed', pass, fail;
  if fail > 0 then
    raise exception 'change_requests guard tests FAILED';
  end if;
end;
$$;
