/**
 * KHARAB LIKHO — maal toot gaya, kharab ho gaya, reject nikla ya kam mila.
 *
 * This is the "stock goes out and nobody paid for it" screen. It is a plain
 * stock adjustment underneath: one `stock_adjustments` draft, a negative line
 * per item, then `postAdjustment` turns each line into a stock movement.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 *   · The quantity is NEGATIVE. This removes stock; it never adds.
 *   · Every line carries `unit_cost`, taken from the item's average cost.
 *     Hisab reads the day's loss as SUM(-qty * unit_cost) over movements of
 *     type 'damage'. A line saved at zero cost still removes the stock but
 *     reports the loss as ₹0 — the books then look healthier than the shop
 *     is. So the rate is shown on every line and can be corrected before
 *     saving, and an item with no known cost says so out loud.
 *
 * The shop's words are not the database's words. `stock_adjustments.reason`
 * has a CHECK constraint, so "Toot Gaya" is stored as 'damage' and the word
 * the user actually pressed is kept in the line note and the document notes.
 * `postAdjustment` decides the movement type from the LINE's `reason_code`
 * first, which is why that column must hold the allowed value 'damage' and
 * not the Hinglish label — otherwise the loss lands as a plain 'adjustment'
 * and Hisab never counts it.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { formatINR, isDateString, toDateString } from '@domain';

import { uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { postAdjustment } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow } from '@/lib/writes';
import { Button, Card, Chip, Divider, Empty, Input, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { VariantPicker, type PickedVariant } from '@/ui/lines';
import { PhotoPicker } from '@/ui/photo';
import { space } from '@/ui/theme';

/**
 * What the shop says, and what the database is allowed to store.
 *
 * `code` is one of stock_adjustments_reason_check:
 * opening · damage · missing · found · wrong_entry · counting_error · audit ·
 * free_issue · other.
 */
const REASONS = [
  { key: 'kharab', label: 'Kharab', code: 'damage' },
  { key: 'reject', label: 'Reject', code: 'damage' },
  { key: 'missing', label: 'Nahi mila', code: 'missing' },
  { key: 'toota', label: 'Toot Gaya', code: 'damage' },
  { key: 'count', label: 'Ginti ka farak', code: 'counting_error' },
  { key: 'other', label: 'Aur kuch', code: 'other' },
] as const;

type Line = { variantId: string; label: string; sku: string; qty: number; cost: number };

