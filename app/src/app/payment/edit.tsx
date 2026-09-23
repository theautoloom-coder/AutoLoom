/**
 * Mark a payment: money received from a customer (or paid to a supplier).
 * Cash / online, screenshot proof, remarks ("kis account mein aaya"), and
 * allocation to open bills oldest-first unless chosen by hand.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';

import { allocateFifo, formatINR, round, toDateString } from '@domain';

import { postPayment } from '@/lib/posting';
import { pickProof, uploadProof, type PickedFile } from '@/lib/proofs';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { useShopSettings } from '@/lib/use-settings';
import { openWhatsApp, paidMessage } from '@/lib/whatsapp';
import { updateRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Divider, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, NumberField, SelectField, confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type Party = { id: string; name: string; mobile: string | null; balance: number };
type OpenDoc = { id: string; doc_no: string; doc_date: string; outstanding: number; due_date: string | null };
const MODES = [{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'Online / UPI' }, { value: 'bank', label: 'Bank transfer' }, { value: 'cheque', label: 'Cheque' }, { value: 'card', label: 'Card' }, { value: 'adjustment', label: 'Adjustment' }];

export default function PaymentEdit() {
  const { direction: dirParam, party: partyParam, doc, amount: amountParam } = useLocalSearchParams<{ direction?: 'in' | 'out'; party?: string; doc?: string; amount?: string }>();
  const direction: 'in' | 'out' = dirParam === 'out' ? 'out' : 'in';
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const shop = useShopSettings();
  const isIn = direction === 'in';

  const [partyId, setPartyId] = useState<string | null>(partyParam || null);
  const [amount, setAmount] = useState<number | null>(amountParam ? Number(amountParam) : null);
  const [mode, setMode] = useState('cash');
  const [ref, setRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [date, setDate] = useState(toDateString());
  const [proof, setProof] = useState<PickedFile | null>(null);
  const [manual, setManual] = useState<Record<string, number>>({});
  const [useManual, setUseManual] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: parties } = useQuery<Party>(
    isIn
      ? `SELECT c.id, c.name, c.mobile, COALESCE(pb.balance,0) AS balance FROM customers c LEFT JOIN party_balance_live pb ON pb.party_type='customer' AND pb.party_id=c.id WHERE c.is_active=1 ORDER BY c.name`
      : `SELECT s.id, s.name, s.mobile, COALESCE(pb.balance,0) AS balance FROM suppliers s LEFT JOIN party_balance_live pb ON pb.party_type='supplier' AND pb.party_id=s.id WHERE s.is_active=1 ORDER BY s.name`);
  const party = parties?.find((p) => p.id === partyId) ?? null;
  const { data: openDocs } = useQuery<OpenDoc>(
    isIn
      ? `SELECT id, doc_no, doc_date, due_date, grand_total - paid_total AS outstanding FROM sales_invoices WHERE customer_id = ? AND doc_type='invoice' AND status='posted' AND grand_total > paid_total ORDER BY doc_date`
      : `SELECT id, doc_no, doc_date, due_date, grand_total - paid_total AS outstanding FROM purchases WHERE supplier_id = ? AND doc_type='purchase' AND status='posted' AND grand_total > paid_total ORDER BY doc_date`,
    [partyId ?? '']);
  const { data: accounts } = useQuery<{ remarks: string }>("SELECT DISTINCT remarks FROM payments WHERE remarks IS NOT NULL AND remarks <> '' ORDER BY created_at DESC LIMIT 6");

  useEffect(() => {
    if (doc && openDocs?.some((d) => d.id === doc) && !useManual) {
      const d = openDocs.find((x) => x.id === doc)!;
      if (amount == null) setAmount(d.outstanding);
      setManual({ [doc]: Math.min(amount ?? d.outstanding, d.outstanding) });
      setUseManual(true);
    }
  }, [doc, openDocs, amount, useManual]);

  const autoAlloc = useMemo(() => allocateFifo(amount ?? 0, (openDocs ?? []).map((d) => ({ id: d.id, doc_type: isIn ? 'sales_invoice' : 'purchase', outstanding: d.outstanding, doc_date: d.doc_date }))), [amount, openDocs, isIn]);
  const manualTotal = round(Object.values(manual).reduce((a, b) => a + (b || 0), 0));
  const allocated = useManual ? manualTotal : autoAlloc.reduce((a, x) => a + x.amount, 0);
  const unallocated = round((amount ?? 0) - allocated);

  async function attach() {
    try {
      const f = await pickProof();
      if (f) setProof(f);
    } catch (e) { notify((e as Error).message); }
  }

  async function save() {
    if (!partyId) { notify(`Choose the ${isIn ? 'customer' : 'supplier'}.`); return; }
    if (!amount || amount <= 0) { notify('Enter the amount.'); return; }
    if (useManual) {
      for (const [id, amt] of Object.entries(manual)) {
        const d = openDocs?.find((x) => x.id === id);
        if (d && amt > d.outstanding + 0.005) { notify(`${d.doc_no}: more than its pending ${formatINR(d.outstanding)}.`); return; }
      }
      if (manualTotal > amount + 0.005) { notify('Allocations exceed the payment amount.'); return; }
    }
    if (!(await confirm(isIn ? 'Mark payment received?' : 'Record payment?', `${formatINR(amount)} ${isIn ? 'from' : 'to'} ${party?.name} by ${MODES.find((m) => m.value === mode)?.label}.${unallocated > 0 ? ` ${formatINR(unallocated)} stays as advance.` : ''}`))) return;
    setBusy(true);
    try {
      let docNo = '';
      let paymentId = '';
      await db.writeTransaction(async (tx) => {
        docNo = await postPayment(tx, {
          direction, party_id: partyId, amount, mode, reference_no: ref || null, notes: remarks || null, payment_date: date,
          allocations: useManual ? Object.entries(manual).filter(([, a]) => a > 0).map(([doc_id, a]) => ({ doc_id, doc_type: isIn ? 'sales_invoice' : 'purchase', amount: round(a) })) : 'auto',
        }, actor);
        const r = await tx.execute('SELECT id FROM payments WHERE doc_no = ? LIMIT 1', [docNo]);
        paymentId = (r.rows?._array?.[0]?.id as string) ?? '';
        if (paymentId && remarks) await updateRow(tx, 'payments', paymentId, { remarks });
      });
      if (proof && paymentId) {
        try {
          const path = await uploadProof(proof, paymentId);
          await updateRow(db, 'payments', paymentId, { proof_path: path });
        } catch (e) {
          notify(`Payment saved, but the screenshot could not be uploaded now (${(e as Error).message}). Attach it later from Payments.`);
        }
      }
      const pendingAfter = round((party?.balance ?? 0) - amount);
      if (isIn && party?.mobile && (await confirm(`Recorded ${docNo}`, `Send "payment received" WhatsApp to ${party.name}?`))) {
        await openWhatsApp(party.mobile, paidMessage(shop.wa, { name: party.name, amount, mode: MODES.find((m) => m.value === mode)?.label ?? mode, pending: Math.max(pendingAfter, 0) }));
      }
      router.replace(isIn ? `/customer/${partyId}` : `/supplier/${partyId}`);
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  if (isIn && !can('payment.receive')) return <Screen><Text>You do not have permission to receive payments.</Text></Screen>;
  if (!isIn && !can('payment.pay_supplier')) return <Screen><Text>You do not have permission to pay suppliers.</Text></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: isIn ? 'Mark payment' : 'Pay supplier' }} />
      <Screen>
        <Text variant="display">{isIn ? 'Payment received' : 'Pay supplier'}</Text>
        <FormSection title={isIn ? 'From' : 'To'}>
          <SelectField label={isIn ? 'Customer' : 'Supplier'} value={partyId} options={(parties ?? []).map((p) => ({ value: p.id, label: p.name, sublabel: p.balance ? `${formatINR(p.balance)} ${isIn ? 'pending' : 'payable'}` : 'settled' }))} onChange={setPartyId} />
          {party ? <Row gap={8}><Badge tone={party.balance > 0 ? 'warn' : 'ok'}>{isIn ? 'Pending' : 'Payable'} {formatINR(party.balance)}</Badge>{party.balance > 0 ? <Button title="Full amount" size="sm" tone="ghost" onPress={() => setAmount(round(party.balance))} /> : null}</Row> : null}
        </FormSection>

        <FormSection title="Payment">
          <NumberField label="Amount (₹)" value={amount} onChange={setAmount} />
          <Text variant="label" color="textMuted">Mode</Text>
          <Row gap={space.xs} wrap>{MODES.map((m) => <Chip key={m.value} label={m.label} selected={mode === m.value} onPress={() => setMode(m.value)} />)}</Row>
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
            <Input containerStyle={{ flex: 1 }} label={mode === 'cheque' ? 'Cheque no.' : mode === 'upi' ? 'UPI ref / UTR' : 'Reference'} value={ref} onChangeText={setRef} autoCapitalize="characters" />
          </Row>
          <Input label="Remarks · kis account mein aaya / kisne liya" value={remarks} onChangeText={setRemarks} placeholder="Rakesh ji ke HDFC me · Ramesh ne cash liya" />
          {(accounts ?? []).length ? <Row gap={space.xs} wrap>{(accounts ?? []).map((a) => <Chip key={a.remarks} label={a.remarks} selected={remarks === a.remarks} onPress={() => setRemarks(a.remarks)} />)}</Row> : null}
          <Divider />
          <Row gap={12} align="center">
            <Button title={proof ? 'Change screenshot' : 'Attach payment screenshot'} tone="secondary" onPress={attach} />
            {proof ? <Image source={{ uri: proof.uri }} style={{ width: 56, height: 56, borderRadius: 6 }} /> : <Text variant="small" color="textFaint">Optional · UPI / bank screenshot as proof</Text>}
          </Row>
        </FormSection>

        {partyId ? (
          <>
            <SectionTitle right={<Button title={useManual ? 'Auto (oldest first)' : 'Choose bills'} tone="ghost" size="sm" onPress={() => setUseManual((v) => !v)} />}>Settle against · {(openDocs ?? []).length} open</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(openDocs ?? []).map((d) => {
                const auto = autoAlloc.find((a) => a.doc_id === d.id)?.amount ?? 0;
                return (
                  <ListRow key={d.id} title={d.doc_no} subtitle={`${d.doc_date} · pending ${formatINR(d.outstanding)}`}
                    right={useManual ? <View style={{ width: 110 }}><NumberField value={manual[d.id] ?? null} onChange={(v) => setManual((m) => ({ ...m, [d.id]: v ?? 0 }))} placeholder="0" /></View> : <Text mono color={auto ? 'ok' : 'textFaint'}>{auto ? formatINR(auto) : '—'}</Text>} />
                );
              })}
              {(openDocs ?? []).length === 0 ? <Text variant="small" color="textMuted" style={{ padding: 12 }}>No open bills; the amount is kept as advance and used on the next bill.</Text> : null}
              <Divider />
              <Row style={{ justifyContent: 'space-between', paddingTop: 8 }}>
                <Text variant="small" color="textMuted">Settled {formatINR(allocated)}</Text>
                <Text variant="small" color={unallocated > 0 ? 'warn' : 'textMuted'}>Advance {formatINR(Math.max(unallocated, 0))}</Text>
              </Row>
            </Card>
          </>
        ) : null}

        <Button title={isIn ? 'Mark as paid' : 'Record payment'} size="lg" onPress={save} loading={busy} />
      </Screen>
    </>
  );
}
