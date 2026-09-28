/**
 * PARTNER KHARCHA — the one screen whose whole job is a distinction.
 *
 * A partner does two different things at the cash drawer and they look
 * identical while they are happening.
 *
 *   · He pays the transport man ₹2,000 out of his own pocket for the shop.
 *     That is a cost of trading. It belongs in profit and loss.
 *   · He takes ₹20,000 for a wedding. The drawer is lighter by ₹20,000, but
 *     the business did not spend anything — he drew his own share out.
 *
 * Written down the same way, the second one quietly eats the first one's
 * meaning: every month a partner takes money, the shop reports less profit
 * than it made, and the owner prices, stocks and hires off a wrong number.
 *
 * So the choice is not a tickbox in a corner. It is two cards, the size of the
 * decision, and nothing saves until one of them is chosen. The row carries it
 * as `is_personal`, and Hisab filters on COALESCE(is_personal,0)=0 so only the
 * first kind ever reaches the profit line.
 *
 * Owner-only, because a partner's drawings are not the counter hand's
 * business.
 */
import { useQuery } from '@powersync/react';
import { Stack } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';

import { formatINR, toDateString } from '@domain';

import { uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Divider, Empty, Grid, Input, ListRow, Row, Screen, SectionTitle, StatTile, Text, useTheme } from '@/ui';
import { Disclosure, SelectField, confirm, notify } from '@/ui/forms';
import { ItemPhoto, PhotoPicker } from '@/ui/photo';
import { radius, space, type as type_ } from '@/ui/theme';

const CATEGORIES = ['Transport', 'Petrol', 'Rent', 'Bijli', 'Loading', 'Packing', 'Repair', 'Chai/Pani', 'Other'];

/** 'bank' is what the column's check constraint calls "Online". */
const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Online' },
  { value: 'upi', label: 'UPI' },
];
const methodLabel = (mode: string) => METHODS.find((m) => m.value === mode)?.label ?? mode;

/**
 * One of the two cards that are the point of this screen.
 *
 * At module scope, not inside the screen. Declared in the render it was a new
 * component type on every keystroke in the amount box, so React threw both
 * cards away and rebuilt them each time somebody typed a digit — and eslint's
 * react-hooks/static-components said so.
 */
function Choice({
  selected, title, line, tone, onPress,
}: { selected: boolean; title: string; line: string; tone: 'ok' | 'warn'; onPress: () => void }) {
  const t = useTheme();
  const edge = tone === 'warn' ? t.warn : t.ok;
  const fill = tone === 'warn' ? t.warnSoft : t.okSoft;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={(s) => [{
        gap: space.xs,
        padding: space.lg,
        borderRadius: radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? edge : t.border,
        backgroundColor: selected ? fill : t.surface,
        opacity: s.pressed ? 0.9 : 1,
      }]}>
      <Row gap={space.sm} align="center">
        <View style={{
          width: 18, height: 18, borderRadius: 9,
          borderWidth: selected ? 6 : 1.5,
          borderColor: selected ? edge : t.borderStrong,
          backgroundColor: t.surface,
        }} />
        <Text variant="heading" style={{ flex: 1 }}>{title}</Text>
      </Row>
      <Text variant="small" color="textMuted" style={{ paddingLeft: 18 + space.sm }}>{line}</Text>
    </Pressable>
  );
}

type Entry = {
  id: string; expense_date: string; category: string; amount: number;
  mode: string; paid_by: string | null; note: string | null;
  photo_path: string | null; is_personal: number;
};

