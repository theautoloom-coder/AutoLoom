-- =============================================================================
-- A bill can be changed after it is made (owner, 15 Oct 2026)
--
-- "Bill banane ke baad user ko usme edit ka option nahi mil raha — sab options
-- edit hone chahiye. Approval ke baad bhi edit ka option ho, re-approval ke
-- process se jaaye."
--
-- A posted bill is never edited in place: its maal has left the shelf, the
-- grahak's khata was charged, a cash receipt may have been written against
-- it. A change is a new bill that corrects the old one
-- (sales_invoices.corrects_invoice_id) — the way a stock entry is put right
-- (20261009100000). Posting it cancels the old bill and posts the new one in
-- one go, and the money already taken against the old bill moves to the new.
--
-- A staff member's change waits for the owner (submitted_at, submitted_by).
-- Only someone who may cancel a bill can post a change to one — here on the
-- server as well as in the app, so a staff phone cannot post its own change.
-- =============================================================================

alter table public.sales_invoices
  add column if not exists corrects_invoice_id uuid references public.sales_invoices(id),
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references public.profiles(id);

create index if not exists sales_invoices_corrects_idx
  on public.sales_invoices (corrects_invoice_id) where corrects_invoice_id is not null;

create or replace function public.tg_invoice_correction_needs_approver()
returns trigger
language plpgsql
as $$
begin
  if new.corrects_invoice_id is not null
     and new.status = 'posted'
     and (tg_op = 'INSERT' or old.status is distinct from 'posted')
     and auth.uid() is not null
     and not public.has_permission('sale.cancel') then
    raise exception 'Bill ka badlav owner ya admin ke approve karne par hi lagta hai.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_invoices_correction_needs_approver on public.sales_invoices;
create trigger sales_invoices_correction_needs_approver
  before insert or update on public.sales_invoices
  for each row execute function public.tg_invoice_correction_needs_approver();
