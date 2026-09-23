-- =============================================================================
-- 0019 profile_roles NEEDS AN id COLUMN
--
-- 0018 gave the table a composite primary key `(profile_id, role)` and no `id`.
-- That is correct relational design and wrong for this stack: **every table
-- PowerSync syncs must have an `id` column**, because the client schema is
-- built around one and every CRUD entry it uploads is keyed by it. Without it
-- the local insert succeeded, the upload had nowhere to land, and assigning a
-- second role silently did nothing — the row was written on the device and
-- never reached the server.
--
-- `id` becomes the primary key and the pair keeps its uniqueness as a
-- constraint, so a person still cannot hold the same role twice.
-- =============================================================================

alter table public.profile_roles drop constraint profile_roles_pkey;

alter table public.profile_roles
  add column id uuid not null default public.uuid_generate_v7();

alter table public.profile_roles add primary key (id);

alter table public.profile_roles
  add constraint profile_roles_unique unique (profile_id, role);
