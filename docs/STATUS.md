# AutoLoom — Build status

Last updated: 15 September 2026 (evening) — after the owner's direction change

## Direction (owner, 15 Sep)

Not a GST tax-invoice product. The daily job is the **khata**: goods sent to shop-owner customers, marked due/paid by evening, with a simple stock that goes down on bills and up on purchases. Built accordingly:

- **Bill, not invoice.** GST is OFF by default (Settings → "GST on bills"); bills print as a plain BILL with no HSN/tax columns. Turn it on and everything GST-ready comes back.
- **Price memory.** The price typed for a customer+product is prefilled next time ("last price" badge); otherwise the admin-set selling price. Admin can set a special price per customer from the product page.
- **Payment aayi.** Cash / online / bank / cheque, screenshot proof upload (private Supabase Storage bucket `payment-proofs`), remarks ("kis account mein aaya" — remembered as quick chips), settles the oldest bills first or chosen bills; "Mark paid" on the bill and on the customer page prefills the due amount.
- **Returns.** Per-line note; Good → back to stock, Faulty → the Damaged location; the Stock tab shows faulty stock separately and it never counts as sellable.
- **WhatsApp.** No Meta API: every button opens WhatsApp (phone app or WhatsApp Web) with the message prefilled for the customer's number via wa.me; staff tap Send. Slip of today's goods, day-end reminder list, "payment received" note. Templates in Hinglish/Hindi are editable in Settings; the reminder includes the UPI ID and a tap-to-pay link with the pending amount. Admin sets the WhatsApp Business number and UPI details in Settings.
- **Brand.** AutoLoom, red/black/white, "Drive Better".


## What exists and is verified

