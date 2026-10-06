/**
 * KHARAB LIKHO — maal toot gaya, kharab nikla, ya reject aaya.
 *
 * Broken maal is not written off on the spot any more (owner, 6 Oct 2026):
 * it goes back to the supplier for replacement or a money adjustment. So
 * Kharab Likho MOVES it — a transfer from the godown to the "Kharab maal"
 * corner, where it waits on /kharab until the owner sends it back. It stops
 * being sellable at once, and no loss is booked unless it is later thrown
 * away there.
 *
 * "Nahi mila" is different: there is nothing to send back, so that one is a
 * stock adjustment that takes the pieces off and counts the loss at the
 * item's average cost — Hisab reads movements of type 'missing'/'damage'.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { formatINR, isDateString, toDateString } from '@domain';

import { uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { dispatchTransfer, postAdjustment } from '@/lib/posting';
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
  { key: 'kharab', label: 'Kharab nikla', code: 'damage', aside: true },
  { key: 'toota', label: 'Toot gaya', code: 'damage', aside: true },
  { key: 'reject', label: 'Supplier se kharab aaya', code: 'damage', aside: true },
  { key: 'wapas', label: 'Grahak ne kharab lauta', code: 'damage', aside: true },
  { key: 'missing', label: 'Nahi mila', code: 'missing', aside: false },
] as const;

type Line = { variantId: string; label: string; sku: string; qty: number; cost: number };

export default function KharabLikho() {
  const router = useRouter();
  const { db } = useSystem();
  const { actor, locationId, can } = useSession();
  const showCost = can('catalog.view_cost');
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
  const { data: kharabLoc } = useQuery<{ id: string }>(
    "SELECT id FROM locations WHERE type = 'damaged' AND is_active = 1 ORDER BY sort_order LIMIT 1");
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
    if (!locationId) { notify('Godown nahi mila. Sync hone do, phir dobara karo.', 'danger'); return; }
    const kharabId = kharabLoc?.[0]?.id;
    if (reason.aside && !kharabId) { notify('“Kharab maal” ki jagah nahi mili. Sync hone do, phir dobara karo.', 'danger'); return; }

    const ok = await confirm(
      reason.aside ? `${totalQty} pcs kharab mein daal dein?` : `${totalQty} pcs nahi mile — stock se hata dein?`,
      reason.aside
        ? `${reason.label}. Godown se nikal ke “Kharab maal” mein chala jayega — wahan se supplier ko wapas jayega.`
        : showCost
        ? `${formatINR(totalLoss)} ka nuksan hisab mein judega. Stock abhi kam ho jayega.`
        : 'Stock abhi kam ho jayega.'
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
        if (reason.aside) {
          // Set aside: godown → kharab corner, same pieces, nothing lost yet.
          const tid = await insertRow(tx, 'stock_transfers', {
            doc_date: date, from_location_id: locationId, to_location_id: kharabId, status: 'draft', notes,
          }, actor);
          for (const l of usable) {
            await insertRow(tx, 'stock_transfer_lines', { transfer_id: tid, variant_id: l.variantId, qty: l.qty, unit_cost: l.cost || 0 });
          }
          await dispatchTransfer(tx, tid, actor);
          return;
        }
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
            // The loss code, not the Hinglish label: postAdjustment reads this
            // to decide movement_type === 'damage', which is what Hisab counts.
            // A piece that is gone is a loss whether it broke or vanished.
            reason_code: 'damage',
            note: reason.label,
          });
        }
        await postAdjustment(tx, id, actor);
      });

      notify(reason.aside ? `${totalQty} pcs kharab mein daal diya.` : `${totalQty} pcs stock se hata diya.`, 'ok');
      router.back();
    } catch (e) {
      notify(`Kharab nahi likha gaya: ${String((e as Error).message ?? e)}`, 'danger');
    } finally {
      setSaving(false);
    }
  }

  if (!can('stock.adjust') && !can('stock.damage')) {
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
            Toota ya kharab maal godown se alag kar do — wo “Kharab maal” mein rukega aur supplier ko wapas jayega. Bechne wale stock mein nahi ginega.
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
            hint="Aaj ki tareekh pehle se bhari hai."
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
                    {/* The godown writes off kharab maal but does not see what
                        it cost; the average cost is recorded without showing. */}
                    {showCost && !reason.aside ? (
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
                    ) : null}
                  </Row>
                  <Text variant="small" color={l.cost || !showCost || reason.aside ? 'textFaint' : 'danger'}>
                    {!showCost || reason.aside
                      ? `${l.sku} · godown mein ${here} → ${here - l.qty}`
                      : l.cost
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
              {showCost && !reason.aside ? <Text variant="number" color="danger">−{formatINR(totalLoss)}</Text> : null}
            </Row>
            {showCost && !reason.aside && anyZeroCost ? (
              <Text variant="small" color="danger">
                Kuch item ka rate nahi bhara — utna nuksan hisab mein nahi dikhega.
              </Text>
            ) : null}
          </Card>
        ) : null}

        <Button
          title={reason.aside
            ? (totalQty > 0 ? `${totalQty} pcs kharab mein daalo` : 'Kharab mein daalo')
            : (totalQty > 0 ? `${totalQty} pcs stock se hatao` : 'Stock se hatao')}
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
