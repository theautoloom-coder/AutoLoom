# AutoLoom

Inventory, billing and customer ledger software for an Indian auto accessories, car modification and B2B distribution business (Noida, UP).

A product here is not "LED Bulb — 100 pcs". It is *XYZ LED Bulb → H4 → 60W → 6500K → CANBUS → SKU → fits Swift 2018–23 → 25 in Main Warehouse, 4 in Shop → last bought ₹1,200 → dealer price ₹1,650 → this customer last paid ₹1,550.*

## Layout

```
app/                Expo app (Android, iOS, web) — Expo Router, PowerSync, Supabase
packages/domain/    Pure TypeScript business rules (GST, pricing, SKU, fitment, stock) + tests
supabase/           Postgres migrations and seed data (families, specs, vehicles, sample catalogue)
powersync/          Sync rules and local PowerSync service
scripts/            Schema generator
docs/               ARCHITECTURE.md (design), STATUS.md (what is built, how to run)
```

## Start here

- Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Running it and current status: [docs/STATUS.md](docs/STATUS.md)

## Principles

Complex data structure underneath, simple interface on top. Stock and money are derived from append-only events so offline devices merge safely. Product families and their specifications are data, not code.
