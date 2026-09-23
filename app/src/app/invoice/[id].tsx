import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { invoiceHtml, shareInvoiceHtml, type InvoiceForPrint } from '@/lib/invoice-html';
import { cancelInvoice } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { useShopSettings } from '@/lib/use-settings';
import { openWhatsApp, slipMessage } from '@/lib/whatsapp';
import { Badge, Button, Card, Divider, Empty, KV, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type I = InvoiceForPrint & { id: string; customer_id: string; customer_mobile: string | null; location_name: string; cancel_reason: string | null; credit_flag: number; against_invoice_id: string | null; salesperson_name: string | null; balance: number };
type L = { id: string; description: string; hsn_code: string | null; qty: number; unit_code: string | null; rate: number; discount_pct: number; discount_amt: number; taxable_value: number; tax_rate_pct: number; cgst: number; sgst: number; igst: number; line_total: number; sku: string; variant_id: string; product_id: string; price_source: string | null; unit_cost_at_sale: number; return_condition: string | null; return_note: string | null };
type Pay = { id: string; doc_no: string; payment_date: string; amount: number; mode: string; remarks: string | null; proof_path: string | null };

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const shop = useShopSettings();
  const [busy, setBusy] = useState(false);

  const { data: rows } = useQuery<Omit<I, 'lines' | 'company' | 'customer' | 'vehicle'>>(`
    SELECT i.*, l.name AS location_name, o.doc_no AS against_no, pr.full_name AS salesperson_name, c.mobile AS customer_mobile, COALESCE(pb.balance,0) AS balance
    FROM sales_invoices i JOIN locations l ON l.id = i.location_id JOIN customers c ON c.id = i.customer_id LEFT JOIN party_balance_live pb ON pb.party_type='customer' AND pb.party_id=c.id
    LEFT JOIN sales_invoices o ON o.id = i.against_invoice_id LEFT JOIN profiles pr ON pr.id = i.salesperson_id WHERE i.id = ?`, [id]);
  const inv = rows?.[0];
  const { data: lines } = useQuery<L>('SELECT l.*, pv.sku, pv.product_id FROM sales_invoice_lines l JOIN product_variants pv ON pv.id = l.variant_id WHERE l.invoice_id = ? ORDER BY l.line_no', [id]);
  const { data: cust } = useQuery<InvoiceForPrint['customer'] & { id: string }>('SELECT id, business_name, address_line1, address_line2, city, state_name, pincode, mobile FROM customers WHERE id = ?', [inv?.customer_id ?? '']);
  const { data: veh } = useQuery<{ registration_no: string; model_name: string | null }>('SELECT cv.registration_no, vm.name AS model_name FROM customer_vehicles cv LEFT JOIN vehicle_models vm ON vm.id = cv.model_id WHERE cv.id = ?', [(inv as { customer_vehicle_id?: string } | undefined)?.customer_vehicle_id ?? '']);
  const { data: company } = useQuery<InvoiceForPrint['company']>('SELECT * FROM company_settings LIMIT 1');
  const { data: payments } = useQuery<Pay>(`SELECT py.id, py.doc_no, py.payment_date, pa.amount, py.mode, py.remarks, py.proof_path FROM payment_allocations pa JOIN payments py ON py.id = pa.payment_id WHERE pa.doc_id = ? AND py.status = 'posted' ORDER BY py.payment_date`, [id]);
  const { data: notes } = useQuery<{ id: string; doc_no: string | null; doc_date: string; grand_total: number; status: string }>('SELECT id, doc_no, doc_date, grand_total, status FROM sales_invoices WHERE against_invoice_id = ? ORDER BY doc_date', [id]);

  async function share() {
    if (!inv || !company?.[0]) return;
    try {
      const html = invoiceHtml({ ...(inv as I), lines: lines ?? [], company: company[0], customer: cust?.[0] ?? null, vehicle: veh?.[0] ?? null }, { gst: shop.gstEnabled });
      await shareInvoiceHtml(html, `${inv.doc_no ?? 'bill'}.pdf`);
    } catch (e) { notify((e as Error).message); }
  }

  async function whatsapp() {
    if (!inv) return;
    if (!inv.customer_mobile) { notify('This customer has no mobile number. Add it on the customer page.'); return; }
    const msg = slipMessage(shop.wa, { name: inv.customer_name ?? '', billNo: inv.doc_no ?? '', date: inv.doc_date, total: inv.grand_total, pending: Math.max(inv.balance, 0), items: (lines ?? []).map((l) => ({ description: l.description, qty: l.qty, rate: l.rate })) });
    await openWhatsApp(inv.customer_mobile, msg);
  }

  async function cancel() {
    if (!inv) return;
    const reason = typeof globalThis.prompt === 'function' ? globalThis.prompt('Reason for cancelling') : 'Cancelled';
    if (!reason || !(await confirm('Cancel this bill?', 'Stock comes back, the khata entry is reversed, and any cash receipt for this bill is reversed. The number stays used.'))) return;
    setBusy(true);
    try { await db.writeTransaction((tx) => cancelInvoice(tx, inv.id, reason, actor)); notify('Cancelled.'); } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  if (!inv) return <Screen><Empty title="Bill not found on this device" /></Screen>;
  const isCN = inv.doc_type === 'credit_note';
  const due = inv.grand_total - inv.paid_total;
  const hasTax = inv.cgst_total + inv.sgst_total + inv.igst_total > 0;
  const showCost = can('reports.view_margin');
  const margin = (lines ?? []).reduce((a, l) => a + (l.rate * (1 - l.discount_pct / 100) - l.unit_cost_at_sale) * l.qty, 0);

  return (
    <>
      <Stack.Screen options={{ title: inv.doc_no ?? 'Bill' }} />
      <Screen>
        <View>
          <Row gap={6} wrap>
            <Badge tone={inv.status === 'cancelled' ? 'danger' : inv.status === 'posted' ? (due > 0 && !isCN ? 'warn' : 'ok') : 'neutral'}>{inv.status === 'posted' ? (isCN ? 'return posted' : due > 0 ? 'pending' : 'paid') : inv.status}</Badge>
            {isCN ? <Badge tone="info">against {inv.against_no}</Badge> : null}
            {inv.credit_flag ? <Badge tone="warn">over credit limit</Badge> : null}
          </Row>
          <Text variant="display" style={{ marginTop: space.xs }}>{inv.customer_name}</Text>
          <Text color="textMuted" onPress={() => router.push(`/customer/${inv.customer_id}`)}>{inv.doc_no ?? 'Draft'} · {inv.doc_date} · {inv.location_name}{inv.salesperson_name ? ` · ${inv.salesperson_name}` : ''}</Text>
        </View>
        {inv.status === 'cancelled' ? <Card tone="alt"><Text color="danger">Cancelled: {inv.cancel_reason}</Text></Card> : null}

        <Card tone="navy">
          <Row gap={space.lg} wrap>
            <View style={{ flex: 1, minWidth: 110 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>{isCN ? 'Credit' : 'Bill total'}</Text><Text variant="number" color="navyText">{formatINR(inv.grand_total)}</Text></View>
            {!isCN ? <>
              <View style={{ flex: 1, minWidth: 110 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Paid</Text><Text variant="number" color="navyText">{formatINR(inv.paid_total)}</Text></View>
              <View style={{ flex: 1, minWidth: 110 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>This bill due</Text><Text variant="number" color="navyText">{formatINR(due)}</Text></View>
              <View style={{ flex: 1, minWidth: 110 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Khata pending</Text><Text variant="number" color="navyText">{formatINR(inv.balance)}</Text></View>
            </> : null}
          </Row>
        </Card>

        <Row gap={space.sm} wrap>
          {inv.status === 'posted' && !isCN && can('payment.receive') && due > 0 ? <Button title="Mark paid" onPress={() => router.push(`/payment/edit?direction=in&party=${inv.customer_id}&doc=${inv.id}&amount=${due}`)} /> : null}
          {inv.status === 'posted' ? <Button title="WhatsApp slip" tone={due > 0 ? 'secondary' : 'primary'} onPress={whatsapp} /> : null}
          <Button title="PDF / print" tone="secondary" onPress={share} />
          {inv.status === 'posted' && !isCN && can('sale.return') ? <Button title="Return" tone="secondary" onPress={() => router.push(`/invoice/edit?against=${inv.id}`)} /> : null}
          {inv.status === 'posted' && can('sale.cancel') ? <Button title="Cancel bill" tone="danger" onPress={cancel} loading={busy} /> : null}
        </Row>

        <SectionTitle>Items</SectionTitle>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(lines ?? []).map((l) => (
            <ListRow key={l.id} title={l.description} subtitle={`${l.qty} ${l.unit_code ?? ''} × ${formatINR(l.rate)}${l.discount_pct ? ` − ${l.discount_pct}%` : ''}${hasTax ? ` · GST ${l.tax_rate_pct}%` : ''}${l.return_condition ? ` · ${l.return_condition === 'damaged' ? 'faulty' : 'good'}` : ''}${l.return_note ? ` · ${l.return_note}` : ''}`}
              onPress={() => router.push(`/product/${l.product_id}?variant=${l.variant_id}`)}
              right={<View style={{ alignItems: 'flex-end' }}><Text mono>{formatINR(l.line_total)}</Text>{showCost ? <Text variant="small" color="textMuted" mono>cost {formatINR(l.unit_cost_at_sale)}</Text> : null}</View>} />
          ))}
        </Card>

        <Card style={{ gap: 0 }}>
          {inv.discount_total ? <KV k="Discount" v={`- ${formatINR(inv.discount_total)}`} mono /> : null}
          {hasTax ? <><KV k="Taxable" v={formatINR(inv.taxable_total)} mono />{inv.is_interstate ? <KV k="IGST" v={formatINR(inv.igst_total, { paise: true })} mono /> : <><KV k="CGST" v={formatINR(inv.cgst_total, { paise: true })} mono /><KV k="SGST" v={formatINR(inv.sgst_total, { paise: true })} mono /></>}</> : null}
          {inv.other_charges ? <KV k="Other charges" v={formatINR(inv.other_charges)} mono /> : null}
          {inv.round_off ? <KV k="Round off" v={formatINR(inv.round_off, { paise: true })} mono /> : null}
          <Divider />
          <KV k={isCN ? 'Credit' : 'Total'} v={formatINR(inv.grand_total)} mono />
          {showCost && !isCN ? <KV k="Margin" v={`${formatINR(margin)} · ${inv.taxable_total ? Math.round((margin / inv.taxable_total) * 1000) / 10 : 0}%`} mono /> : null}
          <KV k="Payment" v={(inv.payment_mode ?? '').toUpperCase()} />
          {inv.notes ? <KV k="Note" v={inv.notes} /> : null}
        </Card>

        {(payments ?? []).length ? (<><SectionTitle>Payments</SectionTitle><Card style={{ gap: 0, paddingVertical: 4 }}>{(payments ?? []).map((py) => <ListRow key={py.id} title={`${py.mode.toUpperCase()} · ${formatINR(py.amount)}`} subtitle={`${py.doc_no} · ${py.payment_date}${py.remarks ? ` · ${py.remarks}` : ''}${py.proof_path ? ' · 📎 proof' : ''}`} onPress={() => router.push('/payments')} />)}</Card></>) : null}
        {(notes ?? []).length ? (<><SectionTitle>Returns against this bill</SectionTitle><Card style={{ gap: 0, paddingVertical: 4 }}>{(notes ?? []).map((n) => <ListRow key={n.id} title={n.doc_no ?? 'Draft'} subtitle={n.doc_date} onPress={() => router.push(n.status === 'draft' ? `/invoice/edit?id=${n.id}` : `/invoice/${n.id}`)} right={<Text mono>{formatINR(n.grand_total)}</Text>} />)}</Card></>) : null}
      </Screen>
    </>
  );
}
