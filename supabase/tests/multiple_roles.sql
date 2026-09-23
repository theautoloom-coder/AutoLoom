-- Multiple roles per person: does the permission check really union them?
--
--   docker exec -i supabase_db_Autogrid psql -U postgres -d postgres < supabase/tests/multiple_roles.sql
--
-- Runs as a real authenticated user through has_permission(), the same function
-- every RLS policy calls, and cleans up the extra role it grants.

\set QUIET on
\set ON_ERROR_STOP on
set client_min_messages = notice;

do $$
declare
  sales uuid := 'd281e2a1-09c3-40da-990b-e12c14cf84de';  -- Counter Sales
  pass int := 0;
  fail int := 0;

  procedure_note text;
begin
  perform set_config('request.jwt.claims',
          json_build_object('sub', sales, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- Baseline: a salesman bills, and does not buy.
  if public.has_permission('sale.create') then
    raise notice 'PASS  sales can bill'; pass := pass + 1;
  else
    raise notice 'FAIL  sales cannot bill'; fail := fail + 1;
  end if;

  if public.has_permission('purchase.create') then
    raise notice 'FAIL  sales could already purchase'; fail := fail + 1;
  else
    raise notice 'PASS  sales cannot purchase'; pass := pass + 1;
  end if;

  -- Give the same person the purchase role as well.
  perform set_config('role', 'postgres', true);
  insert into public.profile_roles (profile_id, role) values (sales, 'purchase')
    on conflict do nothing;
  perform set_config('role', 'authenticated', true);

  if public.has_permission('purchase.create') then
    raise notice 'PASS  second role grants purchase'; pass := pass + 1;
  else
    raise notice 'FAIL  second role granted nothing'; fail := fail + 1;
  end if;

  if public.has_permission('sale.create') then
    raise notice 'PASS  first role still works'; pass := pass + 1;
  else
    raise notice 'FAIL  adding a role removed the old one'; fail := fail + 1;
  end if;

  -- Neither role includes this one, so the union must not invent it.
  if public.has_permission('admin.users') then
    raise notice 'FAIL  union granted admin.users out of nowhere'; fail := fail + 1;
  else
    raise notice 'PASS  union grants nothing extra'; pass := pass + 1;
  end if;

  -- Take it away again.
  perform set_config('role', 'postgres', true);
  delete from public.profile_roles where profile_id = sales and role = 'purchase';
  perform set_config('role', 'authenticated', true);

  if public.has_permission('purchase.create') then
    raise notice 'FAIL  removing the role left the permission behind'; fail := fail + 1;
  else
    raise notice 'PASS  removing the role removes the permission'; pass := pass + 1;
  end if;

  -- The primary role must survive on its own: an older code path that writes
  -- only profiles.role still has to produce a usable staff member.
  perform set_config('role', 'postgres', true);
  delete from public.profile_roles where profile_id = sales;
  update public.profiles set role = role where id = sales;   -- fires the trigger
  perform set_config('role', 'authenticated', true);

  if public.has_permission('sale.create') then
    raise notice 'PASS  primary role is restored by the trigger'; pass := pass + 1;
  else
    raise notice 'FAIL  a profile with only profiles.role can do nothing'; fail := fail + 1;
  end if;

  perform set_config('role', 'postgres', true);
  raise notice '----------------------------------------';
  raise notice '  % passed, % failed', pass, fail;
  if fail > 0 then raise exception 'multiple-roles tests FAILED'; end if;
end;
$$;
