# AutoLoom — System Architecture

**B2B Auto Accessories · Car Modification · Inventory · Billing · Customer Ledger**
Noida, Uttar Pradesh, India

> **Direction (15 Sep 2026):** this is a khata-first tool, not a GST invoicing product. GST stays in the engine but is off by default; the everyday screens are bill → mark paid → WhatsApp slip/reminder. See `docs/STATUS.md` "Direction".
>
> Principle: **complex data structure underneath, simple interface on top.**
> A product is not "LED Bulb — 100 pcs". It is
> *XYZ LED Bulb → H4 → 60W → 6500K → CANBUS → SKU LED-XYZ-H4-60W → fits Swift 2018-23 → 25 pcs in Main Warehouse, 4 in Shop → last bought ₹1,200 → dealer price ₹1,650 → XYZ Auto last paid ₹1,550.*

---

## A. Complete software architecture

### A.1 Shape of the system

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  DEVICES (each has its own full local database)                          │
│                                                                          │
│   Android app      iPhone app      Web / Desktop (owner, admin, accounts)│
│   ┌────────────┐   ┌────────────┐  ┌──────────────────────────────┐      │
│   │ Expo app   │   │ Expo app   │  │ Same Expo app, React Native  │      │
│   │ (RN)       │   │ (RN)       │  │ Web build, responsive layout │      │
│   ├────────────┤   ├────────────┤  ├──────────────────────────────┤      │
│   │ SQLite     │   │ SQLite     │  │ SQLite (wasm, OPFS)          │      │
│   │ PowerSync  │   │ PowerSync  │  │ PowerSync                    │      │
│   └─────┬──────┘   └─────┬──────┘  └──────────────┬───────────────┘      │
└─────────┼────────────────┼────────────────────────┼──────────────────────┘
          │  download: streamed changes (WebSocket)  │
          │  upload: local write queue (HTTPS)       │
          ▼                ▼                         ▼
   ┌───────────────────────────────────────────────────────────┐
   │  PowerSync Service  (hosted "PowerSync Cloud", or Docker) │
   │  · reads Postgres logical replication                     │
   │  · applies sync rules → per-device buckets                │
   │  · validates Supabase JWT                                 │
   └──────────────┬────────────────────────────▲───────────────┘
                  │ replication                │ uploads go straight to
                  ▼                            │ Supabase (PostgREST), not
   ┌───────────────────────────────────────────┴───────────────┐
   │  SUPABASE                                                  │
   │  · PostgreSQL 17  — single source of truth                 │
   │      tables, constraints, triggers, RLS, audit log         │
   │  · Auth           — email/phone login, JWT with role claim │
   │  · Storage        — invoice PDFs, product images           │
   │  · Edge Functions — only for secrets-needing jobs (later:  │
   │                     WhatsApp, e-invoice)                    │
   └────────────────────────────────────────────────────────────┘
