import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { cancelPayment } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { dayLabel } from '@/lib/words';
import { Badge, Button, Card, Empty, KV, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { LedgerList } from '@/ui/ledger';
import { space } from '@/ui/theme';

type Supplier = {
  id: string; code: string; name: string; company_name: string | null; contact_person: string | null; mobile: string | null; alt_phone: string | null; email: string | null;
  gstin: string | null; address_line1: string | null; address_line2: string | null; city: string | null; state_name: string | null; pincode: string | null;
  payment_terms_days: number; notes: string | null; balance: number;
};
type Ledger = {
  id: string; entry_date: string; doc_type: string; doc_id: string | null; doc_no: string | null; debit: number; credit: number; narration: string | null;
  pur_status: string | null; pur_type: string | null; open_fix: string | null; returned: number; pay_status: string | null;
};
type Purchase = { id: string; doc_no: string | null; doc_date: string; supplier_invoice_no: string | null; grand_total: number; paid_total: number; status: string; doc_type: string };
type Top = { id: string; sku: string; variant_name: string; product_name: string; qty: number; last_rate: number; last_date: string };

const DOC_LABEL: Record<string, string> = { opening: 'Purana baaki', purchase: 'Maal aaya', debit_note: 'Maal wapas bheja', payment_out: 'Paisa diya', adjustment: 'Sudhar', cancel_reversal: 'Cancel' };

export default function SupplierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const { data: rows } = useQuery<Supplier>(
    `SELECT s.*, COALESCE(pb.balance, 0) AS balance FROM suppliers s LEFT JOIN party_balance_live pb ON pb.party_type = 'supplier' AND pb.party_id = s.id WHERE s.id = ?`, [id]);
  const s = rows?.[0];
  // Each khata line with the entry or payment it came from — whether the entry
  // still stands, has a correction open, or sent maal back (then it cannot be
  // corrected) — so the line can open it and offer what can be done to it.
  const { data: ledger } = useQuery<Ledger>(`
    SELECT le.id, le.entry_date, le.doc_type, le.doc_id, le.doc_no, le.debit, le.credit, le.narration,
           pu.status AS pur_status, pu.doc_type AS pur_type,
           (SELECT x.id FROM purchases x WHERE x.corrects_purchase_id = pu.id AND x.status = 'draft' LIMIT 1) AS open_fix,
           (SELECT COUNT(*) FROM purchases d WHERE d.against_purchase_id = pu.id AND d.doc_type = 'debit_note' AND d.status = 'posted') AS returned,
           pm.status AS pay_status
    FROM ledger_entries le
    LEFT JOIN purchases pu ON pu.id = le.doc_id
    LEFT JOIN payments pm ON pm.id = le.doc_id
    WHERE le.party_type = 'supplier' AND le.party_id = ?
    ORDER BY le.entry_date DESC, le.created_at DESC LIMIT 200`, [id]);
  const { data: purchases } = useQuery<Purchase>(`SELECT id, doc_no, doc_date, supplier_invoice_no, grand_total, paid_total, status, doc_type FROM purchases WHERE supplier_id = ? ORDER BY doc_date DESC, created_at DESC LIMIT 50`, [id]);
  const { data: top } = useQuery<Top>(`
    SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name, SUM(pl.qty) AS qty, MAX(pl.rate) AS last_rate, MAX(pu.doc_date) AS last_date
    FROM purchase_lines pl JOIN purchases pu ON pu.id = pl.purchase_id AND pu.status = 'posted' AND pu.doc_type = 'purchase' AND pu.supplier_id = ?
    JOIN product_variants pv ON pv.id = pl.variant_id JOIN products p ON p.id = pv.product_id GROUP BY pv.id ORDER BY qty DESC LIMIT 20`, [id]);
  // What a supplier is owed is what the maal cost — the partners' number.
  // Staff record stock from a supplier but never see the amounts (owner, 7 Oct 2026).
  const showMoney = can('catalog.view_cost') || can('payment.pay_supplier');

  if (!s) return <Screen><Empty art="search" title="Ye supplier is phone par nahi mila" /></Screen>;

  // What is owed, built from the oldest line up.
  const desc = [...(ledger ?? [])].reverse()
    .reduce<(Ledger & { running: number })[]>((acc, e) => {
      acc.push({ ...e, running: (acc[acc.length - 1]?.running ?? 0) + e.credit - e.debit });
      return acc;
    }, [])
    .reverse();
  const fixer = can('purchase.approve');
  const payTaker = can('sale.cancel') && can('payment.pay_supplier');

  /** A payment written wrongly: take it back, then write the right one with "Paisa do". */
  async function takeBack(e: { doc_id: string | null; doc_no: string | null; debit: number }) {
    if (!e.doc_id) return;
    if (!(await confirm('Ye payment wapas lein?', `${e.doc_no ?? 'Payment'} · ${formatINR(e.debit)} — galat likha tha to wapas lo, phir sahi “Paisa do” likho.`))) return;
    try {
      await db.writeTransaction(async (tx) => { await cancelPayment(tx, e.doc_id!, 'Galat entry — khate se wapas li', actor); });
      notify('Payment wapas le li — khata theek ho gaya.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'danger');
    }
  }

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
                  onPress={() => router.push(`/purchase/${p.id}`)}
                  right={<View style={{ alignItems: 'flex-end' }}><Text mono>{formatINR(p.grand_total)}</Text><Badge tone={p.status === 'cancelled' ? 'danger' : p.doc_type === 'debit_note' ? 'info' : p.paid_total >= p.grand_total ? 'ok' : 'warn'}>{p.status === 'cancelled' ? 'cancel' : p.status === 'draft' ? 'adhoora' : p.doc_type === 'debit_note' ? 'wapas bheja' : p.paid_total >= p.grand_total ? 'chuka diya' : 'dena baaki'}</Badge></View>} />
              ))}
              {(purchases ?? []).length === 0 ? <Empty title="Abhi tak kuch nahi kharida" /> : null}
            </Card>

            <SectionTitle>Inse aane wala maal</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(top ?? []).map((p) => (
                <ListRow key={p.id} title={`${p.product_name} · ${p.variant_name}`} subtitle={`${p.sku} · aakhri baar ${dayLabel(p.last_date)}`} right={<View style={{ alignItems: 'flex-end' }}><Text mono>{p.qty} pcs</Text>{can('catalog.view_cost') ? <Text variant="small" color="textMuted" mono>@ {formatINR(p.last_rate)}</Text> : null}</View>} />
              ))}
              {(top ?? []).length === 0 ? <Empty title="Abhi tak kuch nahi kharida" /> : null}
            </Card>

            <SectionTitle>Khata</SectionTitle>
            {/* + when the shop owes more, − when it paid. A line opens the
                entry or payment it came from; an entry can be corrected and a
                payment taken back from right here. */}
            <Card style={{ gap: 0 }}>
              <LedgerList lines={desc.map((e) => {
                const isEntry = e.doc_type === 'purchase' && e.pur_type === 'purchase';
                const isPay = e.doc_type === 'payment_out' && !!e.pay_status;
                return {
                  key: e.id,
                  title: `${DOC_LABEL[e.doc_type] ?? e.doc_type}${e.doc_no ? ` ${e.doc_no}` : ''}`,
                  sub: `${dayLabel(e.entry_date)}${e.narration && !(e.doc_no && e.narration.endsWith(e.doc_no)) ? ` · ${e.narration}` : ''}`,
                  amount: e.credit ? `+ ${formatINR(e.credit)}` : `− ${formatINR(e.debit)}`,
                  up: !!e.credit,
                  running: `dena ${formatINR(e.running)}`,
                  onPress: e.pur_type && e.doc_id ? () => router.push(`/purchase/${e.doc_id}`) : e.pay_status ? () => router.push('/payments') : undefined,
                  badge: isEntry && e.pur_status === 'cancelled' ? <Badge tone="danger">cancel</Badge>
                    : isPay && e.pay_status !== 'posted' ? <Badge tone="danger">wapas li</Badge>
                    : isEntry && e.open_fix ? <Badge tone="warn">sudhaar khula</Badge> : null,
                  action: isEntry && e.pur_status === 'posted' && !e.returned && can('purchase.create') ? (
                    <Button size="sm" tone="secondary"
                      title={e.open_fix ? 'Sudhaar kholo' : fixer ? 'Entry sudhaaro' : 'Sudhaar bhejo'}
                      onPress={() => router.push(e.open_fix ? `/purchase/edit?id=${e.open_fix}` : `/purchase/edit?correct=${e.doc_id}`)} />
                  ) : isPay && e.pay_status === 'posted' && payTaker ? (
                    <Button size="sm" tone="ghost" title="Galat hai — wapas lo" onPress={() => takeBack(e)} />
                  ) : null,
                };
              })} />
            </Card>
          </>
        ) : null}
      </Screen>
    </>
  );
}
