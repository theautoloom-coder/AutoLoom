/**
 * Posting: the one place that turns a draft document into stock movements,
 * ledger entries and a document number.
 *
 * Every function here runs inside a caller-supplied transaction, so a posted
 * purchase and its movements and ledger row leave the device as one unit.
 * Nothing here ever edits a quantity or a balance directly.
 */
import type { Transaction } from '@powersync/react-native';

import {
  allocateFifo,
  computeDocument,
  computeLine,
  financialYear,
  formatDocNo,
  landedCosts,
  newAverageCost,
  round,
  toDateString,
  uuidv7,
  type LineTax,
} from '@domain';

import { insertRow, updateRow, type Actor } from './writes';

type DocType = 'sales_invoice' | 'credit_note' | 'purchase' | 'debit_note' | 'payment_in' | 'payment_out' | 'stock_adjustment' | 'stock_transfer' | 'stock_audit' | 'job_card';

async function one<T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await tx.execute(sql, params as (string | number | null)[]);
  return (r.rows?._array?.[0] as T) ?? null;
}
async function all<T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await tx.execute(sql, params as (string | number | null)[]);
  return (r.rows?._array as T[]) ?? [];
}

// -----------------------------------------------------------------------------
// Numbering
// -----------------------------------------------------------------------------

/**
 * Allocate the next document number for this device.
 *
 * Prefers a series owned by this device; falls back to an unowned series of
 * the same type; if the financial year has rolled over, clones the most
 * recent series for the new year with its counter reset. Two devices never
 * share an owned series, so offline numbering cannot collide.
 */
export async function allocateDocNo(tx: Transaction, docType: DocType, deviceId: string | null, date = new Date()): Promise<string> {
  const company = await one<{ fy_start_month: number }>(tx, 'SELECT fy_start_month FROM company_settings LIMIT 1');
  const fy = financialYear(date, company?.fy_start_month ?? 4);

  type Seq = { id: string; series_code: string; prefix: string; next_number: number; pad_width: number; owner_device_id: string | null; financial_year: string; location_id: string | null };
  let seq = await one<Seq>(
    tx,
    `SELECT * FROM document_sequences WHERE doc_type = ? AND financial_year = ?
     ORDER BY CASE WHEN owner_device_id = ? THEN 0 WHEN owner_device_id IS NULL THEN 1 ELSE 2 END, series_code LIMIT 1`,
    [docType, fy, deviceId ?? '']
  );
  if (seq && seq.owner_device_id && seq.owner_device_id !== deviceId) seq = null;

  if (!seq) {
    // New financial year (or first document of this type): clone the latest series pattern.
    const last = await one<Seq>(tx, 'SELECT * FROM document_sequences WHERE doc_type = ? ORDER BY financial_year DESC, series_code LIMIT 1', [docType]);
    const prefix = last ? last.prefix.replace(last.financial_year, fy) : `${docType.toUpperCase().slice(0, 3)}/${fy}/`;
    const id = await insertRow(tx, 'document_sequences', {
      series_code: last?.series_code ?? 'A',
      doc_type: docType,
      financial_year: fy,
      prefix,
      next_number: 1,
      pad_width: last?.pad_width ?? 4,
      location_id: last?.location_id ?? null,
      owner_device_id: null,
    });
    seq = { id, series_code: last?.series_code ?? 'A', prefix, next_number: 1, pad_width: last?.pad_width ?? 4, owner_device_id: null, financial_year: fy, location_id: null };
  }

  const docNo = formatDocNo(seq);
  await updateRow(tx, 'document_sequences', seq.id, { next_number: seq.next_number + 1 });
  return docNo;
}

// -----------------------------------------------------------------------------
// Line totals
// -----------------------------------------------------------------------------
export type DraftLine = {
  id: string;
  variant_id: string;
  description: string;
  hsn_code: string | null;
  qty: number;
  unit_code: string | null;
  rate: number;
  discount_pct: number;
  discount_amt: number;
  tax_rate_pct: number;
  mrp?: number | null;
  batch_no?: string | null;
  warranty_months?: number | null;
  against_line_id?: string | null;
};

export function totalLines(lines: DraftLine[], interstate: boolean, otherCharges = 0, roundToRupee = true) {
  const taxed: LineTax[] = lines.map((l) => computeLine({ qty: l.qty, rate: l.rate, discount_pct: l.discount_pct, discount_amt: l.discount_amt, tax_rate_pct: l.tax_rate_pct }, interstate));
  const totals = computeDocument(taxed, { otherCharges, roundToRupee });
  const landed = landedCosts(lines.map((l, i) => ({ qty: l.qty, taxable_value: taxed[i].taxable_value })), otherCharges);
  return { taxed, totals, landed };
}

