/**
 * Writing rows to the local database.
 *
 * Every insert gets a client-generated UUID v7, timestamps, and the user and
 * device that made it. Multi-row business actions run inside one
 * writeTransaction so they upload to the server as one unit.
 */
import type { AbstractPowerSyncDatabase, Transaction } from '@powersync/react-native';

import { uuidv7 } from '@domain';

export type Actor = { userId: string | null; deviceId: string | null };

type Scalar = string | number | boolean | null | undefined;
export type RowInput = Record<string, Scalar>;

/** SQLite has no booleans: store 1/0. Undefined becomes NULL. */
function toParam(v: Scalar, column?: string): string | number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  // An empty string is never a valid uuid; Postgres would reject the whole upload.
  if (v === '' && column && (column === 'id' || column.endsWith('_id') || column.endsWith('_by'))) return null;
  return v;
}

type Executor = Pick<AbstractPowerSyncDatabase, 'execute'> | Transaction;

const NO_AUDIT_COLUMNS = new Set(['app_settings', 'audit_logs', 'ledger_entries', 'stock_movements', 'spec_values', 'product_images', 'stock_levels', 'party_balances']);

/** Tables whose rows have created_by / device_id columns. */
function hasActorColumns(table: string): boolean {
  return [
    'products', 'product_variants', 'product_fitments', 'price_list_items', 'customers', 'customer_prices', 'suppliers',
    'customer_vehicles', 'stock_movements', 'stock_adjustments', 'stock_transfers', 'stock_audits', 'sales_invoices',
    'purchases', 'payments', 'ledger_entries', 'job_cards',
  ].includes(table);
}

export async function insertRow(ex: Executor, table: string, row: RowInput, actor?: Actor): Promise<string> {
  const id = (row.id as string | undefined) ?? uuidv7();
  const now = new Date().toISOString();
  const full: RowInput = { ...row, id };
  if (!NO_AUDIT_COLUMNS.has(table) || table === 'spec_values' || table === 'product_images') {
    if (!('created_at' in full)) full.created_at = now;
    if (!('updated_at' in full) && table !== 'stock_movements' && table !== 'ledger_entries' && table !== 'audit_logs') full.updated_at = now;
  }
  if (table === 'stock_movements' || table === 'ledger_entries') {
    if (!('created_at' in full)) full.created_at = now;
  }
  if (actor && hasActorColumns(table)) {
    if (!('created_by' in full)) full.created_by = actor.userId;
    if (!('device_id' in full)) full.device_id = actor.deviceId;
  }

  const cols = Object.keys(full);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  await ex.execute(sql, cols.map((c) => toParam(full[c], c)));
  return id;
}

export async function updateRow(ex: Executor, table: string, id: string, patch: RowInput): Promise<void> {
  const full: RowInput = { ...patch };
  if (!NO_AUDIT_COLUMNS.has(table) || table === 'spec_values') full.updated_at = new Date().toISOString();
  const cols = Object.keys(full);
  if (cols.length === 0) return;
  const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
  await ex.execute(sql, [...cols.map((c) => toParam(full[c], c)), id]);
}

export async function deleteRow(ex: Executor, table: string, id: string): Promise<void> {
  await ex.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

/** Upsert keyed on id: insert when missing, otherwise patch. */
export async function upsertRow(ex: Executor, table: string, id: string | null | undefined, row: RowInput, actor?: Actor): Promise<string> {
  if (!id) return insertRow(ex, table, row, actor);
  const exists = await ex.execute(`SELECT 1 FROM ${table} WHERE id = ?`, [id]);
  if (exists.rows?.length) {
    await updateRow(ex, table, id, row);
    return id;
  }
  return insertRow(ex, table, { ...row, id }, actor);
}

/** Lowercased, whitespace-collapsed search text for a set of fields. */
export function searchText(...parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((p) => p !== null && p !== undefined && String(p).trim() !== '')
    .map((p) => String(p).toLowerCase())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Next code in a series like C0001 -> C0002, from the current max. */
export function nextCode(prefix: string, currentMax: string | null | undefined, width = 4): string {
  const n = currentMax && currentMax.startsWith(prefix) ? parseInt(currentMax.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(width, '0')}`;
}