```

**One backend, one database, one codebase.** The web admin dashboard is the same Expo application rendered with React Native Web, with wider layouts on large screens. There is no separate React web project to maintain.

### A.2 Where logic lives

| Concern | Lives in | Why |
|---|---|---|
| Screens, search, billing math, GST split, price resolution, SKU generation | **App (TypeScript, `packages/domain`)** | Must work offline. Pure functions, unit-tested. |
| Stock movement rows, ledger entry rows | **Written by the app, in the same local transaction as the document** | Stock and outstanding are correct offline, and sync atomically with the document. |
| Derived balances (`stock_levels`, `party_balances`), audit log, integrity validation, `updated_at` | **Postgres triggers** | Cheap, always consistent, cannot be bypassed by a client. |
| Reports over the whole business | **Postgres views** (web dashboard) + local SQL (device) | Same SQL dialect subset works on both. |
| Anything needing secrets or third-party APIs | **Supabase Edge Functions** | Phase 3 only (WhatsApp, e-invoice, e-way bill). |

### A.3 Non-negotiable rules

1. **Every stock change is a `stock_movements` row.** Stock is a sum. There is no editable "quantity" column anywhere.
2. **Every money effect on a customer or supplier is a `ledger_entries` row.** Outstanding is a sum.
3. **Posted documents are never edited or deleted.** They are cancelled (status change + reversing movements/entries) or corrected with a credit/debit note.
4. **Every row id is a UUID v7 generated on the device.** Two offline devices can never collide.
5. **Every sensitive change is in `audit_logs`** with user, device, timestamp, old value, new value.
6. **Product families and specifications are data, not code.** Adding "Android Screens" is a row, not a migration.

---

## B. Recommended technology stack

| Layer | Choice | Version (Sept 2026) | Notes |
|---|---|---|---|
| Mobile + Web app | **Expo (React Native)** | Expo SDK 57, RN 0.86, React 19.2 | Android, iOS, and web from one codebase. Expo Router for file-based navigation. New Architecture on. |
| Language | TypeScript (strict) | 6.0 | Shared domain package for pricing/GST/SKU logic. |
| Local database | **SQLite** via `@op-engineering/op-sqlite` (native) and `@powersync/web` (wasm + OPFS on web) | | PowerSync's recommended drivers. |
| Offline sync | **PowerSync** (`@powersync/react-native`, `@powersync/react`) | | Streams Postgres → SQLite; queues local writes; atomic CRUD transactions. |
| Backend database | **PostgreSQL** on **Supabase** | PG 17 | Source of truth. Logical replication is already enabled on Supabase. |
| Auth | Supabase Auth | | Email + password for staff. Role stored in `profiles`, exposed to RLS. |
| Files | Supabase Storage | | Invoice PDFs, product photos. |
| Sync service | **PowerSync Cloud** (managed) for production; `journeyapps/powersync-service` Docker for local dev | | Avoids running our own server. |
| PDF | `expo-print` (HTML → PDF on device) + `expo-sharing` | | GST invoice PDF generated offline, shared to WhatsApp/email by the OS share sheet. |
| Barcode | `expo-camera` barcode scanner | | Phase 2 UI; the data model supports it from day 1. |
| Reactive queries | `useQuery` from `@powersync/react` | | Screens re-render automatically when local SQLite changes (including after sync). |
| Validation | `zod` | | Form and import validation. |
| Tests | `vitest` (domain package), `supabase test db` (pgTAP) for triggers | | |
| Dev tooling | Supabase CLI 2.x, Docker Desktop, EAS Build for store builds | | |

**Deliberately not used:** Redux/Zustand (SQLite is the state), a separate REST/GraphQL API (PostgREST + PowerSync cover it), an ORM (SQL is written once, runs on both SQLite and Postgres), a separate web framework.

**Hosting cost at MVP:** Supabase Pro (~US$25/mo) + PowerSync Cloud (free tier, then ~US$35/mo) + EAS (free tier). Nothing else.

---

## C. Recommended database structure

All tables have: `id uuid PK`, `created_at`, `updated_at`, `created_by` (user), `device_id`. Money is `numeric(14,2)`. Quantities are `numeric(12,3)` (allows metres of wire). Enumerations are `text` with a `CHECK`, so new values never need a migration of an enum type on SQLite.

### C.1 Catalogue (master data)

| Table | Purpose | Key columns |
|---|---|---|
| `product_families` | Bulbs, Mats, Horns, LED Headlights… admin-created | `code`, `name`, `sku_prefix`, `default_hsn_code`, `default_unit_id`, `default_tax_rate_id`, `is_fitment_required` |
| `spec_definitions` | The specification template of a family | `family_id`, `code`, `name`, `data_type` (text/number/boolean/select/multiselect), `unit`, `is_required`, `is_variant_axis`, `is_filterable`, `show_in_variant_name`, `sort_order` |
| `spec_options` | Allowed dropdown values (H4, H7, 5D, 7D, Snail, Disc…) | `spec_definition_id`, `value`, `label`, `sort_order`, `is_active` |
| `categories` | Category → Subcategory tree | `family_id`, `parent_id`, `name`, `level` (1 or 2) |
| `brands` | | `name`, `code` |
| `units` | pcs, set, pair, kit, mtr, box | `code`, `name`, `allow_decimal` |
| `hsn_codes` | HSN/SAC master with default rate | `code`, `description`, `default_tax_rate_id` |
| `tax_rates` | Admin-editable GST slabs | `name`, `rate_pct`, `cgst_pct`, `sgst_pct`, `igst_pct`, `cess_pct`, `effective_from`, `effective_to` |
| `products` | A marketable product (one brand, one family) | `family_id`, `category_id`, `subcategory_id`, `brand_id`, `name`, `description`, `hsn_code`, `unit_id`, `tax_rate_id`, `is_universal_fit`, `search_text`, `is_active` |
| `product_variants` | **The sellable SKU** | `product_id`, `variant_name` (auto from axis specs), `sku`, `barcode`, `mrp`, `retail_price`, `wholesale_price`, `dealer_price`, `min_selling_price`, `min_stock`, `reorder_level`, `reorder_qty`, `last_purchase_cost`, `avg_cost`, `search_text`, `is_active` |
| `spec_values` | Actual spec values, **one row per spec per product or variant** | `product_id`, `variant_id` (null = product-level), `spec_definition_id`, `value_text`, `value_number`, `value_bool`, `option_id`, `option_ids` (multiselect) |
| `product_images` | | `product_id`, `variant_id`, `storage_path`, `sort_order` |

### C.2 Vehicles and fitment

| Table | Purpose | Key columns |
|---|---|---|
| `vehicle_makes` | Maruti Suzuki, Hyundai, Tata… | `name` |
| `vehicle_models` | Creta, Swift, Nexon… | `make_id`, `name`, `body_type`, `segment` |
| `vehicle_generations` | Creta 2015-19 / 2020-23 / 2024+ (facelift) | `model_id`, `name`, `year_from`, `year_to` (null = current), `is_facelift`, `body_type`, `seating` |
| `vehicle_variants` | SX(O) Diesel AT, etc. Optional detail | `generation_id`, `name`, `fuel`, `transmission`, `engine`, `seating`, `notes` |
| `product_fitments` | **Product/variant ↔ vehicle** | `product_id`, `variant_id` (null = whole product), `model_id`, `generation_id` (null = all gens), `vehicle_variant_id` (null = all variants), `year_from`, `year_to`, `position` (front/rear/left/right/both/full-set), `notes` |
| `vehicle_spec_map` | Vehicle → socket/size facts (Creta 2024 low beam = H7, fog = H8). Phase 2 UI, schema now | `generation_id`, `spec_definition_id`, `position_label`, `option_id` |
| `customer_vehicles` | Real cars of a customer/shop by registration no. | `customer_id`, `registration_no`, `model_id`, `generation_id`, `vehicle_variant_id`, `color`, `notes` |

### C.3 Parties and pricing

| Table | Purpose | Key columns |
|---|---|---|
| `price_lists` | Retail, Dealer, Wholesale, Workshop, Special-A… | `name`, `code`, `is_default` |
| `price_list_items` | Optional per-SKU override for a list | `price_list_id`, `variant_id`, `price`, `effective_from` |
| `customers` | | `code`, `name`, `business_name`, `owner_name`, `mobile`, `alt_phone`, `email`, `gstin`, `pan`, `address_line1/2`, `city`, `state_code`, `pincode`, `customer_type` (retail/dealer/wholesale/workshop/other), `price_list_id`, `credit_limit`, `credit_days`, `opening_balance`, `opening_balance_date`, `is_active`, `search_text` |
| `customer_prices` | Negotiated price for one customer + SKU | `customer_id`, `variant_id`, `price`, `effective_from`, `approved_by` |
| `suppliers` | | same address/GST fields, `payment_terms_days`, `opening_balance` |
| `supplier_products` | Supplier's code/name for our SKU (import matching) | `supplier_id`, `variant_id`, `supplier_sku`, `last_rate` |

### C.4 Inventory

| Table | Purpose | Key columns |
|---|---|---|
| `locations` | Main Warehouse, Shop, Workshop, future branches | `code`, `name`, `type`, `address`, `is_active` |
| `stock_movements` | **Append-only event log. The only source of stock.** | `variant_id`, `location_id`, `qty` (signed), `movement_type`, `ref_type`, `ref_id`, `ref_line_id`, `unit_cost`, `batch_no`, `serial_no`, `occurred_at`, `reversal_of_id`, `note` |
| `stock_levels` | Server-maintained cache: per variant × location | `variant_id`, `location_id`, `qty`, `reserved_qty`, `last_movement_at` |
| `stock_adjustments` + `_lines` | Damage, missing, found, opening, audit correction | header: `location_id`, `reason`, `status`, `approved_by`; line: `variant_id`, `qty_delta`, `unit_cost`, `reason_code` |
| `stock_transfers` + `_lines` | Between locations | `from_location_id`, `to_location_id`, `status` (draft/dispatched/received) |
| `stock_audits` + `_lines` | Physical count sessions | header: `location_id`, `status`, `counted_by`; line: `variant_id`, `system_qty`, `counted_qty`, `difference`, `reason_code` |

`movement_type` values: `opening`, `purchase`, `purchase_return`, `sale`, `sale_return`, `damage`, `adjustment`, `transfer_out`, `transfer_in`, `job_consumption`, `free_issue`, `reservation`, `reservation_release`, `cancel_reversal`.

### C.5 Documents and money

| Table | Purpose | Key columns |
|---|---|---|
| `document_sequences` | Offline-safe numbering series | `series_code`, `doc_type`, `financial_year`, `prefix`, `next_number`, `location_id`, `owner_device_id` |
| `sales_invoices` | Invoice **and** credit note (`doc_type`) | `doc_type` (invoice/credit_note), `doc_no`, `doc_date`, `customer_id`, `customer_vehicle_id`, `location_id`, `price_list_id`, `place_of_supply_state`, `is_interstate`, `subtotal`, `discount_total`, `taxable_total`, `cgst_total`, `sgst_total`, `igst_total`, `round_off`, `grand_total`, `paid_total`, `due_date`, `payment_mode`, `status` (draft/posted/cancelled), `against_invoice_id`, `salesperson_id`, `notes`, `cancel_reason` |
| `sales_invoice_lines` | | `variant_id`, `description` (frozen), `hsn_code`, `qty`, `unit_id`, `mrp`, `list_price`, `rate`, `discount_pct`, `discount_amt`, `taxable_value`, `tax_rate_pct`, `cgst`, `sgst`, `igst`, `line_total`, `unit_cost_at_sale`, `price_source` (retail/dealer/customer/manual), `override_approved_by`, `return_condition` |
| `purchases` | Purchase **and** debit note (purchase return) | `doc_type`, `doc_no`, `supplier_id`, `supplier_invoice_no`, `supplier_invoice_date`, `location_id`, tax totals as above, `other_charges`, `status` |
| `purchase_lines` | | `variant_id`, `qty`, `rate`, discounts, taxes, `batch_no`, `warranty_months`, `landed_unit_cost` |
| `payments` | Receipts from customers and payments to suppliers | `direction` (in/out), `party_type`, `party_id`, `doc_no`, `payment_date`, `amount`, `mode` (cash/upi/bank/cheque/card), `reference_no`, `status` |
| `payment_allocations` | Which invoices a payment settles (for ageing) | `payment_id`, `doc_type`, `doc_id`, `amount` |
| `ledger_entries` | **Append-only party ledger** | `party_type`, `party_id`, `entry_date`, `doc_type`, `doc_id`, `debit`, `credit`, `narration`, `reversal_of_id` |
| `party_balances` | Server cache: outstanding per party | `party_type`, `party_id`, `balance`, `overdue_amount`, `last_txn_at` |
| `job_cards` + `_lines` + `_labour` | Workshop (Phase 2 UI, schema now) | `customer_id`, `customer_vehicle_id`, `technician_id`, `status`, `requirement`, `odometer`; lines consume stock from workshop location |

### C.6 Users, security, system

| Table | Purpose |
|---|---|
| `profiles` | one per auth user: `full_name`, `role`, `default_location_id`, `is_active`, `mobile` |
| `role_permissions` | `role`, `permission` (e.g. `sale.override_price`, `stock.adjust`, `purchase.cancel`) — editable by admin |
| `devices` | `user_id`, `name`, `platform`, `last_seen_at`, `numbering_series_code` |
| `audit_logs` | `user_id`, `device_id`, `at`, `table_name`, `row_id`, `action`, `old_data`, `new_data`, `reason` |
| `company_settings` | single row: legal name, GSTIN, state code, address, bank details, invoice footer, financial year start, rounding rule |
| `app_settings` | key/value: low-stock thresholds, dead-stock days, etc. |

---

## D. Product / family / specification architecture

### D.1 The hierarchy, and what each level actually stores

```text
PRODUCT FAMILY    "LED Bulbs"          → owns the spec template, SKU prefix, default HSN/GST
   CATEGORY       "Lighting"           → reporting bucket (category-wise sales)
   SUBCATEGORY    "Headlight Bulbs"    → finer reporting bucket
   BRAND          "XYZ"                → brand-wise sales, SKU segment
   PRODUCT        "XYZ Ultra LED"      → shared specs (Tech=LED, CCT=6500K, CANBUS=Yes, Warranty=12m)
      VARIANT     "H4 60W"             → axis specs (Socket=H4, Wattage=60) + SKU + prices + stock
      VARIANT     "H7 60W"
      VARIANT     "H11 60W"
   FITMENT        variant/product ↔ vehicles
   SKU/BARCODE    on the variant
   STOCK          sum of movements per variant × location
