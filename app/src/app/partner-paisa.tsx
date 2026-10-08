/**
 * PARTNER KA PAISA — who put money into AutoLoom, who took money out, when.
 *
 * "Kisne kis date mai kitna invest kia wo sab daal sakte hai proper hisab
 * kitab ke liye" (owner, 6 Oct 2026). Each entry is a payment row with
 * party_type 'partner' and the partner's profile as the party:
 *
 *   Paisa lagaya  → direction 'in'  (money into the business)
 *   Paisa nikala  → direction 'out' (money out to the partner)
 *
 * None of it is sale, kharcha or munafa: it is the partners' own account
 * with the business, so Hisab never counts it and this screen is its home.
 * A wrong entry is cancelled, not deleted, so the history keeps it.
 */
import { useQuery } from '@powersync/react';
import { Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR, isDateString, toDateString } from '@domain';

import { partnerReport, shareReport } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { dayLabel, payModeLabel } from '@/lib/words';
import { insertRow, updateRow } from '@/lib/writes';
import { Button, Card, Chip, Divider, Empty, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { NumberField, confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';
import { DateField } from '@/ui/date-field';

type Partner = { id: string; full_name: string };
type Entry = { id: string; party_id: string; partner: string; payment_date: string; direction: 'in' | 'out'; amount: number; mode: string; notes: string | null };

const MODES = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'bank', label: 'Bank' }, { value: 'cheque', label: 'Cheque' },
];

