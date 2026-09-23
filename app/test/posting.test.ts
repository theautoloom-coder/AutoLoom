/**
 * End-to-end tests of the posting engine against a real SQLite database:
 * purchases, invoices, credit notes, cancellations, payments, transfers,
 * adjustments, audits and offline numbering.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { Transaction } from '@powersync/react-native';

import {
  allocateDocNo, cancelInvoice, cancelPayment, cancelPurchase, closeAudit, closeJobCard, dispatchTransfer, postAdjustment, postInvoice, postPayment, postPurchase, receiveTransfer, snapshotAudit,
} from '../src/lib/posting';
import { insertRow, type Actor } from '../src/lib/writes';
import { createDb, many, one, row, type FakeDb } from './harness';

const actor: Actor = { userId: 'user-1', deviceId: 'device-1' };
const asTx = (db: FakeDb) => db as unknown as Transaction;

let db: FakeDb;
const ID = {
  main: 'loc-main', shop: 'loc-shop', dmg: 'loc-dmg', fam: 'fam-led', prod: 'prod-1', h4: 'var-h4', h7: 'var-h7',
  cust: 'cust-1', custDelhi: 'cust-2', sup: 'sup-1', tax18: 'tax-18',
};

beforeEach(() => {
  db = createDb();
  row(db, 'company_settings', { id: 'co', legal_name: 'AutoGrid Trading Co.', state_code: '09', state_name: 'Uttar Pradesh', fy_start_month: 4, round_to_rupee: 1 });
  row(db, 'locations', { id: ID.main, code: 'MAIN', name: 'Main Warehouse', type: 'warehouse', is_active: 1, sort_order: 1 });
  row(db, 'locations', { id: ID.shop, code: 'SHOP', name: 'Shop', type: 'shop', is_active: 1, sort_order: 2 });
  row(db, 'locations', { id: ID.dmg, code: 'DMGD', name: 'Damaged', type: 'damaged', is_active: 1, sort_order: 9 });
  row(db, 'tax_rates', { id: ID.tax18, name: 'GST 18%', rate_pct: 18, cgst_pct: 9, sgst_pct: 9, igst_pct: 18, is_active: 1 });
  row(db, 'product_families', { id: ID.fam, code: 'LED', name: 'LED Bulbs', sku_prefix: 'LED', sku_template: '{FAMILY}-{AXES}', is_active: 1 });
  row(db, 'products', { id: ID.prod, family_id: ID.fam, name: 'Ultra LED', hsn_code: '8539', tax_rate_id: ID.tax18, is_active: 1, is_universal_fit: 1, search_text: '' });
  row(db, 'product_variants', { id: ID.h4, product_id: ID.prod, variant_name: 'H4 60W', sku: 'LED-H4-60W', retail_price: 2400, dealer_price: 1900, min_selling_price: 1700, avg_cost: 1450, last_purchase_cost: 1450, min_stock: 0, reorder_level: 0, reorder_qty: 0, is_active: 1, search_text: '' });
  row(db, 'product_variants', { id: ID.h7, product_id: ID.prod, variant_name: 'H7 60W', sku: 'LED-H7-60W', retail_price: 2400, dealer_price: 1900, avg_cost: 0, last_purchase_cost: 0, min_stock: 0, reorder_level: 0, reorder_qty: 0, is_active: 1, search_text: '' });
  row(db, 'customers', { id: ID.cust, code: 'C0001', name: 'XYZ Accessories', state_code: '09', gstin: '09ABCDE1234F1Z5', customer_type: 'dealer', credit_limit: 10000, credit_days: 30, opening_balance: 0, is_active: 1, search_text: '' });
  row(db, 'customers', { id: ID.custDelhi, code: 'C0002', name: 'Delhi Car Studio', state_code: '07', gstin: '07UVWXY3456J1Z4', customer_type: 'wholesale', credit_limit: 0, credit_days: 0, opening_balance: 0, is_active: 1, search_text: '' });
  row(db, 'suppliers', { id: ID.sup, code: 'S0001', name: 'Bright Auto', state_code: '07', payment_terms_days: 30, opening_balance: 0, is_active: 1, search_text: '' });
  // opening stock: 20 H4 in main
  row(db, 'stock_movements', { id: 'mv-open', variant_id: ID.h4, location_id: ID.main, qty: 20, movement_type: 'opening', unit_cost: 1450, occurred_at: '2026-09-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z' });
  for (const [type, prefix] of [['purchase', 'PUR/26-27/'], ['debit_note', 'DN/26-27/'], ['sales_invoice', 'NOI/A/26-27/'], ['credit_note', 'CN/A/26-27/'], ['payment_in', 'RCP/26-27/'], ['payment_out', 'PAY/26-27/'], ['stock_transfer', 'TRF/26-27/'], ['stock_adjustment', 'ADJ/26-27/'], ['stock_audit', 'AUD/26-27/']] as const) {
    row(db, 'document_sequences', { id: `seq-${type}`, series_code: 'A', doc_type: type, financial_year: '26-27', prefix, next_number: 1, pad_width: 4 });
  }
});

const stock = (variant: string, loc: string) => Number(one<{ q: number | null }>(db, 'SELECT SUM(qty) AS q FROM stock_movements WHERE variant_id = ? AND location_id = ?', variant, loc).q ?? 0);
const balance = (type: string, id: string) => Number(one<{ b: number | null }>(db, 'SELECT balance AS b FROM party_balance_live WHERE party_type = ? AND party_id = ?', type, id)?.b ?? 0);

async function draftPurchase(lines: Array<{ variant: string; qty: number; rate: number }>, opts: { interstate?: boolean; other?: number } = {}) {
  const pid = await insertRow(asTx(db), 'purchases', { doc_type: 'purchase', doc_date: '2026-09-15', supplier_id: ID.sup, location_id: ID.main, is_interstate: opts.interstate ?? true, other_charges: opts.other ?? 0, status: 'draft' }, actor);
  for (const [i, l] of lines.entries()) {
    await insertRow(asTx(db), 'purchase_lines', { purchase_id: pid, line_no: i + 1, variant_id: l.variant, description: 'x', hsn_code: '8539', qty: l.qty, rate: l.rate, discount_pct: 0, discount_amt: 0, tax_rate_pct: 18 });
  }
  return pid;
}

async function draftInvoice(customer: string, lines: Array<{ variant: string; qty: number; rate: number }>, mode = 'cash', opts: { interstate?: boolean } = {}) {
  const iid = await insertRow(asTx(db), 'sales_invoices', { doc_type: 'invoice', doc_date: '2026-09-15', customer_id: customer, location_id: ID.main, is_interstate: opts.interstate ?? false, other_charges: 0, payment_mode: mode, credit_days: 30, status: 'draft' }, actor);
  for (const [i, l] of lines.entries()) {
    await insertRow(asTx(db), 'sales_invoice_lines', { invoice_id: iid, line_no: i + 1, variant_id: l.variant, description: 'x', hsn_code: '8539', qty: l.qty, rate: l.rate, discount_pct: 0, discount_amt: 0, tax_rate_pct: 18, list_price: l.rate, price_source: 'dealer' });
  }
  return iid;
}

describe('numbering', () => {
  it('formats and increments the series, and clones it for a new financial year', async () => {
    expect(await allocateDocNo(asTx(db), 'sales_invoice', 'device-1', new Date('2026-09-15'))).toBe('NOI/A/26-27/0001');
    expect(await allocateDocNo(asTx(db), 'sales_invoice', 'device-1', new Date('2026-09-15'))).toBe('NOI/A/26-27/0002');
    expect(await allocateDocNo(asTx(db), 'sales_invoice', 'device-1', new Date('2027-04-02'))).toBe('NOI/A/27-28/0001');
    expect(many(db, "SELECT financial_year FROM document_sequences WHERE doc_type = 'sales_invoice'")).toHaveLength(2);
  });

  it('never hands another device an owned series', async () => {
    db.raw.exec("UPDATE document_sequences SET owner_device_id = 'device-9' WHERE doc_type = 'purchase'");
    const n = await allocateDocNo(asTx(db), 'purchase', 'device-1');
    expect(n).toMatch(/^PUR\/26-27\/0001$/); // a fresh unowned series was cloned for this device
    expect(many(db, "SELECT * FROM document_sequences WHERE doc_type = 'purchase'")).toHaveLength(2);
  });
});

describe('purchases', () => {
  it('posts: stock in, landed cost with freight, moving average, supplier credit, GST', async () => {
    const pid = await draftPurchase([{ variant: ID.h4, qty: 10, rate: 1000 }, { variant: ID.h7, qty: 10, rate: 3000 }], { interstate: true, other: 400 });
    const docNo = await db.writeTransaction((tx) => postPurchase(tx as unknown as Transaction, pid, actor));
    expect(docNo).toBe('PUR/26-27/0001');

    const p = one<{ status: string; taxable_total: number; igst_total: number; cgst_total: number; grand_total: number }>(db, 'SELECT * FROM purchases WHERE id = ?', pid);
    expect(p.status).toBe('posted');
    expect(p.taxable_total).toBe(40000);
    expect(p.igst_total).toBe(7200);
    expect(p.cgst_total).toBe(0);
    expect(p.grand_total).toBe(47600); // 40000 + 7200 + 400 freight

    expect(stock(ID.h4, ID.main)).toBe(30);
    expect(stock(ID.h7, ID.main)).toBe(10);

    const lines = many<{ variant_id: string; landed_unit_cost: number }>(db, 'SELECT variant_id, landed_unit_cost FROM purchase_lines WHERE purchase_id = ? ORDER BY line_no', pid);
    expect(lines[0].landed_unit_cost).toBeCloseTo(1010, 2); // 1000 + 100 freight share / 10
    expect(lines[1].landed_unit_cost).toBeCloseTo(3030, 2);

    // moving average: 20 @ 1450 + 10 @ 1010 = 1303.33
    const h4 = one<{ avg_cost: number; last_purchase_cost: number }>(db, 'SELECT avg_cost, last_purchase_cost FROM product_variants WHERE id = ?', ID.h4);
    expect(h4.avg_cost).toBeCloseTo(1303.33, 1);
    expect(h4.last_purchase_cost).toBeCloseTo(1010, 2);
    // first-ever receipt takes the landed cost
    expect(one<{ avg_cost: number }>(db, 'SELECT avg_cost FROM product_variants WHERE id = ?', ID.h7).avg_cost).toBeCloseTo(3030, 2);

    expect(balance('supplier', ID.sup)).toBe(47600);
  });

  it('refuses to post twice and refuses an empty draft', async () => {
    const pid = await draftPurchase([{ variant: ID.h4, qty: 1, rate: 100 }]);
    await db.writeTransaction((tx) => postPurchase(tx as unknown as Transaction, pid, actor));
    await expect(db.writeTransaction((tx) => postPurchase(tx as unknown as Transaction, pid, actor))).rejects.toThrow(/draft/);
    const empty = await insertRow(asTx(db), 'purchases', { doc_type: 'purchase', doc_date: '2026-09-15', supplier_id: ID.sup, location_id: ID.main, status: 'draft', is_interstate: 0, other_charges: 0 }, actor);
    await expect(db.writeTransaction((tx) => postPurchase(tx as unknown as Transaction, empty, actor))).rejects.toThrow(/at least one line/);
  });

  it('cancels with exact reversals and leaves the number consumed', async () => {
    const pid = await draftPurchase([{ variant: ID.h4, qty: 5, rate: 1000 }]);
    await db.writeTransaction((tx) => postPurchase(tx as unknown as Transaction, pid, actor));
    expect(stock(ID.h4, ID.main)).toBe(25);
    await db.writeTransaction((tx) => cancelPurchase(tx as unknown as Transaction, pid, 'wrong supplier', actor));
    expect(stock(ID.h4, ID.main)).toBe(20);
    expect(balance('supplier', ID.sup)).toBe(0);
    expect(one<{ status: string; doc_no: string }>(db, 'SELECT status, doc_no FROM purchases WHERE id = ?', pid)).toEqual({ status: 'cancelled', doc_no: 'PUR/26-27/0001' });
    const rev = many<{ reversal_of_id: string | null; qty: number }>(db, "SELECT reversal_of_id, qty FROM stock_movements WHERE movement_type = 'cancel_reversal'");
    expect(rev).toHaveLength(1);
    expect(rev[0].qty).toBe(-5);
    expect(rev[0].reversal_of_id).toBeTruthy();
    // the original movement row is untouched
    expect(many(db, "SELECT * FROM stock_movements WHERE movement_type = 'purchase'")).toHaveLength(1);
  });

  it('posts a debit note that returns stock and debits the supplier', async () => {
    const pid = await draftPurchase([{ variant: ID.h4, qty: 10, rate: 1000 }]);
    await db.writeTransaction((tx) => postPurchase(tx as unknown as Transaction, pid, actor));
    const dn = await insertRow(asTx(db), 'purchases', { doc_type: 'debit_note', doc_date: '2026-09-16', supplier_id: ID.sup, location_id: ID.main, is_interstate: 1, other_charges: 0, status: 'draft', against_purchase_id: pid }, actor);
    await insertRow(asTx(db), 'purchase_lines', { purchase_id: dn, line_no: 1, variant_id: ID.h4, description: 'x', qty: 3, rate: 1000, discount_pct: 0, discount_amt: 0, tax_rate_pct: 18 });
    const no = await db.writeTransaction((tx) => postPurchase(tx as unknown as Transaction, dn, actor));
    expect(no).toBe('DN/26-27/0001');
    expect(stock(ID.h4, ID.main)).toBe(27);
    expect(balance('supplier', ID.sup)).toBe(11800 - 3540);
  });
});

describe('sales', () => {
  it('cash invoice: stock out, CGST+SGST, customer debited then credited by the automatic receipt', async () => {
    const iid = await draftInvoice(ID.cust, [{ variant: ID.h4, qty: 2, rate: 1900 }], 'upi');
    const no = await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, iid, actor));
    expect(no).toBe('NOI/A/26-27/0001');
    const inv = one<{ grand_total: number; paid_total: number; cgst_total: number; sgst_total: number; igst_total: number; customer_gstin: string; is_b2b: number; due_date: string }>(db, 'SELECT * FROM sales_invoices WHERE id = ?', iid);
    expect(inv.cgst_total).toBe(342);
    expect(inv.sgst_total).toBe(342);
    expect(inv.igst_total).toBe(0);
    expect(inv.grand_total).toBe(4484);
    expect(inv.paid_total).toBe(4484);
    expect(inv.is_b2b).toBe(1);
    expect(inv.due_date).toBe('2026-09-15');
    expect(stock(ID.h4, ID.main)).toBe(18);
    expect(balance('customer', ID.cust)).toBe(0);
    const pay = one<{ doc_no: string; mode: string; amount: number }>(db, "SELECT doc_no, mode, amount FROM payments WHERE direction = 'in'");
    expect(pay).toEqual({ doc_no: 'RCP/26-27/0001', mode: 'upi', amount: 4484 });
    // margin is frozen on the line
    expect(one<{ unit_cost_at_sale: number }>(db, 'SELECT unit_cost_at_sale FROM sales_invoice_lines WHERE invoice_id = ?', iid).unit_cost_at_sale).toBe(1450);
  });

  it('credit invoice: outstanding rises, due date follows credit days, limit breach is flagged', async () => {
    const iid = await draftInvoice(ID.cust, [{ variant: ID.h4, qty: 5, rate: 1900 }], 'credit');
    await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, iid, actor, { creditOverrideBy: 'owner-1' }));
    const inv = one<{ grand_total: number; paid_total: number; due_date: string; credit_flag: number; credit_override_by: string }>(db, 'SELECT * FROM sales_invoices WHERE id = ?', iid);
    expect(inv.grand_total).toBe(11210);
    expect(inv.paid_total).toBe(0);
    expect(inv.due_date).toBe('2026-10-15');
    expect(inv.credit_flag).toBe(1); // 11210 > limit 10000
    expect(inv.credit_override_by).toBe('owner-1');
    expect(balance('customer', ID.cust)).toBe(11210);
    expect(many(db, 'SELECT * FROM payments')).toHaveLength(0);
  });

  it('inter-state customer gets IGST', async () => {
    const iid = await draftInvoice(ID.custDelhi, [{ variant: ID.h4, qty: 1, rate: 1000 }], 'cash', { interstate: true });
    await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, iid, actor));
    const inv = one<{ igst_total: number; cgst_total: number; grand_total: number }>(db, 'SELECT * FROM sales_invoices WHERE id = ?', iid);
    expect(inv.igst_total).toBe(180);
    expect(inv.cgst_total).toBe(0);
    expect(inv.grand_total).toBe(1180);
  });

  it('credit note returns sellable stock to the location and damaged stock to the damaged location', async () => {
    const iid = await draftInvoice(ID.cust, [{ variant: ID.h4, qty: 4, rate: 1900 }], 'credit');
    await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, iid, actor));
    const orig = one<{ id: string }>(db, 'SELECT id FROM sales_invoice_lines WHERE invoice_id = ?', iid);
    const cn = await insertRow(asTx(db), 'sales_invoices', { doc_type: 'credit_note', doc_date: '2026-09-16', customer_id: ID.cust, location_id: ID.main, is_interstate: 0, other_charges: 0, payment_mode: 'credit', credit_days: 0, status: 'draft', against_invoice_id: iid }, actor);
    await insertRow(asTx(db), 'sales_invoice_lines', { invoice_id: cn, line_no: 1, variant_id: ID.h4, description: 'x', qty: 1, rate: 1900, discount_pct: 0, discount_amt: 0, tax_rate_pct: 18, return_condition: 'sellable', against_line_id: orig.id });
    await insertRow(asTx(db), 'sales_invoice_lines', { invoice_id: cn, line_no: 2, variant_id: ID.h4, description: 'x', qty: 1, rate: 1900, discount_pct: 0, discount_amt: 0, tax_rate_pct: 18, return_condition: 'damaged', against_line_id: orig.id });
    const no = await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, cn, actor));
    expect(no).toBe('CN/A/26-27/0001');
    expect(stock(ID.h4, ID.main)).toBe(17); // 20 - 4 + 1
    expect(stock(ID.h4, ID.dmg)).toBe(1);
    expect(balance('customer', ID.cust)).toBe(8968 - 4484); // invoice 8968, credit note 2 x 2242
    expect(many(db, "SELECT * FROM payments")).toHaveLength(0);
  });

  it('cancelling a cash invoice reverses stock, ledger and the automatic receipt', async () => {
    const iid = await draftInvoice(ID.cust, [{ variant: ID.h4, qty: 3, rate: 1900 }], 'cash');
    await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, iid, actor));
    await db.writeTransaction((tx) => cancelInvoice(tx as unknown as Transaction, iid, 'customer changed mind', actor));
    expect(stock(ID.h4, ID.main)).toBe(20);
    expect(balance('customer', ID.cust)).toBe(0);
    expect(one<{ status: string; paid_total: number }>(db, 'SELECT status, paid_total FROM sales_invoices WHERE id = ?', iid)).toEqual({ status: 'cancelled', paid_total: 0 });
    expect(one<{ status: string }>(db, 'SELECT status FROM payments').status).toBe('cancelled');
    expect(many(db, 'SELECT * FROM payment_allocations')).toHaveLength(0);
    // 4 ledger rows: invoice debit, receipt credit, receipt reversal debit, invoice reversal credit -> net zero
    expect(many(db, "SELECT * FROM ledger_entries WHERE party_id = ?", ID.cust)).toHaveLength(4);
  });

  it('refuses to cancel an invoice that has a credit note', async () => {
    const iid = await draftInvoice(ID.cust, [{ variant: ID.h4, qty: 2, rate: 1900 }], 'credit');
    await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, iid, actor));
    const orig = one<{ id: string }>(db, 'SELECT id FROM sales_invoice_lines WHERE invoice_id = ?', iid);
    const cn = await insertRow(asTx(db), 'sales_invoices', { doc_type: 'credit_note', doc_date: '2026-09-16', customer_id: ID.cust, location_id: ID.main, is_interstate: 0, other_charges: 0, status: 'draft', against_invoice_id: iid, credit_days: 0 }, actor);
    await insertRow(asTx(db), 'sales_invoice_lines', { invoice_id: cn, line_no: 1, variant_id: ID.h4, description: 'x', qty: 1, rate: 1900, discount_pct: 0, discount_amt: 0, tax_rate_pct: 18, return_condition: 'sellable', against_line_id: orig.id });
    await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, cn, actor));
    await expect(db.writeTransaction((tx) => cancelInvoice(tx as unknown as Transaction, iid, 'x', actor))).rejects.toThrow(/Credit notes exist/);
  });
});

describe('payments', () => {
  it('allocates a receipt oldest-first and leaves the surplus as advance', async () => {
    const a = await draftInvoice(ID.cust, [{ variant: ID.h4, qty: 1, rate: 1000 }], 'credit');
    db.raw.prepare("UPDATE sales_invoices SET doc_date = '2026-08-01' WHERE id = ?").run(a);
    const b = await draftInvoice(ID.cust, [{ variant: ID.h4, qty: 1, rate: 2000 }], 'credit');
    await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, a, actor));
    await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, b, actor));
    expect(balance('customer', ID.cust)).toBe(1180 + 2360);

    const no = await db.writeTransaction((tx) => postPayment(tx as unknown as Transaction, { direction: 'in', party_id: ID.cust, amount: 2000, mode: 'cash', payment_date: '2026-09-16', allocations: 'auto' }, actor));
    expect(no).toBe('RCP/26-27/0001');
    expect(one<{ paid_total: number }>(db, 'SELECT paid_total FROM sales_invoices WHERE id = ?', a).paid_total).toBe(1180);
    expect(one<{ paid_total: number }>(db, 'SELECT paid_total FROM sales_invoices WHERE id = ?', b).paid_total).toBe(820);
    expect(balance('customer', ID.cust)).toBe(1540);

    await db.writeTransaction((tx) => postPayment(tx as unknown as Transaction, { direction: 'in', party_id: ID.cust, amount: 5000, mode: 'bank', payment_date: '2026-09-17', allocations: 'auto' }, actor));
    expect(one<{ paid_total: number }>(db, 'SELECT paid_total FROM sales_invoices WHERE id = ?', b).paid_total).toBe(2360);
    expect(balance('customer', ID.cust)).toBe(1540 - 5000); // advance held as negative outstanding
  });

  it('reverses a bounced cheque: allocations removed, ledger reversed', async () => {
    const a = await draftInvoice(ID.cust, [{ variant: ID.h4, qty: 1, rate: 1000 }], 'credit');
    await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, a, actor));
    await db.writeTransaction((tx) => postPayment(tx as unknown as Transaction, { direction: 'in', party_id: ID.cust, amount: 1180, mode: 'cheque', reference_no: '123', payment_date: '2026-09-16' }, actor));
    expect(balance('customer', ID.cust)).toBe(0);
    const pid = one<{ id: string }>(db, 'SELECT id FROM payments').id;
    await db.writeTransaction((tx) => cancelPayment(tx as unknown as Transaction, pid, 'Cheque bounced', actor));
    expect(balance('customer', ID.cust)).toBe(1180);
    expect(one<{ paid_total: number }>(db, 'SELECT paid_total FROM sales_invoices WHERE id = ?', a).paid_total).toBe(0);
    expect(one<{ status: string }>(db, 'SELECT status FROM payments WHERE id = ?', pid).status).toBe('bounced');
  });

  it('pays a supplier against the oldest bill', async () => {
    const pid = await draftPurchase([{ variant: ID.h4, qty: 1, rate: 1000 }]);
    await db.writeTransaction((tx) => postPurchase(tx as unknown as Transaction, pid, actor));
    const no = await db.writeTransaction((tx) => postPayment(tx as unknown as Transaction, { direction: 'out', party_id: ID.sup, amount: 1180, mode: 'bank', payment_date: '2026-09-20' }, actor));
    expect(no).toBe('PAY/26-27/0001');
    expect(balance('supplier', ID.sup)).toBe(0);
    expect(one<{ paid_total: number }>(db, 'SELECT paid_total FROM purchases WHERE id = ?', pid).paid_total).toBe(1180);
  });
});

describe('transfers, adjustments, audits', () => {
  it('moves stock out on dispatch and in on receipt, and can be cancelled while in transit', async () => {
    const tid = await insertRow(asTx(db), 'stock_transfers', { doc_date: '2026-09-15', from_location_id: ID.main, to_location_id: ID.shop, status: 'draft' }, actor);
    await insertRow(asTx(db), 'stock_transfer_lines', { transfer_id: tid, variant_id: ID.h4, qty: 6, unit_cost: 0 });
    const no = await db.writeTransaction((tx) => dispatchTransfer(tx as unknown as Transaction, tid, actor));
    expect(no).toBe('TRF/26-27/0001');
    expect(stock(ID.h4, ID.main)).toBe(14);
    expect(stock(ID.h4, ID.shop)).toBe(0);
    await db.writeTransaction((tx) => receiveTransfer(tx as unknown as Transaction, tid, actor));
    expect(stock(ID.h4, ID.shop)).toBe(6);
    expect(one<{ status: string }>(db, 'SELECT status FROM stock_transfers WHERE id = ?', tid).status).toBe('received');
    await expect(db.writeTransaction((tx) => receiveTransfer(tx as unknown as Transaction, tid, actor))).rejects.toThrow();
  });

  it('posts an adjustment with the right movement type per reason', async () => {
    const aid = await insertRow(asTx(db), 'stock_adjustments', { doc_date: '2026-09-15', location_id: ID.main, reason: 'damage', status: 'draft' }, actor);
    await insertRow(asTx(db), 'stock_adjustment_lines', { adjustment_id: aid, variant_id: ID.h4, qty_delta: -2, unit_cost: 0, reason_code: 'damage' });
    const no = await db.writeTransaction((tx) => postAdjustment(tx as unknown as Transaction, aid, actor));
    expect(no).toBe('ADJ/26-27/0001');
    expect(stock(ID.h4, ID.main)).toBe(18);
    const m = one<{ movement_type: string; unit_cost: number }>(db, "SELECT movement_type, unit_cost FROM stock_movements WHERE ref_id = ?", aid);
    expect(m.movement_type).toBe('damage');
    expect(m.unit_cost).toBe(1450); // falls back to average cost
  });

  it('audit: snapshot, count, close posts only the differences', async () => {
    const auditId = await insertRow(asTx(db), 'stock_audits', { location_id: ID.main, name: 'Q2 count', status: 'open', started_at: '2026-09-15T00:00:00Z' }, actor);
    const n = await db.writeTransaction((tx) => snapshotAudit(tx as unknown as Transaction, auditId));
    expect(n).toBe(1); // only H4 has stock at main
    const line = one<{ id: string; system_qty: number }>(db, 'SELECT id, system_qty FROM stock_audit_lines WHERE audit_id = ?', auditId);
    expect(line.system_qty).toBe(20);
    // a sale happens during the count: system stock drops, the snapshot does not
    const iid = await draftInvoice(ID.cust, [{ variant: ID.h4, qty: 3, rate: 1900 }], 'cash');
    await db.writeTransaction((tx) => postInvoice(tx as unknown as Transaction, iid, actor));
    db.raw.prepare("UPDATE stock_audit_lines SET counted_qty = 19, reason_code = 'missing' WHERE id = ?").run(line.id);
    const res = await db.writeTransaction((tx) => closeAudit(tx as unknown as Transaction, auditId, actor));
    expect(res.lines).toBe(1);
    expect(res.docNo).toBe('ADJ/26-27/0001');
    // difference was -1 against the snapshot, so stock = 20 - 3 (sale) - 1 = 16
    expect(stock(ID.h4, ID.main)).toBe(16);
    expect(one<{ status: string; adjustment_id: string }>(db, 'SELECT status, adjustment_id FROM stock_audits WHERE id = ?', auditId).status).toBe('closed');
  });

  it('a failed post rolls the whole transaction back', async () => {
    const pid = await insertRow(asTx(db), 'purchases', { doc_type: 'purchase', doc_date: '2026-09-15', supplier_id: ID.sup, location_id: ID.main, status: 'draft', is_interstate: 0, other_charges: 0 }, actor);
    await expect(db.writeTransaction((tx) => postPurchase(tx as unknown as Transaction, pid, actor))).rejects.toThrow();
    expect(many(db, "SELECT * FROM document_sequences WHERE doc_type = 'purchase' AND next_number > 1")).toHaveLength(0);
    expect(many(db, 'SELECT * FROM ledger_entries')).toHaveLength(0);
  });
});

describe('workshop job cards', () => {
  it('closes a job card into a posted invoice: parts move stock, labour does not', async () => {
    // a service SKU for labour
    row(db, 'product_families', { id: 'fam-srv', code: 'SRVC', name: 'Services & Labour', sku_prefix: 'SRV', sku_template: '{FAMILY}', is_active: 1 });
    row(db, 'products', { id: 'prod-srv', family_id: 'fam-srv', name: 'Installation Labour', hsn_code: '9987', tax_rate_id: ID.tax18, is_active: 1, is_universal_fit: 1, search_text: '' });
    row(db, 'product_variants', { id: 'var-srv', product_id: 'prod-srv', variant_name: 'Headlight Fitting', sku: 'SRV-INST', retail_price: 300, avg_cost: 0, last_purchase_cost: 0, min_stock: 0, reorder_level: 0, reorder_qty: 0, is_active: 1, search_text: '', sort_order: 0 });
    row(db, 'document_sequences', { id: 'seq-job', series_code: 'A', doc_type: 'job_card', financial_year: '26-27', prefix: 'JOB/26-27/', next_number: 1, pad_width: 4 });
    row(db, 'customer_vehicles', { id: 'cv-1', customer_id: ID.cust, registration_no: 'UP16AB1234' });

    const jc = await insertRow(asTx(db), 'job_cards', { doc_date: '2026-09-15', customer_id: ID.cust, customer_vehicle_id: 'cv-1', location_id: ID.main, status: 'in_progress', parts_total: 0, labour_total: 0, discount_total: 0, tax_total: 0, grand_total: 0 }, actor);
    await insertRow(asTx(db), 'job_card_lines', { job_card_id: jc, variant_id: ID.h4, description: 'Ultra LED H4 60W', qty: 2, rate: 1900, tax_rate_pct: 18, line_total: 3800 });
    await insertRow(asTx(db), 'job_card_labour', { job_card_id: jc, description: 'Headlight fitting both sides', amount: 500, sac_code: '9987', tax_rate_pct: 18 });

    const res = await db.writeTransaction((tx) => closeJobCard(tx as unknown as Transaction, jc, actor, { paymentMode: 'upi' }));
    expect(res.docNo).toBe('NOI/A/26-27/0001');

    const j = one<{ status: string; doc_no: string; invoice_id: string; parts_total: number; labour_total: number; grand_total: number }>(db, 'SELECT * FROM job_cards WHERE id = ?', jc);
    expect(j.status).toBe('closed');
    expect(j.doc_no).toBe('JOB/26-27/0001');
    expect(j.invoice_id).toBe(res.invoiceId);
    expect(j.parts_total).toBe(3800);
    expect(j.labour_total).toBe(500);
    expect(j.grand_total).toBe(5074); // (3800 + 500) * 1.18

    // parts left the workshop location; the labour line moved nothing
    expect(stock(ID.h4, ID.main)).toBe(18);
    expect(many(db, "SELECT * FROM stock_movements WHERE variant_id = 'var-srv'")).toHaveLength(0);
    const lines = many<{ description: string; hsn_code: string; qty: number; rate: number }>(db, 'SELECT description, hsn_code, qty, rate FROM sales_invoice_lines WHERE invoice_id = ? ORDER BY line_no', res.invoiceId);
    expect(lines).toEqual([
      { description: 'Ultra LED H4 60W', hsn_code: '8539', qty: 2, rate: 1900 },
      { description: 'Headlight fitting both sides', hsn_code: '9987', qty: 1, rate: 500 },
    ]);
    // UPI: paid on the spot
    expect(one<{ paid_total: number; customer_vehicle_id: string }>(db, 'SELECT paid_total, customer_vehicle_id FROM sales_invoices WHERE id = ?', res.invoiceId)).toEqual({ paid_total: 5074, customer_vehicle_id: 'cv-1' });
    await expect(db.writeTransaction((tx) => closeJobCard(tx as unknown as Transaction, jc, actor, { paymentMode: 'cash' }))).rejects.toThrow(/already closed/);
  });
});