```

**Product-level vs variant-level specs.** Each `spec_definition` has `is_variant_axis`. Axis specs (Socket, Wattage, Colour, Size, Rows) vary per variant and generate the variant name and SKU. Non-axis specs (Technology, CANBUS, Warranty, Material) are entered once on the product and inherited. A variant may still override any inherited spec (a row in `spec_values` with `variant_id` set wins).

**Effective specs of a variant** = product-level rows overlaid by variant-level rows. This is a single SQL query used by the product page, the comparison table and search indexing.

### D.2 Specification definition (admin)

```text
Family:        Bulbs
Spec:          Socket
Code:          socket            ← stable key, used in SKU templates and search
Data type:     select
Required:      yes
Variant axis:  yes               ← different sockets = different variants
Filterable:    yes               ← appears as a filter chip in search
Show in name:  yes               ← "H4 60W"
Options:       H1 H3 H4 H7 H8 H9 H10 H11 H16 HB3 HB4 9005 9006 9012 T10 BA9S Festoon …
```

Data types: `text`, `number` (with `unit`), `boolean`, `select` (one option), `multiselect` (many options). Options are rows in `spec_options`, so admin adds "H15" without touching code. Options can be deactivated but never deleted (historical products reference them).

### D.3 Seeded family templates

The seed ships 20 families with complete templates so the business is productive on day one: Halogen Bulbs, LED Bulbs, HID Kits, LED Headlights, Headlight Assemblies, Projectors, Fog Lamps, Fog Lamp Assemblies, DRLs, Tail Lamps, Mats, Seat Covers, Horns, Reverse Cameras, Parking Sensors, Android Screens, Speakers, Dash Cameras, Wiring & Relays, and Generic Accessories. Admin can edit or add more.

Examples of axis choice (this is what makes the variant naming right):

| Family | Variant axes | Product-level specs |
|---|---|---|
| LED Bulbs | Socket, Wattage | Technology, Lumens, CCT, CANBUS, Fan/Fanless, Beam, Polarity, Connector, Voltage, Warranty |
| Mats | Type (3D/5D/7D/9D), Colour, Set (Front/Rear/Full/Boot) | Material, Rows, Border, Thickness, Anti-slip, Waterproof, Warranty |
| Horns | Type (Disc/Snail/Air), Single/Twin | Voltage, dB, Frequency, Compressor Required, Connector, Colour, Warranty |
| Seat Covers | Colour, Seats (5/7) | Material, Pattern, Custom/Universal, Stitching, Airbag Compatible, Warranty |
| Android Screens | Size, RAM/Storage | Android Version, Resolution, Processor, DSP, 4G/SIM, Wireless CarPlay, Android Auto, Camera Support |

### D.4 SKU generation

Each family has a `sku_template`, e.g. `{FAMILY}-{BRAND}-{socket}-{wattage}W` → `LED-XYZ-H4-60W`; mats: `MAT-{BRAND}-{VEHICLE}-{type}-{colour}` → `MAT-XYZ-CRETA-7D-BLK`. Tokens resolve from family code, brand code, variant axis option *codes* (options carry a short `code` like `BLK`), and the first fitment model's short code. The generated SKU is shown editable; admin can override. Uniqueness is enforced by a database constraint; on collision the UI appends `-2`.

### D.5 Search and filter

- Every product and variant has a `search_text` column rebuilt on save: name + brand + family + category + every spec value + every fitted model name + SKU + barcode. Lowercased, tokenised.
- Search "H4 LED" = every token must appear in `search_text`. Works identically in SQLite and Postgres (`LIKE`).
- Structured filter = join on `spec_values` (`socket = H4 AND technology = LED AND wattage = 60`). Filter chips are generated from `spec_definitions` where `is_filterable`.
- Phase 2: FTS5 virtual table on device for ranked results.

### D.6 Variant comparison

Any set of variants from the same family renders a table whose columns are that family's `spec_definitions` (sorted), plus price and stock. No per-family code.

---

## E. Vehicle fitment architecture

### E.1 Levels and how they match

A fitment row can be as broad or as precise as the business knows:

| Fitment row says | Matches vehicle search for |
|---|---|
| model=Creta, generation=null, years=null | Any Creta, any year |
| model=Creta, generation="2024+ facelift" | Creta 2024, 2025, 2026 |
| model=Swift, years 2018–2023 | Swift 2018…2023 regardless of generation naming |
| model=Creta, generation=2024+, vehicle_variant="SX(O) Diesel AT" | only that trim |

A product with `is_universal_fit = true` (most bulbs, horns, chargers) appears in every vehicle search but under a **"Universal"** heading, not mixed with model-specific parts. For bulbs, the Phase 2 `vehicle_spec_map` upgrades this: *Creta 2024 low beam = H7* means the H7 variants surface as "Fits by socket" for that car.

### E.2 Vehicle → products (the main sales workflow)

```text
Search box: "creta 2024"
   → resolve to Hyundai Creta, generation 2024+ (fuzzy on model name + year)
   → products = model-specific fitments for that model/generation/year
              ∪ socket matches from vehicle_spec_map (Phase 2)
              ∪ universal products (collapsed section)
   → group by family, show stock (all locations) + this customer's price
   → filters: In stock only · Family · Brand · Price band · Category
