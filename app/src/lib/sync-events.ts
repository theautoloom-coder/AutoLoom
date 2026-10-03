/**
 * When the server refuses an entry, the person who made it hears about it.
 *
 * The sync drops a transaction it cannot apply and moves the queue on, which
 * is the right thing for the queue and was the wrong thing for the shop: the
 * entry had already been shown as saved, and the only trace of the refusal was
 * a console line and a list on the Sync screen nobody opens. That is how a new
 * supplier, a purchase, and every count from a godown hand could each vanish
 * with nothing on screen to say so — and how three of those were only found
 * over USB, reading logcat.
 *
 * lib cannot import ui without a cycle (ui reads the session, which reads the
 * system, which owns the connector), so the connector announces the failure
 * here and the root layout, which can see both, turns it into a toast.
 */
export type Rejection = { table: string; id: string; op: string; code: string | null; message: string; at: string };

type Listener = (r: Rejection) => void;
const listeners = new Set<Listener>();

export function onSyncRejected(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function announceRejection(r: Rejection): void {
  for (const fn of listeners) {
    try { fn(r); } catch { /* a broken listener must not stop the sync */ }
  }
}

/** What the thing was, in the shop's words. */
const WHAT: Record<string, string> = {
  suppliers: 'Supplier',
  customers: 'Grahak',
  customer_vehicles: 'Grahak ki gaadi',
  sales_invoices: 'Bill',
  sales_invoice_lines: 'Bill ki line',
  purchases: 'Stock chadhane ki entry',
  purchase_lines: 'Stock chadhane ki line',
  expenses: 'Kharcha',
  payments: 'Payment',
  payment_allocations: 'Payment',
  stock_adjustments: 'Stock sudhar',
  stock_adjustment_lines: 'Stock sudhar ki line',
  stock_transfers: 'Transfer',
  stock_transfer_lines: 'Transfer ki line',
  products: 'Item',
  product_variants: 'Item',
  product_images: 'Photo',
  change_requests: 'Request',
};

/** Why, in words a counter hand can act on — Postgres codes mean nothing to them. */
function why(code: string | null): string {
  switch (code) {
    case '23502': return 'ek zaroori cheez khaali reh gayi thi';
    case '22007':
    case '22008': return 'tareekh galat thi';
    case '42501': return 'aapke paas iska haq nahi hai';
    case '23505': return 'yeh pehle se bana hua hai';
    case '23503': return 'jisse yeh juda tha woh server par nahi mila';
    case '23514': return 'ek value sahi nahi thi';
    default: return 'server ne mana kar diya';
  }
}

export function describeRejection(r: Rejection): string {
  const what = WHAT[r.table] ?? r.table;
  return `${what} save nahi hua — ${why(r.code)}. Dobara karke dekho; phir bhi na ho to owner ko batao.`;
}
