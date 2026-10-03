import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { useSession } from '@/lib/session';
import { dayLabel } from '@/lib/words';
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

const DOC_LABEL: Record<string, string> = { opening: 'Purana baaki', purchase: 'Maal aaya', debit_note: 'Maal wapas bheja', payment_out: 'Paisa diya', adjustment: 'Sudhar', cancel_reversal: 'Cancel' };

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

  if (!s) return <Screen><Empty art="search" title="Ye supplier is phone par nahi mila" /></Screen>;

  let running = 0;
  const asc = [...(ledger ?? [])].reverse().map((e) => { running += e.credit - e.debit; return { ...e, running }; });
  const desc = asc.reverse();

  return (
    <>
      <Stack.Screen options={{ title: s.name }} />
      <Screen>
        {/* Same as the customer page: the name gets the full width, the
            actions wrap under it, so neither can squeeze the other off screen. */}
        <View>
          <Text variant="small" color="textFaint" mono>{s.code}</Text>
          <Text variant="display">{s.name}</Text>
          {s.company_name && s.company_name !== s.name ? <Text color="textMuted">{s.company_name}</Text> : null}
          <Row gap={6} wrap style={{ marginTop: space.sm }}>
            {can('payment.pay_supplier') && s.balance > 0 ? <Button title="Paisa do" size="sm" onPress={() => router.push(`/payment/edit?direction=out&party=${s.id}`)} /> : null}
            {can('party.edit') ? <Button title="Badlo" tone="secondary" size="sm" onPress={() => router.push(`/supplier/edit?id=${s.id}`)} /> : null}
          </Row>
        </View>

        {showMoney ? (
          <Card tone="navy">
            <Row gap={space.lg} wrap>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Inhe dena hai</Text>
                <Text variant="number" color="navyText">{formatINR(s.balance)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Kitne din mein dena hai</Text>
                <Text variant="number" color="navyText">{s.payment_terms_days} din</Text>
              </View>
            </Row>
          </Card>
        ) : null}

        <SectionTitle>Sampark</SectionTitle>
        <Card style={{ gap: 0 }}>
          {s.contact_person ? <KV k="Sampark" v={s.contact_person} /> : null}
          {s.mobile ? <KV k="Mobile" v={s.mobile} mono /> : null}
          {s.alt_phone ? <KV k="Phone" v={s.alt_phone} mono /> : null}
          {s.email ? <KV k="Email" v={s.email} /> : null}
          {s.gstin ? <KV k="GSTIN" v={s.gstin} mono /> : null}
          <KV k="Pata" v={[s.address_line1, s.address_line2, s.city, s.state_name, s.pincode].filter(Boolean).join(', ') || '—'} />
          {s.notes ? <KV k="Note" v={s.notes} /> : null}
        </Card>

        {showMoney ? (
          <>
            <SectionTitle>Kab kya aaya</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(purchases ?? []).map((p) => (
                <ListRow key={p.id} title={p.doc_no ?? 'Adhoori entry'} subtitle={`${dayLabel(p.doc_date)}${p.supplier_invoice_no ? ` · unka bill ${p.supplier_invoice_no}` : ''}`}
                  right={<View style={{ alignItems: 'flex-end' }}><Text mono>{formatINR(p.grand_total)}</Text><Badge tone={p.status === 'cancelled' ? 'danger' : p.doc_type === 'debit_note' ? 'info' : p.paid_total >= p.grand_total ? 'ok' : 'warn'}>{p.status === 'cancelled' ? 'cancel' : p.status === 'draft' ? 'adhoora' : p.doc_type === 'debit_note' ? 'wapas bheja' : p.paid_total >= p.grand_total ? 'chuka diya' : 'dena baaki'}</Badge></View>} />
              ))}
              {(purchases ?? []).length === 0 ? <Empty title="Abhi tak kuch nahi kharida" /> : null}
            </Card>

            <SectionTitle>Inse aane wala maal</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(top ?? []).map((p) => (
                <ListRow key={p.id} title={`${p.product_name} · ${p.variant_name}`} subtitle={`${p.sku} · aakhri baar ${dayLabel(p.last_date)}`} right={<View style={{ alignItems: 'flex-end' }}><Text mono>{p.qty} pcs</Text><Text variant="small" color="textMuted" mono>@ {formatINR(p.last_rate)}</Text></View>} />
              ))}
              {(top ?? []).length === 0 ? <Empty title="Abhi tak kuch nahi kharida" /> : null}
            </Card>

            <SectionTitle>Khata</SectionTitle>
            <Card style={{ gap: 0 }}>
              {desc.length === 0 ? <Empty title="Khata khaali hai" /> : null}
              {desc.map((e) => (
                <React.Fragment key={e.id}>
                  {/* Two columns, as on the customer page: + when the shop
                      owes more, − when it paid; the running total under it. */}
                  <Row gap={space.sm} style={{ paddingVertical: 8 }} align="flex-start">
                    <View style={{ flex: 1 }}>
                      <Text variant="small" style={{ fontWeight: '600' }}>{DOC_LABEL[e.doc_type] ?? e.doc_type}{e.doc_no ? ` ${e.doc_no}` : ''}</Text>
                      <Text variant="small" color="textFaint">{dayLabel(e.entry_date)}{e.narration && !(e.doc_no && e.narration.endsWith(e.doc_no)) ? ` · ${e.narration}` : ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="small" mono style={{ fontWeight: '600' }} color={e.credit ? 'warn' : 'ok'}>{e.credit ? `+ ${formatINR(e.credit)}` : `− ${formatINR(e.debit)}`}</Text>
                      <Text variant="small" mono color="textFaint">dena {formatINR(e.running)}</Text>
                    </View>
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