export default function PartnerKharchaScreen() {
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();

  const [partner, setPartner] = useState<string | null>(null);
  const [newPartners, setNewPartners] = useState<string[]>([]);
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState('');
  const [otherCategory, setOtherCategory] = useState('');
  const [date, setDate] = useState(toDateString());
  const [paidBy, setPaidBy] = useState('');
  const [method, setMethod] = useState('cash');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [note, setNote] = useState('');
  /** null until chosen — nothing saves on a guess about which kind this is. */
  const [isPersonal, setIsPersonal] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  // No autoFocus anywhere on this screen: the first thing it asks for is which
  // partner, and that is a picker. A keyboard thrown up over a list the person
  // has to read is a keyboard they have to dismiss first.
  const paidByRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);

  // Every hook sits above the permission guard. A useQuery below an early
  // return unmounts on the render where the guard passes and blanks the
  // screen, and tsc does not catch it.
  const { data: partnerRows } = useQuery<{ partner_name: string }>(
    `SELECT DISTINCT partner_name FROM expenses
      WHERE partner_name IS NOT NULL AND TRIM(partner_name) <> ''
      ORDER BY partner_name`);

  const { data: history } = useQuery<Entry>(
    `SELECT id, expense_date, category, amount, mode, paid_by, note, photo_path,
            COALESCE(is_personal, 0) AS is_personal
       FROM expenses
      WHERE partner_name = ?
      ORDER BY expense_date DESC, created_at DESC
      LIMIT 300`, [partner ?? '']);

  const { data: staff } = useQuery<{ id: string; full_name: string }>(
    'SELECT id, full_name FROM profiles WHERE is_active = 1 ORDER BY full_name LIMIT 30');

  const partnerOptions = useMemo(() => {
    const names = new Set([...(partnerRows ?? []).map((r) => r.partner_name), ...newPartners]);
    return [...names].sort().map((n) => ({ value: n, label: n }));
  }, [partnerRows, newPartners]);

  const rows = history ?? [];
  const totals = useMemo(() => ({
    business: rows.filter((e) => !e.is_personal).reduce((s, e) => s + Number(e.amount), 0),
    personal: rows.filter((e) => !!e.is_personal).reduce((s, e) => s + Number(e.amount), 0),
  }), [rows]);

  const byDate = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of rows) {
      if (!m.has(e.expense_date)) m.set(e.expense_date, []);
      m.get(e.expense_date)!.push(e);
    }
    return [...m.entries()];
  }, [rows]);

  const amount = Number(amountText.replace(/[^0-9.]/g, '')) || 0;
  const typedCategory = category === 'Other' ? otherCategory.trim() : category;
  // A withdrawal has no natural category, so it gets one rather than demanding
  // a tap for a field that does not mean anything on that side of the choice.
  const finalCategory = typedCategory || (isPersonal ? 'Personal nikala' : '');
  const ready = !!partner && amount > 0 && !!finalCategory && isPersonal !== null;

  function reset() {
    setAmountText(''); setCategory(''); setOtherCategory('');
    setDate(toDateString()); setPaidBy(''); setMethod('cash');
    setPhoto(null); setNote(''); setIsPersonal(null);
  }

  async function save() {
    if (!partner) { notify('Kaunsa partner hai, wo chuno.', 'danger'); return; }
    if (amount <= 0) { notify('Kitna paisa hai? Amount daalo.', 'danger'); return; }
    if (isPersonal === null) { notify('Business kharcha hai ya personal nikala — ek chuno.', 'danger'); return; }
    if (!finalCategory) { notify('Kis cheez ka kharcha hai, wo chuno.', 'danger'); return; }

    setSaving(true);
    try {
      let photoPath: string | null = null;
      if (photo) {
        try {
          photoPath = await uploadPhoto(photo, 'kharcha');
        } catch {
          notify('Photo nahi chadhi — entry phir bhi save ho rahi hai.', 'danger');
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
        partner_name: partner,
        is_personal: isPersonal,
        location_id: locationId,
      }, actor);

      const kind = isPersonal ? 'Personal nikala' : 'Business kharcha';
      reset();
      notify(`${partner} · ${kind} ${formatINR(amount)} likh diya.`, 'ok');
    } catch (e) {
      notify(`Save nahi hua: ${String((e as Error).message ?? e)}. Dobara koshish karo.`, 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function remove(e: Entry) {
    if (!(await confirm('Entry hatayein?', `${e.category} · ${formatINR(e.amount)}`))) return;
    try {
      await db.execute('DELETE FROM expenses WHERE id = ?', [e.id]);
      notify('Entry hata di.', 'ok');
    } catch (err) {
      notify(`Hata nahi paaye: ${String((err as Error).message ?? err)}`, 'danger');
    }
  }

  const today = toDateString();
  const dayLabel = (d: string) =>
    d === today ? 'Aaj' : new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });

  if (!can('reports.view')) {
    return (
      <>
        <Stack.Screen options={{ title: 'Partner Kharcha' }} />
        <Screen>
          <Text variant="display">Partner Kharcha</Text>
          <Empty
            title="Ye sirf owner dekh sakta hai"
            hint="Partner ka paisa kaun le gaya, ye sabko dikhane wali cheez nahi hai."
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Partner Kharcha' }} />
      <Screen>
        <View>
          <Text variant="display">Partner Kharcha</Text>
          <Text variant="small" color="textMuted">
            Partner ne jo paisa kharch kiya ya nikala, yahan likhein.
          </Text>
        </View>

        <Card keyline spine="accent" style={{ gap: space.lg }}>
          <SelectField
            label="Kaunsa partner"
            value={partner}
            options={partnerOptions}
            onChange={setPartner}
            onCreate={(text) => {
              const name = text.trim();
              if (!name) return;
              setNewPartners((p) => (p.includes(name) ? p : [...p, name]));
              setPartner(name);
            }}
            placeholder="Naam chuno"
            hint="Naya naam likh ke partner bana sakte ho."
            allowClear
          />

          <Input
            label="Kitna paisa"
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0"
            returnKeyType="next"
            onSubmitEditing={() => paidByRef.current?.focus()}
            submitBehavior="submit"
            left={<Text style={[type_.hero, { fontSize: 26, lineHeight: 34 }]} color="textFaint">₹</Text>}
            style={[type_.hero, { fontSize: 34, lineHeight: 44 }]}
          />

          {/* The whole reason this screen exists. */}
          <View style={{ gap: space.sm }}>
            <Text variant="label" color="textMuted">YE PAISA KIS TARAH KA HAI</Text>
            <Choice
              selected={isPersonal === false}
              tone="ok"
              title="Business Kharcha"
              line="Profit/loss mein jayega."
              onPress={() => setIsPersonal(false)}
            />
            <Choice
              selected={isPersonal === true}
              tone="warn"
              title="Personal Paisa Nikala"
              line="Business kharcha NAHI hai."
              onPress={() => setIsPersonal(true)}
            />
            <Text variant="small" color="textFaint">
              Partner ne apne personal use ke liye paisa liya ho to use Business Kharcha mein mat dalein.
            </Text>
          </View>

          <View style={{ gap: space.sm }}>
            <Text variant="label" color="textMuted">KIS CHEEZ KA</Text>
            <Row gap={8} wrap>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(category === c ? '' : c)} />
              ))}
            </Row>
            {category === 'Other' ? (
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
            {isPersonal ? (
              <Text variant="small" color="textFaint">
                Personal nikala hai to category zaroori nahi — khali chhod do.
              </Text>
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

          {/* Autocorrect rewrites a typed date and says nothing about it. */}
          <Input
            ref={dateRef}
            label="Tareekh"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            hint="Aaj ki date pehle se bhari hai."
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => { if (ready && !saving) save(); }}
          />

          <Button
            title={ready ? `${formatINR(amount)} likh do` : 'Likh do'}
            size="lg"
            full
            onPress={save}
            loading={saving}
            disabled={!ready}
          />
        </Card>

        <Disclosure
          title="Photo aur note"
          hint={photo ? 'Photo lagi hai — kholo to dikhegi.' : 'Zaroori nahi. Chit ho to photo laga sakte ho.'}>
          <View style={{ gap: space.md, paddingTop: space.sm }}>
            <PhotoPicker localUri={photo?.uri} name="Receipt" onPickLocal={setPhoto} />
            <Input label="Note" value={note} onChangeText={setNote} placeholder="Kis liye liya, kuch bhi" />
          </View>
        </Disclosure>

        {!partner ? (
          <Empty
            title="Partner chuno"
            hint="Naam chunte hi uska poora hisaab neeche khul jayega — business kharcha alag, personal nikala alag."
          />
        ) : (
          <>
            <SectionTitle>{partner} ka hisaab</SectionTitle>
            <Grid min={220}>
              <StatTile
                label="BUSINESS KHARCHA"
                value={formatINR(totals.business)}
                sub="profit/loss mein gaya"
                icon="briefcase-outline"
                accent="green"
              />
              <StatTile
                label="PERSONAL NIKALA"
                value={formatINR(totals.personal)}
                sub="business kharcha nahi"
                icon="person-outline"
                accent="amber"
                tone="warn"
              />
            </Grid>

            {byDate.length === 0 ? (
              <Empty art="hisab"
                title={`${partner} ka koi hisaab nahi`}
                hint="Upar amount daalo, do mein se ek chuno, aur likh do."
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
                            subtitle={[e.paid_by, e.note].filter(Boolean).join(' · ') || undefined}
                            right={
                              <Row gap={8} align="center">
                                <Badge tone={e.is_personal ? 'warn' : 'neutral'}>
                                  {e.is_personal ? 'Personal' : methodLabel(e.mode)}
                                </Badge>
                                <Text mono>{formatINR(e.amount)}</Text>
                              </Row>
                            }
                            onPress={() => remove(e)}
                          />
                        </React.Fragment>
                      ))}
                    </Card>
                  </View>
                );
              })
            )}
          </>
        )}
      </Screen>
    </>
  );
}
