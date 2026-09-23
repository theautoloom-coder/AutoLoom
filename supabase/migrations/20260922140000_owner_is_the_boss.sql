-- =============================================================================
-- 0014 THE OWNER IS THE BOSS
--
-- The seed gave `admin` two permissions that `owner` did not have —
-- `admin.users` and `admin.settings` — and nothing the other way round. So
-- `owner` was strictly *less* privileged than `admin`, which is backwards for
-- this business: AutoLoom is one shop and the owner is the person who hires the
-- staff and sets the shop's own details.
--
-- The practical effect was that the owner signed in, saw no way to add a
-- salesman, and had to be told to go and do it in the Supabase dashboard. The
-- `create-staff` Edge Function already accepts `owner` — it was only the
-- permission, and the UI gate that reads it, that disagreed.
--
-- The split still exists and still means something: every other role is
-- unchanged, and a shop that later wants a manager who runs the counter but
-- cannot create logins simply does not give them `admin.users`.
-- =============================================================================

insert into public.role_permissions (role, permission)
values
  ('owner', 'admin.users'),
  ('owner', 'admin.settings')
on conflict do nothing;
