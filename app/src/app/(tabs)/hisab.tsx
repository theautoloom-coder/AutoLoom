/**
 * Reports hub. Every report is one SQL statement over the local database with
 * a date range, rendered as a table and exportable to CSV. Works offline.
 */
import { useQuery } from '@powersync/react';
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { financialYearStart, formatINR, toCsv, toDateString } from '@domain';

import { shareInvoiceHtml } from '@/lib/invoice-html';
import { reportHtml } from '@/lib/report-html';
import { useSession } from '@/lib/session';
import { useShopSettings } from '@/lib/use-settings';
import { Button, Card, Chip, Divider, Empty, Input, Row, Screen, Text, useTheme } from '@/ui';
import { notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type Col = { key: string; label: string; money?: boolean; num?: boolean; width?: number };
type Report = {
  key: string; group: string; title: string;
  permission: 'reports.view' | 'reports.view_margin' | 'catalog.view_cost' | 'sale.create' | 'expense.record';
  sql: string; cols: Col[]; dated: boolean;
  /** A summary already ends in its own net line; a "Kul" row under it is noise. */
  noTotals?: boolean;
};

const REPORTS: Report[] = [
  { key: 'hisaab', group: 'Hisaab', title: 'Poora hisaab', permission: 'reports.view', dated: true, noTotals: true,
    sql: `
      SELECT 1 AS ord, 'Bill banaye' AS item, COUNT(*) AS qty, NULL AS amount
        FROM sales_invoices WHERE doc_type='invoice' AND status='posted' AND doc_date BETWEEN ?1 AND ?2
      UNION ALL SELECT 2, 'Bikri', NULL, COALESCE(SUM(grand_total),0)
        FROM sales_invoices WHERE doc_type='invoice' AND status='posted' AND doc_date BETWEEN ?1 AND ?2
      UNION ALL SELECT 3, 'Return (wapas aaya)', NULL, -COALESCE(SUM(grand_total),0)
        FROM sales_invoices WHERE doc_type='credit_note' AND status='posted' AND doc_date BETWEEN ?1 AND ?2
      UNION ALL SELECT 4, 'Paisa aaya', NULL, COALESCE(SUM(amount),0)
        FROM payments WHERE direction='in' AND status='posted' AND payment_date BETWEEN ?1 AND ?2
      UNION ALL SELECT 5, 'Maal kharida', NULL, -COALESCE(SUM(grand_total),0)
        FROM purchases WHERE doc_type='purchase' AND status='posted' AND doc_date BETWEEN ?1 AND ?2
      UNION ALL SELECT 6, 'Supplier ko diya', NULL, -COALESCE(SUM(amount),0)
        FROM payments WHERE direction='out' AND status='posted' AND payment_date BETWEEN ?1 AND ?2
      UNION ALL SELECT 7, 'Kharcha', NULL, -COALESCE(SUM(amount),0)
        FROM expenses WHERE expense_date BETWEEN ?1 AND ?2
      UNION ALL SELECT 8, 'Haath mein aaya (net cash)', 0,
        COALESCE((SELECT SUM(amount) FROM payments WHERE direction='in' AND status='posted' AND payment_date BETWEEN ?1 AND ?2),0)
        - COALESCE((SELECT SUM(amount) FROM payments WHERE direction='out' AND status='posted' AND payment_date BETWEEN ?1 AND ?2),0)
        - COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date BETWEEN ?1 AND ?2),0)
      ORDER BY ord`,
    cols: [{ key: 'item', label: 'Kya', width: 240 }, { key: 'qty', label: 'Ginti', num: true }, { key: 'amount', label: 'Rupaye', money: true }] },

  { key: 'expense_register', group: 'Hisaab', title: 'Kharcha register', permission: 'expense.record', dated: true,
    sql: `SELECT expense_date, category, paid_to, mode, note, amount
          FROM expenses WHERE expense_date BETWEEN ?1 AND ?2 ORDER BY expense_date DESC, created_at DESC`,
    cols: [{ key: 'expense_date', label: 'Date' }, { key: 'category', label: 'Kis cheez ka', width: 150 }, { key: 'paid_to', label: 'Kisko' }, { key: 'mode', label: 'Mode' }, { key: 'note', label: 'Note', width: 180 }, { key: 'amount', label: 'Amount', money: true }] },

  { key: 'expense_by_category', group: 'Hisaab', title: 'Kharcha — kis cheez par', permission: 'expense.record', dated: true,
    sql: `SELECT category, COUNT(*) AS entries, SUM(amount) AS amount
          FROM expenses WHERE expense_date BETWEEN ?1 AND ?2 GROUP BY category ORDER BY amount DESC`,
    cols: [{ key: 'category', label: 'Kis cheez ka', width: 220 }, { key: 'entries', label: 'Entries', num: true }, { key: 'amount', label: 'Amount', money: true }] },
  { key: 'sales_register', group: 'Bikri', title: 'Bikri ka register', permission: 'sale.create', dated: true,
    sql: `SELECT i.doc_no, i.doc_date, c.name AS customer, i.payment_mode, i.taxable_total, i.cgst_total + i.sgst_total + i.igst_total AS tax, i.grand_total, i.paid_total, i.grand_total - i.paid_total AS due
          FROM sales_invoices i JOIN customers c ON c.id = i.customer_id WHERE i.doc_type='invoice' AND i.status='posted' AND i.doc_date BETWEEN ?1 AND ?2 ORDER BY i.doc_date, i.doc_no`,
    cols: [{ key: 'doc_no', label: 'Invoice', width: 160 }, { key: 'doc_date', label: 'Date' }, { key: 'customer', label: 'Customer', width: 180 }, { key: 'payment_mode', label: 'Mode' }, { key: 'taxable_total', label: 'Taxable', money: true }, { key: 'tax', label: 'Tax', money: true }, { key: 'grand_total', label: 'Total', money: true }, { key: 'due', label: 'Due', money: true }] },
  { key: 'sales_by_product', group: 'Bikri', title: 'Item ke hisaab se bikri', permission: 'reports.view', dated: true,
    sql: `SELECT p.name AS product, pv.variant_name, pv.sku, SUM(l.qty) AS qty, SUM(l.taxable_value) AS value, COUNT(DISTINCT i.id) AS invoices
          FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.invoice_id AND i.doc_type='invoice' AND i.status='posted' AND i.doc_date BETWEEN ?1 AND ?2
          JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id GROUP BY pv.id ORDER BY value DESC`,
    cols: [{ key: 'product', label: 'Product', width: 200 }, { key: 'variant_name', label: 'Variant' }, { key: 'sku', label: 'SKU' }, { key: 'qty', label: 'Qty', num: true }, { key: 'value', label: 'Value', money: true }, { key: 'invoices', label: 'Invoices', num: true }] },
  { key: 'sales_by_family', group: 'Bikri', title: 'Category ke hisaab se bikri', permission: 'reports.view', dated: true,
    sql: `SELECT f.name AS family, SUM(l.qty) AS qty, SUM(l.taxable_value) AS value FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.invoice_id AND i.doc_type='invoice' AND i.status='posted' AND i.doc_date BETWEEN ?1 AND ?2
          JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id LEFT JOIN product_families f ON f.id = p.family_id GROUP BY f.id ORDER BY value DESC`,
    cols: [{ key: 'family', label: 'Family', width: 200 }, { key: 'qty', label: 'Qty', num: true }, { key: 'value', label: 'Value', money: true }] },
  { key: 'sales_by_brand', group: 'Bikri', title: 'Brand ke hisaab se bikri', permission: 'reports.view', dated: true,
    sql: `SELECT COALESCE(b.name,'—') AS brand, SUM(l.qty) AS qty, SUM(l.taxable_value) AS value FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.invoice_id AND i.doc_type='invoice' AND i.status='posted' AND i.doc_date BETWEEN ?1 AND ?2
          JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id LEFT JOIN brands b ON b.id = p.brand_id GROUP BY b.id ORDER BY value DESC`,
    cols: [{ key: 'brand', label: 'Brand', width: 200 }, { key: 'qty', label: 'Qty', num: true }, { key: 'value', label: 'Value', money: true }] },
  { key: 'sales_by_customer', group: 'Bikri', title: 'Grahak ke hisaab se bikri', permission: 'reports.view', dated: true,
    sql: `SELECT c.name AS customer, c.customer_type, COUNT(*) AS invoices, SUM(i.grand_total) AS total, SUM(i.grand_total - i.paid_total) AS due FROM sales_invoices i JOIN customers c ON c.id = i.customer_id
          WHERE i.doc_type='invoice' AND i.status='posted' AND i.doc_date BETWEEN ?1 AND ?2 GROUP BY c.id ORDER BY total DESC`,
    cols: [{ key: 'customer', label: 'Customer', width: 200 }, { key: 'customer_type', label: 'Type' }, { key: 'invoices', label: 'Invoices', num: true }, { key: 'total', label: 'Total', money: true }, { key: 'due', label: 'Due', money: true }] },
  { key: 'sales_by_vehicle', group: 'Bikri', title: 'Gaadi ke hisaab se bikri', permission: 'reports.view', dated: true,
    sql: `SELECT mk.name || ' ' || vm.name AS model, SUM(l.qty) AS qty, SUM(l.taxable_value) AS value FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.invoice_id AND i.doc_type='invoice' AND i.status='posted' AND i.doc_date BETWEEN ?1 AND ?2
          JOIN product_fitments pf ON pf.product_id = (SELECT product_id FROM product_variants WHERE id = l.variant_id) AND (pf.variant_id IS NULL OR pf.variant_id = l.variant_id)
          JOIN vehicle_models vm ON vm.id = pf.model_id JOIN vehicle_makes mk ON mk.id = vm.make_id GROUP BY vm.id ORDER BY value DESC`,
    cols: [{ key: 'model', label: 'Model', width: 200 }, { key: 'qty', label: 'Qty', num: true }, { key: 'value', label: 'Value', money: true }] },
  { key: 'sales_by_salesperson', group: 'Bikri', title: 'Kis aadmi ne kitna becha', permission: 'reports.view', dated: true,
    sql: `SELECT COALESCE(pr.full_name,'—') AS salesperson, COUNT(*) AS invoices, SUM(i.grand_total) AS total FROM sales_invoices i LEFT JOIN profiles pr ON pr.id = i.salesperson_id WHERE i.doc_type='invoice' AND i.status='posted' AND i.doc_date BETWEEN ?1 AND ?2 GROUP BY pr.id ORDER BY total DESC`,
    cols: [{ key: 'salesperson', label: 'Bechne wala', width: 200 }, { key: 'invoices', label: 'Invoices', num: true }, { key: 'total', label: 'Total', money: true }] },
  { key: 'gst_sales', group: 'GST', title: 'GST bikri ka hisaab (rate ke hisaab se)', permission: 'reports.view', dated: true,
    sql: `SELECT CASE WHEN i.customer_gstin IS NOT NULL THEN 'B2B' ELSE 'B2C' END AS type, CASE WHEN i.is_interstate THEN 'IGST' ELSE 'CGST+SGST' END AS supply, l.tax_rate_pct AS rate, l.hsn_code,
                 SUM(l.taxable_value) AS taxable, SUM(l.cgst) AS cgst, SUM(l.sgst) AS sgst, SUM(l.igst) AS igst, COUNT(DISTINCT i.id) AS docs
          FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.invoice_id AND i.status='posted' AND i.doc_date BETWEEN ?1 AND ?2
          GROUP BY type, supply, l.tax_rate_pct, l.hsn_code ORDER BY type, supply, rate`,
    cols: [{ key: 'type', label: 'Type' }, { key: 'supply', label: 'Supply' }, { key: 'rate', label: 'Rate %', num: true }, { key: 'hsn_code', label: 'HSN' }, { key: 'taxable', label: 'Taxable', money: true }, { key: 'cgst', label: 'CGST', money: true }, { key: 'sgst', label: 'SGST', money: true }, { key: 'igst', label: 'IGST', money: true }, { key: 'docs', label: 'Docs', num: true }] },
  { key: 'gst_purchase', group: 'GST', title: 'GST purchase ka hisaab (input credit)', permission: 'reports.view', dated: true,
    sql: `SELECT s.name AS supplier, s.gstin, p.doc_no, p.supplier_invoice_no, p.doc_date, p.taxable_total, p.cgst_total, p.sgst_total, p.igst_total, p.grand_total
          FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.status='posted' AND p.doc_date BETWEEN ?1 AND ?2 ORDER BY p.doc_date`,
    cols: [{ key: 'supplier', label: 'Supplier', width: 180 }, { key: 'gstin', label: 'GSTIN' }, { key: 'doc_no', label: 'Our no.' }, { key: 'supplier_invoice_no', label: 'Their bill' }, { key: 'doc_date', label: 'Date' }, { key: 'taxable_total', label: 'Taxable', money: true }, { key: 'cgst_total', label: 'CGST', money: true }, { key: 'sgst_total', label: 'SGST', money: true }, { key: 'igst_total', label: 'IGST', money: true }, { key: 'grand_total', label: 'Total', money: true }] },
  { key: 'purchase_register', group: 'Purchase', title: 'Purchase register', permission: 'reports.view', dated: true,
    sql: `SELECT p.doc_no, p.doc_date, s.name AS supplier, p.doc_type, p.grand_total, p.paid_total, p.grand_total - p.paid_total AS due FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.status='posted' AND p.doc_date BETWEEN ?1 AND ?2 ORDER BY p.doc_date`,
    cols: [{ key: 'doc_no', label: 'No.' }, { key: 'doc_date', label: 'Date' }, { key: 'supplier', label: 'Supplier', width: 180 }, { key: 'doc_type', label: 'Type' }, { key: 'grand_total', label: 'Total', money: true }, { key: 'paid_total', label: 'Paid', money: true }, { key: 'due', label: 'Due', money: true }] },
  { key: 'purchase_by_product', group: 'Purchase', title: 'Purchases by product (price trend)', permission: 'catalog.view_cost', dated: true,
    sql: `SELECT p.name AS product, pv.variant_name, pv.sku, SUM(l.qty) AS qty, MIN(l.rate) AS min_rate, MAX(l.rate) AS max_rate, SUM(l.taxable_value)/SUM(l.qty) AS avg_rate, pv.avg_cost AS current_avg
          FROM purchase_lines l JOIN purchases pu ON pu.id = l.purchase_id AND pu.doc_type='purchase' AND pu.status='posted' AND pu.doc_date BETWEEN ?1 AND ?2
          JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id GROUP BY pv.id ORDER BY qty DESC`,
    cols: [{ key: 'product', label: 'Product', width: 200 }, { key: 'variant_name', label: 'Variant' }, { key: 'qty', label: 'Qty', num: true }, { key: 'min_rate', label: 'Min', money: true }, { key: 'avg_rate', label: 'Avg', money: true }, { key: 'max_rate', label: 'Max', money: true }, { key: 'current_avg', label: 'Avg cost now', money: true }] },
  { key: 'receivables', group: 'Paisa', title: 'Grahak se kitna baaki, kitna purana', permission: 'reports.view', dated: false,
    sql: `SELECT c.name AS customer, c.mobile, COALESCE(pb.balance,0) AS outstanding, c.credit_limit,
                 COALESCE((SELECT SUM(grand_total - paid_total) FROM sales_invoices i WHERE i.customer_id=c.id AND i.doc_type='invoice' AND i.status='posted' AND grand_total>paid_total AND julianday(?2)-julianday(i.due_date) BETWEEN 1 AND 30),0) AS d0_30,
                 COALESCE((SELECT SUM(grand_total - paid_total) FROM sales_invoices i WHERE i.customer_id=c.id AND i.doc_type='invoice' AND i.status='posted' AND grand_total>paid_total AND julianday(?2)-julianday(i.due_date) BETWEEN 31 AND 60),0) AS d31_60,
                 COALESCE((SELECT SUM(grand_total - paid_total) FROM sales_invoices i WHERE i.customer_id=c.id AND i.doc_type='invoice' AND i.status='posted' AND grand_total>paid_total AND julianday(?2)-julianday(i.due_date) BETWEEN 61 AND 90),0) AS d61_90,
                 COALESCE((SELECT SUM(grand_total - paid_total) FROM sales_invoices i WHERE i.customer_id=c.id AND i.doc_type='invoice' AND i.status='posted' AND grand_total>paid_total AND julianday(?2)-julianday(i.due_date) > 90),0) AS d90p
          FROM customers c LEFT JOIN party_balance_live pb ON pb.party_type='customer' AND pb.party_id=c.id WHERE COALESCE(pb.balance,0) <> 0 ORDER BY outstanding DESC`,
    cols: [{ key: 'customer', label: 'Customer', width: 200 }, { key: 'mobile', label: 'Mobile' }, { key: 'outstanding', label: 'Baaki paisa', money: true }, { key: 'credit_limit', label: 'Limit', money: true }, { key: 'd0_30', label: '1-30', money: true }, { key: 'd31_60', label: '31-60', money: true }, { key: 'd61_90', label: '61-90', money: true }, { key: 'd90p', label: '90+', money: true }] },
  { key: 'payables', group: 'Paisa', title: 'Supplier ko kitna dena hai', permission: 'reports.view', dated: false,
    sql: `SELECT s.name AS supplier, s.mobile, s.payment_terms_days, COALESCE(pb.balance,0) AS payable FROM suppliers s LEFT JOIN party_balance_live pb ON pb.party_type='supplier' AND pb.party_id=s.id WHERE COALESCE(pb.balance,0) <> 0 ORDER BY payable DESC`,
    cols: [{ key: 'supplier', label: 'Supplier', width: 200 }, { key: 'mobile', label: 'Mobile' }, { key: 'payment_terms_days', label: 'Terms', num: true }, { key: 'payable', label: 'Humein dena hai', money: true }] },
  { key: 'collections', group: 'Paisa', title: 'Collections & payments', permission: 'reports.view', dated: true,
    sql: `SELECT p.payment_date, p.doc_no, p.direction, COALESCE(c.name, s.name) AS party, p.mode, p.reference_no, p.amount FROM payments p LEFT JOIN customers c ON c.id=p.party_id AND p.party_type='customer' LEFT JOIN suppliers s ON s.id=p.party_id AND p.party_type='supplier'
          WHERE p.status='posted' AND p.payment_date BETWEEN ?1 AND ?2 ORDER BY p.payment_date`,
    cols: [{ key: 'payment_date', label: 'Date' }, { key: 'doc_no', label: 'No.' }, { key: 'direction', label: 'In/Out' }, { key: 'party', label: 'Party', width: 180 }, { key: 'mode', label: 'Mode' }, { key: 'reference_no', label: 'Ref' }, { key: 'amount', label: 'Amount', money: true }] },
  { key: 'margin', group: 'Paisa', title: 'Kis item par kitna bacha', permission: 'reports.view_margin', dated: true,
    sql: `SELECT p.name AS product, pv.variant_name, SUM(l.qty) AS qty, SUM(l.taxable_value) AS sales, SUM(l.unit_cost_at_sale * l.qty) AS cost, SUM(l.taxable_value) - SUM(l.unit_cost_at_sale * l.qty) AS margin,
                 ROUND((SUM(l.taxable_value) - SUM(l.unit_cost_at_sale * l.qty)) * 100.0 / NULLIF(SUM(l.taxable_value),0), 1) AS margin_pct
          FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.invoice_id AND i.doc_type='invoice' AND i.status='posted' AND i.doc_date BETWEEN ?1 AND ?2
          JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id GROUP BY pv.id ORDER BY margin DESC`,
    cols: [{ key: 'product', label: 'Product', width: 200 }, { key: 'variant_name', label: 'Variant' }, { key: 'qty', label: 'Qty', num: true }, { key: 'sales', label: 'Bikri', money: true }, { key: 'cost', label: 'Cost', money: true }, { key: 'margin', label: 'Margin', money: true }, { key: 'margin_pct', label: '%', num: true }] },
  { key: 'stock_valuation', group: 'Inventory', title: 'Stock ki keemat', permission: 'catalog.view_cost', dated: false,
    sql: `SELECT l.name AS location, f.name AS family, SUM(sl.qty) AS units, SUM(sl.qty * pv.avg_cost) AS value FROM stock_on_hand sl JOIN locations l ON l.id = sl.location_id JOIN product_variants pv ON pv.id = sl.variant_id JOIN products p ON p.id = pv.product_id LEFT JOIN product_families f ON f.id = p.family_id
          WHERE sl.qty <> 0 GROUP BY l.id, f.id ORDER BY l.sort_order, value DESC`,
    cols: [{ key: 'location', label: 'Location' }, { key: 'family', label: 'Family', width: 180 }, { key: 'units', label: 'Units', num: true }, { key: 'value', label: 'Value', money: true }] },
  { key: 'stock_current', group: 'Inventory', title: 'Abhi kitna stock hai (saare SKU)', permission: 'sale.create', dated: false,
    sql: `SELECT p.name AS product, pv.variant_name, pv.sku, f.name AS family, COALESCE((SELECT SUM(qty) FROM stock_on_hand s WHERE s.variant_id=pv.id),0) AS qty, pv.min_stock, pv.reorder_level
          FROM product_variants pv JOIN products p ON p.id = pv.product_id LEFT JOIN product_families f ON f.id = p.family_id WHERE pv.is_active=1 ORDER BY f.sort_order, p.name, pv.variant_name`,
    cols: [{ key: 'product', label: 'Product', width: 200 }, { key: 'variant_name', label: 'Variant' }, { key: 'sku', label: 'SKU' }, { key: 'family', label: 'Family' }, { key: 'qty', label: 'Qty', num: true }, { key: 'min_stock', label: 'Min', num: true }, { key: 'reorder_level', label: 'Reorder', num: true }] },
  { key: 'dead_stock', group: 'Inventory', title: 'Jo maal nahi bik raha', permission: 'reports.view', dated: true,
    sql: `SELECT p.name AS product, pv.variant_name, pv.sku, COALESCE((SELECT SUM(qty) FROM stock_on_hand s WHERE s.variant_id=pv.id),0) AS qty, pv.avg_cost, COALESCE((SELECT SUM(qty) FROM stock_on_hand s WHERE s.variant_id=pv.id),0) * pv.avg_cost AS value,
                 (SELECT MAX(i.doc_date) FROM sales_invoice_lines l JOIN sales_invoices i ON i.id=l.invoice_id AND i.status='posted' WHERE l.variant_id=pv.id) AS last_sold,
                 COALESCE((SELECT SUM(l.qty) FROM sales_invoice_lines l JOIN sales_invoices i ON i.id=l.invoice_id AND i.status='posted' AND i.doc_type='invoice' AND i.doc_date BETWEEN ?1 AND ?2 WHERE l.variant_id=pv.id),0) AS sold_in_period
          FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.is_active=1 AND qty > 0 ORDER BY sold_in_period ASC, value DESC`,
    cols: [{ key: 'product', label: 'Product', width: 200 }, { key: 'variant_name', label: 'Variant' }, { key: 'qty', label: 'Qty', num: true }, { key: 'value', label: 'Value', money: true }, { key: 'last_sold', label: 'Last sold' }, { key: 'sold_in_period', label: 'Sold in period', num: true }] },
  { key: 'stock_movements', group: 'Inventory', title: 'Stock ka aana-jaana', permission: 'reports.view', dated: true,
    sql: `SELECT m.movement_type, l.name AS location, COUNT(*) AS rows_, SUM(CASE WHEN m.qty>0 THEN m.qty ELSE 0 END) AS qty_in, SUM(CASE WHEN m.qty<0 THEN -m.qty ELSE 0 END) AS qty_out, SUM(m.qty*m.unit_cost) AS value
          FROM stock_movements m JOIN locations l ON l.id = m.location_id WHERE date(m.occurred_at) BETWEEN ?1 AND ?2 GROUP BY m.movement_type, l.id ORDER BY l.sort_order, m.movement_type`,
    cols: [{ key: 'movement_type', label: 'Type', width: 160 }, { key: 'location', label: 'Location' }, { key: 'rows_', label: 'Rows', num: true }, { key: 'qty_in', label: 'In', num: true }, { key: 'qty_out', label: 'Out', num: true }, { key: 'value', label: 'Value', money: true }] },
];

/** Monday of the week `d` falls in. Indian shops count the week from Monday. */
function weekStart(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}

function range(key: string): [string, string] {
  const now = new Date();
  const today = toDateString(now);
  if (key === 'today') return [today, today];
  if (key === 'yesterday') { const d = new Date(now); d.setDate(d.getDate() - 1); const y = toDateString(d); return [y, y]; }
  if (key === 'week') return [toDateString(weekStart(now)), today];
  if (key === 'last_week') {
    const start = weekStart(now); start.setDate(start.getDate() - 7);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    return [toDateString(start), toDateString(end)];
  }
  if (key === 'month') return [toDateString(new Date(now.getFullYear(), now.getMonth(), 1)), today];
  if (key === 'last_month') return [toDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)), toDateString(new Date(now.getFullYear(), now.getMonth(), 0))];
  if (key === 'fy') return [toDateString(financialYearStart(now)), today];
  if (key === '30') { const d = new Date(now); d.setDate(d.getDate() - 30); return [toDateString(d), today]; }
  if (key === '90') { const d = new Date(now); d.setDate(d.getDate() - 90); return [toDateString(d), today]; }
  return [today, today];
}