| Area | Status | Evidence |
|---|---|---|
| Architecture (A–P) | Done | `docs/ARCHITECTURE.md` |
| Postgres schema, 8 migrations; triggers for stock levels, balances, average cost, search text, immutability, audit; RLS from `role_permissions`; PowerSync publication | Done, applied | `supabase db reset` runs clean; counts and searches verified in psql |
| Seed: 29 families, 205 spec fields, 747 options, 86 models, 107 generations, 23 SKUs, parties, opening stock, 7 staff logins | Done | Counts checked |
| PowerSync service (local Docker) replicating from Supabase Postgres | Running | `/probes/liveness` returns 200 |
| Domain package: GST, pricing, credit, SKU, fitment, stock, numbering, specs, CSV, amount-in-words | Done | 120 unit tests pass (`npm test` in `packages/domain`) |
| App foundation: generated PowerSync schema (52 tables), Supabase connector, device identity, session + permissions, write helpers, local derived views (`stock_on_hand`, `party_balance_live`), theme, UI, forms, line picker with barcode scan | Done | `npm run typecheck` clean in `app/` |
| **Phase 0** — Sign-in, dashboard, universal search, vehicle → products, product detail, customer detail, stock overview, sync status | Done | Typecheck + web bundle |
| **Phase 1 — Admin & catalogue** — hub, families + spec templates, spec editor with allowed values and synonyms, product wizard (dynamic specs, variant generator, fitment, prices, opening stock; single-transaction save; edit), products list, vehicle master (generations, aliases, socket map), masters editor (brands, categories, units, HSN, tax rates, locations, price lists, numbering series), customers/suppliers lists + forms, company & behaviour settings, users & permission matrix, CSV import with validation and templates | Done | Typecheck + web bundle |
| **Phase 2 — Inventory** — purchase receive (landed cost, moving average), purchase return (debit note), cancel with reversals, transfers (dispatch/receive/in-transit), adjustments with approval, audit sessions (snapshot, count sheet, close → adjustment), per-SKU stock ledger with running balance, supplier payments with FIFO allocation | Done | Typecheck + web bundle + **20 posting tests on real SQLite** |
| **Workshop & purchasing aids** — job cards (customer + vehicle by registration, requirement, technician, parts from workshop stock at the customer's price, labour lines with SAC 9987, status flow, close → posted invoice in one transaction; services never move stock), vehicle job history from the customer page, reorder suggestions from sales velocity with supplier and last rate and CSV export, special-price editing for a customer on the product page | Done | Typecheck + posting test + browser smoke (job card → invoice) |
| **Khata pivot (15 Sep)** — GST-off plain bills, last-price prefill, Mark paid with proof + remarks, faulty returns view, WhatsApp slips/reminders/paid notes with UPI link, editable Hinglish templates, day-end Reminders screen, red/black AutoLoom theme | Done | Typecheck + posting tests + browser smoke |
| **Phase 3 — Billing** — invoice editor (customer credit position, vehicle, scan/search, price resolution with source, last-paid rate, price floor with approver, credit-limit check with override), post (offline numbering series, movements, ledger, automatic receipt for cash/UPI/card/bank), credit notes with sellable/damaged returns, cancellation reversing stock, ledger and the auto receipt, GST invoice PDF (share on phone, print on web), receipts with oldest-first or manual allocation, payment reversal (bounce), reports hub (17 reports: sales registers/by product/family/brand/customer/vehicle/salesperson, GST sales & purchase summaries, purchase register & price trend, receivable ageing, payables, collections, gross margin, stock valuation, current stock, slow/dead stock, movement summary) with CSV export | Done | Typecheck + web bundle + posting tests |

### Posting engine tests (`app/test/posting.test.ts`, run with `npm test` in `app/`)

Run the real posting code against an in-memory SQLite database built from the generated PowerSync schema. They cover: numbering (format, increment, financial-year rollover, device-owned series), purchase posting (stock, landed cost with freight, moving average, supplier ledger, IGST), refusal of double posting and empty drafts, cancellation with exact reversals, debit notes, cash invoice (CGST/SGST, auto receipt, frozen cost), credit invoice (due date, credit-limit flag and override), IGST for inter-state customers, credit notes (sellable vs damaged locations), invoice cancellation (including the auto receipt), refusal to cancel an invoice with credit notes, FIFO receipt allocation and advances, bounced cheque reversal, supplier payment allocation, transfer dispatch/receive, adjustment movement types, audit snapshot/count/close during concurrent sales, and transaction rollback on failure.

Bugs these tests caught and fixed before any user saw them: `paid_total` was NULL on a device until sync (SQLite has no column defaults) so allocations stayed NULL; the moving-average read the on-hand quantity after inserting the receipt and double-counted it.

## Not yet built

1. **Phase 4 — Go-live**: real catalogue import (the CSV tool is ready), staff accounts in Supabase Auth, EAS builds for Android/iOS, cloud Supabase project + PowerSync Cloud with the same migrations and sync rules, first-sync progress screen polish, backups.
2. **Phase 5**: product images, PIN-based approver on shared devices, WhatsApp sharing, e-invoice/e-way bill, customer portal.

Known gaps:
- Staff login credentials are created in the Supabase dashboard, not in the app (needs a server-side call; planned as an Edge Function).
- Price overrides currently require the approver to be the signed-in user; the PIN approach for shared counters is designed (profiles.pin_hash) but not wired.
- Credit-limit and negative-stock checks use this device's view of the world; another offline device's sales are not known until sync (by design; flagged on the invoice for the owner).

## Verified with what

- Database and seed: real SQL queries.
- Domain logic: 120 unit tests. Posting engine: 20 SQLite-backed tests.
- App: TypeScript typecheck and Metro web bundle including every route.
- **Browser end-to-end** (`npm run smoke` in `app/` with the dev server, local Supabase and PowerSync running; 18 steps): headless Chromium signs in, waits for the first sync, searches "creta 2024", opens the Creta fitment page and the 7D mat, finds HB3 via the "9005" alias, opens XYZ Accessories, creates a bill with the last price prefilled and posts it as udhaar, marks it paid online with remarks and captures the Hinglish "payment received" WhatsApp link to the customer's number, opens Reminders and captures a reminder link with the UPI pay link, checks the stock ledger, closes a job card into a bill, opens Reports and the product wizard, and confirms zero pending uploads. Server-side checks then confirm the invoice, movement, ledger rows, auto receipt, balances and audit log arrived through PowerSync.

Bugs the browser run caught and fixed: web build imported runtime values from `@powersync/react-native` (empty on web) instead of `@powersync/common`; seeded auth users had NULL token columns that break GoTrue sign-in; the local Supabase CLI signs JWTs with an asymmetric key so PowerSync needs the JWKS URL; base table GRANTs for the `authenticated` role were missing (migration 0009); an admin-approved customer price below the general floor wrongly demanded a second approval; an empty query parameter reached a UUID column as '' and, because SQLSTATE codes like 22P02 contain letters, the connector treated the rejection as retryable and the poisoned row blocked every later upload (both fixed: empty ids become NULL in the write helper, and fatal-code matching is alphanumeric).

Not yet run: a physical Android/iOS device build.

## Run it locally

Prerequisites: Node 22+, Docker Desktop, Supabase CLI 2.x.

```bash
# 1. Database + auth (first run pulls images)
supabase start -x studio,inbucket,mailpit,realtime,logflare,vector,supavisor,edge-runtime   # keeps storage (payment proofs)
supabase db reset          # applies migrations + seeds

# 2. Sync service
docker compose -f powersync/docker-compose.yml up -d
curl http://localhost:8080/probes/liveness   # expect 200

# 3. App (web)
cd app
cp .env.example .env       # then paste ANON_KEY from `supabase status` (already done on this machine)
npx expo start --web

# 3b. App (Android dev build; Expo Go cannot load op-sqlite)
npx expo run:android

# Tests
cd packages/domain && npm test
cd app && npm test && npm run typecheck
cd app && npm run smoke        # browser end-to-end; needs `npx expo start --web` running
```

Sign in with `admin@autoloom.local` / `autoloom123` (also owner@, purchase@, sales@, warehouse@, accounts@, workshop@).

Suggested first walk-through: Search `creta 2024` → open the 7D mat → Sell → New invoice → choose XYZ Accessories → scan/search `LED-AFY-H4-60W` (note the special price and last-paid rate) → post as cash → Print / share PDF → Stock → Receive purchase → post → Reports → GST sales summary.

## After changing the database

```bash
supabase db reset
python scripts/gen-schema.py     # regenerates app/src/lib/schema.ts
# a reset recreates Postgres, so PowerSync must start a fresh replication:
docker compose -f powersync/docker-compose.yml down -v && docker compose -f powersync/docker-compose.yml up -d
```

## Conventions that must not be broken

- Never `UPDATE` a quantity or a balance. Insert a `stock_movements` or `ledger_entries` row.
- Never edit a posted document. Cancel it (reversal rows) or issue a credit/debit note.
- Every new table needs: `id uuid`, `created_at`, `updated_at` + trigger, an RLS write policy in migration 0008's list, and inclusion in the `powersync` publication and `sync-rules.yaml`.
- Business logic that must work offline lives in `packages/domain` with a test; anything that writes documents goes through `app/src/lib/posting.ts` with a test in `app/test`.
- Multi-row business actions go through one `db.writeTransaction` so they sync as one unit.
- On the device, read stock from `stock_on_hand` and balances from `party_balance_live`, never from the server caches.
- SQLite has no column defaults: any column a later `UPDATE x = x + ?` touches must be written explicitly when the row is created or posted.
