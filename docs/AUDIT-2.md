# Second audit — what a working day still can't do

> **Status, 23 Sep 2026.** Shipped: #1 add item while billing, #2 expenses,
> #3 duplicate customer/supplier, #7 statement on WhatsApp, #8 activity log,
> #9 stock-short confirmation. Plus reporting the audit did not ask for:
> a "Poora hisaab" period summary, expense reports, week/yesterday presets and
> **PDF export of any report** — which also fixed the bill's own "PDF / print",
> broken on the web because `'expo' in globalThis` is true on Expo web and the
> sharer took the native path in silence.
> Still open: #4 quotation, #5 delivery challan, #6 bulk rate change,
> #10 split payment on a bill, #11 item photo.

22 September 2026. Read as the shopkeeper, not as the developer: sit at the
counter for a day and see where the app makes you put the phone down.

The first audit (`FIXES.md`) found eleven feature gaps and four production
risks; four of those are now shipped. This one deliberately does **not** repeat
them. Everything below was checked against the code, not guessed — where the
app already does something well, it is not listed.

**What is already solid, so it is off the list:** billing with line and bill
discounts, round-off, five payment modes, credit limits and ageing, returns
(credit note) straight off a bill, PDF and WhatsApp slip, drafts that survive
and are resumable from the Billing screen, search by car, per-customer price
memory, 19 reports including sales-by-salesperson and slow/dead stock, physical
stock counts, transfers between locations, and the approval loop for staff.

---

## Daily — these stop work at the counter

### 1. A new item cannot be added while billing

**What happens.** A customer is standing there. The item is on the shelf but
not in the catalogue — new stock, a line the shop just started carrying. The
item picker says "No matching SKU" and offers nothing else. The bill has to be
abandoned, the item created from Admin, and the bill started again.

For a **staff** member it is worse: they cannot create the item at all. They
raise a request and wait for the owner to approve it. The customer does not
wait.

The customer picker already handles exactly this — it has "+ Add" and jumps to
the new-customer form. The item picker does not.

**Fix.** Give the item picker the same "+ Add" the customer picker has. For
someone with `catalog.edit` it opens the one-page item form and returns to the
bill with the item selected. For staff, it adds the line as a **one-off
description with a price** and flags the bill so the owner sees an item that
needs to be created properly — the sale happens now, the catalogue catches up
later.

### 2. There is nowhere to record an expense

**What happens.** Nothing. There is no expense table, no screen, no report —
the word does not appear anywhere in the code.

A shop spends money every day: transport, packing, chai, staff advance, shop
rent, electricity, the boy who fetches stock. None of it can be entered.

Three things break because of it:

- **The day's cash can never be tallied.** Day-close (FIXES #7) is unbuildable
  as specified, because cash out is invisible.
- **"Profit" is only gross margin.** The margin report is sales minus cost of
  goods. The owner's real question — *is mahine kitna bacha* — cannot be
  answered by this app at all.
- **Staff advances are tracked in a diary**, which is exactly what this app was
  built to replace.

**Fix.** An `expenses` table (date, category, amount, mode, paid_to, note,
location, who entered it), a one-field-at-a-time entry screen, and two lines on
the dashboard: today's expense, and this month's. Then day-close becomes
possible and the margin report can show a net figure.

### 3. The same customer can be created twice

**What happens.** `customer/edit.tsx` validates that the mobile number is ten
digits. It never checks whether that number already exists.

So "Ramesh", "Ramesh Auto" and "Ramesh bhai" become three customers with one
phone number and three separate khatas. The balances are then all wrong, and
the reminder goes to the same man three times with three different amounts.

This is the single most common data problem in a shop ledger, and it is
silent — nobody notices until the balances stop matching.

**Fix.** On save, look up the mobile. If it exists, say so and offer the
existing customer instead of creating a second one. Same for the supplier form.

---

## Weekly — these cost money and trust

### 4. No quotation / estimate

A wholesaler quotes rates all day, on the phone and at the counter. There is
no document for it: the only way to give a price in writing is to make a real
bill, which posts stock and creates a khata entry for a sale that has not
happened.

