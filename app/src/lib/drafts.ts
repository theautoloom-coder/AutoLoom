/**
 * Screens that make their draft the moment they open, so there is something
 * to write lines into, leave that draft behind when the person backs out
 * without adding anything. Every visit to Transfer, Purchase or Adjustment did
 * it; production had empty "Draft · 0 lines" transfers from weeks back sitting
 * at the top of the list.
 *
 * `useDropEmptyDraft` hands back a function to call with the new draft's id.
 * When the screen goes, it asks the DATABASE — not the screen's query, which
 * answers [] while its first read is still running — whether that draft is
 * still a draft with no lines, and only then deletes it. A draft opened from a
 * list (?id=) is never registered, so it is never touched.
 */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback, useEffect, useRef } from 'react';

import { deleteRow } from './writes';

type DraftTable = 'sales_invoices' | 'purchases' | 'stock_transfers' | 'stock_adjustments';

const LINES: Record<DraftTable, { table: string; fk: string }> = {
  sales_invoices: { table: 'sales_invoice_lines', fk: 'invoice_id' },
  purchases: { table: 'purchase_lines', fk: 'purchase_id' },
  stock_transfers: { table: 'stock_transfer_lines', fk: 'transfer_id' },
  stock_adjustments: { table: 'stock_adjustment_lines', fk: 'adjustment_id' },
};

export function useDropEmptyDraft(db: AbstractPowerSyncDatabase, table: DraftTable): (id: string) => void {
  const created = useRef<string | null>(null);
  useEffect(() => () => {
    const id = created.current;
    if (!id) return;
    const lines = LINES[table];
    db.writeTransaction(async (tx) => {
      const r = await tx.execute(
        `SELECT (SELECT status FROM ${table} WHERE id = ?1) AS status,
                (SELECT COUNT(*) FROM ${lines.table} WHERE ${lines.fk} = ?1) AS n`, [id]);
      const row = r.rows?._array?.[0] as { status: string | null; n: number } | undefined;
      if (row?.status === 'draft' && Number(row.n) === 0) await deleteRow(tx, table, id);
    }).catch(() => {});
  }, [db, table]);
  return useCallback((id: string) => { created.current = id; }, []);
}
