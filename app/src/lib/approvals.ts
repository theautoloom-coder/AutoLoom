/**
 * Approving staff stock entries from the queue itself (owner, 10 Oct 2026:
 * "yahin bahar button aa jaye approve karne ka; Approve all aur Reject all ka
 * bulk button upar hi de do").
 *
 * The same posting the full approval screen does — a correction posts as a
 * correction — so an entry approved from the list and one approved from its
 * own screen are the same rows.
 */
import type { Transaction } from '@powersync/react-native';

import { postCorrection, postPurchase } from './posting';
import { updateRow, type Actor } from './writes';

type Exec = Pick<Transaction, 'execute'>;

async function rows<T>(tx: Exec, sql: string, params: unknown[]): Promise<T[]> {
  const r = await tx.execute(sql, params);
  return (r.rows?._array ?? []) as T[];
}

/** What stands between this entry and approval, if anything. */
export async function entryProblem(tx: Exec, id: string): Promise<string | null> {
  const [p] = await rows<{ status: string; supplier_id: string | null }>(tx, 'SELECT status, supplier_id FROM purchases WHERE id = ?', [id]);
  if (!p) return 'Entry nahi mili';
  if (p.status !== 'draft') return 'Iska faisla ho chuka hai';
  if (!p.supplier_id) return 'Supplier nahi chuna';
  const lines = await rows<{ qty: number }>(tx, 'SELECT qty FROM purchase_lines WHERE purchase_id = ?', [id]);
  if (!lines.length) return 'Koi maal nahi';
  if (lines.some((l) => !l.qty || l.qty <= 0)) return 'Kisi line mein qty nahi';
  return null;
}

/**
 * Lines with no buy rate take the kism's last known one. A staff member never
 * types a rate, so without this a bulk approval would put every entry on the
 * supplier's khata at ₹0. Returns how many lines still have none.
 */
export async function fillKnownRates(tx: Exec, id: string): Promise<number> {
  const lines = await rows<{ id: string; rate: number; known: number }>(tx,
    `SELECT l.id, l.rate, COALESCE(NULLIF(pv.last_purchase_cost, 0), pv.avg_cost, 0) AS known
       FROM purchase_lines l JOIN product_variants pv ON pv.id = l.variant_id WHERE l.purchase_id = ?`, [id]);
  let left = 0;
  for (const l of lines) {
    if (l.rate > 0) continue;
    if (l.known > 0) await updateRow(tx, 'purchase_lines', l.id, { rate: l.known });
    else left += 1;
  }
  return left;
}

/** Approve one waiting entry. Returns its number. */
export async function approveEntry(tx: Transaction, id: string, actor: Actor, opts: { fillRates?: boolean } = {}): Promise<string> {
  const bad = await entryProblem(tx, id);
  if (bad) throw new Error(bad);
  if (opts.fillRates) await fillKnownRates(tx, id);
  const [p] = await rows<{ corrects_purchase_id: string | null }>(tx, 'SELECT corrects_purchase_id FROM purchases WHERE id = ?', [id]);
  return p?.corrects_purchase_id ? postCorrection(tx, id, actor) : postPurchase(tx, id, actor);
}

/** Refuse one waiting entry, keeping it with the reason for the staff member. */
export async function refuseEntry(tx: Exec, id: string, reason: string, actor: Actor): Promise<void> {
  await updateRow(tx, 'purchases', id, {
    status: 'cancelled', cancel_reason: reason.trim(), cancelled_at: new Date().toISOString(), cancelled_by: actor.userId,
  });
}

/** For the confirm: pieces, value at known rates, and lines with no rate anywhere. */
export async function queueSummary(tx: Exec, ids: string[]): Promise<{ pcs: number; value: number; unpriced: number }> {
  if (!ids.length) return { pcs: 0, value: 0, unpriced: 0 };
  const marks = ids.map(() => '?').join(',');
  const [r] = await rows<{ pcs: number; value: number; unpriced: number }>(tx,
    `SELECT COALESCE(SUM(l.qty), 0) AS pcs,
            COALESCE(SUM(l.qty * CASE WHEN l.rate > 0 THEN l.rate ELSE COALESCE(NULLIF(pv.last_purchase_cost, 0), pv.avg_cost, 0) END), 0) AS value,
            COALESCE(SUM(CASE WHEN l.rate > 0 OR COALESCE(NULLIF(pv.last_purchase_cost, 0), pv.avg_cost, 0) > 0 THEN 0 ELSE 1 END), 0) AS unpriced
       FROM purchase_lines l JOIN product_variants pv ON pv.id = l.variant_id WHERE l.purchase_id IN (${marks})`, ids);
  return r ?? { pcs: 0, value: 0, unpriced: 0 };
}
