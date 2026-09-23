# scripts

`gen-schema.py` regenerates `app/src/lib/schema.ts` from the live local
Postgres. Run after any migration change:

    supabase db reset
    python scripts/gen-schema.py
