import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { checkCredit, formatINR, formatRegistration, toDateString } from '@domain';

import { CUSTOMER, CUSTOMER_LEDGER, CUSTOMER_TOP_PRODUCTS } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useShopSettings } from '@/lib/use-settings';
import { openWhatsApp, reminderMessage, statementMessage } from '@/lib/whatsapp';
import { notify } from '@/ui/forms';
import { Badge, Button, Card, Divider, Empty, KV, ListRow, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';
import { space, type as typeScale } from '@/ui/theme';

type Customer = {
  id: string; code: string; name: string; business_name: string | null; owner_name: string | null; mobile: string | null; alt_phone: string | null;
  email: string | null; gstin: string | null; address_line1: string | null; address_line2: string | null; city: string | null; state_name: string | null;
  pincode: string | null; customer_type: string; credit_limit: number; credit_days: number; price_list_name: string | null; balance: number; notes: string | null;
};
type Ledger = { id: string; entry_date: string; doc_type: string; doc_no: string | null; debit: number; credit: number; narration: string | null };
type Top = { id: string; sku: string; variant_name: string; product_name: string; qty: number; last_rate: number };
type Warranty = { invoice_id: string; doc_no: string; doc_date: string; variant_id: string; description: string; warranty_months: number; days_left: number };
type Vehicle = { id: string; registration_no: string; color: string | null; make_name: string | null; model_name: string | null; generation_name: string | null; model_id: string | null };

const DOC_LABEL: Record<string, string> = {
  opening: 'Opening balance',
  sales_invoice: 'Invoice',
  credit_note: 'Credit note',
  payment_in: 'Payment aaya',
  adjustment: 'Adjustment',
  cancel_reversal: 'Cancellation',
};

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const shop = useShopSettings();
  const t = useTheme();

  const { data: rows } = useQuery<Customer>(CUSTOMER.sql, [id]);
  const c = rows?.[0];
  const { data: ledger } = useQuery<Ledger>(CUSTOMER_LEDGER.sql, [id]);
  const since = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return toDateString(d);
  }, []);
  const tq = CUSTOMER_TOP_PRODUCTS(since);
  const { data: top } = useQuery<Top>(tq.sql, [id, ...tq.params]);
  // Warranty lookup: the customer walks in with a part and no bill, so list
  // everything they ever bought that carries a warranty period, newest first,
  // with the days remaining worked out from the invoice date.
  const { data: warranty } = useQuery<Warranty>(
    `SELECT i.id AS invoice_id, i.doc_no, i.doc_date, l.variant_id, l.description,
            pv.warranty_months,
            CAST(julianday(date(i.doc_date, '+' || pv.warranty_months || ' months')) - julianday(date('now')) AS INTEGER) AS days_left
     FROM sales_invoice_lines l
     JOIN sales_invoices i ON i.id = l.invoice_id
     JOIN product_variants pv ON pv.id = l.variant_id
     WHERE i.customer_id = ? AND i.doc_type = 'invoice' AND i.status = 'posted' AND pv.warranty_months > 0
     ORDER BY i.doc_date DESC LIMIT 25`,
    [id]
  );

  const { data: vehicles } = useQuery<Vehicle>(
    `SELECT cv.id, cv.registration_no, cv.color, vm.id AS model_id, vm.name AS model_name, mk.name AS make_name, vg.name AS generation_name
     FROM customer_vehicles cv LEFT JOIN vehicle_models vm ON vm.id = cv.model_id LEFT JOIN vehicle_makes mk ON mk.id = vm.make_id
     LEFT JOIN vehicle_generations vg ON vg.id = cv.generation_id WHERE cv.customer_id = ? ORDER BY cv.registration_no`,
    [id]
  );

  const showMoney = can('sale.create') || can('reports.view') || can('payment.receive');

  if (!c) {
    return (
      <Screen>
        <Empty title="Ye grahak is phone par nahi mila" />
      </Screen>
    );
  }

  const credit = checkCredit({ outstanding: c.balance, creditLimit: c.credit_limit, invoiceAmount: 0 });
  let running = 0;
  const ledgerAsc = [...(ledger ?? [])].reverse().map((e) => {
    running += e.debit - e.credit;
    return { ...e, running };
  });
  const ledgerDesc = ledgerAsc.reverse();

  /**
   * The whole khata, not just the total. A dealer asking *poora hisaab bhejo*
   * wants the working; the reminder only sends the closing figure, so the owner
   * was screenshotting this screen.
   */
  async function sendStatement() {
    if (!c) return;
    if (!c.mobile) { notify('Is customer ka mobile number nahi hai.'); return; }
    const entries = [...(ledger ?? [])].reverse();
    if (entries.length === 0) { notify('Abhi is khate mein kuch nahi hai.'); return; }
    // The running balance is built from the oldest entry, so the opening figure
    // is the closing balance minus everything that happened in between.
    const movement = entries.reduce((sum, e) => sum + e.debit - e.credit, 0);
    await openWhatsApp(c.mobile, statementMessage(shop.wa, {
      name: c.name,
      from: entries[0].entry_date,
      to: entries[entries.length - 1].entry_date,
      opening: c.balance - movement,
      rows: entries.map((e) => ({
        date: e.entry_date,
        label: e.doc_no ?? e.narration ?? e.doc_type,
        debit: e.debit,
        credit: e.credit,
      })),
      closing: c.balance,
    }));
  }

  return (
    <>
      <Stack.Screen options={{ title: c.name }} />
      <Screen>
        <View>
          <Row gap={space.xs}>
            <Badge tone={c.customer_type === 'retail' ? 'neutral' : 'info'}>{c.customer_type}</Badge>
            {c.price_list_name ? <Badge tone="accent">{c.price_list_name} prices</Badge> : null}
            <Text variant="small" color="textFaint" mono>
              {c.code}
            </Text>
          </Row>
          <Row style={{ justifyContent: 'space-between' }} align="flex-start">
            <Text variant="display" style={{ marginTop: space.xs, flex: 1 }}>
              {c.name}
            </Text>
            <Row gap={6}>
              {can('sale.create') ? <Button title="Naya bill" size="sm" onPress={() => router.push(`/invoice/edit?customer=${c.id}`)} /> : null}
              <Button title="Hisaab bhejo" size="sm" tone="ghost" onPress={sendStatement} />
              {c.balance > 0 ? <Button title="Yaad dilao" size="sm" tone="secondary" onPress={async () => { if (!c.mobile) { notify('Is grahak ka mobile number nahi hai.'); return; } await openWhatsApp(c.mobile, reminderMessage(shop.wa, { name: c.name, pending: c.balance })); }} /> : null}
              {can('jobcard.edit') ? <Button title="Job card" size="sm" tone="secondary" onPress={() => router.push(`/job-card/edit?customer=${c.id}`)} /> : null}
              {can('payment.receive') ? <Button title="Paisa aa gaya" size="sm" tone="secondary" onPress={() => router.push(`/payment/edit?direction=in&party=${c.id}${c.balance > 0 ? `&amount=${c.balance}` : ''}`)} /> : null}
              {can('party.edit') ? <Button title="Badlo" tone="secondary" size="sm" onPress={() => router.push(`/customer/edit?id=${c.id}`)} /> : null}
            </Row>
          </Row>
          {c.business_name && c.business_name !== c.name ? (
            <Text variant="body" color="textMuted">
              {c.business_name}
            </Text>
          ) : null}
        </View>

        {showMoney ? (
          <Card keyline style={{ gap: space.md }}>
            <Row style={{ justifyContent: 'space-between' }} align="flex-start">
              <View style={{ flex: 1 }}>
                <Text variant="label" color="textMuted">Khata baaki</Text>
                <Text style={[typeScale.hero, { fontSize: 40, lineHeight: 44, color: c.balance > 0 ? t.warn : t.ok }]}>
                  {formatINR(c.balance)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text variant="mono" color="textFaint">
                  {credit.unlimited ? 'limit nahi' : `limit ${formatINR(c.credit_limit)}`}
                </Text>
                <Text variant="mono" color="textFaint">{c.credit_days} din udhaar</Text>
              </View>
            </Row>
            {!credit.unlimited && c.credit_limit > 0 ? (
              <View style={{ height: 5, borderRadius: 3, backgroundColor: t.bg, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(Math.round((c.balance / c.credit_limit) * 100), 100)}%`, height: 5, backgroundColor: credit.available <= 0 ? t.danger : t.warn }} />
              </View>
            ) : null}
          </Card>
        ) : null}

        <SectionTitle>Sampark</SectionTitle>
        <Card style={{ gap: 0 }}>
          {c.owner_name ? <KV k="Maalik" v={c.owner_name} /> : null}
          {c.mobile ? <KV k="Mobile" v={c.mobile} mono /> : null}
          {c.alt_phone ? <KV k="Phone" v={c.alt_phone} mono /> : null}
          {c.email ? <KV k="Email" v={c.email} /> : null}
          {c.gstin ? <KV k="GSTIN" v={c.gstin} mono /> : null}
          <KV k="Pata" v={[c.address_line1, c.address_line2, c.city, c.state_name, c.pincode].filter(Boolean).join(', ') || '—'} />
          {c.notes ? <KV k="Note" v={c.notes} /> : null}
        </Card>

        {vehicles && vehicles.length > 0 ? (
          <>
            <SectionTitle>Gaadiyan</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {vehicles.map((v) => (
                <ListRow
                  key={v.id}
                  title={formatRegistration(v.registration_no)}
                  subtitle={[v.make_name, v.model_name, v.generation_name, v.color].filter(Boolean).join(' · ') || 'Model not recorded'}
                  onPress={() => router.push(`/job-cards?vehicle=${v.id}`)}
                  right={<Row gap={8}>{v.model_id ? <Text color="accent" onPress={() => router.push(`/vehicle/${v.model_id}`)}>Saara maal</Text> : null}<Text color="accent">Pehle kya liya</Text></Row>}
                />
              ))}
            </Card>
          </>
        ) : null}

        {warranty && warranty.length > 0 ? (
          <>
            <SectionTitle>Warranty wala maal</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {warranty.map((w) => {
                const live = w.days_left > 0;
                return (
                  <ListRow
                    key={`${w.invoice_id}-${w.variant_id}`}
                    title={w.description}
                    subtitle={`${w.doc_no} · ${w.doc_date} · ${w.warranty_months} mahine`}
                    onPress={() => router.push(`/invoice/${w.invoice_id}`)}
                    right={
                      <Badge tone={live ? 'ok' : 'neutral'}>
                        {live ? `${w.days_left} din baaki` : 'khatam'}
                      </Badge>
                    }
                  />
                );
              })}
            </Card>
          </>
        ) : null}

        {showMoney ? (
          <>
            <SectionTitle>Sabse zyada bikne wala maal · pichhle 12 mahine</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {top && top.length > 0 ? (
                top.map((p) => (
                  <ListRow
                    key={p.id}
                    title={`${p.product_name} · ${p.variant_name}`}
                    subtitle={p.sku}
                    right={
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text mono>{p.qty} pcs</Text>
                        <Text variant="small" color="textMuted" mono>
                          last @ {formatINR(p.last_rate)}
                        </Text>
                      </View>
                    }
                  />
                ))
              ) : (
                <Empty title="Pichhle 12 mahine mein kuch nahi liya" />
              )}
            </Card>

            <SectionTitle>Khata</SectionTitle>
            <Card style={{ gap: 0 }}>
              <Row gap={space.sm} style={{ paddingVertical: 6 }}>
                <Text variant="label" color="textMuted" style={{ flex: 1.6 }}>
                  Entry
                </Text>
                <Text variant="label" color="textMuted" style={{ width: 80, textAlign: 'right' }}>
                  Debit
                </Text>
                <Text variant="label" color="textMuted" style={{ width: 80, textAlign: 'right' }}>
                  Credit
                </Text>
                <Text variant="label" color="textMuted" style={{ width: 90, textAlign: 'right' }}>
                  Balance
                </Text>
              </Row>
              <Divider />
              {ledgerDesc.length === 0 ? <Empty title="Khata khaali hai" /> : null}
              {ledgerDesc.map((e) => (
                <React.Fragment key={e.id}>
                  <Row gap={space.sm} style={{ paddingVertical: 8 }} align="flex-start">
                    <View style={{ flex: 1.6 }}>
                      <Text variant="small" style={{ fontWeight: '600' }}>
                        {DOC_LABEL[e.doc_type] ?? e.doc_type}
                        {e.doc_no ? ` ${e.doc_no}` : ''}
                      </Text>
                      <Text variant="small" color="textFaint">
                        {e.entry_date}
                        {e.narration ? ` · ${e.narration}` : ''}
                      </Text>
                    </View>
                    <Text variant="small" mono style={{ width: 80, textAlign: 'right' }}>
                      {e.debit ? formatINR(e.debit) : ''}
                    </Text>
                    <Text variant="small" mono style={{ width: 80, textAlign: 'right' }} color="ok">
                      {e.credit ? formatINR(e.credit) : ''}
                    </Text>
                    <Text variant="small" mono style={{ width: 90, textAlign: 'right', fontWeight: '600' }}>
                      {formatINR(e.running)}
                    </Text>
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
