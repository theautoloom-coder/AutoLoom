"""Regenerate app/src/lib/schema.ts from the live local Postgres publication."""
import json, os, subprocess

SQL = """
select json_agg(t) from (
  select c.table_name,
         json_agg(json_build_object('name', c.column_name, 'type', c.data_type) order by c.ordinal_position) as cols
  from information_schema.columns c
  join pg_publication_tables p on p.tablename = c.table_name and p.schemaname='public' and p.pubname='powersync'
  where c.table_schema='public' and c.column_name <> 'id'
  group by c.table_name order by c.table_name
) t;
"""
raw = subprocess.check_output(
    ['docker', 'exec', 'supabase_db_Autogrid', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', SQL],
    text=True,
)
tables = json.loads(raw)

def col(t):
    if t in ('integer', 'bigint', 'smallint', 'boolean'): return 'column.integer'
    if t in ('numeric', 'real', 'double precision'): return 'column.real'
    return 'column.text'

INDEXES = {
  'product_variants': {'product': ['product_id'], 'sku': ['sku'], 'barcode': ['barcode']},
  'spec_values': {'product': ['product_id'], 'variant': ['variant_id'], 'def': ['spec_definition_id']},
  'spec_definitions': {'family': ['family_id']},
  'spec_options': {'def': ['spec_definition_id']},
  'products': {'family': ['family_id'], 'brand': ['brand_id']},
  'product_fitments': {'product': ['product_id'], 'model': ['model_id'], 'variant': ['variant_id']},
  'vehicle_generations': {'model': ['model_id']},
  'vehicle_models': {'make': ['make_id']},
  'vehicle_model_aliases': {'model': ['model_id']},
  'vehicle_spec_map': {'gen': ['generation_id']},
  'stock_movements': {'variant_loc': ['variant_id', 'location_id'], 'ref': ['ref_type', 'ref_id']},
  'stock_levels': {'variant': ['variant_id']},
  'sales_invoices': {'customer': ['customer_id'], 'date': ['doc_date'], 'status': ['status']},
  'sales_invoice_lines': {'invoice': ['invoice_id'], 'variant': ['variant_id']},
  'purchases': {'supplier': ['supplier_id'], 'date': ['doc_date']},
  'purchase_lines': {'purchase': ['purchase_id'], 'variant': ['variant_id']},
  'payments': {'party': ['party_type', 'party_id']},
  'payment_allocations': {'payment': ['payment_id'], 'doc': ['doc_id']},
  'ledger_entries': {'party': ['party_type', 'party_id']},
  'party_balances': {'party': ['party_type', 'party_id']},
  'customers': {'mobile': ['mobile'], 'code': ['code']},
  'customer_prices': {'customer': ['customer_id'], 'variant': ['variant_id']},
  'customer_vehicles': {'customer': ['customer_id'], 'reg': ['registration_no']},
  'price_list_items': {'list': ['price_list_id'], 'variant': ['variant_id']},
  'stock_adjustment_lines': {'adj': ['adjustment_id']},
  'stock_transfer_lines': {'transfer': ['transfer_id']},
  'stock_audit_lines': {'audit': ['audit_id']},
  'job_cards': {'customer': ['customer_id']},
  'job_card_lines': {'job': ['job_card_id']},
  'job_card_labour': {'job': ['job_card_id']},
  'categories': {'parent': ['parent_id']},
  'document_sequences': {'series': ['series_code', 'doc_type', 'financial_year']},
}

out = ["""/**
 * PowerSync client schema.
 *
 * GENERATED from the Postgres `powersync` publication by scripts/gen-schema.py.
 * Do not hand-edit: change the migration, run `supabase db reset`, regenerate.
 *
 * Type mapping: uuid/text/date/timestamptz/jsonb -> text,
 *               integer/boolean -> integer (booleans are 1/0),
 *               numeric -> real.
 */
import { column, Schema, Table } from '@powersync/common';
"""]
for t in tables:
    name = t['table_name']
    out.append(f"export const {name} = new Table(\n  {{")
    for c in t['cols']:
        out.append(f"    {c['name']}: {col(c['type'])},")
    out.append("  },")
    idx = INDEXES.get(name)
    if idx:
        parts = ', '.join(f"{k}: [{', '.join(repr(x) for x in v)}]" for k, v in idx.items())
        out.append(f"  {{ indexes: {{ {parts} }} }}")
    else:
        out.append("  {}")
    out.append(");\n")
out.append("export const AppSchema = new Schema({")
for t in tables:
    out.append(f"  {t['table_name']},")
out.append("});\n")
out.append("export type Database = (typeof AppSchema)['types'];")
for t in tables:
    n = t['table_name']
    pascal = ''.join(p.capitalize() for p in n.split('_'))
    out.append(f"export type {pascal}Row = Database['{n}'];")

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dest = os.path.join(root, 'app', 'src', 'lib', 'schema.ts')
os.makedirs(os.path.dirname(dest), exist_ok=True)
open(dest, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(len(tables), 'tables ->', dest)
