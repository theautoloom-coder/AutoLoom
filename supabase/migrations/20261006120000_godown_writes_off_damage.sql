-- =============================================================================
-- The godown may write off kharab maal.
--
-- The owner's call (6 Oct 2026): the person who finds a broken or missing
-- piece on the shelf is the godown hand, and should be able to record it
-- with Kharab Likho instead of telling someone who can.
--
-- `stock.adjust` would have done it, but it opens every kind of stock
-- correction — opening stock, "zyada mila", free issue. So this is its own
-- permission, `stock.damage`, and it opens exactly the reasons Kharab Likho
-- writes: damage, missing, counting_error, other. Owner and admin already hold
-- `stock.adjust`; they get `stock.damage` too so the role matrix reads true.
-- =============================================================================

insert into public.role_permissions (role, permission)
values ('admin', 'stock.damage'), ('owner', 'stock.damage'), ('warehouse', 'stock.damage')
on conflict (role, permission) do nothing;

create or replace function public.can_write_adjustment(p_reason text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select has_permission('stock.adjust')
      or (p_reason = 'audit' and has_permission('stock.count'))
      or (p_reason in ('damage', 'missing', 'counting_error', 'other') and has_permission('stock.damage'));
$$;