```

### E.3 Product → vehicles

The product page lists fitments grouped by make → model → generation/years. A variant can have its own fitment list; if empty it inherits the product's.

### E.4 Vehicle master hygiene

- Model names are unique per make; generation names unique per model.
- Year-based search uses `year_from <= Y AND (year_to IS NULL OR year_to >= Y)`.
- Aliases (`vehicle_model_aliases`: "Scorpio N" ↔ "Scorpio-N", "WagonR" ↔ "Wagon R") make search forgiving. Seeded for common Indian models.
- Admin can merge duplicate models; fitments are re-pointed by a single update.

---

## F. Inventory architecture

### F.1 Stock is derived, never stored by hand

```text
current_stock(variant, location) = SUM(qty) FROM stock_movements WHERE variant_id=? AND location_id=?
```

On the device this is a local SQLite view (`stock_on_hand`) over the synced `stock_movements`, so a purchase posted offline is visible at once; `party_balance_live` does the same for ledgers. On the server a trigger keeps `stock_levels` / `party_balances` in step for fast reports. They must always agree; a nightly check compares them.

| Business event | Movement rows written by the app |
|---|---|
| Opening stock import | `opening` +qty @ unit_cost |
| Purchase posted | `purchase` +qty per line @ landed cost, location = purchase location |
| Purchase return posted | `purchase_return` −qty |
| Invoice posted | `sale` −qty per line, `unit_cost` = avg_cost at that moment (frozen for margin reports) |
| Credit note posted (sales return) | `sale_return` +qty into *sellable* or *damaged* stock (damaged = a separate location "Damaged/Returns") |
| Transfer dispatched / received | `transfer_out` at source, `transfer_in` at destination (two rows, same `ref_id`) |
| Adjustment approved | `adjustment` / `damage` ±qty with `reason_code` |
| Audit closed | one `adjustment` per counted difference, `ref_type = stock_audit` |
| Job card closed | `job_consumption` −qty from workshop location |
| Document cancelled | `cancel_reversal` rows that exactly negate the original (`reversal_of_id` set) |

### F.2 Costing

- `last_purchase_cost` = rate on the most recent posted purchase line (landed, after discount, before GST if input credit is claimed; configurable).
- `avg_cost` = moving weighted average, recomputed on each purchase posting: `(old_qty × old_avg + new_qty × new_cost) / (old_qty + new_qty)`, computed over all locations.
- Sales lines freeze `unit_cost_at_sale`, so gross margin reports never change retroactively.
- Purchase price history is simply the `purchase_lines` table filtered by variant. Nothing is overwritten.

### F.3 Locations

Every movement has a location. A transfer is a draft until "received", so in-transit stock is visible (`transfer_out` posted, `transfer_in` pending). Sales default to the user's `default_location_id`; the salesperson can switch when billing from warehouse stock.

### F.4 Low stock / reorder

`min_stock`, `reorder_level`, `reorder_qty` on each variant. The dashboard query is a join of `v_stock_levels` (summed across locations, or per location if configured) against `reorder_level`. Phase 2 adds 30/60/90-day sales velocity → suggested quantity.

### F.5 Stock audit

1. Create audit session for a location (optionally filtered by family/brand/category).
2. Lines are snapshotted with `system_qty` at session start.
3. Counting happens on phones (scan or search → enter count). Multiple users can count the same session; last count per line wins and is logged.
4. Reviewer sees differences with reason codes; **Close** requires `stock.adjust` permission and writes adjustment movements. Nothing changes stock until close.

---

## G. Sales / purchase / ledger architecture

### G.1 Document lifecycle

```text
draft ──(post)──▶ posted ──(cancel, permission)──▶ cancelled
```

- **Draft** rows are editable and sync like any row (a draft started on the phone can be finished on the desktop).
- **Post** is one local transaction: lock the numbering series → assign `doc_no` → freeze line descriptions, prices, HSN, tax rates → write `stock_movements` → write `ledger_entries` → set `status = posted`. PowerSync uploads the whole transaction atomically.
- **Cancel** writes reversal movements and reversal ledger entries and stamps `cancel_reason`. The number is consumed (GST requires the gap to be explainable; the cancelled invoice remains printable with a CANCELLED watermark).
- Corrections after the customer has the invoice are always a **credit note** or **debit note**.

### G.2 Numbering that works offline

Under GST an invoice series must be unique and consecutive **within a series**; multiple series are allowed. So:

- Each device that bills gets a series: `NOI/A/` (shop counter), `NOI/B/` (warehouse tablet), `NOI/W/` (web). Format is admin-configurable, e.g. `{PREFIX}{FY}/{NNNN}` → `NOI/A/26-27/0042`.
- The `document_sequences` row is owned by one device (`owner_device_id`); only that device increments it, so no conflict is possible.
- Sequences reset per financial year (April–March), configurable.
- Credit notes, debit notes, purchases, payments, job cards each have their own series.

### G.3 GST computation (per line, then summed)

```text
taxable_value = qty × rate − discount
if customer.place_of_supply_state == company.state → CGST = taxable × rate/2, SGST = taxable × rate/2
else                                              → IGST = taxable × rate
grand_total = Σ taxable + Σ tax + other charges, rounded to nearest rupee (round_off stored)
```

- Rates come from `tax_rates` by `effective_from/to`; the applied percentage is frozen on the line.
- Place of supply defaults to the customer's state; editable per invoice (a UP customer picking up goods vs. delivery to Delhi).
- Unregistered customers (no GSTIN) are B2C on the invoice; registered ones are B2B. Both are stored so GSTR-1 style exports are possible later.
- Exempt/nil-rated items use a 0% `tax_rates` row, not a special case.
- **All GST logic must be reviewed by the business's CA before production.** The engine is configurable precisely so this review can change values without code.

### G.4 Ledger entries (double-entry, party side only)

| Document | Customer ledger | Supplier ledger |
|---|---|---|
| Sales invoice posted | Debit grand_total | |
| Payment received | Credit amount | |
| Credit note (sales return) | Credit grand_total | |
| Purchase posted | | Credit grand_total |
| Payment made | | Debit amount |
| Debit note (purchase return) | | Debit grand_total |
| Opening balance | Debit/Credit as entered | same |
| Cancellation | Reversing entry of the original | same |

Customer outstanding = Σdebit − Σcredit. Overdue = outstanding portion of invoices whose `due_date` (`doc_date + credit_days`) has passed and which are not covered by allocations (FIFO auto-allocation if the user doesn't allocate manually). Available credit = `credit_limit − outstanding`.

### G.5 Price resolution (the order the app tries, first hit wins)

1. `customer_prices` for this customer + variant (special negotiated rate)
2. `price_list_items` for the customer's price list + variant
3. The variant's column matching the price list's `code` (`retail_price`, `dealer_price`, `wholesale_price`)
4. `retail_price`

The line also shows: MRP, the customer's **last paid rate** for this SKU (from `sales_invoice_lines`), last purchase cost (if role allows) and margin at the current rate.

### G.6 Price control

- `min_selling_price` per variant (or a global margin floor over `avg_cost`). Entering a rate below it shows "Below permitted selling price" and requires a user with `sale.override_price` to enter their PIN on that device; the override is stored on the line (`override_approved_by`) and in `audit_logs`.
- Changing master prices requires `catalog.edit_price`.

### G.7 Credit control

Before posting a credit sale: outstanding (local, from ledger entries) + this invoice vs `credit_limit`. Exceeding → warning; `sale.override_credit` permission to proceed; recorded in the audit log. Offline caveat: another device may have posted invoices the phone hasn't received yet; the server re-checks on sync and flags the invoice `credit_flag = true` for the owner's dashboard rather than rejecting it (the goods have already left).

---

## H. Offline / sync architecture

### H.1 How PowerSync is used

- **Download:** the PowerSync service tails Postgres logical replication and pushes changed rows to each device's SQLite. Sync rules define *what* each user receives. This is a single-tenant, small-team app, so everyone receives the **whole business dataset** (products, vehicles, customers, documents, movements). Sync rules exclude the `audit_logs` table and cost columns for roles that must not see costs.
- **Upload:** every local write goes into PowerSync's CRUD queue. A document post is one `writeTransaction`, uploaded as one unit. The app's `uploadData` sends the rows to Supabase via PostgREST (`upsert` with the client-generated ids, so a retry is idempotent).
- **Read your writes:** the local SQLite is updated immediately; the row is marked pending until the server echo arrives. The UI shows a small "pending sync" count in the header.

### H.2 Conflict policy by table kind

| Kind | Tables | Policy |
|---|---|---|
| Append-only events | `stock_movements`, `ledger_entries`, `audit_logs`, `payment_allocations` | Never updated, never conflict. |
| Posted documents | invoices, purchases, payments, adjustments, transfers | Immutable after post. Only `status`, `paid_total`, `cancel_*` can change, via reversal rows. |
| Drafts | same tables, `status = draft` | Last-write-wins on `updated_at`; only one person edits a draft in practice. |
| Master data | products, variants, customers, specs, vehicles | Last-write-wins per row; server keeps every old version in `audit_logs`; admin can see and restore. |
| Counters | `document_sequences` | Single owner device → no conflict. |
| Derived caches | `stock_levels`, `party_balances` | Server-only writes; device treats as read-only and can recompute locally. |

### H.3 Identity and idempotency

- IDs are UUID v7 (time-ordered, so indexes stay compact). Generated by `@powersync` helpers on the device.
- Uploads are `upsert` keyed on `id`; a retried upload cannot duplicate.
- A Postgres trigger rejects a `stock_movements` row whose `(ref_type, ref_line_id, movement_type)` already exists unless it's a reversal.

### H.4 Data volume plan

A shop with 5,000 SKUs, 60 invoices/day: ~150k movements/year, ~50k invoice lines/year. SQLite handles this comfortably (a few hundred MB after several years). Phase 3 adds yearly compaction: movements older than N years are collapsed into `opening` rows per variant × location, and sync rules only ship the compacted set.

### H.5 Local development

`supabase start` gives Postgres + Auth locally; a `docker-compose.powersync.yml` runs the PowerSync service against it with `sync_rules.yaml`. The app points at both via `.env`. Production uses Supabase cloud + PowerSync Cloud with the same sync rules file.

---

## I. User roles and permissions

Roles are coarse; permissions are fine-grained rows in `role_permissions` that admin can toggle.

| Permission | Admin | Owner | Purchase | Sales | Warehouse | Accounts | Workshop |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| catalog.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| catalog.edit (products, specs, vehicles, fitments) | ✓ | ✓ | | | | | |
| catalog.edit_price | ✓ | ✓ | | | | | |
| catalog.view_cost | ✓ | ✓ | ✓ | | | ✓ | |
| purchase.create / post | ✓ | ✓ | ✓ | | ✓ (receive only) | | |
| purchase.cancel | ✓ | ✓ | | | | | |
| sale.create / post | ✓ | ✓ | | ✓ | | | ✓ |
| sale.override_price | ✓ | ✓ | | | | | |
| sale.override_credit | ✓ | ✓ | | | | | |
| sale.cancel | ✓ | ✓ | | | | | |
| sale.return (credit note) | ✓ | ✓ | | ✓ | | ✓ | |
| payment.receive | ✓ | ✓ | | ✓ | | ✓ | ✓ |
| payment.pay_supplier | ✓ | ✓ | ✓ | | | ✓ | |
| stock.transfer | ✓ | ✓ | | | ✓ | | ✓ |
| stock.count | ✓ | ✓ | | | ✓ | | ✓ |
| stock.adjust (approve audit/adjustment) | ✓ | ✓ | | | | | |
| party.edit (customers/suppliers) | ✓ | ✓ | ✓ (suppliers) | ✓ (customers) | | ✓ | |
| party.edit_credit_limit | ✓ | ✓ | | | | | |
| jobcard.* | ✓ | ✓ | | | | | ✓ |
| reports.view | ✓ | ✓ | | | | ✓ | |
| reports.view_margin | ✓ | ✓ | | | | | |
| admin.users / admin.settings | ✓ | | | | | | |

Enforced twice: in the app (hide/disable) and in Postgres RLS (a tampered client still cannot write what its role forbids). Approvals on a shared device are done by an approver entering their own 4-digit PIN (stored hashed in `profiles`), which stamps `override_approved_by`.

---

## J. Complete list of MVP screens

Navigation: 5 tabs on mobile (Home · Search · Sell · Stock · More); left rail on web with the same sections plus Admin.

**Auth & shell**
1. Sign in (email/password), device naming, choose default location
2. Sync status sheet (pending uploads, last sync, force sync)

**Home**
3. Dashboard (see K)

**Search (universal)**
4. Universal search — one box; result groups: Vehicles · Products/Variants · Customers · Invoices · Vehicle numbers
5. Vehicle results — compatible products grouped by family, filters (in stock, family, brand, price), "Universal" section
6. Product list / filter — family-driven filter chips from spec definitions
7. Product detail — specs, variants table (stock per location, prices), fitments, purchase history, sales history, customer's last rate (when a customer is chosen)
8. Variant comparison table

**Sell**
9. New invoice — customer picker (shows outstanding / limit / available), vehicle picker (optional), line editor with variant search/scan, rate with source + last rate, discount, GST auto, totals
10. Invoice review & post — number assigned, PDF preview, share/print
11. Invoice list (status, customer, date filters) and Invoice detail (cancel with reason, create credit note)
12. Credit note (sales return) — pick invoice lines, quantity, condition (sellable/damaged), refund/credit
13. Receive payment — customer, amount, mode, reference, allocation to invoices (auto FIFO)

**Stock**
14. Stock overview — search a SKU → per-location quantities, movement history
15. Receive purchase — supplier, supplier invoice no/date, lines (search/scan, qty, rate, discount, GST), other charges, post
16. Purchase list / detail / cancel; Purchase return (debit note)
17. Stock transfer — from/to, lines, dispatch, receive
18. Stock adjustment — location, reason, lines (± with cost), approve
19. Stock audit — sessions, count sheet, differences, close (approval)
20. Low stock list — reorder required, grouped by family; export
21. Opening stock entry (bulk grid) — used once per location during go-live

**Parties**
22. Customer list / detail (profile, ledger, invoices, payments, returns, vehicles, top products 12 months, special prices)
23. Customer form (with credit limit/period, price list, state)
24. Supplier list / detail (profile, ledger, purchases, returns, payments)
25. Supplier form
26. Pay supplier
27. Customer vehicle form (registration no, model, generation)

**Admin (web-first, usable on phone)**
28. Product families (list, create, SKU template)
29. Specification definitions per family (drag order, data type, options editor)
30. Categories & subcategories
31. Brands, Units, HSN codes, Tax rates
32. Product create/edit — the 10-step wizard from the brief (family → specs → brand → name → variants → fitment → SKU/barcode → costs → prices → min stock), collapsed into 3 pages on mobile
33. Vehicle master (makes, models, generations, variants, aliases)
34. Price lists and per-customer prices
35. Locations
36. Users & roles, permission matrix
37. Company settings (GSTIN, state, invoice format, numbering series per device)
38. Audit log viewer
39. Import (CSV/Excel) — products, variants, fitments, vehicles, customers, suppliers, opening stock

**Reports (MVP set — see L)**
40. Reports hub with the MVP reports

Phase 2 screens (schema ready): Job card list/editor/close, barcode scanning inside 9/15/19, reorder suggestions, fast/slow/dead analysis, vehicle-wise analytics.

---

## K. Dashboard design

Kept to one screen. Every tile is tappable and opens the underlying list.

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Today · Fri 12 Sep 2026                          [pending sync: 0]  │
│                                                                      │
│  SALES TODAY        PURCHASES TODAY     COLLECTED TODAY              │
│  ₹1,42,300          ₹86,000             ₹64,500                      │
│  18 invoices        3 bills             9 receipts                   │
│  cash 40% · credit 60%                                               │
│                                                                      │
│  RECEIVABLES        PAYABLES            STOCK VALUE (avg cost)       │
│  ₹9,80,400          ₹4,12,000           ₹38,60,000                   │
│  ₹2,10,000 overdue  ₹95,000 due 7d      Main 84% · Shop 12% · WS 4%  │
│                                                                      │
│  ⚠ LOW STOCK (14)          ⏰ OVERDUE CUSTOMERS (6)                   │
│  H4 LED 60W    8 / 15      XYZ Auto        ₹84,000  38 days          │
│  Creta 7D Blk  2 / 6       ABC Motors      ₹52,000  21 days          │
│  …see all                  …see all                                  │
│                                                                      │
│  FAST MOVING (30d)         DEAD STOCK (90d)                          │
│  H4 LED 60W  142 pcs       Alto 5D Mat Beige   14 pcs  ₹11,200      │
│  Creta 7D    38 sets       …                                         │
└──────────────────────────────────────────────────────────────────────┘
```

