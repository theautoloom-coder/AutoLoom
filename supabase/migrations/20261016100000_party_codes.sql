-- =============================================================================
-- A new grahak or supplier always gets a free code (owner, 16 Oct 2026)
--
-- "User not able to make new grahak." The app numbered a new grahak from the
-- highest code starting with C — and since 7 Oct the highest such code in the
-- shop has been 'CASH', the cash grahak's (20261007100000). 'CASH' carries no
-- number, so every new grahak came out as C0001, which Modern Car already has.
-- The server refused it as a duplicate and the phone dropped it: no grahak
-- made since, and the bills went on Modern Car's khata instead.
--
-- The app now numbers from the codes that are numbers. The server makes sure
-- regardless: a grahak or supplier that arrives with no code, or with a code
-- another one already has, is given the next free number — so an older app,
-- or two phones that numbered offline at the same time, still land.
-- =============================================================================

create or replace function public.tg_party_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text := case tg_table_name when 'customers' then 'C' else 'S' end;
  taken  boolean := true;
  n      int;
begin
  if new.code is not null and btrim(new.code) <> '' then
    if tg_table_name = 'customers' then
      select exists (select 1 from public.customers where code = new.code and id <> new.id) into taken;
    else
      select exists (select 1 from public.suppliers where code = new.code and id <> new.id) into taken;
    end if;
  end if;
  if not taken then
    return new;
  end if;
  -- One numbering at a time, so two arriving together do not take one number.
  perform pg_advisory_xact_lock(hashtext('party_code:' || tg_table_name));
  if tg_table_name = 'customers' then
    select coalesce(max(substring(code from 2)::int), 0) into n from public.customers where code ~ '^C[0-9]+$';
  else
    select coalesce(max(substring(code from 2)::int), 0) into n from public.suppliers where code ~ '^S[0-9]+$';
  end if;
  new.code := prefix || lpad((n + 1)::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists customers_code on public.customers;
create trigger customers_code
  before insert on public.customers
  for each row execute function public.tg_party_code();

drop trigger if exists suppliers_code on public.suppliers;
create trigger suppliers_code
  before insert on public.suppliers
  for each row execute function public.tg_party_code();