export default function PartnerPaisa() {
  const { db } = useSystem();
  const { can, actor } = useSession();

  // The partners are the people holding the owner role.
  const { data: partners } = useQuery<Partner>(`
    SELECT DISTINCT p.id, p.full_name FROM profiles p
     WHERE p.is_active = 1 AND (p.role = 'owner' OR p.id IN (SELECT profile_id FROM profile_roles WHERE role = 'owner'))
     ORDER BY p.full_name`);
  const { data: entries } = useQuery<Entry>(`
    SELECT pm.id, pm.party_id, COALESCE(pr.full_name, 'Partner') AS partner, pm.payment_date, pm.direction, pm.amount, pm.mode, pm.notes
      FROM payments pm LEFT JOIN profiles pr ON pr.id = pm.party_id
     WHERE pm.party_type = 'partner' AND pm.status = 'posted'
     ORDER BY pm.payment_date DESC, pm.created_at DESC`);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(toDateString());
  const [mode, setMode] = useState('bank');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const who = partnerId ?? partners?.[0]?.id ?? null;

  const perPartner = useMemo(() => {
    const m = new Map<string, { name: string; lagaya: number; nikala: number }>();
    for (const p of partners ?? []) m.set(p.id, { name: p.full_name, lagaya: 0, nikala: 0 });
    for (const e of entries ?? []) {
      const x = m.get(e.party_id) ?? { name: e.partner, lagaya: 0, nikala: 0 };
      if (e.direction === 'in') x.lagaya += e.amount; else x.nikala += e.amount;
      m.set(e.party_id, x);
    }
    return [...m.entries()];
  }, [partners, entries]);
  const total = perPartner.reduce((a, [, x]) => a + x.lagaya - x.nikala, 0);

  async function save() {
    if (!who) { notify('Partner chuno.', 'danger'); return; }
    if (!amount || amount <= 0) { notify('Kitna paisa — rakam likho.', 'danger'); return; }
    if (!isDateString(date)) { notify('Tareekh YYYY-MM-DD mein likho, jaise 2026-10-07.', 'danger'); return; }
    const name = partners?.find((p) => p.id === who)?.full_name ?? 'Partner';
    if (!(await confirm(direction === 'in' ? 'Paisa lagaya likh dein?' : 'Paisa nikala likh dein?', `${name} · ${formatINR(amount)} · ${payModeLabel(mode)} · ${dayLabel(date)}`))) return;
    setSaving(true);
    try {
      await insertRow(db, 'payments', {
        direction, party_type: 'partner', party_id: who, payment_date: date, amount, mode,
        notes: note.trim() || null, status: 'posted', received_by: actor.userId,
      }, actor);
      notify(direction === 'in' ? `${name} ne ${formatINR(amount)} lagaya — likh diya.` : `${name} ne ${formatINR(amount)} nikala — likh diya.`, 'ok');
      setAmount(null);
      setNote('');
    } catch (e) {
      notify(`Nahi likha gaya: ${String((e as Error).message ?? e)}`, 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function cancel(e: Entry) {
    if (!(await confirm('Ye entry cancel karein?', `${e.partner} · ${e.direction === 'in' ? 'lagaya' : 'nikala'} ${formatINR(e.amount)} · ${dayLabel(e.payment_date)}. Galti se likhi ho tabhi.`))) return;
    await updateRow(db, 'payments', e.id, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'Galat entry' });
    notify('Cancel ho gayi.', 'ok');
  }

  async function pdf() {
    setPrinting(true);
    try {
      const first = (entries ?? []).map((e) => e.payment_date).sort()[0] ?? toDateString();
      await shareReport(await partnerReport(db, first, toDateString()), 'Partner ka hisaab');
    } catch (e) {
      notify(`PDF nahi bana: ${String((e as Error).message ?? e)}`, 'danger');
    } finally {
      setPrinting(false);
    }
  }

  if (!can('partner.capital')) {
    return <Screen><Empty title="Ye sirf partner dekh sakte hain" /></Screen>;
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Partner ka paisa' }} />
      <Screen>
        <View>
          <Text variant="display">Partner ka paisa</Text>
          <Text variant="small" color="textMuted">
            Kis partner ne business mein kab kitna lagaya aur kitna nikala. Ye kharcha ya munafa nahi — partner ka apna hisaab hai. Galat entry par tap karke cancel kar sakte ho.
          </Text>
        </View>

        <Card keyline>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label" color="textMuted">Business mein kul poonji</Text>
            <Button title="PDF" tone="secondary" size="sm" loading={printing} onPress={pdf} />
          </Row>
          <Text variant="number" mono>{formatINR(total)}</Text>
          <Divider />
          {perPartner.length === 0 ? <Text variant="small" color="textMuted">Abhi koi partner nahi.</Text> : null}
          {perPartner.map(([pid, x]) => (
            <View key={pid} style={{ gap: 2, paddingVertical: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="heading">{x.name}</Text>
                <Text mono style={{ fontWeight: '700' }}>{formatINR(x.lagaya - x.nikala)}</Text>
              </Row>
              <Text variant="small" color="textMuted">Lagaya {formatINR(x.lagaya)} · Nikala {formatINR(x.nikala)}</Text>
            </View>
          ))}
        </Card>

        <SectionTitle>Nayi entry</SectionTitle>
        <Card style={{ gap: space.md }}>
          <Text variant="label" color="textMuted">Partner</Text>
          <Row gap={space.xs} wrap>
            {(partners ?? []).map((p) => <Chip key={p.id} label={p.full_name} selected={who === p.id} onPress={() => setPartnerId(p.id)} />)}
          </Row>
          <Row gap={space.xs}>
            <Chip label="Paisa lagaya" selected={direction === 'in'} onPress={() => setDirection('in')} />
            <Chip label="Paisa nikala" selected={direction === 'out'} onPress={() => setDirection('out')} />
          </Row>
          <NumberField label="Kitna" value={amount} onChange={setAmount} />
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><DateField label="Kab" value={date} onChange={setDate} /></View>
          </Row>
          <Text variant="label" color="textMuted">Kaise</Text>
          <Row gap={space.xs} wrap>
            {MODES.map((m) => <Chip key={m.value} label={m.label} selected={mode === m.value} onPress={() => setMode(m.value)} />)}
          </Row>
          <Input label="Note" value={note} onChangeText={setNote} placeholder="Kis kaam ke liye, kaunsa account" />
          <Button
            title={amount ? `${formatINR(amount)} ${direction === 'in' ? 'lagaya' : 'nikala'} — likh do` : 'Likh do'}
            size="lg" full onPress={save} loading={saving}
          />
        </Card>

        <SectionTitle right={<Text variant="small" color="textFaint">{(entries ?? []).length}</Text>}>Saari entry</SectionTitle>
        {(entries ?? []).length === 0 ? (
          <Empty title="Abhi koi entry nahi" hint="Upar partner chuno, kitna lagaya ya nikala likho." />
        ) : (
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {(entries ?? []).map((e) => (
              <ListRow
                key={e.id}
                title={`${e.partner} · ${e.direction === 'in' ? 'lagaya' : 'nikala'}`}
                subtitle={[dayLabel(e.payment_date), payModeLabel(e.mode), e.notes].filter(Boolean).join(' · ')}
                onPress={() => cancel(e)}
                right={<Text mono color={e.direction === 'in' ? 'ok' : 'danger'}>{e.direction === 'in' ? '+' : '−'}{formatINR(e.amount)}</Text>}
              />
            ))}
          </Card>
        )}
      </Screen>
    </>
  );
}
