-- =============================================================================
-- The average cost read the stock cache, and the cache was wrong.
--
-- Found on production on 3 Oct 2026, buying 2 more of the test mat at ₹1,900
-- onto 4 already on the shelf at ₹1,800. The average should have become
-- ₹1,833.33; the server set ₹1,900 — as if the shelf had been empty.
--
-- `tg_update_avg_cost` took "how many did we already have" from
-- `stock_levels`, a cache kept up by another trigger. On production that cache
-- said 1 where the movement log said 6: the item's opening stock (22 Sep) had
-- never reached it. With the cache short, the old stock looked like nothing and
-- the new price became the whole average. Every sale after a purchase like that
-- is costed too high, and Hisab's munafa comes out too low.
--
-- Phones never read `stock_levels` — they add up `stock_movements` themselves —
-- so this cache mattered in exactly one place, and that place was money.
--
-- Two fixes:
--   1. The average reads the movement log, the same thing the phone reads, so
--      the server and the phone can no longer disagree about what was on hand.
--   2. The cache is rebuilt from the log, so anything else that looks at it is
--      right again.
-- =============================================================================

create or replace function public.tg_update_avg_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_qty  numeric(12,3);
  v_old_avg  numeric(14,4);
  v_new_avg  numeric(14,4);
begin
  if new.movement_type <> 'purchase' or new.qty <= 0 or new.unit_cost <= 0 then
    return new;
  end if;

  -- Everything on hand before this receipt, across every location — the same
  -- sum the phone takes from stock_on_hand before it posts the purchase.
  select coalesce(sum(qty), 0) into v_old_qty
    from public.stock_movements
   where variant_id = new.variant_id and id <> new.id;

  select avg_cost into v_old_avg from public.product_variants where id = new.variant_id;

  if v_old_qty <= 0 then
    v_new_avg := new.unit_cost;
  else
    v_new_avg := ((v_old_qty * coalesce(v_old_avg, 0)) + (new.qty * new.unit_cost)) / (v_old_qty + new.qty);
  end if;

  update public.product_variants
     set avg_cost           = v_new_avg,
         last_purchase_cost = new.unit_cost,
         updated_at         = now()
   where id = new.variant_id;

  return new;
end;
$$;

-- The cache, rebuilt from the log. Idempotent.
select public.recompute_stock_levels();