Role variants: Sales staff see Sales/Collected/Receivables + low stock; Warehouse sees Stock value per location, low stock, pending transfers, pending audits; Accounts sees receivables/payables/collections; Owner and Admin see all. Every figure is computed by local SQL, so the dashboard works offline and shows data as of last sync.

---

## L. Reports

Every report: date range, location filter, export CSV, and (on web) print. All are SQL over the synced tables, so they run on device for the business's own data.

**Inventory:** Current stock (variant × location) · Stock valuation (avg cost, last cost) · Location-wise stock · Low stock / reorder · Dead stock (configurable 30/60/90/180 days) · Stock movement ledger for a SKU · Stock audit differences

**Sales:** Daily sales register · Monthly summary · Product-wise / Variant-wise · Family/Category/Brand-wise · Customer-wise · Vehicle-wise (by fitment or by customer vehicle on invoice) · Salesperson-wise · Sales returns · GST sales summary (B2B/B2C, rate-wise, CGST/SGST/IGST) for the CA

**Purchase:** Supplier-wise · Product-wise · Monthly · Purchase price trend for a SKU · Purchase returns · GST purchase summary (input credit)

**Finance:** Customer outstanding with ageing (0-30 / 31-60 / 61-90 / 90+) · Supplier outstanding · Collections register · Payments register · Customer ledger statement (PDF, WhatsApp-ready) · Supplier ledger statement · Gross margin by invoice / product / customer (owner only)

