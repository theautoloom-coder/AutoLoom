-- =============================================================================
-- 0022 PARTNER KHARCHA — telling money the business spent from money a partner
--                       took out of it
--
-- WHY THIS EXISTS
--
-- `expenses` was built for one kind of money-out: the business spending on
-- itself. Transport, packing, bijli, chai. Every one of those rows is a real
-- cost of trading, so every one of them belongs in profit.
--
-- But a partner in this shop also walks to the drawer and takes ₹20,000 for a
-- wedding, a school fee, a car. That money leaves the business exactly the way
-- a transport bill leaves it — the cash box is lighter by the same amount —
-- and it was getting written down on the same screen, in the same table, with
-- a category like "Partner" or "Personal". Nothing in the row said it was any
-- different.
--
-- It is completely different. A withdrawal is a partner taking their own share
-- out; it is a claim on profit already earned, not a cost of earning it. Book
-- it as an expense and the shop's profit reads LOWER than it actually was —
-- every month a partner takes money, the business looks like it earned less.
-- The owner then makes decisions — what to stock, what to charge, whether to
-- hire — on a profit figure that is wrong by however much the partners drew.
--
-- So the row now carries the distinction itself:
--
--   is_personal = false  →  business kharcha. Costs the business. In profit.
--   is_personal = true   →  partner ne paisa nikala. Cash out, NOT a cost.
--                           Out of profit. Shown separately, never netted in.
--
-- The Hisab screen filters on COALESCE(is_personal, 0) = 0 for exactly this
-- reason: the profit and expense reports must see only the first kind. The
-- COALESCE is not defensive padding — it is load-bearing. Every expense row
-- written before today has is_personal NULL on any device whose local copy
-- predates this migration, and NULL is not false in SQL: `where is_personal =
-- false` would silently drop every historical kharcha out of the P&L. The
-- default below fixes the server; the COALESCE fixes the device.
--
-- Cash-in-hand reports are the mirror image: they must count BOTH, because
-- both kinds of rupee actually left the drawer.
--
-- `partner_name` is free text, not a foreign key. A partner is not a staff
-- login and not a supplier — they are usually the owner's brother, and forcing
-- a row in some `partners` table before you can write down that Rajesh took
-- ₹5,000 is how a two-second entry becomes something nobody bothers doing.
--
-- TWO MORE COLUMNS, SAME TABLE, SAME REASON: THE ENTRY HAS TO BE COMPLETE
--
-- `paid_by` — `paid_to` records who RECEIVED the money (Ramesh transport).
-- Nothing recorded who HANDED IT OVER. In a shop where four people can dip
-- into the same drawer, "₹800 loading, cash" with nobody's name on it is the
-- entry that starts an argument at closing time. These are two different
-- questions and they need two different columns.
--
-- `photo_path` — the receipt. A purchase bill has had `bill_photo_path` since
-- 0021 and a kharcha had nowhere to put the paper at all, so the kharcha
-- screen could ask for a photo but never keep it. Same bucket, same shape:
-- one path, not a gallery. This is the chit that came with the money, not a
-- media library.
-- =============================================================================

alter table public.expenses
  add column if not exists is_personal  boolean not null default false,
  add column if not exists partner_name text,
  add column if not exists paid_by      text,
  add column if not exists photo_path   text;

comment on column public.expenses.is_personal is
  'TRUE when a partner drew money for personal use. Cash left the business but this is NOT a business cost: counting it as one understates profit. Profit and expense reports filter on COALESCE(is_personal,0)=0; cash-in-hand reports count both.';

comment on column public.expenses.partner_name is
  'Which partner this row belongs to. Free text — a partner is family, not a staff login or a supplier, and gating the entry behind a master record is how the entry stops happening.';

comment on column public.expenses.paid_by is
  'Who handed the money over, as opposed to paid_to, who received it. Both matter when several people share one cash drawer.';

comment on column public.expenses.photo_path is
  'Storage path in the item-photos bucket for the receipt/chit that came with this kharcha. One path, not a gallery.';

-- A partner's own history is the whole Partner Kharcha screen: name first,
-- newest first. Partial, because the overwhelming majority of expense rows are
-- ordinary shop kharcha with no partner on them at all.
create index if not exists expenses_partner_idx
  on public.expenses (partner_name, expense_date desc)
  where partner_name is not null;

-- Personal withdrawals are pulled out on their own often enough — "is mahine
-- partners ne kitna nikala" — to be worth their own partial index.
create index if not exists expenses_personal_idx
  on public.expenses (expense_date desc)
  where is_personal;
