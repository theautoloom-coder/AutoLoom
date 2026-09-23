-- =============================================================================
-- 0001 FOUNDATION
-- Extensions, helper functions, settings, users/roles/permissions, devices,
-- locations, units.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- UUID v7 (time-ordered). Clients generate ids too; this is the server default.
-- -----------------------------------------------------------------------------
create or replace function public.uuid_generate_v7()
returns uuid
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  unix_ts_ms bytea;
  uuid_bytes bytea;
begin
  unix_ts_ms := substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  uuid_bytes := unix_ts_ms || gen_random_bytes(10);
  uuid_bytes := set_byte(uuid_bytes, 6, (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int);
  uuid_bytes := set_byte(uuid_bytes, 8, (b'10' || get_byte(uuid_bytes, 8)::bit(6))::bit(8)::int);
  return encode(uuid_bytes, 'hex')::uuid;
end;
$$;

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Company / app settings
-- -----------------------------------------------------------------------------
create table public.company_settings (
  id                 uuid primary key default public.uuid_generate_v7(),
  legal_name         text not null,
  trade_name         text,
  gstin              text,
  pan                text,
  state_code         text not null,               -- '09' = Uttar Pradesh
  state_name         text not null,
  address_line1      text,
  address_line2      text,
  city               text,
  pincode            text,
  phone              text,
  email              text,
  bank_name          text,
  bank_account_no    text,
  bank_ifsc          text,
  upi_id             text,
  invoice_footer     text,
  invoice_terms      text,
  fy_start_month     int not null default 4,      -- April
  round_to_rupee     boolean not null default true,
  logo_path          text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.app_settings (
  id          text primary key,                   -- setting key
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Users, roles, permissions
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text not null,
  mobile              text,
  role                text not null check (role in ('admin','owner','purchase','sales','warehouse','accounts','workshop')),
  default_location_id uuid,
  pin_hash            text,                       -- approver PIN for overrides on shared devices
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.role_permissions (
  id         uuid primary key default public.uuid_generate_v7(),
  role       text not null check (role in ('admin','owner','purchase','sales','warehouse','accounts','workshop')),
  permission text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, permission)
);

create table public.devices (
  id                    uuid primary key default public.uuid_generate_v7(),
  user_id               uuid references auth.users (id),
  name                  text not null,
  platform              text check (platform in ('android','ios','web')),
  numbering_series_code text,                     -- e.g. 'A' -> NOI/A/26-27/0001
  last_seen_at          timestamptz,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Role of the calling user (used by RLS). SECURITY DEFINER so it can read profiles.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

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
    join public.role_permissions rp on rp.role = pr.role
    where pr.id = auth.uid() and pr.is_active and rp.permission = p
  );
$$;

-- -----------------------------------------------------------------------------
-- Locations and units
-- -----------------------------------------------------------------------------
create table public.locations (
  id         uuid primary key default public.uuid_generate_v7(),
  code       text not null unique,
  name       text not null,
  type       text not null check (type in ('warehouse','shop','workshop','branch','damaged','transit')),
  address    text,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_default_location_fk
  foreign key (default_location_id) references public.locations (id);

create table public.units (
  id            uuid primary key default public.uuid_generate_v7(),
  code          text not null unique,             -- pcs, set, pair, kit, mtr, box
  name          text not null,
  allow_decimal boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id         uuid primary key default public.uuid_generate_v7(),
  user_id    uuid,
  device_id  uuid,
  at         timestamptz not null default now(),
  table_name text not null,
  row_id     uuid,
  action     text not null,                       -- insert / update / delete / cancel / override_price / ...
  old_data   jsonb,
  new_data   jsonb,
  reason     text
);
create index audit_logs_table_row_idx on public.audit_logs (table_name, row_id);
create index audit_logs_at_idx on public.audit_logs (at desc);

-- Generic audit trigger for sensitive tables
create or replace function public.tg_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row uuid;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_row := old.id;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_row := new.id;
    if v_old - 'updated_at' = v_new - 'updated_at' then
      return new;                                 -- nothing meaningful changed
    end if;
  else
    v_new := to_jsonb(new); v_row := new.id;
  end if;

  insert into public.audit_logs (user_id, device_id, table_name, row_id, action, old_data, new_data)
  values (
    auth.uid(),
    nullif(coalesce(v_new ->> 'device_id', v_old ->> 'device_id'), '')::uuid,
    tg_table_name,
    v_row,
    lower(tg_op),
    v_old,
    v_new
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger company_settings_updated_at before update on public.company_settings for each row execute function public.tg_set_updated_at();
create trigger app_settings_updated_at      before update on public.app_settings      for each row execute function public.tg_set_updated_at();
create trigger profiles_updated_at         before update on public.profiles         for each row execute function public.tg_set_updated_at();
create trigger role_permissions_updated_at before update on public.role_permissions for each row execute function public.tg_set_updated_at();
create trigger devices_updated_at          before update on public.devices          for each row execute function public.tg_set_updated_at();
create trigger locations_updated_at        before update on public.locations        for each row execute function public.tg_set_updated_at();
create trigger units_updated_at            before update on public.units            for each row execute function public.tg_set_updated_at();

create trigger profiles_audit         after insert or update or delete on public.profiles         for each row execute function public.tg_audit_row();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions for each row execute function public.tg_audit_row();
create trigger company_settings_audit after update on public.company_settings for each row execute function public.tg_audit_row();