So quotes are given verbally and forgotten. When the dealer calls back a week
later — *tumne 2,200 bola tha* — there is no record either way.

**Fix.** A quotation document: same line editor as a bill, no stock movement,
no ledger entry, an expiry date, and a "convert to bill" button that carries
the lines over. It is the bill screen with the posting turned off.

### 5. No delivery challan / goods-out-on-approval

Goods leave the shop without a bill constantly: on approval (*dekhkar batata
hoon*), to a fitter down the road, to an outstation dealer ahead of the
invoice. Today the only choices are to bill it (wrong — it may come back) or to
send it with no record at all (worse).

Either way the stock report still shows the item sitting in the shop.

**Fix.** A challan document that moves the stock to a holding location rather
than out of stock — `locations.type` already allows `transit`, so a "Bahar
gaya" location needs no schema change — and then either converts to a bill or
comes back. This also answers *wo maal kahan gaya*,
which is otherwise unanswerable.

### 6. Rates cannot be changed in bulk

When a supplier raises prices 8%, every affected SKU has to be opened and
edited one at a time. A shop carrying a few hundred SKUs simply will not do
this, so the rates quietly go stale and every sale is at the wrong margin.

`admin/products.tsx` has one action: "+ Naya item".

**Fix.** Multi-select on the products list with "increase by %", "set price",
"change price list". The CSV import can already carry prices — a
re-import path would work too, but selection is faster for a handful of brands.

### 7. The full khata statement cannot be sent

`whatsapp.ts` can send a bill slip, a payment reminder and a paid
confirmation. It cannot send a **statement** — the itemised list of bills and
payments that makes up a balance.

When a dealer says *poora hisaab bhejo*, the owner screenshots the customer
screen or reads it out over the phone.

**Fix.** A "Statement bhejo" button on the customer page producing the same
kind of message the reminder already does, listing bills and payments for a
period with the closing balance. The ledger data and the WhatsApp plumbing both
already exist.

---

## The owner cannot watch the shop

### 8. The audit trail never reaches the app

`audit_logs` is written faithfully on the server for every insert, update and
delete. It is then **excluded from sync on purpose** — it is in the connector's
`SERVER_ONLY_TABLES` and absent from the sync rules — so no screen in the app
can ever show it.

The result: when a bill is cancelled, a price is overridden, a discount is
given or a customer's credit limit is raised, the owner has no way to find out
who did it. The staff feature was built precisely so the owner could hand out
logins; this is the half that tells them what those logins did.

**Fix.** Sync `audit_logs` — read-only, the last 90 days — and add an
**Activity** screen under Admin: who, what, when, filterable by person. The
table, the triggers and the data are all already there; only the pipe and the
screen are missing.

---

## Smaller, but worth doing

### 9. Negative stock happens silently

The item picker shows the quantity at the current location and colours it red
at zero, which is good. But nothing warns at the moment of posting, so a bill
for 10 against a stock of 2 goes through and the stock goes to −8 without
comment.

Blocking it would be wrong — shops genuinely sell before the purchase entry is
made. A confirmation at post time ("Stock mein 2 hai, bill 10 ka hai — theek
hai?") keeps the sale possible and stops the silent drift.

### 10. One bill carries one payment mode

Part cash, part UPI is an ordinary counter payment. A bill records a single
`payment_mode`, so a split has to be entered as two separate payments against
the invoice — possible, but not from the bill screen where it happens.

### 11. No item photo at the counter

Already logged as FIXES #9. Repeated here only because it is the one gap a
*customer* notices: a wholesaler's phone gallery is how a dealer picks a mat
design.

---

## Suggested order

Three at a time, most painful first:

1. **Expenses** (#2) — nothing else unblocks day-close or a real profit figure
2. **Add item while billing** (#1) — the only one that makes a customer wait
3. **Duplicate customer check** (#3) — cheap, and it silently corrupts the khata

then

4. **Activity screen** (#8) — the owner asked for it when asking for staff
5. **Statement on WhatsApp** (#7) — small, and used every week
6. **Quotation** (#4)

then challan, bulk rates, and the smaller items.
