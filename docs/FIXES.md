# Audit fixes

Findings from the 17 September operational audit, with the exact change each
one needs. Done items record what shipped; the rest are specs precise enough to
hand to whoever picks them up next.

Audit: https://claude.ai/artifact/HGbNHgZBjzrfKapsRpnRrG

---

## Done

### 1. Pack size — set vs piece
**Was:** everything counted in `pcs`. A 7D mat set of 7 and a single mat both
entered as "1", so stock drifted silently and never came back.

**Shipped:** `product_variants.pack_size` (pieces per sold unit),
`pack_label` (what the customer calls it: set / pair / box) and a
`pack_size > 0` check — migration `20260917120000_pack_and_warranty.sql`.
Entered on the item form under "Set / pair aur warranty". Stock stays in
pieces so movements, moving-average costing and every existing report are
unchanged.

**Still open in the UI:** the billing screen does not yet multiply by
`pack_size`. Next step: when a variant with `pack_size > 1` is picked in
`invoice/edit.tsx`, show the quantity stepper in sold units and post
`qty * pack_size` pieces, with the line description carrying the label
("2 set = 14 pcs").

### 2. Warranty lookup
**Was:** LED bulbs, screens and cameras carry 6–12 months and do fail. The
customer arrives with the part and no bill, and the only way to check was
memory.

**Shipped:** `product_variants.warranty_months` on the same migration, set on
the item form. The customer page now has a **Warranty items** section listing
everything they bought that carries a period, newest first, with a green
"N din baaki" or grey "khatam" badge computed from the invoice date. Tapping a
row opens the bill.

---

## Open — specs

### 3. Fitment warning on the bill
The most expensive class of return: a Creta 2019 mat sold for a 2024.

- Add a vehicle picker to `invoice/edit.tsx` (the customer's saved vehicles are
  already in `customer_vehicles`; default to their only one).
- On each line, check `product_fitments` for the chosen `model_id`. Products
  with `is_universal_fit = 1` always pass.
- A non-matching line gets a red row and a confirm on post — warn, never block:
  the shopkeeper sometimes knows better than the data.

### 4. Fitting / labour on a counter sale
Labour income taken in cash and never booked, so margin reports read low.

- One "Fitting" row on the bill screen that adds a service line (no stock
  movement — services must never touch `stock_movements`; `postJobCard`
  already does this correctly, copy that path).
- Remember the last fitting amount per variant so it prefills next time,
  same mechanism as `CUSTOMER_LAST_RATE`.

### 5. Order book (indent)
"Creta ka 7D nahi hai, order kar do" currently lives on a chit.

- New table `customer_orders`: customer_id, variant_id (nullable — sometimes
  they describe an item that doesn't exist yet), free-text description, qty,
  promised_date, status (`open` / `arrived` / `delivered` / `cancelled`).
- Mark `arrived` automatically when a purchase receipt posts stock for that
  variant at any location.
- On arrival, queue a WhatsApp nudge using the existing `wa.me` path.
- Screen lives next to Reminders; it is the same daily habit.

### 6. Advance / token money
₹2,000 taken for an Android screen before any bill exists.

- `payments` already supports unallocated amounts — expose them: an "Advance"
  mode that records the payment against the customer with no allocation, shown
  on the khata as a credit.
- At billing, offer the advance as an allocation source before asking for cash.

### 7. Day-close cash tally
The classic shop-book close. Catches a shortage the same evening.

- New table `day_closes`: date, location_id, expected_cash, counted_cash,
  online_total, difference, closed_by, note.
- Expected cash = cash payments in − cash payments out for the day at that
  location, all already derivable from `payments`.
- One screen: show expected, take counted, save the difference. Do not let it
  block anything — it is a record, not a gate.

### 8. PIN approver on shared devices
`profiles.pin_hash` exists in the schema and nothing asks for it, so staff
approve their own below-floor discounts.

- Set a PIN from the users screen (hash client-side, store the hash).
- When a price falls below `min_selling_price`, prompt for a PIN and record
  which profile approved it in `override_approved_by` — the column is already
  on `sales_invoice_lines`.

### 9. Product photos
The single highest-leverage growth item for a wholesaler who sells on
WhatsApp.

- `product_images` table already exists in the schema and is unused.
- Capture with `expo-image-picker` (already a dependency), upload to a
  `product-images` Supabase Storage bucket — same pattern as `proofs.ts` uses
  for payment screenshots.
- Show on the product page and in the variant picker; add "Send photo" beside
  the existing WhatsApp actions.

### 10. Rate list to WhatsApp
- Pick a customer (their price list decides the column) and a set of
  categories, render the same HTML-to-PDF path `invoice-html.ts` already uses,
  and share it.

### 11. Transport / LR for outstation dealers
- `transport_name` and `lr_number` on `sales_invoices`, printed on the slip and
  included in `search_text` so a missing parcel can be found by LR.

---

## Production risk

### 12. Rotate the exposed keys — do this first
The Supabase `service_role` key and the database password were pasted into a
chat session during go-live setup. `service_role` bypasses every RLS policy.

- Supabase → Settings → API → roll `service_role`.
- Supabase → Database → reset password.
- Nothing in the app uses either (the app authenticates with the anon key plus
  a user JWT), so nothing breaks. Update any local `psql` command you use.

### 13. Backups
The whole khata sits in one Supabase project on a free plan with short
retention, and devices sync *from* it, so a server-side mistake propagates out.

- Nightly `pg_dump` to storage you control, and one restore actually tested
  before you rely on it.

### 14. Staff account creation
Adding a salesman means opening the Supabase dashboard by hand.

- Supabase Edge Function calling the Auth admin API, invoked from the existing
  Users & roles screen, creating the login and the `profiles` row together.

### 15. Crash and stuck-sync visibility
Offline-first apps fail quietly by design, which makes silent breakage easy to
miss for weeks.

- Crash reporting wired to the owner's email.
- A visible warning in the app once `pending local changes` stays above zero
  for longer than a threshold — the number is already on the sync screen.
