-- =============================================================================
-- 0017 EXPENSES, AND LETTING THE OWNER SEE THE ACTIVITY LOG
--
-- Two gaps from the second audit, both of which a shop hits daily.
--
-- EXPENSES. There was nowhere to record money going out that is not a supplier
-- payment: transport, packing, chai, an advance to a boy, the electricity bill.
-- Without it the day's cash can never be tallied, and "profit" is only gross
-- margin — the owner's actual question, *is mahine kitna bacha*, could not be
-- answered by this app at all.
--
-- ACTIVITY. `audit_logs` has been written faithfully since day one and then
-- deliberately withheld from the device, so no screen could ever show who
-- cancelled a bill or overrode a price. Staff logins were built so the owner
-- could delegate; this is the half that tells them what was done with that
-- delegation. It stays strictly read-only on the device — the connector already
-- refuses to upload it, and the append-only triggers refuse edits anyway.
-- =============================================================================

create table public.expenses (
  id            uuid primary key default public.uuid_generate_v7(),
  expense_date  date not null default current_date,

  -- Free text with a suggested list in the app rather than a locked enum: every
  -- shop's categories are its own, and a category nobody can add is a category
  -- everybody files under "other".
  category      text not null,
  amount        numeric(14,2) not null check (amount > 0),
  mode          text not null default 'cash'
                  check (mode in ('cash', 'upi', 'card', 'cheque', 'bank')),
  paid_to       text,
  note          text,
  location_id   uuid references public.locations(id),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index expenses_date_idx on public.expenses (expense_date desc);
create index expenses_category_idx on public.expenses (category, expense_date desc);

create trigger expenses_updated_at before update on public.expenses
  for each row execute function public.tg_set_updated_at();
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function public.tg_audit_row();

-- -----------------------------------------------------------------------------
-- Permission. Recording an expense is not the same as paying a supplier: the
-- counter hand who buys packing tape should be able to write it down without
-- also being able to settle a supplier's account.
-- -----------------------------------------------------------------------------
insert into public.role_permissions (role, permission)
values ('owner', 'expense.record'),
       ('admin', 'expense.record'),
       ('accounts', 'expense.record')
on conflict do nothing;

alter table public.expenses enable row level security;

create policy expenses_read on public.expenses
  for select to authenticated
  using (public.is_active_staff());

create policy expenses_ins on public.expenses
  for insert to authenticated
  with check (public.has_permission('expense.record'));

create policy expenses_upd on public.expenses
  for update to authenticated
  using (public.has_permission('expense.record'))
  with check (public.has_permission('expense.record'));

create policy expenses_del on public.expenses
  for delete to authenticated
  using (public.has_permission('expense.record'));

grant select, insert, update, delete on public.expenses to authenticated;
grant select on public.expenses to powersync_role;

-- The publication is an explicit list, not FOR ALL TABLES, so a new table is
-- invisible to sync — and to scripts/gen-schema.py, which reads it — until it
-- is named here.
alter publication powersync add table public.expenses;

-- -----------------------------------------------------------------------------
-- Activity log on the device.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'powersync' and tablename = 'audit_logs'
  ) then
    alter publication powersync add table public.audit_logs;
  end if;
end;
$$;
