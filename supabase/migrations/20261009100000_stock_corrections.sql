-- =============================================================================
-- Stock corrections go through the owner (owner, 8 Oct 2026)
--
-- "User ne stock chadhaya, maine approve kar diya, usme kuch galat chadh
-- gaya — ya current stock mein kuch upar niche karna hai — to user stock edit
-- karke request bhej sake, main approve kar saku."
--
-- Two ways stock is put right, both waiting for an owner or admin when a
-- staff member asks:
--
--   · Galat entry sudhaaro — an approved stock entry was wrong (qty, kism, a
--     line too many or missing). The fix is written as a new entry that
--     corrects the old one (purchases.corrects_purchase_id). Approving it
--     cancels the old entry and posts the new one in one go, so the stock
--     AND the supplier's khata both end up right, and payments already
--     matched to the old entry move to the new one.
--
--   · Stock theek karo — the shelf does not match the app (a count, a piece
--     that broke or went missing). A stock_adjustments document, as before,
--     but a staff member's now waits as a submitted draft until approved.
--     Until today a staff ginti changed the stock on the spot.
--
-- The server holds the same lines the app does: only stock.adjust may post an
-- adjustment, and staff may change or withdraw only their own, only while it
-- waits.
-- =============================================================================

alter table public.purchases
  add column if not exists corrects_purchase_id uuid references public.purchases(id);

alter table public.stock_adjustments
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references public.profiles(id),
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id);

-- What the app said and what was counted, so the approver sees the count and
-- not only the difference.
alter table public.stock_adjustment_lines
  add column if not exists system_qty numeric(14,3),
  add column if not exists counted_qty numeric(14,3);

-- Posting an adjustment moves stock: owner or admin only.
create or replace function public.tg_adjustment_needs_approver()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'posted'
     and (tg_op = 'INSERT' or old.status is distinct from 'posted')
     and auth.uid() is not null
     and not public.has_permission('stock.adjust') then
    raise exception 'Stock owner ya admin ke approve karne par hi badalta hai.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists stock_adjustments_need_approver on public.stock_adjustments;
create trigger stock_adjustments_need_approver
  before insert or update on public.stock_adjustments
  for each row execute function public.tg_adjustment_needs_approver();

-- Staff: their own request, only while it waits, never its decision.
create or replace function public.tg_adjustment_staff_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_permission('stock.adjust') then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if old.created_by is distinct from auth.uid() and old.submitted_by is distinct from auth.uid() then
    raise exception 'Ye request kisi aur ki hai — use owner hi badal sakta hai.' using errcode = '42501';
  end if;
  if old.status <> 'draft' then
    raise exception 'Is request ka faisla ho chuka hai — owner hi badal sakta hai.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    raise exception 'Request ko approve ya mana sirf owner karta hai.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists stock_adjustments_staff_scope on public.stock_adjustments;
create trigger stock_adjustments_staff_scope
  before update or delete on public.stock_adjustments
  for each row execute function public.tg_adjustment_staff_scope();

create or replace function public.tg_adjustment_line_staff_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.stock_adjustments;
begin
  if auth.uid() is null or public.has_permission('stock.adjust') then
    return coalesce(new, old);
  end if;
  select * into a from public.stock_adjustments where id = coalesce(new.adjustment_id, old.adjustment_id);
  if a.id is null then
    return coalesce(new, old);
  end if;
  if a.created_by is distinct from auth.uid() and a.submitted_by is distinct from auth.uid() then
    raise exception 'Ye request kisi aur ki hai.' using errcode = '42501';
  end if;
  if a.status <> 'draft' then
    raise exception 'Is request ka faisla ho chuka hai.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists stock_adjustment_lines_staff_scope on public.stock_adjustment_lines;
create trigger stock_adjustment_lines_staff_scope
  before insert or update or delete on public.stock_adjustment_lines
  for each row execute function public.tg_adjustment_line_staff_scope();
