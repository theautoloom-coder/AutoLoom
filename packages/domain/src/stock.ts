/**
 * Stock movement rules.
 *
 * Stock is never a column that gets edited. Every business event appends a
 * signed movement row, and the quantity on hand is their sum. That is what
 * makes two offline devices safe to merge: appends never conflict.
 */

import { round } from './money';

export type MovementType =
  | 'opening'
  | 'purchase'
  | 'purchase_return'
  | 'sale'
  | 'sale_return'
  | 'damage'
  | 'adjustment'
  | 'transfer_out'
  | 'transfer_in'
  | 'job_consumption'
  | 'free_issue'
  | 'reservation'
  | 'reservation_release'
  | 'cancel_reversal';

/** Sign that each movement type must carry. 0 means either sign is valid. */
const SIGNS: Record<MovementType, -1 | 0 | 1> = {
  opening: 1,
  purchase: 1,
  purchase_return: -1,
  sale: -1,
  sale_return: 1,
  damage: -1,
  adjustment: 0,
  transfer_out: -1,
  transfer_in: 1,
  job_consumption: -1,
  free_issue: -1,
  reservation: 0,
  reservation_release: 0,
  cancel_reversal: 0,
};

export type MovementDraft = {
  variant_id: string;
  location_id: string;
  qty: number;
  movement_type: MovementType;
  ref_type?: string | null;
  ref_id?: string | null;
  ref_line_id?: string | null;
  unit_cost?: number;
  batch_no?: string | null;
  serial_no?: string | null;
  note?: string | null;
};

/** Apply the required sign to a positive quantity the user entered. */
export function signedQty(type: MovementType, qty: number): number {
  const sign = SIGNS[type];
  const magnitude = Math.abs(qty);
  if (sign === 0) return qty;
  return round(sign * magnitude, 3);
}

/** Human label for the stock ledger screen. */
export function movementLabel(type: MovementType): string {
  const labels: Record<MovementType, string> = {
    opening: 'Opening stock',
    purchase: 'Purchase',
    purchase_return: 'Purchase return',
    sale: 'Sale',
    sale_return: 'Sales return',
    damage: 'Damage',
    adjustment: 'Adjustment',
    transfer_out: 'Transfer out',
    transfer_in: 'Transfer in',
    job_consumption: 'Used on job card',
    free_issue: 'Free issue',
    reservation: 'Reserved',
    reservation_release: 'Reservation released',
    cancel_reversal: 'Cancellation reversal',
  };
  return labels[type];
}

/** Quantity on hand from a movement list. */
export function stockOnHand(movements: Array<{ qty: number }>): number {
  return round(movements.reduce((a, m) => a + m.qty, 0), 3);
}

/**
 * Moving weighted average cost after receiving stock.
 * Mirrors the Postgres trigger so the app can preview the new cost.
 */
export function newAverageCost(args: {
  currentQty: number;
  currentAvg: number;
  receivedQty: number;
  receivedCost: number;
}): number {
  const { currentQty, currentAvg, receivedQty, receivedCost } = args;
  if (currentQty <= 0) return round(receivedCost, 4);
  const total = currentQty + receivedQty;
  if (total <= 0) return round(receivedCost, 4);
  return round((currentQty * currentAvg + receivedQty * receivedCost) / total, 4);
}

/**
 * Reversal rows for cancelling a posted document. Each row exactly negates one
 * original movement and points back at it, so the audit trail is complete and
 * the original row is never touched.
 */
export function reversalMovements(
  originals: Array<MovementDraft & { id: string }>,
  refType: string,
  refId: string
): Array<MovementDraft & { reversal_of_id: string }> {
  return originals.map((m) => ({
    variant_id: m.variant_id,
    location_id: m.location_id,
    qty: round(-m.qty, 3),
    movement_type: 'cancel_reversal' as const,
    ref_type: refType,
    ref_id: refId,
    ref_line_id: m.ref_line_id ?? null,
    unit_cost: m.unit_cost ?? 0,
    reversal_of_id: m.id,
    note: 'Reversal of cancelled document',
  }));
}

export type StockStatus = 'out' | 'low' | 'ok';

/** Traffic light for a SKU on the stock and search screens. */
export function stockStatus(qty: number, minStock: number, reorderLevel: number): StockStatus {
  if (qty <= 0) return 'out';
  if (qty <= Math.max(minStock, reorderLevel)) return 'low';
  return 'ok';
}

/**
 * Suggested purchase quantity from recent sales velocity.
 * Used by the reorder report; deliberately simple and explainable.
 */
export function suggestedReorderQty(args: {
  soldQty: number;
  overDays: number;
  currentQty: number;
  coverDays?: number;
  reorderQty?: number;
}): number {
  const { soldQty, overDays, currentQty, coverDays = 30, reorderQty = 0 } = args;
  if (overDays <= 0) return reorderQty;
  const perDay = soldQty / overDays;
  const target = perDay * coverDays;
  const needed = Math.ceil(target - currentQty);
  return Math.max(needed, reorderQty, 0);
}

export type MovementClass = 'fast' | 'medium' | 'slow' | 'dead';

/** Classify a SKU from its recent sales, for the fast/slow/dead report. */
export function movementClass(args: {
  soldQty: number;
  overDays: number;
  currentQty: number;
  deadDays: number;
  daysSinceLastSale: number | null;
}): MovementClass {
  const { soldQty, overDays, currentQty, deadDays, daysSinceLastSale } = args;

  if (daysSinceLastSale == null || daysSinceLastSale >= deadDays) {
    return currentQty > 0 ? 'dead' : 'slow';
  }
  if (overDays <= 0) return 'slow';

  const perDay = soldQty / overDays;
  const daysOfCover = perDay > 0 ? currentQty / perDay : Number.POSITIVE_INFINITY;

  if (daysOfCover < 30) return 'fast';
  if (daysOfCover < 90) return 'medium';
  return 'slow';
}
