import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { cancelPurchase } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { Badge, Button, Card, Divider, Empty, KV, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type P = { id: string; doc_type: string; doc_no: string | null; doc_date: string; supplier_id: string; supplier_name: string | null; supplier_invoice_no: string | null; supplier_invoice_date: string | null; location_name: string; is_interstate: number; subtotal: number; discount_total: number; taxable_total: number; cgst_total: number; sgst_total: number; igst_total: number; other_charges: number; round_off: number; grand_total: number; paid_total: number; status: string; notes: string | null; cancel_reason: string | null; posted_at: string | null; against_no: string | null; sname: string };
type L = { id: string; description: string; hsn_code: string | null; qty: number; unit_code: string | null; rate: number; discount_pct: number; taxable_value: number; tax_rate_pct: number; cgst: number; sgst: number; igst: number; line_total: number; landed_unit_cost: number; batch_no: string | null; variant_id: string; sku: string; product_id: string };
type Pay = { id: string; doc_no: string; payment_date: string; amount: number; mode: string };

export default function PurchaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const [busy, setBusy] = useState(false);
  const { data: rows } = useQuery<P>(`
    SELECT p.*, l.name AS location_name, s.name AS sname, o.doc_no AS against_no
    FROM purchases p JOIN locations l ON l.id = p.location_id JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN purchases o ON o.id = p.against_purchase_id WHERE p.id = ?`, [id]);
  const p = rows?.[0];
  const { data: lines } = useQuery<L>('SELECT pl.*, pv.sku, pv.product_id FROM purchase_lines pl JOIN product_variants pv ON pv.id = pl.variant_id WHERE pl.purchase_id = ? ORDER BY pl.line_no', [id]);
  const { data: payments } = useQuery<Pay>(`SELECT py.id, py.doc_no, py.payment_date, pa.amount, py.mode FROM payment_allocations pa JOIN payments py ON py.id = pa.payment_id WHERE pa.doc_id = ? AND py.status = 'posted' ORDER BY py.payment_date`, [id]);
  const { data: returns } = useQuery<{ id: string; doc_no: string | null; doc_date: string; grand_total: number; status: string }>(`SELECT id, doc_no, doc_date, grand_total, status FROM purchases WHERE against_purchase_id = ? ORDER BY doc_date`, [id]);

  async function cancel() {
    if (!p) return;
    const reason = typeof globalThis.prompt === 'function' ? globalThis.prompt('Reason for cancelling (recorded in the audit log)') : 'Cancelled';
    if (!reason) return;
    if (!(await confirm('Cancel this document?', 'Stock movements and the supplier ledger entry will be reversed. The number stays consumed.'))) return;
    setBusy(true);
    try {
      await db.writeTransaction(async (tx) => cancelPurchase(tx, p.id, reason, actor));
      notify('Cancelled.');
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  if (!p) return <Screen><Empty title="Purchase not found on this device" /></Screen>;
  const isReturn = p.doc_type === 'debit_note';
  const due = p.grand_total - p.paid_total;

  return (
    <>
      <Stack.Screen options={{ title: p.doc_no ?? 'Purchase' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }} align="flex-start">
          <View style={{ flex: 1 }}>
            <Row gap={6}>
              <Badge tone={p.status === 'cancelled' ? 'danger' : p.status === 'posted' ? 'ok' : 'neutral'}>{p.status}</Badge>
              {isReturn ? <Badge tone="info">debit note{p.against_no ? ` · against ${p.against_no}` : ''}</Badge> : null}
            </Row>
            <Text variant="display" style={{ marginTop: space.xs }}>{p.doc_no ?? 'Draft'}</Text>
            <Text color="textMuted">{p.sname} · {p.doc_date} · {p.location_name}</Text>
          </View>
        </Row>
        {p.status === 'cancelled' ? <Card tone="alt"><Text color="danger">Cancelled: {p.cancel_reason}</Text></Card> : null}

        <Card tone="navy">
          <Row gap={space.lg} wrap>
            <View style={{ flex: 1, minWidth: 120 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Grand total</Text><Text variant="number" color="navyText">{formatINR(p.grand_total)}</Text></View>
            <View style={{ flex: 1, minWidth: 120 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Paid</Text><Text variant="number" color="navyText">{formatINR(p.paid_total)}</Text></View>
            <View style={{ flex: 1, minWidth: 120 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Due</Text><Text variant="number" color="navyText">{formatINR(due)}</Text></View>
          </Row>
        </Card>

        {p.status === 'posted' ? (
          <Row gap={space.sm} wrap>
            {!isReturn && can('payment.pay_supplier') && due > 0 ? <Button title="Pay supplier" onPress={() => router.push(`/payment/edit?direction=out&party=${p.supplier_id}&doc=${p.id}`)} /> : null}
            {!isReturn && can('purchase.create') ? <Button title="Purchase return" tone="secondary" onPress={() => router.push(`/purchase/edit?against=${p.id}`)} /> : null}
            {can('purchase.cancel') ? <Button title="Cancel document" tone="danger" onPress={cancel} loading={busy} /> : null}
          </Row>
        ) : null}

        <SectionTitle>Items</SectionTitle>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(lines ?? []).map((l) => (
            <ListRow key={l.id} title={l.description} subtitle={`${l.sku} · ${l.qty} ${l.unit_code ?? ''} @ ${formatINR(l.rate)}${l.discount_pct ? ` − ${l.discount_pct}%` : ''} · GST ${l.tax_rate_pct}%${l.batch_no ? ` · batch ${l.batch_no}` : ''}`}
              onPress={() => router.push(`/product/${l.product_id}?variant=${l.variant_id}`)}
              right={<View style={{ alignItems: 'flex-end' }}><Text mono>{formatINR(l.line_total)}</Text><Text variant="small" color="textMuted" mono>landed {formatINR(l.landed_unit_cost)}</Text></View>} />
          ))}
        </Card>

        <Card style={{ gap: 0 }}>
          <KV k="Supplier bill" v={`${p.supplier_invoice_no ?? '—'}${p.supplier_invoice_date ? ` · ${p.supplier_invoice_date}` : ''}`} />
          <KV k="Subtotal" v={formatINR(p.subtotal)} mono />
          {p.discount_total ? <KV k="Discount" v={`- ${formatINR(p.discount_total)}`} mono /> : null}
          <KV k="Taxable" v={formatINR(p.taxable_total)} mono />
          {p.is_interstate ? <KV k="IGST" v={formatINR(p.igst_total)} mono /> : <><KV k="CGST" v={formatINR(p.cgst_total)} mono /><KV k="SGST" v={formatINR(p.sgst_total)} mono /></>}
          {p.other_charges ? <KV k="Other charges" v={formatINR(p.other_charges)} mono /> : null}
          {p.round_off ? <KV k="Round off" v={formatINR(p.round_off, { paise: true })} mono /> : null}
          <Divider />
          <KV k="Grand total" v={formatINR(p.grand_total)} mono />
          {p.notes ? <KV k="Notes" v={p.notes} /> : null}
        </Card>

        {(payments ?? []).length ? (
          <>
            <SectionTitle>Payments</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(payments ?? []).map((py) => <ListRow key={py.id} title={py.doc_no} subtitle={`${py.payment_date} · ${py.mode}`} right={<Text mono>{formatINR(py.amount)}</Text>} />)}
            </Card>
          </>
        ) : null}
        {(returns ?? []).length ? (
          <>
            <SectionTitle>Returns against this bill</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(returns ?? []).map((r) => <ListRow key={r.id} title={r.doc_no ?? 'Draft'} subtitle={r.doc_date} onPress={() => router.push(r.status === 'draft' ? `/purchase/edit?id=${r.id}` : `/purchase/${r.id}`)} right={<Text mono>{formatINR(r.grand_total)}</Text>} />)}
            </Card>
          </>
        ) : null}
      </Screen>
    </>
  );
}
