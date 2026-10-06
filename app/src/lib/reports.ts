/**
 * The reports the partners take out of the app as PDF (owner, 6 Oct 2026:
 * "reports export pdf ka hojae with proper data formatting to maja ajaye").
 *
 * Every figure is read from the phone's own database with the same rules the
 * screens use — Sale nets off returns, cost is the movement's stamped cost,
 * partner money is never business kharcha — so a PDF and the screen it came
 * from can never disagree.
 */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { shareInvoiceHtml } from './invoice-html';
import { FITS_OF, SPECS_OF } from './queries';
import { day, inr, reportHtml, type ReportFigure, type ReportRow, type ReportSection } from './report-html';
import { payModeLabel } from './words';

type DB = AbstractPowerSyncDatabase;

async function shop(db: DB) {
  const c = await db.getOptional<{ trade_name: string | null; legal_name: string | null; address_line1: string | null; city: string | null; phone: string | null }>(
    'SELECT trade_name, legal_name, address_line1, city, phone FROM company_settings LIMIT 1');
  return {
    shopName: c?.trade_name || c?.legal_name || 'AutoLoom',
    shopLine: [c?.address_line1, c?.city, c?.phone].filter(Boolean).join(' · ') || null,
  };
}

/** Rows grouped under a heading per key, with a subtotal after each group. */
function grouped<T>(items: T[], key: (t: T) => string, heading: (k: string, list: T[]) => string,
  row: (t: T) => ReportRow, subtotal?: (list: T[]) => ReportRow): ReportRow[] {
  const out: ReportRow[] = [];
  const groups = new Map<string, T[]>();
  for (const t of items) {
    const k = key(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  for (const [k, list] of groups) {
    out.push({ _heading: heading(k, list) });
    out.push(...list.map(row));
    if (subtotal && list.length > 1) out.push({ ...subtotal(list), _subtotal: true });
  }
  return out;
}

const sum = <T,>(list: T[], f: (t: T) => number) => list.reduce((a, t) => a + (Number(f(t)) || 0), 0);

// -----------------------------------------------------------------------------
// Sale — the timeline the partners asked for
// -----------------------------------------------------------------------------
export async function saleReport(db: DB, from: string, to: string): Promise<string> {
  const bills = await db.getAll<{
    doc_no: string; doc_date: string; doc_type: string; customer: string | null; is_cash: number;
    payment_mode: string; grand_total: number; paid_total: number; pcs: number; by: string | null;
  }>(`
    SELECT i.doc_no, i.doc_date, i.doc_type, c.name AS customer, COALESCE(c.is_cash, 0) AS is_cash,
           i.payment_mode, i.grand_total, i.paid_total,
           (SELECT COALESCE(SUM(qty), 0) FROM sales_invoice_lines l WHERE l.invoice_id = i.id) AS pcs,
           pr.full_name AS by
      FROM sales_invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN profiles pr ON pr.id = i.salesperson_id
     WHERE i.status = 'posted' AND i.doc_type IN ('invoice', 'credit_note') AND i.doc_date BETWEEN ?1 AND ?2
     ORDER BY i.doc_date, i.doc_no`, [from, to]);

  const items = await db.getAll<{ item: string; pcs: number; amount: number }>(`
    SELECT p.name || ' · ' || pv.variant_name AS item,
           SUM(CASE WHEN i.doc_type = 'credit_note' THEN -l.qty ELSE l.qty END) AS pcs,
           SUM(CASE WHEN i.doc_type = 'credit_note' THEN -l.line_total ELSE l.line_total END) AS amount
      FROM sales_invoice_lines l
      JOIN sales_invoices i ON i.id = l.invoice_id
      JOIN product_variants pv ON pv.id = l.variant_id
      JOIN products p ON p.id = pv.product_id
     WHERE i.status = 'posted' AND i.doc_type IN ('invoice', 'credit_note') AND i.doc_date BETWEEN ?1 AND ?2
     GROUP BY l.variant_id ORDER BY amount DESC LIMIT 40`, [from, to]);

  const sign = (b: { doc_type: string }) => (b.doc_type === 'credit_note' ? -1 : 1);
  const invoices = bills.filter((b) => b.doc_type === 'invoice');
  const returns = bills.filter((b) => b.doc_type === 'credit_note');
  const net = sum(bills, (b) => sign(b) * b.grand_total);
  const paidNow = sum(invoices, (b) => b.paid_total);
  const udhaar = sum(invoices, (b) => b.grand_total - b.paid_total);

  const byCustomer = new Map<string, { bills: number; amount: number }>();
  for (const b of bills) {
    const k = b.customer ?? 'Cash';
    const e = byCustomer.get(k) ?? { bills: 0, amount: 0 };
    e.bills += b.doc_type === 'invoice' ? 1 : 0;
    e.amount += sign(b) * b.grand_total;
    byCustomer.set(k, e);
  }

  const figures: ReportFigure[] = [
    { label: 'Kul sale', value: inr(net), tone: 'strong', sub: `${invoices.length} bill` },
    { label: 'Turant paisa aaya', value: inr(paidNow), tone: 'plus' },
    { label: 'Udhaar mein gaya', value: inr(udhaar), tone: udhaar > 0 ? 'minus' : undefined },
    { label: 'Maal wapas aaya', value: inr(sum(returns, (b) => b.grand_total)), sub: `${returns.length} wapsi` },
  ];

  const timeline: ReportSection = {
    title: 'Din ke hisaab se',
    cols: [
      { key: 'no', label: 'Bill' }, { key: 'customer', label: 'Grahak' }, { key: 'by', label: 'Kisne' },
      { key: 'pcs', label: 'Pcs', num: true }, { key: 'mode', label: 'Paisa' }, { key: 'amount', label: 'Rakam', money: true },
    ],
    rows: grouped(bills, (b) => b.doc_date,
      (d, list) => `${day(d)} · ${list.filter((b) => b.doc_type === 'invoice').length} bill · ${inr(sum(list, (b) => sign(b) * b.grand_total))}`,
      (b) => ({
        no: b.doc_type === 'credit_note' ? `${b.doc_no} (wapsi)` : b.doc_no,
        customer: b.customer ?? 'Cash', by: b.by, pcs: sign(b) * b.pcs,
        mode: b.doc_type === 'credit_note' ? 'Wapsi' : payModeLabel(b.payment_mode),
        amount: sign(b) * b.grand_total,
      }),
      (list) => ({ customer: 'Din ka kul', pcs: sum(list, (b) => sign(b) * b.pcs), amount: sum(list, (b) => sign(b) * b.grand_total) })),
    totals: { pcs: sum(bills, (b) => sign(b) * b.pcs), amount: net },
  };

  const customers: ReportSection = {
    title: 'Grahak ke hisaab se',
    cols: [{ key: 'customer', label: 'Grahak' }, { key: 'bills', label: 'Bill', num: true }, { key: 'amount', label: 'Rakam', money: true }],
    rows: [...byCustomer.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([customer, e]) => ({ customer, ...e })),
    totals: { bills: invoices.length, amount: net },
  };

  const itemsSection: ReportSection = {
    title: 'Sabse zyada bikne wala maal',
    cols: [{ key: 'item', label: 'Item' }, { key: 'pcs', label: 'Pcs', num: true }, { key: 'amount', label: 'Rakam', money: true }],
    rows: items,
  };

  return reportHtml({ ...(await shop(db)), title: 'Sale ka hisaab', from, to, figures, sections: [timeline, customers, itemsSection] });
}

// -----------------------------------------------------------------------------
// One party's khata, as a statement
// -----------------------------------------------------------------------------
export async function ledgerReport(db: DB, partyType: 'customer' | 'supplier', partyId: string, from: string, to: string): Promise<string> {
  const party = await db.getOptional<{ name: string; mobile: string | null; city: string | null }>(
    `SELECT name, mobile, city FROM ${partyType === 'customer' ? 'customers' : 'suppliers'} WHERE id = ?`, [partyId]);
  // Customer: what they owe us = debit − credit. Supplier: what we owe = credit − debit.
  const dir = partyType === 'customer' ? 1 : -1;
  const before = await db.getOptional<{ bal: number }>(
    `SELECT COALESCE(SUM(debit - credit), 0) AS bal FROM ledger_entries
      WHERE party_type = ?1 AND party_id = ?2 AND entry_date < ?3`, [partyType, partyId, from]);
  const entries = await db.getAll<{ entry_date: string; doc_no: string | null; narration: string | null; doc_type: string; debit: number; credit: number }>(
    `SELECT entry_date, doc_no, narration, doc_type, debit, credit FROM ledger_entries
      WHERE party_type = ?1 AND party_id = ?2 AND entry_date BETWEEN ?3 AND ?4
      ORDER BY entry_date, created_at`, [partyType, partyId, from, to]);

  const opening = dir * (before?.bal ?? 0);
  let running = opening;
  const rows: ReportRow[] = [{ date: day(from), what: 'Pichhla baaki', plus: null, minus: null, balance: opening }];
  for (const e of entries) {
    const plus = partyType === 'customer' ? e.debit : e.credit;
    const minus = partyType === 'customer' ? e.credit : e.debit;
    running += plus - minus;
    rows.push({ date: day(e.entry_date), what: e.narration ?? e.doc_type, no: e.doc_no, plus: plus || null, minus: minus || null, balance: running });
  }
  const closing = running;
  const owe = partyType === 'customer' ? 'Lena hai' : 'Dena hai';

  const figures: ReportFigure[] = [
    { label: 'Pichhla baaki', value: inr(opening) },
    { label: partyType === 'customer' ? 'Maal diya (+)' : 'Maal aaya (+)', value: inr(sum(entries, (e) => (partyType === 'customer' ? e.debit : e.credit))) },
    { label: partyType === 'customer' ? 'Paisa aaya (−)' : 'Paisa diya (−)', value: inr(sum(entries, (e) => (partyType === 'customer' ? e.credit : e.debit))) },
    { label: closing >= 0 ? owe : 'Advance', value: inr(Math.abs(closing)), tone: 'strong' },
  ];

  return reportHtml({
    ...(await shop(db)),
    title: `${party?.name ?? 'Party'} ka khata`,
    subtitle: [party?.mobile, party?.city].filter(Boolean).join(' · ') || null,
    from, to, figures,
    sections: [{
      cols: [
        { key: 'date', label: 'Tareekh' }, { key: 'what', label: 'Kya hua' }, { key: 'no', label: 'No.' },
        { key: 'plus', label: '+', money: true }, { key: 'minus', label: '−', money: true }, { key: 'balance', label: 'Baaki', money: true },
      ],
      rows,
      note: partyType === 'customer'
        ? '+ = maal diya (udhaar badha) · − = paisa aaya ya maal wapas aaya · Baaki = grahak ko itna dena hai'
        : '+ = maal aaya · − = paisa diya ya maal wapas gaya · Baaki = supplier ko itna dena hai',
    }],
  });
}

// -----------------------------------------------------------------------------
// Stock — what is in the godown, and in the kharab corner
// -----------------------------------------------------------------------------
export async function stockReport(db: DB, showCost: boolean): Promise<string> {
  const rows = await db.getAll<{ family: string | null; item: string; sku: string; specs: string | null; fits: string | null; godown: number; kharab: number; cost: number; price: number }>(`
    SELECT f.name AS family, p.name || ' · ' || pv.variant_name AS item, pv.sku,
           ${SPECS_OF('p', 'pv')} AS specs, ${FITS_OF('p', 'pv')} AS fits,
           COALESCE((SELECT SUM(s.qty) FROM stock_on_hand s JOIN locations l ON l.id = s.location_id
                      WHERE s.variant_id = pv.id AND l.type <> 'damaged'), 0) AS godown,
           COALESCE((SELECT SUM(s.qty) FROM stock_on_hand s JOIN locations l ON l.id = s.location_id
                      WHERE s.variant_id = pv.id AND l.type = 'damaged'), 0) AS kharab,
           COALESCE(NULLIF(pv.avg_cost, 0), pv.last_purchase_cost, 0) AS cost, pv.retail_price AS price
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN product_families f ON f.id = p.family_id
     WHERE pv.is_active = 1 AND p.is_active = 1
     ORDER BY f.sort_order, f.name, p.name, pv.variant_name`);
  const live = rows.filter((r) => r.godown !== 0 || r.kharab !== 0);

  const cols = [
    { key: 'item', label: 'Item' }, { key: 'detail', label: 'Detail' },
    { key: 'godown', label: 'Godown', num: true }, { key: 'kharab', label: 'Kharab', num: true },
    ...(showCost ? [{ key: 'cost', label: 'Kharid', money: true }, { key: 'value', label: 'Keemat', money: true }] : []),
    { key: 'price', label: 'Bechna', money: true },
  ];
  const figures: ReportFigure[] = [
    { label: 'Item', value: String(live.length) },
    { label: 'Godown mein', value: `${sum(live, (r) => r.godown)} pcs`, tone: 'strong' },
    { label: 'Kharab mein', value: `${sum(live, (r) => r.kharab)} pcs`, tone: sum(live, (r) => r.kharab) ? 'minus' : undefined },
    ...(showCost ? [{ label: 'Godown ki keemat', value: inr(sum(live, (r) => r.godown * r.cost)), tone: 'strong' as const }] : []),
  ];
  return reportHtml({
    ...(await shop(db)),
    title: 'Stock ka hisaab',
    subtitle: `Aaj tak · ${day(new Date().toISOString())}`,
    figures,
    sections: [{
      cols,
      rows: grouped(live, (r) => r.family ?? 'Baaki', (k, list) => `${k} · ${sum(list, (r) => r.godown)} pcs`,
        (r) => ({ item: r.item, detail: [r.specs, r.fits, r.sku].filter(Boolean).join(' · '), godown: r.godown, kharab: r.kharab || null, cost: r.cost, value: r.godown * r.cost, price: r.price })),
      totals: { godown: sum(live, (r) => r.godown), kharab: sum(live, (r) => r.kharab), ...(showCost ? { value: sum(live, (r) => r.godown * r.cost) } : {}) },
      empty: 'Abhi stock mein kuch nahi.',
    }],
  });
}

// -----------------------------------------------------------------------------
// Partners — who put in what, who took out what
// -----------------------------------------------------------------------------
export async function partnerReport(db: DB, from: string, to: string): Promise<string> {
  const entries = await db.getAll<{ partner: string; payment_date: string; direction: string; amount: number; mode: string; notes: string | null }>(`
    SELECT COALESCE(pr.full_name, 'Partner') AS partner, pm.payment_date, pm.direction, pm.amount, pm.mode, pm.notes
      FROM payments pm LEFT JOIN profiles pr ON pr.id = pm.party_id
     WHERE pm.party_type = 'partner' AND pm.status = 'posted' AND pm.payment_date BETWEEN ?1 AND ?2
     ORDER BY pr.full_name, pm.payment_date, pm.created_at`, [from, to]);
  const allTime = await db.getAll<{ partner: string; lagaya: number; nikala: number }>(`
    SELECT COALESCE(pr.full_name, 'Partner') AS partner,
           SUM(CASE WHEN pm.direction = 'in' THEN pm.amount ELSE 0 END) AS lagaya,
           SUM(CASE WHEN pm.direction = 'out' THEN pm.amount ELSE 0 END) AS nikala
      FROM payments pm LEFT JOIN profiles pr ON pr.id = pm.party_id
     WHERE pm.party_type = 'partner' AND pm.status = 'posted' AND pm.payment_date <= ?1
     GROUP BY pm.party_id ORDER BY pr.full_name`, [to]);

  const lagaya = sum(entries, (e) => (e.direction === 'in' ? e.amount : 0));
  const nikala = sum(entries, (e) => (e.direction === 'out' ? e.amount : 0));
  const figures: ReportFigure[] = [
    { label: 'Is period lagaya', value: inr(lagaya), tone: 'plus' },
    { label: 'Is period nikala', value: inr(nikala), tone: 'minus' },
    { label: 'Kul poonji (aaj tak)', value: inr(sum(allTime, (p) => p.lagaya - p.nikala)), tone: 'strong' },
  ];
  return reportHtml({
    ...(await shop(db)),
    title: 'Partner ka hisaab', from, to, figures,
    sections: [
      {
        title: `Har partner — ${day(to)} tak`,
        cols: [{ key: 'partner', label: 'Partner' }, { key: 'lagaya', label: 'Lagaya', money: true }, { key: 'nikala', label: 'Nikala', money: true }, { key: 'net', label: 'Business mein', money: true }],
        rows: allTime.map((p) => ({ ...p, net: p.lagaya - p.nikala })),
        totals: { lagaya: sum(allTime, (p) => p.lagaya), nikala: sum(allTime, (p) => p.nikala), net: sum(allTime, (p) => p.lagaya - p.nikala) },
      },
      {
        title: 'Har entry',
        cols: [{ key: 'date', label: 'Tareekh' }, { key: 'what', label: 'Kya' }, { key: 'mode', label: 'Kaise' }, { key: 'note', label: 'Note' }, { key: 'amount', label: 'Rakam', money: true }],
        rows: grouped(entries, (e) => e.partner, (k, list) => `${k} · lagaya ${inr(sum(list, (e) => (e.direction === 'in' ? e.amount : 0)))} · nikala ${inr(sum(list, (e) => (e.direction === 'out' ? e.amount : 0)))}`,
          (e) => ({ date: day(e.payment_date), what: e.direction === 'in' ? 'Lagaya' : 'Nikala', mode: payModeLabel(e.mode), note: e.notes, amount: e.direction === 'in' ? e.amount : -e.amount })),
      },
    ],
  });
}

// -----------------------------------------------------------------------------
// Munafa — the same arithmetic as the Hisab tab
// -----------------------------------------------------------------------------
export async function munafaReport(db: DB, from: string, to: string): Promise<string> {
  const s = await db.getOptional<{ sale: number; bills: number; cogs: number; kharcha: number; damage: number }>(`
    SELECT
      (SELECT COALESCE(SUM(CASE WHEN doc_type = 'credit_note' THEN -grand_total ELSE grand_total END), 0) FROM sales_invoices
        WHERE doc_type IN ('invoice', 'credit_note') AND status = 'posted' AND doc_date BETWEEN ?1 AND ?2) AS sale,
      (SELECT COUNT(*) FROM sales_invoices WHERE doc_type = 'invoice' AND status = 'posted' AND doc_date BETWEEN ?1 AND ?2) AS bills,
      (SELECT COALESCE(SUM(-m.qty * m.unit_cost), 0) FROM stock_movements m JOIN sales_invoices i ON i.id = m.ref_id
        WHERE m.movement_type IN ('sale', 'sale_return') AND i.status = 'posted' AND i.doc_date BETWEEN ?1 AND ?2) AS cogs,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date BETWEEN ?1 AND ?2 AND COALESCE(is_personal, 0) = 0) AS kharcha,
      (SELECT COALESCE(SUM(-m.qty * m.unit_cost), 0) FROM stock_movements m JOIN stock_adjustments a ON a.id = m.ref_id
        WHERE m.movement_type = 'damage' AND a.status = 'posted' AND a.doc_date BETWEEN ?1 AND ?2) AS damage`, [from, to]);
  const byCategory = await db.getAll<{ category: string; amount: number; n: number }>(`
    SELECT COALESCE(category, 'Aur kuch') AS category, SUM(amount) AS amount, COUNT(*) AS n FROM expenses
     WHERE expense_date BETWEEN ?1 AND ?2 AND COALESCE(is_personal, 0) = 0
     GROUP BY category ORDER BY amount DESC`, [from, to]);
  const losses = await db.getAll<{ doc_date: string; item: string; qty: number; amount: number }>(`
    SELECT a.doc_date, p.name || ' · ' || pv.variant_name AS item, -m.qty AS qty, -m.qty * m.unit_cost AS amount
      FROM stock_movements m JOIN stock_adjustments a ON a.id = m.ref_id
      JOIN product_variants pv ON pv.id = m.variant_id JOIN products p ON p.id = pv.product_id
     WHERE m.movement_type = 'damage' AND a.status = 'posted' AND a.doc_date BETWEEN ?1 AND ?2
     ORDER BY a.doc_date`, [from, to]);

  const sale = s?.sale ?? 0, cogs = s?.cogs ?? 0, kharcha = s?.kharcha ?? 0, damage = s?.damage ?? 0;
  const gross = sale - cogs;
  const net = gross - kharcha - damage;
  const figures: ReportFigure[] = [
    { label: 'Sale', value: inr(sale), sub: `${s?.bills ?? 0} bill` },
    { label: 'Maal ki cost', value: inr(cogs) },
    { label: 'Maal par munafa', value: inr(gross), tone: gross >= 0 ? 'plus' : 'minus' },
    { label: 'Kharcha', value: inr(kharcha) },
    { label: 'Kharab / nuksan', value: inr(damage) },
    { label: 'Asli munafa', value: inr(net), tone: net >= 0 ? 'plus' : 'minus' },
  ];
  return reportHtml({
    ...(await shop(db)),
    title: 'Munafa ka hisaab', from, to, figures,
    sections: [
      {
        title: 'Hisaab',
        cols: [{ key: 'what', label: '' }, { key: 'amount', label: 'Rakam', money: true }],
        rows: [
          { what: 'Sale (wapsi kaat ke)', amount: sale },
          { what: '− Maal ki cost', amount: -cogs },
          { what: 'Maal par munafa', amount: gross, _subtotal: true },
          { what: '− Kharcha', amount: -kharcha },
          { what: '− Kharab / nuksan', amount: -damage },
          { what: 'Asli munafa', amount: net, _subtotal: true },
        ],
      },
      {
        title: 'Kharcha kis cheez par',
        cols: [{ key: 'category', label: 'Kis cheez ka' }, { key: 'n', label: 'Entry', num: true }, { key: 'amount', label: 'Rakam', money: true }],
        rows: byCategory, totals: { n: sum(byCategory, (c) => c.n), amount: kharcha }, empty: 'Is period koi kharcha nahi.',
      },
      {
        title: 'Kharab / nuksan',
        cols: [{ key: 'date', label: 'Tareekh' }, { key: 'item', label: 'Item' }, { key: 'qty', label: 'Pcs', num: true }, { key: 'amount', label: 'Nuksan', money: true }],
        rows: losses.map((l) => ({ ...l, date: day(l.doc_date) })), totals: { qty: sum(losses, (l) => l.qty), amount: damage },
        empty: 'Is period kuch fenkna nahi pada.',
      },
    ],
    note: 'Partner ka nikala paisa kharcha nahi hai — wo Partner ke hisaab mein hai. Supplier ko diya paisa bhi kharcha nahi: maal ki cost bikne par hi lagti hai.',
  });
}

// -----------------------------------------------------------------------------
// Kharcha — every rupee out that was not maal
// -----------------------------------------------------------------------------
export async function kharchaReport(db: DB, from: string, to: string): Promise<string> {
  const rows = await db.getAll<{ expense_date: string; category: string | null; paid_to: string | null; note: string | null; mode: string; amount: number; by: string | null }>(`
    SELECT e.expense_date, e.category, e.paid_to, e.note, e.mode, e.amount, e.paid_by AS by
      FROM expenses e
     WHERE e.expense_date BETWEEN ?1 AND ?2 AND COALESCE(e.is_personal, 0) = 0
     ORDER BY e.expense_date, e.created_at`, [from, to]);
  const total = sum(rows, (r) => r.amount);
  return reportHtml({
    ...(await shop(db)),
    title: 'Kharcha', from, to,
    figures: [{ label: 'Kul kharcha', value: inr(total), tone: 'strong', sub: `${rows.length} entry` }],
    sections: [{
      cols: [{ key: 'category', label: 'Kis cheez ka' }, { key: 'to', label: 'Kisko' }, { key: 'by', label: 'Kisne diya' }, { key: 'mode', label: 'Kaise' }, { key: 'amount', label: 'Rakam', money: true }],
      rows: grouped(rows, (r) => r.expense_date, (d, list) => `${day(d)} · ${inr(sum(list, (r) => r.amount))}`,
        (r) => ({ category: r.category ?? '—', to: [r.paid_to, r.note].filter(Boolean).join(' · '), by: r.by, mode: payModeLabel(r.mode), amount: r.amount })),
      totals: { amount: total },
    }],
  });
}

/** Print or share a report: PDF share sheet on a phone, print dialog on the web. */
export function shareReport(html: string, fileName: string) {
  return shareInvoiceHtml(html, fileName);
}