export default function ReportsScreen() {
  const { can } = useSession();
  const shop = useShopSettings();
  const t = useTheme();
  const available = REPORTS.filter((r) => can(r.permission));
  // Open on the summary: it is the one report that answers the question the
  // owner came with. `available` is often still empty on the first render
  // while permissions sync, so seeding from available[0] used to leave it on
  // whichever report happened to be first in the file.
  const [key, setKey] = useState('hisaab');
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState<[string, string]>(range('month'));
  const report = REPORTS.find((r) => r.key === key) ?? available[0];
  const [from, to] = preset === 'custom' ? custom : range(preset);
  const { data, isLoading } = useQuery<Record<string, unknown>>(report?.sql ?? 'SELECT 1 WHERE 0', report?.dated || report?.sql.includes('?2') ? [from, to] : []);

  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    if (report?.noTotals) return out;
    for (const c of report?.cols ?? []) if (c.money || c.num) out[c.key] = (data ?? []).reduce((a, r) => a + (Number(r[c.key]) || 0), 0);
    return out;
  }, [data, report]);

  function exportCsv() {
    if (!report || !data?.length) return;
    const csv = toCsv(data.map((r) => Object.fromEntries(report.cols.map((c) => [c.label, r[c.key]]))));
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = `autogrid-${report.key}-${from}-${to}.csv`;
      a.click();
    } else notify('CSV export web par milta hai. Phone par screen se hi aankde bhej do.');
  }

  async function exportPdf() {
    if (!report) return;
    try {
      const html = reportHtml({
        shopName: shop.company?.trade_name || shop.company?.legal_name || shop.wa.shopName || 'AutoLoom',
        shopLine: shop.company?.trade_name ? shop.company.legal_name : null,
        title: report.title,
        from: report.dated ? from : undefined,
        to: report.dated ? to : undefined,
        cols: report.cols.map((c) => ({ key: c.key, label: c.label, num: c.num, money: c.money })),
        rows: (data ?? []) as Record<string, unknown>[],
        totals: report.noTotals ? undefined : totals,
      });
      await shareInvoiceHtml(html, `${report.title} ${from} ${to}`);
    } catch (e) {
      notify(String((e as Error).message ?? e));
    }
  }

  if (!report) return <Screen><Empty title="Aapke role ke liye koi hisaab nahi hai" /></Screen>;
  const groups = [...new Set(available.map((r) => r.group))];

  return (
    <Screen>
      <Text variant="display">Hisaab-kitab</Text>
      {groups.map((g) => (
        <View key={g} style={{ gap: 4 }}>
          <Text variant="label" color="textMuted">{g}</Text>
          <Row gap={space.xs} wrap>{available.filter((r) => r.group === g).map((r) => <Chip key={r.key} label={r.title} selected={key === r.key} onPress={() => setKey(r.key)} />)}</Row>
        </View>
      ))}
      {report.dated ? (
        <>
          <Row gap={space.xs} wrap>
            {[['today', 'Aaj'], ['yesterday', 'Kal'], ['week', 'Is hafte'], ['last_week', 'Pichhle hafte'], ['month', 'Is mahine'], ['last_month', 'Pichhle mahine'], ['30', '30 din'], ['90', '90 din'], ['fy', 'Is saal (FY)'], ['custom', 'Apni date']].map(([k, l]) => <Chip key={k} label={l} selected={preset === k} onPress={() => setPreset(k)} />)}
          </Row>
          {preset === 'custom' ? <Row gap={12}><Input containerStyle={{ flex: 1 }} label="Se" value={custom[0]} onChangeText={(v) => setCustom([v, custom[1]])} /><Input containerStyle={{ flex: 1 }} label="Tak" value={custom[1]} onChangeText={(v) => setCustom([custom[0], v])} /></Row> : null}
        </>
      ) : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="title">{report.title}</Text>
        <Row gap={8}><Text variant="small" color="textMuted">{(data ?? []).length} rows</Text><Button title="PDF" size="sm" onPress={exportPdf} disabled={!data?.length} /><Button title="CSV" size="sm" tone="secondary" onPress={exportCsv} disabled={!data?.length} /></Row>
      </Row>
      <Card style={{ padding: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ minWidth: '100%' }}>
            <Row gap={0} style={{ paddingHorizontal: 8, paddingVertical: 8, backgroundColor: t.surfaceAlt }}>
              {report.cols.map((c) => <Text key={c.key} variant="label" color="textMuted" style={{ width: c.width ?? 110, textAlign: c.money || c.num ? 'right' : 'left', paddingHorizontal: 6 }}>{c.label}</Text>)}
            </Row>
            {isLoading ? <Text style={{ padding: 12 }} color="textMuted">Running…</Text> : null}
            {(data ?? []).slice(0, 500).map((r, i) => (
              <React.Fragment key={i}>
                <Row gap={0} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                  {report.cols.map((c) => <Text key={c.key} variant="small" mono={c.money || c.num} style={{ width: c.width ?? 110, textAlign: c.money || c.num ? 'right' : 'left', paddingHorizontal: 6 }} numberOfLines={1}>{r[c.key] == null ? '' : c.money ? formatINR(Number(r[c.key]) || 0) : String(r[c.key])}</Text>)}
                </Row>
                <Divider />
              </React.Fragment>
            ))}
            {(data ?? []).length && !report.noTotals ? (
              <Row gap={0} style={{ paddingHorizontal: 8, paddingVertical: 8, backgroundColor: t.surfaceAlt }}>
                {report.cols.map((c, i) => <Text key={c.key} variant="small" mono style={{ width: c.width ?? 110, textAlign: 'right', paddingHorizontal: 6, fontWeight: '700' }}>{i === 0 ? 'Total' : c.money ? formatINR(totals[c.key] ?? 0) : c.num && c.key !== 'margin_pct' && c.key !== 'rate' ? String(Math.round(totals[c.key] ?? 0)) : ''}</Text>)}
              </Row>
            ) : !isLoading ? <Empty title="Is waqt ka koi record nahi" /> : null}
          </View>
        </ScrollView>
      </Card>
      {(data ?? []).length > 500 ? <Text variant="small" color="textFaint">Pehli 500 row dikha rahe hain — poora chahiye to CSV export karo.</Text> : null}
    </Screen>
  );
}