// -----------------------------------------------------------------------------
// Purchases
// -----------------------------------------------------------------------------
export async function postPurchase(tx: Transaction, purchaseId: string, actor: Actor): Promise<string> {
  const p = await one<{ id: string; doc_type: 'purchase' | 'debit_note'; status: string; supplier_id: string; location_id: string; is_interstate: number; other_charges: number; doc_date: string; against_purchase_id: string | null }>(
    tx, 'SELECT * FROM purchases WHERE id = ?', [purchaseId]);
  if (!p) throw new Error('Purchase not found');
  if (p.status !== 'draft') throw new Error('Only a draft can be posted');

  const lines = await all<DraftLine & { landed_unit_cost: number }>(tx, 'SELECT * FROM purchase_lines WHERE purchase_id = ? ORDER BY line_no', [purchaseId]);
  if (lines.length === 0) throw new Error('Add at least one line');

  const company = await one<{ round_to_rupee: number }>(tx, 'SELECT round_to_rupee FROM company_settings LIMIT 1');
  const { taxed, totals, landed } = totalLines(lines, !!p.is_interstate, p.other_charges, company?.round_to_rupee !== 0);

  const docNo = await allocateDocNo(tx, p.doc_type === 'purchase' ? 'purchase' : 'debit_note', actor.deviceId, new Date(p.doc_date));
  const now = new Date().toISOString();
  const sign = p.doc_type === 'purchase' ? 1 : -1;

  for (const [i, l] of lines.entries()) {
    const tl = taxed[i];
    await updateRow(tx, 'purchase_lines', l.id, {
      taxable_value: tl.taxable_value, cgst: tl.cgst, sgst: tl.sgst, igst: tl.igst, line_total: tl.line_total, landed_unit_cost: landed[i],
    });
    // Read the on-hand quantity and average BEFORE this receipt lands, exactly as the server trigger does.
    const before = await one<{ avg_cost: number; qty: number }>(tx, 'SELECT pv.avg_cost, COALESCE((SELECT SUM(qty) FROM stock_on_hand WHERE variant_id = pv.id), 0) AS qty FROM product_variants pv WHERE pv.id = ?', [l.variant_id]);
    await insertRow(tx, 'stock_movements', {
      variant_id: l.variant_id, location_id: p.location_id, qty: round(sign * l.qty, 3), movement_type: p.doc_type === 'purchase' ? 'purchase' : 'purchase_return',
      ref_type: 'purchase', ref_id: purchaseId, ref_line_id: l.id, unit_cost: landed[i], batch_no: l.batch_no ?? null, occurred_at: now,
    }, actor);

    if (p.doc_type === 'purchase') {
      // Mirror the server's moving-average trigger so the device shows the new cost immediately.
      const avg = newAverageCost({ currentQty: before?.qty ?? 0, currentAvg: before?.avg_cost ?? 0, receivedQty: l.qty, receivedCost: landed[i] });
      await updateRow(tx, 'product_variants', l.variant_id, { avg_cost: avg, last_purchase_cost: landed[i] });
      await tx.execute(
        `INSERT INTO supplier_products (id, supplier_id, variant_id, last_rate, last_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [uuidv7(), p.supplier_id, l.variant_id, l.rate, p.doc_date, now, now]
      );
    }
  }

  await updateRow(tx, 'purchases', purchaseId, {
    doc_no: docNo, status: 'posted', posted_at: now, paid_total: 0,
    subtotal: totals.subtotal, discount_total: totals.discount_total, taxable_total: totals.taxable_total, cgst_total: totals.cgst_total, sgst_total: totals.sgst_total, igst_total: totals.igst_total,
    round_off: totals.round_off, grand_total: totals.grand_total,
  });

  await insertRow(tx, 'ledger_entries', {
    party_type: 'supplier', party_id: p.supplier_id, entry_date: p.doc_date, doc_type: p.doc_type, doc_id: purchaseId, doc_no: docNo,
    debit: p.doc_type === 'debit_note' ? totals.grand_total : 0, credit: p.doc_type === 'purchase' ? totals.grand_total : 0,
    narration: p.doc_type === 'purchase' ? `Purchase ${docNo}` : `Debit note ${docNo}`,
  }, actor);

  return docNo;
}

export async function cancelPurchase(tx: Transaction, purchaseId: string, reason: string, actor: Actor): Promise<void> {
  const p = await one<{ status: string; supplier_id: string; grand_total: number; doc_no: string; doc_type: string; paid_total: number }>(tx, 'SELECT * FROM purchases WHERE id = ?', [purchaseId]);
  if (!p) throw new Error('Purchase not found');
  if (p.status !== 'posted') throw new Error('Only a posted document can be cancelled');
  if (p.paid_total > 0) throw new Error('Payments are allocated to this document. Reverse them first.');
  await reverseMovements(tx, 'purchase', purchaseId, actor);
  await insertRow(tx, 'ledger_entries', {
    party_type: 'supplier', party_id: p.supplier_id, entry_date: toDateString(), doc_type: 'cancel_reversal', doc_id: purchaseId, doc_no: p.doc_no,
    debit: p.doc_type === 'purchase' ? p.grand_total : 0, credit: p.doc_type === 'debit_note' ? p.grand_total : 0, narration: `Cancelled ${p.doc_no}: ${reason}`,
  }, actor);
  await updateRow(tx, 'purchases', purchaseId, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: actor.userId, cancel_reason: reason });
}

/** Reversal rows that exactly negate every movement of a document. */
export async function reverseMovements(tx: Transaction, refType: string, refId: string, actor: Actor): Promise<void> {
  const moves = await all<{ id: string; variant_id: string; location_id: string; qty: number; unit_cost: number; ref_line_id: string | null }>(
    tx, 'SELECT * FROM stock_movements WHERE ref_type = ? AND ref_id = ? AND reversal_of_id IS NULL', [refType, refId]);
  const now = new Date().toISOString();
  for (const m of moves) {
    await insertRow(tx, 'stock_movements', {
      variant_id: m.variant_id, location_id: m.location_id, qty: round(-m.qty, 3), movement_type: 'cancel_reversal', ref_type: refType, ref_id: refId, ref_line_id: m.ref_line_id,
      unit_cost: m.unit_cost, reversal_of_id: m.id, occurred_at: now, note: 'Reversal of cancelled document',
    }, actor);
  }
}

// -----------------------------------------------------------------------------
// Transfers
// -----------------------------------------------------------------------------
export async function dispatchTransfer(tx: Transaction, transferId: string, actor: Actor): Promise<string> {
  const t = await one<{ status: string; from_location_id: string; to_location_id: string; doc_date: string }>(tx, 'SELECT * FROM stock_transfers WHERE id = ?', [transferId]);
  if (!t || t.status !== 'draft') throw new Error('Only a draft transfer can be dispatched');
  const lines = await all<{ id: string; variant_id: string; qty: number }>(tx, 'SELECT * FROM stock_transfer_lines WHERE transfer_id = ?', [transferId]);
  if (lines.length === 0) throw new Error('Add at least one line');
  const docNo = await allocateDocNo(tx, 'stock_transfer', actor.deviceId, new Date(t.doc_date));
  const now = new Date().toISOString();
  for (const l of lines) {
    const v = await one<{ avg_cost: number }>(tx, 'SELECT avg_cost FROM product_variants WHERE id = ?', [l.variant_id]);
    await updateRow(tx, 'stock_transfer_lines', l.id, { unit_cost: v?.avg_cost ?? 0 });
    await insertRow(tx, 'stock_movements', { variant_id: l.variant_id, location_id: t.from_location_id, qty: round(-l.qty, 3), movement_type: 'transfer_out', ref_type: 'stock_transfer', ref_id: transferId, ref_line_id: l.id, unit_cost: v?.avg_cost ?? 0, occurred_at: now }, actor);
  }
  await updateRow(tx, 'stock_transfers', transferId, { doc_no: docNo, status: 'dispatched', dispatched_at: now, dispatched_by: actor.userId });
  return docNo;
}

export async function receiveTransfer(tx: Transaction, transferId: string, actor: Actor): Promise<void> {
  const t = await one<{ status: string; to_location_id: string }>(tx, 'SELECT * FROM stock_transfers WHERE id = ?', [transferId]);
  if (!t || t.status !== 'dispatched') throw new Error('Only a dispatched transfer can be received');
  const lines = await all<{ id: string; variant_id: string; qty: number; unit_cost: number }>(tx, 'SELECT * FROM stock_transfer_lines WHERE transfer_id = ?', [transferId]);
  const now = new Date().toISOString();
  for (const l of lines) {
    await insertRow(tx, 'stock_movements', { variant_id: l.variant_id, location_id: t.to_location_id, qty: l.qty, movement_type: 'transfer_in', ref_type: 'stock_transfer', ref_id: transferId, ref_line_id: l.id, unit_cost: l.unit_cost, occurred_at: now }, actor);
  }
  await updateRow(tx, 'stock_transfers', transferId, { status: 'received', received_at: now, received_by: actor.userId });
}

export async function cancelTransfer(tx: Transaction, transferId: string, actor: Actor): Promise<void> {
  const t = await one<{ status: string }>(tx, 'SELECT status FROM stock_transfers WHERE id = ?', [transferId]);
  if (!t) throw new Error('Transfer not found');
  if (t.status === 'received') throw new Error('A received transfer cannot be cancelled. Create a transfer back instead.');
  if (t.status === 'dispatched') await reverseMovements(tx, 'stock_transfer', transferId, actor);
  await updateRow(tx, 'stock_transfers', transferId, { status: 'cancelled' });
}

// -----------------------------------------------------------------------------
// Adjustments (also used by audit close)
// -----------------------------------------------------------------------------
export async function postAdjustment(tx: Transaction, adjustmentId: string, actor: Actor): Promise<string> {
  const a = await one<{ status: string; location_id: string; reason: string; doc_date: string }>(tx, 'SELECT * FROM stock_adjustments WHERE id = ?', [adjustmentId]);
  if (!a || a.status !== 'draft') throw new Error('Only a draft adjustment can be posted');
  const lines = await all<{ id: string; variant_id: string; qty_delta: number; unit_cost: number; reason_code: string | null }>(tx, 'SELECT * FROM stock_adjustment_lines WHERE adjustment_id = ?', [adjustmentId]);
  if (lines.length === 0) throw new Error('Add at least one line');
  const docNo = await allocateDocNo(tx, 'stock_adjustment', actor.deviceId, new Date(a.doc_date));
  const now = new Date().toISOString();
  for (const l of lines) {
    if (!l.qty_delta) continue;
    const v = await one<{ avg_cost: number }>(tx, 'SELECT avg_cost FROM product_variants WHERE id = ?', [l.variant_id]);
    const cost = l.unit_cost || v?.avg_cost || 0;
    const type = a.reason === 'opening' ? 'opening' : (l.reason_code ?? a.reason) === 'damage' ? 'damage' : a.reason === 'free_issue' ? 'free_issue' : 'adjustment';
    await insertRow(tx, 'stock_movements', { variant_id: l.variant_id, location_id: a.location_id, qty: round(l.qty_delta, 3), movement_type: type, ref_type: 'stock_adjustment', ref_id: adjustmentId, ref_line_id: l.id, unit_cost: cost, occurred_at: now, note: l.reason_code ?? a.reason }, actor);
  }
  await updateRow(tx, 'stock_adjustments', adjustmentId, { doc_no: docNo, status: 'posted', posted_at: now, approved_by: actor.userId });
  return docNo;
}

// -----------------------------------------------------------------------------
// Audits
// -----------------------------------------------------------------------------
/** Snapshot every relevant SKU's system quantity into the audit's count sheet. */
export async function snapshotAudit(tx: Transaction, auditId: string): Promise<number> {
  const a = await one<{ location_id: string; filter_family_id: string | null; filter_brand_id: string | null }>(tx, 'SELECT * FROM stock_audits WHERE id = ?', [auditId]);
  if (!a) throw new Error('Audit not found');
  const rows = await all<{ id: string; qty: number }>(
    tx,
    `SELECT pv.id, COALESCE(sl.qty, 0) AS qty
     FROM product_variants pv JOIN products p ON p.id = pv.product_id
     LEFT JOIN stock_on_hand sl ON sl.variant_id = pv.id AND sl.location_id = ?1
     WHERE pv.is_active = 1 AND p.is_active = 1
       AND (?2 = '' OR p.family_id = ?2) AND (?3 = '' OR p.brand_id = ?3)
       AND (COALESCE(sl.qty, 0) <> 0 OR ?2 <> '' OR ?3 <> '')`,
    [a.location_id, a.filter_family_id ?? '', a.filter_brand_id ?? '']
  );
  const now = new Date().toISOString();
  for (const r of rows) {
    await tx.execute(
      'INSERT OR IGNORE INTO stock_audit_lines (id, audit_id, variant_id, system_qty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv7(), auditId, r.id, r.qty, now, now]
    );
  }
  return rows.length;
}

/** Close an audit: every counted difference becomes one posted adjustment. */
export async function closeAudit(tx: Transaction, auditId: string, actor: Actor): Promise<{ adjustmentId: string | null; docNo: string | null; lines: number }> {
  const a = await one<{ status: string; location_id: string; name: string; doc_no: string | null }>(tx, 'SELECT * FROM stock_audits WHERE id = ?', [auditId]);
  if (!a || a.status === 'closed' || a.status === 'cancelled') throw new Error('Audit is already closed');
  const diffs = await all<{ id: string; variant_id: string; system_qty: number; counted_qty: number | null; reason_code: string | null }>(
    tx, 'SELECT * FROM stock_audit_lines WHERE audit_id = ? AND counted_qty IS NOT NULL AND counted_qty <> system_qty', [auditId]);
  const now = new Date().toISOString();
  const auditNo = a.doc_no ?? (await allocateDocNo(tx, 'stock_audit', actor.deviceId));

  let adjustmentId: string | null = null;
  let docNo: string | null = null;
  if (diffs.length > 0) {
    adjustmentId = await insertRow(tx, 'stock_adjustments', { doc_date: toDateString(), location_id: a.location_id, reason: 'audit', notes: `Stock audit ${auditNo}: ${a.name}`, status: 'draft' }, actor);
    for (const d of diffs) {
      await insertRow(tx, 'stock_adjustment_lines', { adjustment_id: adjustmentId, variant_id: d.variant_id, qty_delta: round((d.counted_qty ?? 0) - d.system_qty, 3), unit_cost: 0, reason_code: d.reason_code ?? 'counting_error', note: `Counted ${d.counted_qty}, system ${d.system_qty}` });
    }
    docNo = await postAdjustment(tx, adjustmentId, actor);
  }
  await updateRow(tx, 'stock_audits', auditId, { doc_no: auditNo, status: 'closed', closed_at: now, closed_by: actor.userId, adjustment_id: adjustmentId });
  return { adjustmentId, docNo, lines: diffs.length };
}

// -----------------------------------------------------------------------------
// Payments (in from customers, out to suppliers)
// -----------------------------------------------------------------------------
export async function postPayment(
  tx: Transaction,
  input: { direction: 'in' | 'out'; party_id: string; amount: number; mode: string; reference_no?: string | null; bank_name?: string | null; notes?: string | null; payment_date: string; allocations?: Array<{ doc_id: string; doc_type: string; amount: number }> | 'auto' },
  actor: Actor
): Promise<string> {
  const partyType = input.direction === 'in' ? 'customer' : 'supplier';
  const docNo = await allocateDocNo(tx, input.direction === 'in' ? 'payment_in' : 'payment_out', actor.deviceId, new Date(input.payment_date));
  const paymentId = await insertRow(tx, 'payments', {
    direction: input.direction, party_type: partyType, party_id: input.party_id, doc_no: docNo, payment_date: input.payment_date, amount: round(input.amount), mode: input.mode,
    reference_no: input.reference_no ?? null, bank_name: input.bank_name ?? null, notes: input.notes ?? null, status: 'posted', received_by: actor.userId,
  }, actor);

  await insertRow(tx, 'ledger_entries', {
    party_type: partyType, party_id: input.party_id, entry_date: input.payment_date, doc_type: input.direction === 'in' ? 'payment_in' : 'payment_out', doc_id: paymentId, doc_no: docNo,
    debit: input.direction === 'out' ? round(input.amount) : 0, credit: input.direction === 'in' ? round(input.amount) : 0, narration: `${input.mode}${input.reference_no ? ` ${input.reference_no}` : ''}`,
  }, actor);

  let allocations = input.allocations === 'auto' || !input.allocations ? null : input.allocations;
  if (!allocations) {
    const open = input.direction === 'in'
      ? await all<{ id: string; doc_date: string; outstanding: number }>(tx, `SELECT id, doc_date, grand_total - paid_total AS outstanding FROM sales_invoices WHERE customer_id = ? AND doc_type = 'invoice' AND status = 'posted' AND grand_total > paid_total ORDER BY doc_date`, [input.party_id])
      : await all<{ id: string; doc_date: string; outstanding: number }>(tx, `SELECT id, doc_date, grand_total - paid_total AS outstanding FROM purchases WHERE supplier_id = ? AND doc_type = 'purchase' AND status = 'posted' AND grand_total > paid_total ORDER BY doc_date`, [input.party_id]);
    allocations = allocateFifo(input.amount, open.map((o) => ({ id: o.id, doc_type: input.direction === 'in' ? 'sales_invoice' : 'purchase', outstanding: o.outstanding, doc_date: o.doc_date })));
  }
  for (const al of allocations) {
    await insertRow(tx, 'payment_allocations', { payment_id: paymentId, doc_type: al.doc_type, doc_id: al.doc_id, amount: al.amount });
    // Mirror the server trigger locally so "paid" badges update at once.
    const table = al.doc_type === 'sales_invoice' || al.doc_type === 'credit_note' ? 'sales_invoices' : 'purchases';
    await tx.execute(`UPDATE ${table} SET paid_total = COALESCE(paid_total, 0) + ?, updated_at = ? WHERE id = ?`, [al.amount, new Date().toISOString(), al.doc_id]);
  }
  return docNo;
}

export async function cancelPayment(tx: Transaction, paymentId: string, reason: string, actor: Actor): Promise<void> {
  const p = await one<{ status: string; direction: 'in' | 'out'; party_type: string; party_id: string; amount: number; doc_no: string }>(tx, 'SELECT * FROM payments WHERE id = ?', [paymentId]);
  if (!p || p.status !== 'posted') throw new Error('Only a posted payment can be reversed');
  const allocs = await all<{ id: string; doc_type: string; doc_id: string; amount: number }>(tx, 'SELECT * FROM payment_allocations WHERE payment_id = ?', [paymentId]);
  for (const al of allocs) {
    const table = al.doc_type === 'sales_invoice' || al.doc_type === 'credit_note' ? 'sales_invoices' : 'purchases';
    await tx.execute(`UPDATE ${table} SET paid_total = COALESCE(paid_total, 0) - ?, updated_at = ? WHERE id = ?`, [al.amount, new Date().toISOString(), al.doc_id]);
    await tx.execute('DELETE FROM payment_allocations WHERE id = ?', [al.id]);
  }
  await insertRow(tx, 'ledger_entries', {
    party_type: p.party_type, party_id: p.party_id, entry_date: toDateString(), doc_type: 'cancel_reversal', doc_id: paymentId, doc_no: p.doc_no,
    debit: p.direction === 'in' ? p.amount : 0, credit: p.direction === 'out' ? p.amount : 0, narration: `Reversed ${p.doc_no}: ${reason}`,
  }, actor);
  await updateRow(tx, 'payments', paymentId, { status: reason.toLowerCase().includes('bounce') ? 'bounced' : 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason });
}

// -----------------------------------------------------------------------------
// Sales invoices and credit notes
// -----------------------------------------------------------------------------
export async function postInvoice(tx: Transaction, invoiceId: string, actor: Actor, opts: { creditOverrideBy?: string | null } = {}): Promise<string> {
  const inv = await one<{ id: string; doc_type: 'invoice' | 'credit_note'; status: string; customer_id: string; location_id: string; is_interstate: number; other_charges: number; doc_date: string; payment_mode: string | null; credit_days: number; against_invoice_id: string | null }>(
    tx, 'SELECT * FROM sales_invoices WHERE id = ?', [invoiceId]);
  if (!inv) throw new Error('Invoice not found');
  if (inv.status !== 'draft') throw new Error('Only a draft can be posted');

  const lines = await all<DraftLine & { return_condition: string | null; unit_cost_at_sale: number }>(tx, 'SELECT * FROM sales_invoice_lines WHERE invoice_id = ? ORDER BY line_no', [invoiceId]);
  if (lines.length === 0) throw new Error('Add at least one line');

  const company = await one<{ round_to_rupee: number; state_code: string }>(tx, 'SELECT round_to_rupee, state_code FROM company_settings LIMIT 1');
  const { taxed, totals } = totalLines(lines, !!inv.is_interstate, inv.other_charges, company?.round_to_rupee !== 0);
  const customer = await one<{ credit_limit: number; credit_days: number; name: string; gstin: string | null; state_code: string | null }>(tx, 'SELECT credit_limit, credit_days, name, gstin, state_code FROM customers WHERE id = ?', [inv.customer_id]);
  const balance = await one<{ balance: number }>(tx, "SELECT balance FROM party_balance_live WHERE party_type = 'customer' AND party_id = ?", [inv.customer_id]);

  const isInvoice = inv.doc_type === 'invoice';
  const docNo = await allocateDocNo(tx, isInvoice ? 'sales_invoice' : 'credit_note', actor.deviceId, new Date(inv.doc_date));
  const now = new Date().toISOString();
  const damaged = await one<{ id: string }>(tx, "SELECT id FROM locations WHERE type = 'damaged' AND is_active = 1 LIMIT 1");

  for (const [i, l] of lines.entries()) {
    const tl = taxed[i];
    const v = await one<{ avg_cost: number; family_code: string | null }>(tx, 'SELECT pv.avg_cost, f.code AS family_code FROM product_variants pv JOIN products p ON p.id = pv.product_id LEFT JOIN product_families f ON f.id = p.family_id WHERE pv.id = ?', [l.variant_id]);
    await updateRow(tx, 'sales_invoice_lines', l.id, {
      taxable_value: tl.taxable_value, cgst: tl.cgst, sgst: tl.sgst, igst: tl.igst, line_total: tl.line_total, unit_cost_at_sale: v?.avg_cost ?? 0,
    });
    // Labour / services (family SRVC) are billed but never move stock.
    if (v?.family_code === 'SRVC') continue;
    const intoDamaged = !isInvoice && l.return_condition === 'damaged' && damaged?.id;
    await insertRow(tx, 'stock_movements', {
      variant_id: l.variant_id, location_id: intoDamaged ? damaged!.id : inv.location_id, qty: round(isInvoice ? -l.qty : l.qty, 3),
      movement_type: isInvoice ? 'sale' : 'sale_return', ref_type: 'sales_invoice', ref_id: invoiceId, ref_line_id: l.id, unit_cost: v?.avg_cost ?? 0, occurred_at: now,
      note: intoDamaged ? 'Returned damaged' : null,
    }, actor);
  }

  const creditDays = inv.payment_mode === 'credit' ? (inv.credit_days || customer?.credit_days || 0) : 0;
  const due = new Date(inv.doc_date); due.setDate(due.getDate() + creditDays);
  const exceeded = isInvoice && inv.payment_mode === 'credit' && (customer?.credit_limit ?? 0) > 0 && (balance?.balance ?? 0) + totals.grand_total > (customer?.credit_limit ?? 0);

  await updateRow(tx, 'sales_invoices', invoiceId, {
    doc_no: docNo, status: 'posted', posted_at: now, paid_total: 0, due_date: toDateString(due), credit_days: creditDays,
    customer_name: customer?.name ?? null, customer_gstin: customer?.gstin ?? null, customer_state_code: customer?.state_code ?? null, is_b2b: !!customer?.gstin,
    subtotal: totals.subtotal, discount_total: totals.discount_total, taxable_total: totals.taxable_total, cgst_total: totals.cgst_total, sgst_total: totals.sgst_total, igst_total: totals.igst_total,
    round_off: totals.round_off, grand_total: totals.grand_total, credit_flag: exceeded, credit_override_by: exceeded ? opts.creditOverrideBy ?? null : null,
  });

  await insertRow(tx, 'ledger_entries', {
    party_type: 'customer', party_id: inv.customer_id, entry_date: inv.doc_date, doc_type: isInvoice ? 'sales_invoice' : 'credit_note', doc_id: invoiceId, doc_no: docNo,
    debit: isInvoice ? totals.grand_total : 0, credit: isInvoice ? 0 : totals.grand_total, narration: isInvoice ? `Invoice ${docNo}` : `Credit note ${docNo}`,
  }, actor);

  // A cash / UPI / card / bank sale is paid on the spot: record the receipt against this invoice.
  if (isInvoice && inv.payment_mode && !['credit', 'mixed'].includes(inv.payment_mode) && totals.grand_total > 0) {
    await postPayment(tx, { direction: 'in', party_id: inv.customer_id, amount: totals.grand_total, mode: inv.payment_mode, payment_date: inv.doc_date, notes: `Against ${docNo}`, allocations: [{ doc_id: invoiceId, doc_type: 'sales_invoice', amount: totals.grand_total }] }, actor);
  }
  return docNo;
}

export async function cancelInvoice(tx: Transaction, invoiceId: string, reason: string, actor: Actor): Promise<void> {
  const inv = await one<{ status: string; customer_id: string; grand_total: number; doc_no: string; doc_type: string; paid_total: number }>(tx, 'SELECT * FROM sales_invoices WHERE id = ?', [invoiceId]);
  if (!inv) throw new Error('Invoice not found');
  if (inv.status !== 'posted') throw new Error('Only a posted document can be cancelled');
  const notes = await one<{ n: number }>(tx, "SELECT COUNT(*) AS n FROM sales_invoices WHERE against_invoice_id = ? AND status <> 'cancelled'", [invoiceId]);
  if ((notes?.n ?? 0) > 0) throw new Error('Credit notes exist against this invoice. Cancel them first.');

  // Reverse payments that were applied only to this invoice (the automatic cash receipt); anything else must be handled manually.
  const pays = await all<{ payment_id: string; amount: number; total: number }>(tx,
    `SELECT pa.payment_id, pa.amount, p.amount AS total FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id WHERE pa.doc_id = ? AND p.status = 'posted'`, [invoiceId]);
  for (const p of pays) {
    if (p.amount !== p.total) throw new Error('A payment covering several invoices is allocated here. Reverse that payment first.');
    await cancelPayment(tx, p.payment_id, `Invoice ${inv.doc_no} cancelled`, actor);
  }

  await reverseMovements(tx, 'sales_invoice', invoiceId, actor);
  await insertRow(tx, 'ledger_entries', {
    party_type: 'customer', party_id: inv.customer_id, entry_date: toDateString(), doc_type: 'cancel_reversal', doc_id: invoiceId, doc_no: inv.doc_no,
    debit: inv.doc_type === 'credit_note' ? inv.grand_total : 0, credit: inv.doc_type === 'invoice' ? inv.grand_total : 0, narration: `Cancelled ${inv.doc_no}: ${reason}`,
  }, actor);
  await updateRow(tx, 'sales_invoices', invoiceId, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: actor.userId, cancel_reason: reason });
}

// -----------------------------------------------------------------------------
// Workshop job cards
// -----------------------------------------------------------------------------
/**
 * Close a job card: build a sales invoice from its parts and labour lines and
 * post it. The invoice is the stock-moving document (parts leave the workshop
 * location as 'sale'); labour rows bill against the matching service SKU.
 */
export async function closeJobCard(tx: Transaction, jobCardId: string, actor: Actor, opts: { paymentMode: string; creditDays?: number }): Promise<{ invoiceId: string; docNo: string }> {
  const jc = await one<{ id: string; status: string; customer_id: string; customer_vehicle_id: string | null; location_id: string; doc_date: string; doc_no: string | null; discount_total: number }>(tx, 'SELECT * FROM job_cards WHERE id = ?', [jobCardId]);
  if (!jc) throw new Error('Job card not found');
  if (jc.status === 'closed' || jc.status === 'cancelled') throw new Error('Job card is already closed');

  const parts = await all<{ id: string; variant_id: string; description: string; qty: number; rate: number; tax_rate_pct: number }>(tx, 'SELECT * FROM job_card_lines WHERE job_card_id = ?', [jobCardId]);
  const labour = await all<{ id: string; description: string; amount: number; sac_code: string | null; tax_rate_pct: number }>(tx, 'SELECT * FROM job_card_labour WHERE job_card_id = ?', [jobCardId]);
  if (parts.length === 0 && labour.length === 0) throw new Error('Add at least one part or labour line');

  const customer = await one<{ state_code: string | null; price_list_id: string | null; credit_days: number }>(tx, 'SELECT state_code, price_list_id, credit_days FROM customers WHERE id = ?', [jc.customer_id]);
  const company = await one<{ state_code: string }>(tx, 'SELECT state_code FROM company_settings LIMIT 1');
  const interstate = !!company?.state_code && !!customer?.state_code && company.state_code !== customer.state_code;
  const jobNo = jc.doc_no ?? (await allocateDocNo(tx, 'job_card', actor.deviceId, new Date(jc.doc_date)));

  const invoiceId = await insertRow(tx, 'sales_invoices', {
    doc_type: 'invoice', doc_date: toDateString(), customer_id: jc.customer_id, customer_vehicle_id: jc.customer_vehicle_id, location_id: jc.location_id,
    price_list_id: customer?.price_list_id ?? null, place_of_supply_state: customer?.state_code ?? null, is_interstate: interstate, other_charges: 0,
    payment_mode: opts.paymentMode, credit_days: opts.creditDays ?? customer?.credit_days ?? 0, status: 'draft', notes: `Job card ${jobNo}`, salesperson_id: actor.userId,
  }, actor);

  let lineNo = 1;
  for (const p of parts) {
    const v = await one<{ hsn_code: string | null; unit_code: string | null; mrp: number | null }>(tx, 'SELECT p.hsn_code, u.code AS unit_code, pv.mrp FROM product_variants pv JOIN products p ON p.id = pv.product_id LEFT JOIN units u ON u.id = p.unit_id WHERE pv.id = ?', [p.variant_id]);
    await insertRow(tx, 'sales_invoice_lines', {
      invoice_id: invoiceId, line_no: lineNo++, variant_id: p.variant_id, description: p.description, hsn_code: v?.hsn_code ?? null, qty: p.qty, unit_code: v?.unit_code ?? null,
      mrp: v?.mrp ?? null, list_price: p.rate, rate: p.rate, discount_pct: 0, discount_amt: 0, tax_rate_pct: p.tax_rate_pct, price_source: 'manual',
    });
  }
  if (labour.length) {
    // Bill labour against the matching service SKU (family SRVC); fall back to the first service SKU.
    const services = await all<{ id: string; variant_name: string }>(tx, "SELECT pv.id, pv.variant_name FROM product_variants pv JOIN products p ON p.id = pv.product_id JOIN product_families f ON f.id = p.family_id WHERE f.code = 'SRVC' AND pv.is_active = 1 ORDER BY pv.sort_order");
    if (services.length === 0) throw new Error('Create at least one product in the Services & Labour family to bill labour');
    for (const l of labour) {
      const match = services.find((s) => l.description.toLowerCase().includes(s.variant_name.toLowerCase())) ?? services[0];
      await insertRow(tx, 'sales_invoice_lines', {
        invoice_id: invoiceId, line_no: lineNo++, variant_id: match.id, description: l.description, hsn_code: l.sac_code ?? '9987', qty: 1, unit_code: null,
        list_price: l.amount, rate: l.amount, discount_pct: 0, discount_amt: 0, tax_rate_pct: l.tax_rate_pct, price_source: 'manual',
      });
    }
  }

  const docNo = await postInvoice(tx, invoiceId, actor);
  const inv = await one<{ grand_total: number; taxable_total: number; cgst_total: number; sgst_total: number; igst_total: number }>(tx, 'SELECT * FROM sales_invoices WHERE id = ?', [invoiceId]);
  await updateRow(tx, 'job_cards', jobCardId, {
    doc_no: jobNo, status: 'closed', closed_at: new Date().toISOString(), invoice_id: invoiceId,
    parts_total: round(parts.reduce((a, p) => a + p.qty * p.rate, 0)), labour_total: round(labour.reduce((a, l) => a + l.amount, 0)),
    tax_total: round((inv?.cgst_total ?? 0) + (inv?.sgst_total ?? 0) + (inv?.igst_total ?? 0)), grand_total: inv?.grand_total ?? 0,
  });
  return { invoiceId, docNo };
}
