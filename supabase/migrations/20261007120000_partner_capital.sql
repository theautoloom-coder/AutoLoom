-- =============================================================================
-- Partner ka paisa (owner, 6 Oct 2026)
--
-- "Kisne kis date mai kitna invest kia wo sab daal sakte hai proper hisab
-- kitab ke liye." Each partner's money in and out of the business is a
-- payment row with party_type 'partner' and party_id = the partner's profile:
--   direction 'in'  — the partner put money into the business
--   direction 'out' — the partner took money out of it
-- Payments already sync to every phone, so this needs no new table and no
-- change to the sync rules. Only owners and admins may write these rows.
-- =============================================================================

alter table public.payments drop constraint if exists payments_party_type_check;
alter table public.payments add constraint payments_party_type_check
  check (party_type in ('customer', 'supplier', 'partner'));

drop policy if exists payments_ins on public.payments;
create policy payments_ins on public.payments for insert to authenticated
  with check (
    case when party_type = 'partner'
      then public.has_permission('partner.capital')
      else (direction = 'in'  and public.has_permission('payment.receive'))
        or (direction = 'out' and public.has_permission('payment.pay_supplier'))
    end
  );

drop policy if exists payments_upd on public.payments;
create policy payments_upd on public.payments for update to authenticated
  using (
    case when party_type = 'partner'
      then public.has_permission('partner.capital')
      else public.has_permission('payment.receive') or public.has_permission('payment.pay_supplier')
    end
  )
  with check (
    case when party_type = 'partner'
      then public.has_permission('partner.capital')
      else public.has_permission('payment.receive') or public.has_permission('payment.pay_supplier')
    end
  );
