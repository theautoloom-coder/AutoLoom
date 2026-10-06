/**
 * KHARCHA LIKHO — business mein jo paisa kharch hua.
 *
 * The shop spends all day: transport, petrol, loading, packing, chai, the
 * bijli bill. None of it could be written down before, so the day's cash never
 * tallied and "profit" was only gross margin.
 *
 * The form is open when the screen opens. It used to sit behind a "+ Naya
 * kharcha" button, which is one tap of nothing before you can begin, and a
 * ₹40 chai is not worth a tap of nothing. The order of the fields is the order
 * the answer arrives in a real shop: how much, what for, and then — only if it
 * is not today, not cash, not obvious — the rest. Photo and note are one tap
 * away rather than in the way, because a transport chit gets photographed
 * maybe one time in ten and the other nine entries should not pay for it.
 *
 * This screen shows BUSINESS kharcha only — COALESCE(is_personal,0)=0. Money a
 * partner drew for themselves also leaves the drawer, but it is not a cost of
 * trading and mixing the two makes the shop look less profitable than it is.
 * That lives on Partner Kharcha, with its own totals.
 */
import { useQuery } from '@powersync/react';
import { Stack } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { formatINR, toDateString } from '@domain';

import { uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Divider, Empty, Grid, Input, ListRow, Row, Screen, SectionTitle, StatTile, Text } from '@/ui';
import { Disclosure, confirm, notify } from '@/ui/forms';
import { ItemPhoto, PhotoPicker } from '@/ui/photo';
import { space, type as type_ } from '@/ui/theme';

/** What this shop actually spends on, in rough order of frequency. */
const CATEGORIES = ['Transport', 'Petrol', 'Rent', 'Bijli', 'Loading', 'Packing', 'Repair', 'Chai/Pani', 'Aur kuch'];

/**
 * Three ways money goes out, in the shop's words. `mode` on the row keeps the
 * server's vocabulary — 'bank' is what the column's check constraint calls the
 * thing everybody at the counter calls "Online".
 */
const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Online' },
  { value: 'upi', label: 'UPI' },
];

const methodLabel = (mode: string) => METHODS.find((m) => m.value === mode)?.label ?? mode;

type Expense = {
  id: string; expense_date: string; category: string; amount: number;
  mode: string; paid_by: string | null; paid_to: string | null;
  note: string | null; photo_path: string | null;
};

type Window = 'aaj' | 'mahina' | 'sab';

