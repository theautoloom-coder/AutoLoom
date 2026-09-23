import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { useSession } from '@/lib/session';
import { Badge, Button, Card, Divider, Empty, KV, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { space } from '@/ui/theme';

type Supplier = {
  id: string; code: string; name: string; company_name: string | null; contact_person: string | null; mobile: string | null; alt_phone: string | null; email: string | null;
  gstin: string | null; address_line1: string | null; address_line2: string | null; city: string | null; state_name: string | null; pincode: string | null;
  payment_terms_days: number; notes: string | null; balance: number;
};
type Ledger = { id: string; entry_date: string; doc_type: string; doc_no: string | null; debit: number; credit: number; narration: string | null };
type Purchase = { id: string; doc_no: string | null; doc_date: string; supplier_invoice_no: string | null; grand_total: number; paid_total: number; status: string; doc_type: string };
type Top = { id: string; sku: string; variant_name: string; product_name: string; qty: number; last_rate: number; last_date: string };

const DOC_LABEL: Record<string, string> = { opening: 'Opening balance', purchase: 'Purchase', debit_note: 'Debit note', payment_out: 'Payment made', adjustment: 'Adjustment', cancel_reversal: 'Cancellation' };

export default function SupplierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const { data: rows } = useQuery<Supplier>(
    `SELECT s.*, COALESCE(pb.balance, 0) AS balance FROM suppliers s LEFT JOIN party_balance_live pb ON pb.party_type = 'supplier' AND pb.party_id = s.id WHERE s.id = ?`, [id]);
  const s = rows?.[0];
  const { data: ledger } = useQuery<Ledger>(`SELECT id, entry_date, doc_type, doc_no, debit, credit, narration FROM ledger_entries WHERE party_type = 'supplier' AND party_id = ? ORDER BY entry_date DESC, created_at DESC LIMIT 200`, [id]);
  const { data: purchases } = useQuery<Purchase>(`SELECT id, doc_no, doc_date, supplier_invoice_no, grand_total, paid_total, status, doc_type FROM purchases WHERE supplier_id = ? ORDER BY doc_date DESC, created_at DESC LIMIT 50`, [id]);
  const { data: top } = useQuery<Top>(`
    SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name, SUM(pl.qty) AS qty, MAX(pl.rate) AS last_rate, MAX(pu.doc_date) AS last_date
    FROM purchase_lines pl JOIN purchases pu ON pu.id = pl.purchase_id AND pu.status = 'posted' AND pu.doc_type = 'purchase' AND pu.supplier_id = ?
    JOIN product_variants pv ON pv.id = pl.variant_id JOIN products p ON p.id = pv.product_id GROUP BY pv.id ORDER BY qty DESC LIMIT 20`, [id]);
  const showMoney = can('purchase.create') || can('reports.view') || can('payment.pay_supplier');

  if (!s) return <Screen><Empty title="Supplier not found on this device" /></Screen>;

  let running = 0;
  const asc = [...(ledger ?? [])].reverse().map((e) => { running += e.credit - e.debit; return { ...e, running }; });
  const desc = asc.reverse();

  return (
    <>
      <Stack.Screen options={{ title: s.name }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }} align="flex-start">
          <View style={{ flex: 1 }}>
            <Text variant="small" color="textFaint" mono>{s.code}</Text>
            <Text variant="display">{s.name}</Text>
            {s.company_name && s.company_name !== s.name ? <Text color="textMuted">{s.company_name}</Text> : null}
          </View>
          <Row gap={6}>
            {can('payment.pay_supplier') && s.balance > 0 ? <Button title="Pay" size="sm" onPress={() => router.push(`/payment/edit?direction=out&party=${s.id}`)} /> : null}
            {can('party.edit') ? <Button title="Edit" tone="secondary" size="sm" onPress={() => router.push(`/supplier/edit?id=${s.id}`)} /> : null}
          </Row>
        </Row>

        {showMoney ? (
          <Card tone="navy">
            <Row gap={space.lg} wrap>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Payable</Text>
                <Text variant="number" color="navyText">{formatINR(s.balance)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Payment terms</Text>
                <Text variant="number" color="navyText">{s.payment_terms_days} days</Text>
              </View>
            </Row>
          </Card>
        ) : null}

        <SectionTitle>Contact</SectionTitle>
        <Card style={{ gap: 0 }}>
          {s.contact_person ? <KV k="Contact" v={s.contact_person} /> : null}
          {s.mobile ? <KV k="Mobile" v={s.mobile} mono /> : null}
          {s.alt_phone ? <KV k="Phone" v={s.alt_phone} mono /> : null}
          {s.email ? <KV k="Email" v={s.email} /> : null}
          {s.gstin ? <KV k="GSTIN" v={s.gstin} mono /> : null}
          <KV k="Address" v={[s.address_line1, s.address_line2, s.city, s.state_name, s.pincode].filter(Boolean).join(', ') || '—'} />
          {s.notes ? <KV k="Notes" v={s.notes} /> : null}
        </Card>

        {showMoney ? (
          <>
            <SectionTitle>Purchases</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(purchases ?? []).map((p) => (
                <ListRow key={p.id} title={p.doc_no ?? '(draft)'} subtitle={`${p.doc_date}${p.supplier_invoice_no ? ` · their bill ${p.supplier_invoice_no}` : ''}`}
                  right={<View style={{ alignItems: 'flex-end' }}><Text mono>{formatINR(p.grand_total)}</Text><Badge tone={p.status === 'cancelled' ? 'danger' : p.doc_type === 'debit_note' ? 'info' : p.paid_total >= p.grand_total ? 'ok' : 'warn'}>{p.status === 'cancelled' ? 'cancelled' : p.doc_type === 'debit_note' ? 'debit note' : p.paid_total >= p.grand_total ? 'paid' : p.status}</Badge></View>} />
              ))}
              {(purchases ?? []).length === 0 ? <Empty title="No purchases yet" /> : null}
            </Card>

            <SectionTitle>Products supplied</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(top ?? []).map((p) => (
                <ListRow key={p.id} title={`${p.product_name} · ${p.variant_name}`} subtitle={`${p.sku} · last ${p.last_date}`} right={<View style={{ alignItems: 'flex-end' }}><Text mono>{p.qty} pcs</Text><Text variant="small" color="textMuted" mono>@ {formatINR(p.last_rate)}</Text></View>} />
              ))}
              {(top ?? []).length === 0 ? <Empty title="Nothing purchased yet" /> : null}
            </Card>

            <SectionTitle>Ledger</SectionTitle>
            <Card style={{ gap: 0 }}>
              {desc.length === 0 ? <Empty title="No ledger entries" /> : null}
              {desc.map((e) => (
                <React.Fragment key={e.id}>
                  <Row gap={space.sm} style={{ paddingVertical: 8 }} align="flex-start">
                    <View style={{ flex: 1.6 }}>
                      <Text variant="small" style={{ fontWeight: '600' }}>{DOC_LABEL[e.doc_type] ?? e.doc_type}{e.doc_no ? ` ${e.doc_no}` : ''}</Text>
                      <Text variant="small" color="textFaint">{e.entry_date}{e.narration ? ` · ${e.narration}` : ''}</Text>
                    </View>
                    <Text variant="small" mono style={{ width: 80, textAlign: 'right' }} color="ok">{e.debit ? formatINR(e.debit) : ''}</Text>
                    <Text variant="small" mono style={{ width: 80, textAlign: 'right' }}>{e.credit ? formatINR(e.credit) : ''}</Text>
                    <Text variant="small" mono style={{ width: 90, textAlign: 'right', fontWeight: '600' }}>{formatINR(e.running)}</Text>
                  </Row>
                  <Divider />
                </React.Fragment>
              ))}
            </Card>
          </>
        ) : null}
      </Screen>
    </>
  );
}
