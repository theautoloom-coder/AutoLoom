-- =============================================================================
-- 0021 MAAL AAYA — the bill photo, and why receiving has to be a purchase
--
-- There were two ways to put stock in: a purchase bill, and a "found"
-- adjustment. They looked interchangeable and were not.
--
-- `tg_update_avg_cost` only fires for movement_type = 'purchase'. So stock
-- received through the adjustment path arrived with no effect on cost at all.
-- A brand new item took its stock and kept avg_cost 0, and every sale of it
-- then reported the entire selling price as profit. The books looked healthy
-- precisely because the cost was missing.
--
-- So receiving is a purchase now, which means a supplier, which the receiving
-- screen lets you create by typing a name. "Found stock" has not gone away —
-- it belongs to Stock Check, where counting something you did not know you had
-- is the whole point.
--
-- The photo of the supplier's bill hangs off the purchase. One path, not a
-- gallery: this is the paper that came with the maal, not a media library.
-- =============================================================================

alter table public.purchases
  add column if not exists bill_photo_path text;

comment on column public.purchases.bill_photo_path is
  'Storage path in the item-photos bucket for the supplier bill that came with this maal.';