**Workshop (Phase 2):** Job revenue · Parts consumed · Labour revenue · Vehicle-wise history

---

## M. Development phases

| Phase | Weeks | Delivers |
|---|---|---|
| **0 · Foundation** (this session) | 1 | Repo, Supabase migrations (full schema, triggers, RLS), seed (families, specs, vehicles, GST), PowerSync config, Expo app with sync + auth + schema mirror, domain package (GST, pricing, SKU) |
| **1 · Catalogue & Search** | 2 | Admin: families, specs, brands, categories, vehicles, product wizard, import. Universal search, vehicle → products, product page, comparison |
| **2 · Inventory** | 2 | Purchase receive/return, opening stock, transfers, adjustments, audit sessions, low stock, stock ledger |
| **3 · Billing & Ledger** | 2 | Invoice, credit note, payments, allocations, customer/supplier ledgers, GST PDF, numbering, price/credit control, dashboard, MVP reports |
| **4 · Hardening & go-live** | 1–2 | Data import of the real catalogue, opening balances, staff training, device series setup, EAS store builds, backups |
| **5 · Phase 2** | 3–4 | Job cards, barcode scanning, reorder suggestions, fast/slow/dead, vehicle analytics, customer analytics, vehicle socket map |
| **6 · Phase 3** | ongoing | WhatsApp sharing/reminders, e-invoice/e-way bill, B2B portal, multi-branch, accounting export |

