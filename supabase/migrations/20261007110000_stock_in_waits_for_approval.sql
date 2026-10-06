-- =============================================================================
-- Stock a staff member writes in waits for the owner (owner, 6 Oct 2026)
--
-- "Ladke stock ayega count karenge, simple maal enter karenge, owner ya admin
-- review and approve." A staff member's Stock Chadhao stays a draft marked
-- submitted. An owner or admin opens it, checks the count, puts the buy rate
-- on each line and approves — only then is it posted: stock goes up and the
-- supplier's khata gets the real amount, not ₹0.
--
-- The app enforces this on screen; the trigger below is what makes it true.
-- A staff phone that posts a purchase anyway (an old build, a crafted upload)
-- is refused, and the refusal reaches the phone as a rejected upload.
-- =============================================================================

alter table public.purchases add column if not exists submitted_at timestamptz;
alter table public.purchases add column if not exists submitted_by uuid;
alter table public.purchases add column if not exists approved_by uuid;

create index if not exists purchases_waiting_idx on public.purchases (submitted_at)
  where status = 'draft' and submitted_at is not null;

-- Posting a purchase or a supplier return is the approver's job. auth.uid()
-- is null for migrations, seeds and the service role, which are trusted.
create or replace function public.tg_purchase_needs_approver()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'posted'
     and (tg_op = 'INSERT' or old.status is distinct from 'posted')
     and auth.uid() is not null
     and not public.has_permission('purchase.approve') then
    raise exception 'Maal ka hisaab owner ya admin approve karta hai.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_need_approver on public.purchases;
create trigger purchases_need_approver before insert or update on public.purchases
  for each row execute function public.tg_purchase_needs_approver();
