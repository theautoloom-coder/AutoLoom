-- =============================================================================
-- 0018 A PERSON CAN HOLD MORE THAN ONE ROLE
--
-- A shop this size does not have one person per job. The counter hand also
-- receives stock; the owner's brother does the billing and the khata. With one
-- role per profile the only way to cover that was to give somebody a role that
-- was too big — which is how an app ends up with everyone marked "admin" and
-- the permission system meaning nothing.
--
-- `profile_roles` is now the source of truth for what a person may do.
-- `profiles.role` stays, as the PRIMARY role: it is what the staff list shows,
-- what the role description is drawn from, and what every existing query,
-- seed and the create-staff function already write. A trigger guarantees the
-- primary is always present in the set, so permissions can never silently
-- vanish because one of the two was written and the other was not.
-- =============================================================================

create table public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create index profile_roles_role_idx on public.profile_roles (role);

-- Everyone keeps exactly what they have today.
insert into public.profile_roles (profile_id, role)
select id, role from public.profiles
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- The primary role is always part of the set.
--
-- The Edge Function, the seeds and every older code path set `profiles.role`
-- alone. Without this they would create a profile that holds no roles at all
-- and can do nothing — a staff member who signs in successfully and then finds
-- every screen empty, which is the worst way for this to fail.
-- -----------------------------------------------------------------------------
create or replace function public.tg_profile_primary_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile_roles (profile_id, role)
  values (new.id, new.role)
  on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_primary_role
  after insert or update of role on public.profiles
  for each row execute function public.tg_profile_primary_role();

-- -----------------------------------------------------------------------------
-- Permission checks now read the whole set.
-- -----------------------------------------------------------------------------
create or replace function public.has_permission(p text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    join public.profile_roles ur on ur.profile_id = pr.id
    join public.role_permissions rp on rp.role = ur.role
    where pr.id = auth.uid() and pr.is_active and rp.permission = p
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS. Everyone may read who holds what — the staff list already shows it —
-- but only `admin.users` may change it, exactly like the profiles table.
-- -----------------------------------------------------------------------------
alter table public.profile_roles enable row level security;

create policy profile_roles_read on public.profile_roles
  for select to authenticated
  using (public.is_active_staff());

create policy profile_roles_ins on public.profile_roles
  for insert to authenticated
  with check (public.has_permission('admin.users'));

create policy profile_roles_del on public.profile_roles
  for delete to authenticated
  using (public.has_permission('admin.users'));

grant select, insert, delete on public.profile_roles to authenticated;
grant select on public.profile_roles to powersync_role;

alter publication powersync add table public.profile_roles;