---

## N. Potential edge cases (and the chosen handling)

**Catalogue**
- Same physical bulb sold as "9005" and "HB3": treat as one option with aliases; option aliases are searchable.
- A spec option is renamed/retired: options are never deleted; retired ones stay on old products but are hidden from new selection.
- Admin changes a spec from product-level to variant axis: allowed only when the product has one variant; otherwise the UI guides a "split into variants" action.
- SKU collision from template: append suffix, show warning; SKU is unique across the business.
- Barcode shared by two suppliers' products: barcode is unique per variant; the import flags duplicates for a decision.
- A product fits "Creta 2020-2023 except Diesel AT": model this as fitments per trim, or a note; do not build negative fitment rules in MVP.
- Universal products flooding vehicle search: collapsed "Universal" section, sorted by sales velocity.

**Inventory**
- Sale posted offline while stock was actually zero at that location (another device sold it): allowed (negative stock permitted per location with a red flag on dashboard); the owner sees "negative stock" list; a transfer or adjustment fixes it. Blocking sales offline would stop the business.
- Sellable vs damaged returns: a `Damaged/Returns` pseudo-location keeps damaged stock out of sellable counts but inside valuation.
- Transfer dispatched but never received: shows as in-transit; warehouse can "receive on behalf" with permission.
- Audit counting while sales continue: system_qty is snapshotted; differences are computed against the snapshot; adjustments apply the *difference*, so concurrent sales stay correct.
- Serial-tracked items (Android screens): `serial_no` on movement rows; MVP records it, Phase 2 enforces uniqueness per unit.
- Decimal units (wire by metre): `units.allow_decimal`; the qty input respects it.

