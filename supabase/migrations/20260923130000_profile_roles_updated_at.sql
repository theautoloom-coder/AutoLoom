-- =============================================================================
-- 0020 profile_roles NEEDS updated_at TOO
--
-- `insertRow` stamps `created_at` and `updated_at` on every row it writes,
-- because every other table here has both. profile_roles had only created_at,
-- so the LOCAL insert threw "table profile_roles has no column named
-- updated_at" and assigning a second role did nothing at all — no pending
-- change, no rejected upload, nothing on screen. The write never got as far as
-- the sync queue, which is why the sync screen had nothing to report.
--
-- Giving it the column is better than special-casing the table on the client:
-- a new table should look like the others, or the next person writing to it
-- hits the same wall.
-- =============================================================================

alter table public.profile_roles
  add column updated_at timestamptz not null default now();

create trigger profile_roles_updated_at before update on public.profile_roles
  for each row execute function public.tg_set_updated_at();