export default function KharchaLikho() {
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const mayRecord = can('expense.record');

  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState('');
  const [otherCategory, setOtherCategory] = useState('');
  const [date, setDate] = useState(toDateString());
  const [paidBy, setPaidBy] = useState('');
  const [method, setMethod] = useState('cash');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [window_, setWindow] = useState<Window>('mahina');

  // The keyboard's next key walks the form instead of the thumb doing it. The
  // category and method rows in between are chips, so the jump skips them —
  // they are already one tap each and a tap is cheaper than a focus.
  const paidByRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);

  // Business kharcha only. A partner's personal withdrawal is money out of the
  // same drawer and belongs on its own screen, not in this total.
  const { data: rows } = useQuery<Expense>(
    `SELECT id, expense_date, category, amount, mode, paid_by, paid_to, note, photo_path
       FROM expenses
      WHERE COALESCE(is_personal, 0) = 0
      ORDER BY expense_date DESC, created_at DESC
      LIMIT 300`);

  // Whoever is on the shop floor today. Tapping a name beats typing it.
  const { data: staff } = useQuery<{ id: string; full_name: string }>(
    'SELECT id, full_name FROM profiles WHERE is_active = 1 ORDER BY full_name LIMIT 30');

  const list = rows ?? [];
  const today = toDateString();
  const monthStart = today.slice(0, 8) + '01';

  const totals = useMemo(() => ({
    today: list.filter((e) => e.expense_date === today).reduce((s, e) => s + Number(e.amount), 0),
    month: list.filter((e) => e.expense_date >= monthStart).reduce((s, e) => s + Number(e.amount), 0),
  }), [list, today, monthStart]);

  const shown = useMemo(() => list.filter((e) =>
    window_ === 'aaj' ? e.expense_date === today
    : window_ === 'mahina' ? e.expense_date >= monthStart
    : true), [list, window_, today, monthStart]);

  const shownTotal = shown.reduce((s, e) => s + Number(e.amount), 0);

  // Grouped by date so a day reads as a day, not as a flat list.
  const byDate = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of shown) {
      if (!m.has(e.expense_date)) m.set(e.expense_date, []);
      m.get(e.expense_date)!.push(e);
    }
    return [...m.entries()];
  }, [shown]);

  const amount = Number(amountText.replace(/[^0-9.]/g, '')) || 0;
  const finalCategory = category === 'Aur kuch' ? otherCategory.trim() : category;
  const ready = amount > 0 && finalCategory.length > 0;

  function reset() {
    setAmountText(''); setCategory(''); setOtherCategory('');
    setDate(toDateString()); setPaidBy(''); setMethod('cash');
    setPhoto(null); setNote('');
  }

  async function save() {
    if (amount <= 0) { notify('Kitna kharcha hua? Amount daalo.', 'danger'); return; }
    if (!finalCategory) { notify('Kis cheez ka kharcha hai, wo chuno.', 'danger'); return; }

    setSaving(true);
    try {
      // The photo goes up first, the way Stock Chadhao does it: if the network is
      // down we want to know before the row is written, not after.
      let photoPath: string | null = null;
      if (photo) {
        try {
          photoPath = await uploadPhoto(photo, 'kharcha');
        } catch {
          notify('Receipt ki photo nahi chadhi — kharcha phir bhi likh rahe hain.', 'danger');
        }
      }

      await insertRow(db, 'expenses', {
        expense_date: date,
        category: finalCategory,
        amount,
        mode: method,
        paid_by: paidBy.trim() || null,
        note: note.trim() || null,
        photo_path: photoPath,
        is_personal: false,
        location_id: locationId,
      }, actor);

      reset();
      notify(`${formatINR(amount)} ka kharcha likh diya.`, 'ok');
    } catch (e) {
      notify(`Kharcha nahi likha gaya: ${String((e as Error).message ?? e)}`, 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function remove(e: Expense) {
    if (!(await confirm('Kharcha hatayein?', `${e.category} · ${formatINR(e.amount)}`))) return;
    try {
      await db.execute('DELETE FROM expenses WHERE id = ?', [e.id]);
      notify('Kharcha hata diya.', 'ok');
    } catch (err) {
      notify(`Hata nahi paaye: ${String((err as Error).message ?? err)}`, 'danger');
    }
  }

  const dayLabel = (d: string) =>
    d === today ? 'Aaj' : new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });

  return (
    <>
      <Stack.Screen options={{ title: 'Kharcha Likho' }} />
      <Screen>
        <View>
          <Text variant="display">Kharcha Likho</Text>
          <Text variant="small" color="textMuted">
            Dukaan ka paisa bahar gaya — transport, petrol, chai, bijli? Yahan likho, tabhi din ka cash sahi milega.
          </Text>
        </View>

        <Grid min={220}>
          <StatTile label="AAJ" value={formatINR(totals.today)} sub="aaj ka kharcha" icon="wallet-outline" accent="amber" />
          <StatTile label="IS MAHINE" value={formatINR(totals.month)} sub="mahine ka kul" icon="calendar-outline" accent="violet" />
        </Grid>

        {mayRecord ? (
          <>
            <Card keyline spine="accent" style={{ gap: space.lg }}>
              {/* How much. Biggest thing on the screen, because it is the one
                  field nobody can leave blank and the one everybody knows
                  before they open the app — so it is also where the cursor
                  starts. Opening Kharcha and typing 40 should be the whole
                  interaction for a ₹40 chai. */}
              <Input
                label="Kitna kharcha hua?"
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                placeholder="0"
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => paidByRef.current?.focus()}
                submitBehavior="submit"
                left={<Text style={[type_.hero, { fontSize: 26, lineHeight: 34 }]} color="textFaint">₹</Text>}
                style={[type_.hero, { fontSize: 34, lineHeight: 44 }]}
              />

              <View style={{ gap: space.sm }}>
                <Text variant="label" color="textMuted">KIS CHEEZ KA</Text>
                <Row gap={8} wrap>
                  {CATEGORIES.map((c) => (
                    <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
                  ))}
                </Row>
                {category === 'Aur kuch' ? (
                  <Input
                    value={otherCategory}
                    onChangeText={setOtherCategory}
                    placeholder="Kis cheez ka? Khud likho…"
                    autoFocus
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => paidByRef.current?.focus()}
                    submitBehavior="submit"
                  />
                ) : null}
              </View>

              <View style={{ gap: space.sm }}>
                <Text variant="label" color="textMuted">PAISA KAISE DIYA</Text>
                <Row gap={8} wrap>
                  {METHODS.map((m) => (
                    <Chip key={m.value} label={m.label} selected={method === m.value} onPress={() => setMethod(m.value)} />
                  ))}
                </Row>
              </View>

              <View style={{ gap: space.sm }}>
                <Input
                  ref={paidByRef}
                  label="Kisne diya"
                  value={paidBy}
                  onChangeText={setPaidBy}
                  placeholder="Naam likho ya neeche se chuno"
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => dateRef.current?.focus()}
                  submitBehavior="submit"
                />
                {(staff ?? []).length > 0 ? (
                  <Row gap={8} wrap>
                    {(staff ?? []).map((s) => (
                      <Chip
                        key={s.id}
                        label={s.full_name}
                        selected={paidBy.trim() === s.full_name}
                        onPress={() => setPaidBy(paidBy.trim() === s.full_name ? '' : s.full_name)}
                      />
                    ))}
                  </Row>
                ) : null}
              </View>

              {/* Autocorrect on a date turns 2026-09-29 into something the
                  parser will not take, and it does it silently. */}
              <Input
                ref={dateRef}
                label="Tareekh"
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                hint="Aaj ki tareekh pehle se bhari hai."
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => { if (ready && !saving) save(); }}
              />

              <Button
                title={ready ? `${formatINR(amount)} ka kharcha likh do` : 'Kharcha likh do'}
                size="lg"
                full
                onPress={save}
                loading={saving}
                disabled={!ready}
              />
            </Card>

            {/* Photo and note are real, but nine entries out of ten do not need
                them. One tap away, not in the way. */}
            <Disclosure
              title="Receipt ki photo aur note"
              hint={photo ? 'Photo lagi hai — kholo to dikhegi.' : 'Zaroori nahi. Chit ho to photo laga sakte ho.'}>
              <View style={{ gap: space.md, paddingTop: space.sm }}>
                <PhotoPicker localUri={photo?.uri} name="Receipt" onPickLocal={setPhoto} />
                <Input label="Note" value={note} onChangeText={setNote} placeholder="Gaadi number, kisko diya, kuch bhi" />
              </View>
            </Disclosure>
          </>
        ) : null}

        <SectionTitle right={<Text mono color="textMuted">{formatINR(shownTotal)}</Text>}>
          Likha hua kharcha
        </SectionTitle>
        <Row gap={8} wrap>
          <Chip label="Aaj" selected={window_ === 'aaj'} onPress={() => setWindow('aaj')} />
          <Chip label="Is mahine" selected={window_ === 'mahina'} onPress={() => setWindow('mahina')} />
          <Chip label="Sab" selected={window_ === 'sab'} onPress={() => setWindow('sab')} />
        </Row>

        {byDate.length === 0 ? (
          <Empty art="kharcha"
            title="Abhi koi kharcha nahi"
            hint={mayRecord
              ? 'Transport, petrol, loading, chai — jo bhi bahar jaaye, upar likh do. Tabhi din ka cash milega.'
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
                        left={e.photo_path ? <ItemPhoto path={e.photo_path} name={e.category} size={38} /> : undefined}
                        title={e.category}
                        subtitle={[e.paid_by, e.paid_to, e.note].filter(Boolean).join(' · ') || undefined}
                        right={
                          <Row gap={8} align="center">
                            <Badge tone="neutral">{methodLabel(e.mode)}</Badge>
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