**Money & GST**
- Customer changes state after invoices exist: place of supply is frozen per invoice; profile change affects only future ones.
- Financial year rollover: series reset on 1 April, previous year still queryable.
- Round-off differences: stored explicitly; grand total rounded to the rupee (configurable to paise).
- Payment received before invoice (advance): allowed; unallocated credit shows on the customer; auto-allocates to the next invoice unless told otherwise.
- Partial payment across many invoices: FIFO auto-allocation, editable.
- Cheque bounce: reverse the payment (reversal entry), not delete.
- Invoice printed then a mistake found: cancel (same day, before dispatch) or credit note (after).
- Credit note bigger than invoice: blocked.
- Tax rate changes by government: new `tax_rates` row with `effective_from`; old invoices keep frozen rates.

**Sync & devices**
- Two devices bill the same customer offline and both exceed the credit limit: both post; server flags; owner dashboard shows it. No silent rejection.
- Device lost: admin deactivates the device row and user; its numbering series is closed; JWT expires; the next-number gap is documented in the audit log.
- Clock skew on a phone: `occurred_at` is device time, `created_at` server time; reports use `doc_date` chosen by the user, never device clock alone.
- Very first sync on a new phone (full download of catalogue): shows a progress screen; app is usable once master data has arrived, transactions stream in after.
- Draft invoice edited on two devices: last write wins; only drafts, never posted docs.
- Same product imported twice: import is idempotent on SKU; second run updates.

**People**
- Salesperson gives a rate below floor: blocked without approver PIN; logged.
- Staff tries to delete an invoice: no delete anywhere; only cancel with reason and permission.
- Shared tablet at counter: fast user switch with PIN, actions still attributed correctly.

---

## O. Data migration / import strategy

1. **Templates.** Excel templates (one sheet per entity) with the exact column headers the importer expects: `brands`, `vehicle_models` (make, model, generation, year_from, year_to), `products` (family_code, category, subcategory, brand, name, hsn, gst_rate, product-level spec columns), `variants` (product_ref, axis spec columns, sku, barcode, mrp, retail, dealer, wholesale, min_stock), `fitments` (sku or product_ref, make, model, generation, year_from, year_to), `customers`, `suppliers`, `opening_stock` (sku, location, qty, unit_cost), `opening_balances` (party, amount, as_of).
2. **Order.** families/specs (seeded) → brands → categories → vehicles → products → variants → fitments → customers/suppliers → customer prices → opening stock → opening balances.
3. **Validation before write.** The importer (runs in the app, on web) parses the sheet, validates every row with `zod` against live master data (unknown brand, unknown option value "H-4", duplicate SKU, missing required spec), and shows a review grid: green rows import, red rows explain the fix. Nothing is written until the user confirms.
4. **Spec columns by header.** A column named `socket` maps to the spec with code `socket`; values are matched to option labels/aliases case-insensitively. Unknown values can be auto-created as options with one click if the user has `catalog.edit`.
5. **Opening stock = movements.** Each row becomes an `opening` movement with `unit_cost`, which also sets `avg_cost` and `last_purchase_cost`. Opening balances become a single `ledger_entries` row per party dated `as_of`.
6. **Idempotent.** Re-importing the same file updates by SKU / customer code; it never duplicates.
7. **From an existing system (Tally/Busy/Excel).** Export their item master and ledger balances to the templates; the SKU column can be their item code initially so staff recognise it; auto-generated SKUs can be adopted family by family later.
8. **Go-live cut-over.** Freeze old system at close of business → import opening stock and balances dated that day → verify totals (stock value, receivables, payables) match the old system → start billing next morning.

---

## P. Exact implementation order

This is the order of work, each step producing something runnable and tested.

1. ✅ Repo layout: `app/` (Expo), `supabase/` (migrations, seed), `powersync/` (sync rules, local docker), `packages/domain` (pure TS logic), `docs/`.
2. ✅ Migration 0001: extensions, helper functions (uuid v7, updated_at, current role), company/app settings, profiles, roles, permissions, devices, locations, units.
3. ✅ Migration 0002: catalogue — families, spec definitions, spec options, categories, brands, HSN, tax rates, products, variants, spec values, images.
4. ✅ Migration 0003: vehicles — makes, models, aliases, generations, variants, fitments, vehicle spec map.
5. ✅ Migration 0004: parties and pricing — price lists, customers, suppliers, customer prices, customer vehicles, supplier products.
6. ✅ Migration 0005: inventory — movements, levels, adjustments, transfers, audits, views.
7. ✅ Migration 0006: documents — sequences, sales invoices/lines, purchases/lines, payments, allocations, ledger entries, party balances, job cards.
8. ✅ Migration 0007: triggers — stock_levels maintenance, party_balances, avg cost update, search_text rebuild, audit log, immutability guards, movement idempotency.
9. ✅ Migration 0008: RLS policies driven by `role_permissions`; PowerSync replication role and publication.
10. ✅ Seed: 20 families with full spec templates and options, units, HSN, GST slabs, locations, price lists, ~60 Indian vehicle models with generations and aliases, sample brands/products/variants/fitments, sample customers/suppliers, admin user.
11. ✅ PowerSync `sync_rules.yaml` + local `docker-compose.powersync.yml`.
12. ✅ `packages/domain`: GST split, invoice totals, price resolution, SKU template rendering, variant naming, credit check, numbering — with unit tests.
13. ✅ App foundation: PowerSync schema mirror of every synced table, Supabase connector (auth + upload with upsert), sync status, sign-in, tab navigation, theme.
14. ✅ Universal search + vehicle results + product detail (read paths that prove the model).
15. ✅ Admin: families/specs editor, product wizard, vehicle master, masters, parties, settings, users, CSV import. (Phase 1)
16. ✅ Purchase receive/return, opening stock, transfers, adjustments, audit sessions, stock ledger, supplier payments. (Phase 2)
17. ✅ Invoice, credit note, receipts with allocation, cancellation with reversals, GST PDF, reports hub. Posting engine covered by 19 SQLite-backed tests. (Phase 3)
18. ⏳ Go-live: real catalogue import, staff accounts, EAS builds, cloud Supabase + PowerSync Cloud. (Phase 4)

See `docs/STATUS.md` for what is implemented and how to run it.
