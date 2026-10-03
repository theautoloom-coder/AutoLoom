-- =============================================================================
-- Let the people whose job is counting stock actually count it.
--
-- `stock.count` was granted to the godown and workshop roles — "maal leta hai,
-- transfer karta hai, ginti karta hai" is the godown role's own description —
-- and then checked by nothing. Ginti Karo asked for `stock.adjust`, which only
-- owner and admin hold, so a godown hand opened the screen the role was built
-- for and was told "Iski permission nahi hai".
--
-- The app side is a one-line fix. This is the half that matters: the server
-- policies also demanded `stock.adjust` on every adjustment, so opening the
-- screen alone would have produced counts that saved on the phone and were then
-- rejected by RLS and discarded by the sync — silently, after the screen had
-- said they were done. That is the worst failure this app has, and it has
-- already happened once with dates.
--
-- So a count holder may write an adjustment whose reason is 'audit' — the
-- correction a count produces — and nothing else. Writing off damaged maal
-- stays with `stock.adjust`: a count records what is on the shelf, a write-off
-- decides what the shop has lost, and the second is a call for the owner.
-- =============================================================================

create or replace function public.can_write_adjustment(p_reason text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select has_permission('stock.adjust')
      or (p_reason = 'audit' and has_permission('stock.count'));
$$;

drop policy if exists stock_adjustments_ins on public.stock_adjustments;
drop policy if exists stock_adjustments_upd on public.stock_adjustments;
drop policy if exists stock_adjustments_del on public.stock_adjustments;

create policy stock_adjustments_ins on public.stock_adjustments
  for insert with check (public.can_write_adjustment(reason));
create policy stock_adjustments_upd on public.stock_adjustments
  for update using (public.can_write_adjustment(reason))
  with check (public.can_write_adjustment(reason));
create policy stock_adjustments_del on public.stock_adjustments
  for delete using (public.can_write_adjustment(reason));

-- Lines carry no reason of their own; they inherit the document's.
drop policy if exists stock_adjustment_lines_ins on public.stock_adjustment_lines;
drop policy if exists stock_adjustment_lines_upd on public.stock_adjustment_lines;
drop policy if exists stock_adjustment_lines_del on public.stock_adjustment_lines;

create policy stock_adjustment_lines_ins on public.stock_adjustment_lines
  for insert with check (exists (
    select 1 from public.stock_adjustments a
     where a.id = adjustment_id and public.can_write_adjustment(a.reason)));
create policy stock_adjustment_lines_upd on public.stock_adjustment_lines
  for update using (exists (
    select 1 from public.stock_adjustments a
     where a.id = adjustment_id and public.can_write_adjustment(a.reason)));
create policy stock_adjustment_lines_del on public.stock_adjustment_lines
  for delete using (exists (
    select 1 from public.stock_adjustments a
     where a.id = adjustment_id and public.can_write_adjustment(a.reason)));
