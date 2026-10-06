-- =============================================================================
-- AutoLoom works as a wholesaler (owner, 6 Oct 2026)
--
-- "Ye supplier se maal lata hai aur aage bechta hai — workshop, counter sab
-- hatao." One godown, three kinds of people: the partners (owner), an admin,
-- and the staff who count stock in and bill it out.
--
--   · roles: owner / admin / staff. Everyone on an old role (Counter, Godown,
--     Kharid, Hisaab, Workshop) becomes staff, so nobody loses the app.
--   · purchase.approve: stock a staff member writes in waits for an owner
--     or admin to check it and put a rate on it.
--   · partner.capital: what each partner put in or took out.
--   · one godown: the shop counter and the workshop stop being places; any
--     stock still sitting there moves into the godown. The damaged corner
--     stays as "Kharab maal" — broken maal waits there for the supplier.
--   · Cash grahak: the one customer who never has udhaar.
--
-- Nothing is deleted. The old roles' rows stay as history; permissions are
-- simply read from the three live roles only, here and in the app.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Roles
-- -----------------------------------------------------------------------------
-- The old names stay legal so an older app build that still sends one does
-- not fail a constraint; nothing hands them out any more.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','owner','staff','purchase','sales','warehouse','accounts','workshop'));
alter table public.role_permissions drop constraint if exists role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check
  check (role in ('admin','owner','staff','purchase','sales','warehouse','accounts','workshop'));

-- What a staff member does: write stock in (it waits for approval), count it,
-- put broken maal aside, bill it out, take a return, take money, write down a
-- small expense, and open a party on the spot. No rates, no reports.
insert into public.role_permissions (role, permission)
select 'staff', p from unnest(array[
  'catalog.view', 'purchase.create', 'sale.create', 'sale.return', 'payment.receive',
  'expense.record', 'stock.count', 'stock.damage', 'party.edit'
]) as p
on conflict (role, permission) do nothing;

insert into public.role_permissions (role, permission)
select r, p from unnest(array['owner','admin']) as r
cross join unnest(array['purchase.approve','partner.capital']) as p
on conflict (role, permission) do nothing;

-- Everyone who is not an owner or admin is staff now.
update public.profiles set role = 'staff' where role not in ('owner','admin','staff');
insert into public.profile_roles (profile_id, role)
select id, 'staff' from public.profiles where role = 'staff'
on conflict do nothing;

-- Only the three live roles grant anything. A leftover 'purchase' row in
-- profile_roles must not keep handing out supplier payments.
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
      and ur.role in ('owner','admin','staff')
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. One godown
-- -----------------------------------------------------------------------------
-- Stock left at the counter, the workshop or anywhere else that is not the
-- godown or the kharab corner walks over to the godown, as a pair of transfer
-- movements so the item's history says where it came from.
do $$
declare
  godown uuid;
begin
  select id into godown from public.locations
   where type = 'warehouse' and is_active order by sort_order, code limit 1;
  if godown is null then
    return;
  end if;

  insert into public.stock_movements (variant_id, location_id, qty, movement_type, ref_type, unit_cost, note)
  select s.variant_id, x.location_id, x.qty, x.movement_type, 'wholesale_move', coalesce(v.avg_cost, 0),
         'Ek godown — counter/workshop ka maal godown mein'
    from (
      select m.variant_id, m.location_id, sum(m.qty) as qty
        from public.stock_movements m
        join public.locations l on l.id = m.location_id
       where l.type <> 'damaged' and l.id <> godown
       group by m.variant_id, m.location_id
      having sum(m.qty) <> 0
    ) s
    join public.product_variants v on v.id = s.variant_id
    cross join lateral (values
      (s.location_id, -s.qty, 'transfer_out'),
      (godown,         s.qty, 'transfer_in')
    ) as x(location_id, qty, movement_type);

  update public.locations set is_active = false where type <> 'damaged' and id <> godown;
  update public.profiles set default_location_id = godown;
end;
$$;

update public.locations set name = 'Kharab maal'
 where type = 'damaged' and name in ('Damaged / Returns', 'Damaged');

-- -----------------------------------------------------------------------------
-- 3. Cash grahak
-- -----------------------------------------------------------------------------
alter table public.customers add column if not exists is_cash boolean not null default false;

-- A walk-in customer that already exists becomes the cash one; otherwise one
-- is made. Exactly one, so a bill can default to it.
update public.customers set is_cash = true
 where id = (select id from public.customers
              where lower(name) in ('walk-in customer', 'walk in customer', 'cash', 'cash grahak')
              order by created_at limit 1)
   and not exists (select 1 from public.customers where is_cash);

insert into public.customers (code, name, customer_type, credit_limit, credit_days, is_cash)
select 'CASH', 'Cash Grahak', 'retail', 0, 0, true
 where not exists (select 1 from public.customers where is_cash);

create unique index if not exists customers_one_cash_uq on public.customers (is_cash) where is_cash;
