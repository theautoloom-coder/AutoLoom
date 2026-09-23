-- =============================================================================
-- 0009 TABLE PRIVILEGES
-- Row level security decides WHICH rows a role may touch; these grants give
-- the roles the base privilege to touch tables at all. Without them PostgREST
-- answers 42501 "permission denied for table".
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- The anon role only ever reaches the sign-in endpoint; no table access.
revoke all on all tables in schema public from anon;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
