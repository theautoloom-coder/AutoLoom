/**
 * Kharcha — money out that is not a supplier payment.
 *
 * The shop spends all day: transport, packing, chai, an advance to the boy,
 * the electricity bill. None of it could be written down before, so the day's
 * cash never tallied and "profit" was only gross margin.
 *
 * One screen, with the form inline rather than behind a route. Writing down a
 * ₹40 chai has to cost fewer taps than it is worth, or nobody does it and the
 * ledger goes back to being a diary. Category is a row of chips for the eight
 * things a shop actually spends on, plus free text for the ninth.
 */
import { useQuery } from '@powersync/react';
import { Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR, toDateString } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Divider, Empty, Grid, Input, ListRow, Row, Screen, SectionTitle, StatTile, Text } from '@/ui';
import { NumberField, SelectField, confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

/** What a car-accessories shop actually spends on, in rough order of frequency. */
const CATEGORIES = ['Transport', 'Packing', 'Chai / khana', 'Staff advance', 'Bijli', 'Kiraya', 'Repair', 'Fuel'];

const MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank' },
  { value: 'cheque', label: 'Cheque' },
];

type Expense = {
  id: string; expense_date: string; category: string; amount: number;
  mode: string; paid_to: string | null; note: string | null;
};

export default function ExpensesScreen() {
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const mayRecord = can('expense.record');

  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [mode, setMode] = useState<string | null>('cash');
  const [paidTo, setPaidTo] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(toDateString());

  const { data: rows } = useQuery<Expense>(
    `SELECT id, expense_date, category, amount, mode, paid_to, note
       FROM expenses ORDER BY expense_date DESC, created_at DESC LIMIT 200`);
  const list = rows ?? [];

  const today = toDateString();
  const monthStart = today.slice(0, 8) + '01';
  const totals = useMemo(() => ({
    today: list.filter((e) => e.expense_date === today).reduce((s, e) => s + Number(e.amount), 0),
    month: list.filter((e) => e.expense_date >= monthStart).reduce((s, e) => s + Number(e.amount), 0),
  }), [list, today, monthStart]);

  function reset() {
    setCategory(''); setAmount(null); setMode('cash'); setPaidTo(''); setNote('');
    setDate(toDateString());
  }

  async function save() {
    if (!category.trim()) { notify('Kis cheez ka kharcha hai, wo choose karo.'); return; }
    if (amount == null || amount <= 0) { notify('Amount daalo.'); return; }
    setSaving(true);
    try {
      await insertRow(db, 'expenses', {
        expense_date: date,
        category: category.trim(),
        amount,
        mode: mode ?? 'cash',
        paid_to: paidTo.trim() || null,
        note: note.trim() || null,
        location_id: locationId,
      }, actor);
      reset();
      setAdding(false);
      notify('Kharcha likh diya.');
    } catch (e) {
      notify(`Save nahi hua: ${String((e as Error).message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(e: Expense) {
    if (!(await confirm('Kharcha hatayein?', `${e.category} · ${formatINR(e.amount)}`))) return;
    await db.execute('DELETE FROM expenses WHERE id = ?', [e.id]);
  }

  // Group by date so a day reads as a day, not as a flat list.
  const byDate = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of list) {
      const k = e.expense_date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()];
  }, [list]);

  const dayLabel = (d: string) =>
    d === today ? 'Aaj' : new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });

  return (
    <>
      <Stack.Screen options={{ title: 'Kharcha' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="display">Kharcha</Text>
          {mayRecord ? (
            <Button
              title={adding ? 'Band karo' : '+ Naya kharcha'}
              tone={adding ? 'secondary' : 'primary'}
              onPress={() => { setAdding(!adding); reset(); }}
            />
          ) : null}
        </Row>

        <Grid min={220}>
          <StatTile label="AAJ" value={formatINR(totals.today)} sub="aaj ka kharcha" icon="wallet-outline" accent="amber" />
          <StatTile label="IS MAHINE" value={formatINR(totals.month)} sub="mahine ka kul" icon="calendar-outline" accent="violet" />
        </Grid>

        {adding ? (
          <Card keyline spine="accent" style={{ gap: space.md }}>
            <Text variant="label" color="textMuted">KIS CHEEZ KA</Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
              ))}
            </Row>
            <Input
              label="Ya khud likho"
              value={CATEGORIES.includes(category) ? '' : category}
              onChangeText={setCategory}
              placeholder="Kuch aur…"
            />

            <Row gap={12}>
              <View style={{ flex: 1 }}>
                <NumberField label="Kitna" value={amount} onChange={setAmount} placeholder="250" />
              </View>
              <View style={{ flex: 1 }}>
                <SelectField label="Kaise diya" value={mode} options={MODES} onChange={setMode} />
              </View>
            </Row>

            <Row gap={12}>
              <Input containerStyle={{ flex: 1 }} label="Kisko diya" value={paidTo} onChangeText={setPaidTo} placeholder="Ramesh transport" />
              <Input containerStyle={{ flex: 1 }} label="Tareekh" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
            </Row>

            <Input label="Note" value={note} onChangeText={setNote} placeholder="zaroori nahi" />

            <Button title="Likh do" size="lg" onPress={save} loading={saving} />
          </Card>
        ) : null}

        {byDate.length === 0 ? (
          <Empty
            title="Abhi koi kharcha nahi"
            hint={mayRecord
              ? 'Transport, packing, chai — jo bhi bahar jaaye, yahan likh do. Tabhi din ka cash milega.'
              : 'Kharcha likhne ki permission nahi hai.'}
          />
        ) : (
          byDate.map(([d, items]) => {
            const dayTotal = items.reduce((s, e) => s + Number(e.amount), 0);
            return (
              <View key={d}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <SectionTitle>{dayLabel(d)}</SectionTitle>
                  <Text mono color="textMuted">{formatINR(dayTotal)}</Text>
                </Row>
                <Card style={{ gap: 0 }}>
                  {items.map((e, i) => (
                    <React.Fragment key={e.id}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow
                        title={e.category}
                        subtitle={[e.paid_to, e.note].filter(Boolean).join(' · ') || undefined}
                        right={
                          <Row gap={8} align="center">
                            <Badge tone="neutral">{e.mode}</Badge>
                            <Text mono>{formatINR(e.amount)}</Text>
                          </Row>
                        }
                        onPress={mayRecord ? () => remove(e) : undefined}
                      />
                    </React.Fragment>
                  ))}
                </Card>
              </View>
            );
          })
        )}
      </Screen>
    </>
  );
}
