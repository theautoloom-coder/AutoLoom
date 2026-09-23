-- =============================================================================
-- 0013 CHANGE REQUESTS — staff propose, admin approves
--
-- Staff cannot write the catalogue: products, variants and fitments are all
-- gated by the `catalog.edit` permission, so a salesman who finds a new item on
-- the shelf has had nowhere to put it. This is that place.
--
-- The staff member submits a proposal. It sits as `pending` until someone with
-- `catalog.edit` approves or rejects it. A rejection carries a reason, and the
-- submitter can correct the proposal and send it back — the row is reused and
-- `revision` counts up, so the whole back-and-forth stays on one record instead
-- of littering the list with near-duplicates.
--
-- Nothing is written to the catalogue by this table. On approval the APPROVER'S
-- device performs the ordinary product insert, under the approver's own
-- credentials, so the existing `catalog.edit` policies are what actually admit
-- the write. That keeps one gate rather than two, and means a bug here can
-- never become a way around RLS.
-- =============================================================================

create table public.change_requests (
  id            uuid primary key default public.uuid_generate_v7(),

  -- Only new items today. The column exists so price changes and stock
  -- corrections can join the same queue without another table.
  kind          text not null default 'new_item' check (kind in ('new_item')),
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'cancelled')),

  -- The proposal, in the same shape the simple item form collects. Kept as
  -- jsonb rather than columns because it is a draft of a future row, not a row:
  -- it may be incomplete, and it must survive the catalogue's columns changing.
  payload       jsonb not null,

  note          text,            -- submitter to reviewer
  review_note   text,            -- reviewer to submitter; required to reject
  revision      int  not null default 1,

  submitted_by  uuid not null references public.profiles(id),
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,

  -- What the approval produced, so the request links to the real item.
  applied_product_id uuid,
  location_id   uuid references public.locations(id),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index change_requests_status_idx on public.change_requests (status, submitted_at desc);
create index change_requests_submitter_idx on public.change_requests (submitted_by, submitted_at desc);

create trigger change_requests_updated_at before update on public.change_requests
  for each row execute function public.tg_set_updated_at();
create trigger change_requests_audit after insert or update or delete on public.change_requests
  for each row execute function public.tg_audit_row();

-- -----------------------------------------------------------------------------
-- The state machine, enforced on the server.
--
-- The app only offers legal moves, but the app is a client and this table is
-- the one place an approval can be forged. A staff member must not be able to
-- approve their own request by writing `status` directly, which a plain RLS
-- policy cannot prevent — RLS decides whether a row may be written, not which
-- column changed. Hence a trigger.
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
        -- A rejection without a reason is what makes staff resubmit the same
        -- thing twice, so the reason is required rather than encouraged.
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
    end if;

    -- Whoever submitted it keeps ownership of it for good.
    new.submitted_by := old.submitted_by;
  end if;

  return new;
end;
$$;

create trigger change_requests_guard before update on public.change_requests
  for each row execute function public.tg_change_request_guard();

-- -----------------------------------------------------------------------------
-- RLS. Reads follow the rest of the app — any active staff member sees the
-- queue, which in a shop this size is the point: everyone can see what is
-- waiting on the admin.
-- -----------------------------------------------------------------------------
alter table public.change_requests enable row level security;

create policy change_requests_read on public.change_requests
  for select to authenticated
  using (public.is_active_staff());

-- Anyone on the staff may propose, but only as themselves.
create policy change_requests_ins on public.change_requests
  for insert to authenticated
  with check (public.is_active_staff() and submitted_by = auth.uid());

-- Submitters may edit their own while it is theirs to edit; reviewers may act
-- on anything. Which fields may change is the trigger's job, not this policy's.
create policy change_requests_upd on public.change_requests
  for update to authenticated
  using (
    public.has_permission('catalog.edit')
    or (public.is_active_staff() and submitted_by = auth.uid()
        and status in ('pending', 'rejected'))
  )
  with check (public.is_active_staff());

-- No deletes: a withdrawn request is cancelled, not erased. The history of who
-- asked for what is the reason this table exists.

grant select, insert, update on public.change_requests to authenticated;
grant select on public.change_requests to powersync_role;

-- -----------------------------------------------------------------------------
-- PowerSync replication.
--
-- The `powersync` publication is an explicit table list, not FOR ALL TABLES, so
-- a new table is invisible to sync until it is named here — and because
-- scripts/gen-schema.py reads the publication to build the client schema, a
-- table left out of it silently never reaches the device at all. Any future
-- table that the app has to read offline needs this line too.
-- -----------------------------------------------------------------------------
alter publication powersync add table public.change_requests;
