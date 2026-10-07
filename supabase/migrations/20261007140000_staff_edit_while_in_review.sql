-- =============================================================================
-- Staff see and fix what they sent while it is in review (owner, 7 Oct 2026)
--
-- "Staff ne jo bhi cheez add ki hai ya queue mein gayi hai wo dikh sake, aur
-- jab tak review mein hai staff edit/update bhi kar sake."
--
-- Two things wait for an owner: a staff stock entry (a submitted purchase
-- draft) and a new-item request (change_requests). While either is waiting,
-- the person who sent it may change it. The rules, enforced here so an old
-- app build or a crafted upload cannot get round them:
--
--   · a staff member touches only their own entry — never another's;
--   · only while it is still a draft — once approved (posted) or refused
--     (cancelled) it is the owner's;
--   · a staff member cannot refuse or approve; the existing approver trigger
--     already stops a staff post;
--   · a change made after sending is stamped revised_at, so the owner can see
--     the entry moved after it reached the queue.
--
-- An owner refusing an entry now marks it cancelled with a reason instead of
-- deleting it, so the staff member sees why.
-- =============================================================================

alter table public.purchases add column if not exists revised_at timestamptz;
alter table public.change_requests add column if not exists revised_at timestamptz;

-- -----------------------------------------------------------------------------
-- Purchases: a staff member's reach is their own draft.
-- -----------------------------------------------------------------------------
create or replace function public.tg_purchase_staff_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_permission('purchase.approve') then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if old.created_by is distinct from auth.uid() and old.submitted_by is distinct from auth.uid() then
    raise exception 'Ye entry kisi aur ki hai — use owner hi badal sakta hai.' using errcode = '42501';
  end if;
  if old.status <> 'draft' then
    raise exception 'Ye entry ab review mein nahi hai — owner hi badal sakta hai.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    raise exception 'Entry ko approve ya mana sirf owner karta hai.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists purchases_staff_scope on public.purchases;
create trigger purchases_staff_scope before update or delete on public.purchases
  for each row execute function public.tg_purchase_staff_scope();

-- Lines follow their entry.
create or replace function public.tg_purchase_lines_staff_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if auth.uid() is null or public.has_permission('purchase.approve') then
    return coalesce(new, old);
  end if;
  select status, created_by, submitted_by into p
    from public.purchases where id = coalesce(new.purchase_id, old.purchase_id);
  if not found then
    -- The entry itself is being deleted (a cascade) — its own trigger decided.
    return coalesce(new, old);
  end if;
  if p.status <> 'draft'
     or (p.created_by is distinct from auth.uid() and p.submitted_by is distinct from auth.uid()) then
    raise exception 'Is entry ka maal sirf owner badal sakta hai.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists purchase_lines_staff_scope on public.purchase_lines;
create trigger purchase_lines_staff_scope before insert or update or delete on public.purchase_lines
  for each row execute function public.tg_purchase_lines_staff_scope();

-- -----------------------------------------------------------------------------
-- New-item requests: an edit while pending counts as a new revision.
-- Same function as 20260922100000 with that one branch added.
-- -----------------------------------------------------------------------------
create or replace function public.tg_change_request_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_reviewer boolean := public.has_permission('catalog.edit');
  is_owner    boolean := old.submitted_by = auth.uid();
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then

      -- Approve / reject: reviewers only.
      if new.status in ('approved', 'rejected') then
        if not is_reviewer then
          raise exception 'Sirf admin request approve ya reject kar sakta hai'
            using errcode = '42501';
        end if;
        if old.status <> 'pending' then
          raise exception 'Ye request pehle hi % ho chuki hai', old.status
            using errcode = '23514';
        end if;
        if new.status = 'rejected'
           and coalesce(btrim(new.review_note), '') = '' then
          raise exception 'Reject karne ke liye wajah likhna zaroori hai'
            using errcode = '23514';
        end if;
        new.reviewed_by := auth.uid();
        new.reviewed_at := now();

      -- Resubmit after a rejection: the submitter only, and it counts up.
      elsif new.status = 'pending' then
        if not is_owner then
          raise exception 'Sirf jisne bheji thi wahi dobara bhej sakta hai'
            using errcode = '42501';
        end if;
        if old.status <> 'rejected' then
          raise exception 'Sirf rejected request dobara bheji ja sakti hai'
            using errcode = '23514';
        end if;
        new.revision := old.revision + 1;
        new.submitted_at := now();
        new.reviewed_by := null;
        new.reviewed_at := null;
        new.review_note := null;

      -- Withdraw: the submitter, while nobody has acted on it.
      elsif new.status = 'cancelled' then
        if not is_owner then
          raise exception 'Sirf jisne bheji thi wahi wapas le sakta hai'
            using errcode = '42501';
        end if;
        if old.status <> 'pending' then
          raise exception 'Sirf pending request wapas li ja sakti hai'
            using errcode = '23514';
        end if;
      end if;

    -- Changed while still waiting: by the submitter, it is a new revision the
    -- reviewer should know about. Nobody else may rewrite what was asked.
    elsif old.status = 'pending' and new.payload is distinct from old.payload then
      if not is_owner and not is_reviewer then
        raise exception 'Sirf jisne bheji thi wahi badal sakta hai'
          using errcode = '42501';
      end if;
      if is_owner then
        new.revision := old.revision + 1;
        new.revised_at := now();
      end if;
    end if;

    -- Whoever submitted it keeps ownership of it for good.
    new.submitted_by := old.submitted_by;
  end if;

  return new;
end;
$$;