export default function KharabLikho() {
  const router = useRouter();
  const { db } = useSystem();
  const { actor, locationId, can } = useSession();
  const { variant: variantParam } = useLocalSearchParams<{ variant?: string }>();

  const [reasonKey, setReasonKey] = useState<string>('kharab');
  const [date, setDate] = useState(toDateString());
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [saving, setSaving] = useState(false);

  // One rate box per line, keyed by variant, so next on the qty keyboard lands
  // on that line's rate and not on some other line's. The rate is the field
  // people skip, and a skipped rate reports the loss as ₹0.
  //
  // Nothing on this screen autoFocuses: VariantPicker already opens with its
  // search focused, and that is where the job starts.
  const costRefs = useRef(new Map<string, TextInput | null>());

  // Every hook lives above the permission guard. A useQuery below an early
  // return unmounts and blanks the screen at runtime, and tsc says nothing.
  const { data: onHand } = useQuery<{ variant_id: string; qty: number }>(
    'SELECT variant_id, qty FROM stock_on_hand WHERE location_id = ?', [locationId ?? '']);
  const hereMap = useMemo(() => new Map((onHand ?? []).map((r) => [r.variant_id, r.qty])), [onHand]);

  // Opened from an item's own page: that item is already the first line.
  const { data: preRows } = useQuery<{ id: string; sku: string; variant_name: string; product_name: string; avg_cost: number; last_purchase_cost: number }>(
    `SELECT pv.id, pv.sku, pv.variant_name, pv.avg_cost, pv.last_purchase_cost, p.name AS product_name
       FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ? LIMIT 1`,
    [variantParam ?? '']);
  const [seeded, setSeeded] = useState(false);
  const pre = preRows?.[0];
  if (pre && !seeded) {
    setSeeded(true);
    setLines([{ variantId: pre.id, label: `${pre.product_name} · ${pre.variant_name}`, sku: pre.sku, qty: 1, cost: pre.avg_cost || pre.last_purchase_cost || 0 }]);
  }

  const reason = REASONS.find((r) => r.key === reasonKey) ?? REASONS[0];

  function add(v: PickedVariant) {
    setLines((prev) => {
      const at = prev.findIndex((l) => l.variantId === v.id);
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], qty: next[at].qty + 1 };
        return next;
      }
      return [...prev, {
        variantId: v.id,
        label: `${v.product_name} · ${v.variant_name}`,
        sku: v.sku,
        qty: 1,
        // The average cost is what the shop actually paid for this piece, so
        // it is what the loss is worth.
        cost: v.avg_cost || v.last_purchase_cost || 0,
      }];
    });
  }

  const patch = (id: string, p: Partial<Line>) => setLines((prev) => prev.map((l) => (l.variantId === id ? { ...l, ...p } : l)));
  const drop = (id: string) => setLines((prev) => prev.filter((l) => l.variantId !== id));

  const usable = lines.filter((l) => l.qty > 0);
  const totalQty = usable.reduce((a, l) => a + l.qty, 0);
  const totalLoss = usable.reduce((a, l) => a + l.qty * (l.cost || 0), 0);
  const anyZeroCost = usable.some((l) => !l.cost);

  async function save() {
    if (usable.length === 0) { notify('Kam se kam ek maal daalo.', 'danger'); return; }
    // A NOT NULL date column will not take "", and PowerSync discards the
    // whole transaction server-side when it tries — silently, long after
    // the screen said it saved. Catch it here, where the person can fix it.
    if (!isDateString(date)) { notify('Tareekh theek nahi hai — YYYY-MM-DD likho, jaise 2026-09-30.', 'danger'); return; }
    if (!locationId) { notify('Location nahi mili. Admin se location set karwao.', 'danger'); return; }

    const ok = await confirm(
      `${totalQty} pcs kharab likhein?`,
      `${reason.label} · ${formatINR(totalLoss)} ka nuksan. Stock abhi kam ho jaayega.`
    );
    if (!ok) return;

    setSaving(true);
    try {
      // The photo goes up first: if the network is down we want to know before
      // the stock has moved, not after. The adjustment tables have no photo
      // column, so the path is kept in the document notes.
      let photoPath: string | null = null;
      if (photo) {
        try {
          photoPath = await uploadPhoto(photo, 'kharab');
        } catch {
          notify('Photo nahi chadhi — entry phir bhi save ho rahi hai.', 'danger');
        }
      }

      const notes = [
        `Kharab Maal · ${reason.label}`,
        note.trim() || null,
        photoPath ? `Photo: ${photoPath}` : null,
      ].filter(Boolean).join(' — ');

      await db.writeTransaction(async (tx) => {
        const id = await insertRow(tx, 'stock_adjustments', {
          doc_date: date,
          location_id: locationId,
          reason: reason.code,
          notes,
          status: 'draft',
        }, actor);

        for (const l of usable) {
          await insertRow(tx, 'stock_adjustment_lines', {
            adjustment_id: id,
            variant_id: l.variantId,
            // Negative: this takes stock off the shelf.
            qty_delta: -l.qty,
            unit_cost: l.cost || 0,
            // Must be the allowed code, not the Hinglish label: postAdjustment
            // reads this to decide movement_type === 'damage'.
            reason_code: reason.code,
            note: reason.label,
          });
        }
        await postAdjustment(tx, id, actor);
      });

      notify(`${totalQty} pcs kharab likh diya.`, 'ok');
      router.back();
    } catch (e) {
      notify(`Kharab nahi likha gaya: ${String((e as Error).message ?? e)}`, 'danger');
    } finally {
      setSaving(false);
    }
  }

  if (!can('stock.adjust')) {
    return (
      <>
        <Stack.Screen options={{ title: 'Kharab Likho' }} />
        <Screen>
          <Text variant="display">Kharab Likho</Text>
          <Empty title="Iski permission nahi hai" hint="Admin se stock badalne ka haq maango." />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Kharab Likho' }} />
      <Screen>
        <View>
          <Text variant="display">Kharab Likho</Text>
          <Text variant="small" color="textMuted">
            Maal toot gaya, kharab nikla ya gum ho gaya? Yahan likho — stock bhi kam hoga aur nuksan hisab mein dikhega.
          </Text>
        </View>

        <Card style={{ gap: space.md }}>
          <Text variant="label" color="textMuted">Kya hua?</Text>
          <Row gap={space.sm} wrap>
            {REASONS.map((r) => (
              <Chip key={r.key} label={r.label} selected={r.key === reasonKey} onPress={() => setReasonKey(r.key)} />
            ))}
          </Row>
          {/* Autocorrect rewrites a typed date and says nothing about it. */}
          <Input
            label="Tareekh"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            hint="Aaj ki date pehle se bhari hai."
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
        </Card>

        <VariantPicker onPick={add} locationId={locationId} showCost={can('catalog.view_cost')} />

        {lines.length === 0 ? (
          <Empty art="maal" title="Abhi koi maal nahi" hint="Upar scan karo ya naam likho. Ek saath kai cheezein daal sakte ho." />
        ) : (
          <Card style={{ gap: space.md }}>
            {lines.map((l, i) => {
              const here = hereMap.get(l.variantId) ?? 0;
              return (
                <View key={l.variantId} style={{ gap: space.xs }}>
                  {i > 0 ? <Divider /> : null}
                  <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
                    <Text style={{ flex: 1 }} numberOfLines={2}>{l.label}</Text>
                    <Button title="Hatao" tone="ghost" size="sm" onPress={() => drop(l.variantId)} />
                  </Row>
                  <Row gap={space.sm}>
                    <Input
                      containerStyle={{ flex: 1 }}
                      label="Kitne pcs"
                      value={String(l.qty)}
                      onChangeText={(v) => patch(l.variantId, { qty: Math.max(0, Math.floor(Number(v.replace(/[^0-9]/g, '')) || 0)) })}
                      keyboardType="number-pad"
                      returnKeyType="next"
                      onSubmitEditing={() => costRefs.current.get(l.variantId)?.focus()}
                      submitBehavior="submit"
                    />
                    <Input
                      ref={(r) => { costRefs.current.set(l.variantId, r); }}
                      containerStyle={{ flex: 1 }}
                      label="Ek ka kharid rate"
                      value={l.cost ? String(l.cost) : ''}
                      onChangeText={(v) => patch(l.variantId, { cost: Number(v.replace(/[^0-9.]/g, '')) || 0 })}
                      keyboardType="decimal-pad"
                      hint="Isi se nuksan gina jaata hai"
                      returnKeyType="done"
                    />
                  </Row>
                  <Text variant="small" color={l.cost ? 'textFaint' : 'danger'}>
                    {l.cost
                      ? `${l.sku} · abhi ${here} → ${here - l.qty} · ${formatINR(l.qty * l.cost)} ka nuksan`
                      : `${l.sku} · abhi ${here} → ${here - l.qty} · rate nahi pata, nuksan ₹0 ginega — rate bhar do`}
                  </Text>
                </View>
              );
            })}
          </Card>
        )}

        <Card style={{ gap: space.md }}>
          <Text variant="label" color="textMuted">Kharab maal ki photo</Text>
          <PhotoPicker localUri={photo?.uri} name="Kharab maal" onPickLocal={setPhoto} />
          <Input label="Note" value={note} onChangeText={setNote} placeholder="Kaise hua, kisne dekha — kuch bhi" />
        </Card>

        {usable.length > 0 ? (
          <Card>
            <SectionTitle>Kul</SectionTitle>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text color="textMuted">{totalQty} pcs · {reason.label}</Text>
              <Text variant="number" color="danger">−{formatINR(totalLoss)}</Text>
            </Row>
            {anyZeroCost ? (
              <Text variant="small" color="danger">
                Kuch item ka rate nahi bhara — utna nuksan hisab mein nahi dikhega.
              </Text>
            ) : null}
          </Card>
        ) : null}

        <Button
          title={totalQty > 0 ? `${totalQty} pcs kharab likh do` : 'Kharab likh do'}
          size="lg"
          full
          tone="danger"
          onPress={save}
          loading={saving}
          disabled={totalQty === 0}
        />
      </Screen>
    </>
  );
}
