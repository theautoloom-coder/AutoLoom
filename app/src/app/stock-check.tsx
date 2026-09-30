/**
 * GINTI KARO — godown mein jitna maal sach mein hai, wahi app mein ho jaaye.
 *
 * This replaces the old two-screen audit (open an audit, snapshot a count
 * sheet, come back later and close it). Counting a shelf is one job done
 * standing at the shelf, so it is one screen: pick the item, see what the app
 * thinks, type what you counted, say why it differs, confirm once, done.
 *
 * Three rules this screen exists to keep:
 *
 *   · Stock never changes silently. Nothing is written until the confirm step
 *     has listed every change and the person has pressed again.
 *   · A zero difference is never written. Counting something and finding it
 *     right should leave no document and no movement behind.
 *   · "System stock" is read live from `stock_on_hand`, not snapshotted when
 *     the item was picked. If a bill posts while the counting is happening,
 *     the difference must be measured against the number the books hold at
 *     the moment of writing — otherwise the correction double-counts the sale.
 *
 * Underneath it is one `stock_adjustments` document with a line per changed
 * item, posted through `postAdjustment`. A line marked Kharab carries the
 * item's average cost, so the shortfall shows up in Hisab as a real loss
 * rather than a quantity that quietly evaporated.
 */
import { useQuery } from '@powersync/react';
import { Stack, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { formatINR, isDateString, toDateString } from '@domain';

import { postAdjustment } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow } from '@/lib/writes';
import { Button, Card, Chip, Divider, Empty, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { VariantPicker, type PickedVariant } from '@/ui/lines';
import { space } from '@/ui/theme';

/**
 * The shop's words, and the values stock_adjustments_reason_check allows:
 * opening · damage · missing · found · wrong_entry · counting_error · audit ·
 * free_issue · other.
 */
const REASONS = [
  { key: 'count', label: 'Count mistake', code: 'counting_error' },
  { key: 'kharab', label: 'Kharab', code: 'damage' },
  { key: 'missing', label: 'Missing', code: 'missing' },
  { key: 'other', label: 'Aur kuch', code: 'other' },
] as const;

type Row_ = { variantId: string; label: string; sku: string; cost: number; actual: string; reasonKey: string };

export default function GintiKaro() {
  const router = useRouter();
  const { db } = useSystem();
  const { actor, locationId, can } = useSession();

  const [rows, setRows] = useState<Row_[]>([]);
  const [date, setDate] = useState(toDateString());
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'count' | 'confirm'>('count');
  const [saving, setSaving] = useState(false);

  // Above the early returns with the rest of the hooks. No autoFocus on this
  // screen: VariantPicker opens with its own search focused, which is the field
  // the counting actually starts in.
  const noteRef = useRef<TextInput>(null);

  // Above the permission guard on purpose: a useQuery under an early return
  // blanks the screen at runtime and tsc will not catch it.
  const { data: onHand } = useQuery<{ variant_id: string; qty: number }>(
    'SELECT variant_id, qty FROM stock_on_hand WHERE location_id = ?', [locationId ?? '']);
  const systemMap = useMemo(() => new Map((onHand ?? []).map((r) => [r.variant_id, r.qty])), [onHand]);

  function add(v: PickedVariant) {
    setRows((prev) => {
      if (prev.some((r) => r.variantId === v.id)) return prev;
      return [...prev, {
        variantId: v.id,
        label: `${v.product_name} · ${v.variant_name}`,
        sku: v.sku,
        cost: v.avg_cost || v.last_purchase_cost || 0,
        actual: '',
        reasonKey: 'count',
      }];
    });
  }

  const patch = (id: string, p: Partial<Row_>) => setRows((prev) => prev.map((r) => (r.variantId === id ? { ...r, ...p } : r)));
  const drop = (id: string) => setRows((prev) => prev.filter((r) => r.variantId !== id));

  /** What each counted row means right now. Recomputed from live system stock. */
  const counted = rows.map((r) => {
    const system = systemMap.get(r.variantId) ?? 0;
    const typed = r.actual.trim();
    const actual = typed === '' ? null : Math.max(0, Math.floor(Number(typed.replace(/[^0-9]/g, '')) || 0));
    const diff = actual === null ? 0 : actual - system;
    const reason = REASONS.find((x) => x.key === r.reasonKey) ?? REASONS[0];
    return { ...r, system, actual, diff, reason };
  });
  const changes = counted.filter((c) => c.actual !== null && c.diff !== 0);
  const uncounted = counted.filter((c) => c.actual === null).length;
  const lossValue = changes.filter((c) => c.diff < 0).reduce((a, c) => a + -c.diff * (c.cost || 0), 0);

  function review() {
    if (rows.length === 0) { notify('Pehle koi item chuno.', 'danger'); return; }
    if (!locationId) { notify('Location nahi mili. Admin se location set karwao.', 'danger'); return; }
    if (changes.length === 0) {
      notify(uncounted > 0 ? 'Abhi tak koi count nahi bhara.' : 'Sab sahi hai — kuch badalne ki zaroorat nahi.', 'ok');
      return;
    }
    setStep('confirm');
  }

  async function apply() {
    // Read the differences again at the moment of writing: the numbers the
    // confirm screen showed are only as fresh as the last render.
    if (changes.length === 0) { notify('Ab koi farak nahi bacha.', 'danger'); setStep('count'); return; }
    // A NOT NULL date column will not take "", and PowerSync discards the
    // whole transaction server-side when it tries — silently, long after
    // the screen said it saved. Catch it here, where it can be fixed.
    if (!isDateString(date)) { notify('Tareekh theek nahi hai — YYYY-MM-DD likho, jaise 2026-09-30.', 'danger'); return; }
    if (!locationId) { notify('Location nahi mili.', 'danger'); return; }
    if (!(await confirm('Ginti theek kar dein?', `${changes.length} item ka stock abhi badal jaayega. Yeh wapas nahi hota.`))) return;

    setSaving(true);
    try {
      await db.writeTransaction(async (tx) => {
        const id = await insertRow(tx, 'stock_adjustments', {
          doc_date: date,
          location_id: locationId,
          // A physical count of the shelf. Each line carries its own reason;
          // this is only the fallback for a line that has none.
          reason: 'audit',
          notes: ['Stock Check', note.trim() || null].filter(Boolean).join(' — '),
          status: 'draft',
        }, actor);

        for (const c of changes) {
          await insertRow(tx, 'stock_adjustment_lines', {
            adjustment_id: id,
            variant_id: c.variantId,
            qty_delta: c.diff,
            // Valued at what the shop paid, so a "Kharab" shortfall reaches
            // Hisab as money and not just as a missing piece.
            unit_cost: c.cost || 0,
            // The allowed code, never the Hinglish label: postAdjustment reads
            // this to decide whether the movement is a 'damage'.
            reason_code: c.reason.code,
            note: `${c.reason.label} · counted ${c.actual}, system ${c.system}`,
          });
        }
        await postAdjustment(tx, id, actor);
      });

      notify(`Ginti theek ho gayi — ${changes.length} item ka stock badal diya.`, 'ok');
      router.back();
    } catch (e) {
      notify(`Ginti theek nahi hui: ${String((e as Error).message ?? e)}. Ginti waise ki waise padi hai — dobara koshish karo.`, 'danger');
    } finally {
      setSaving(false);
    }
  }

  if (!can('stock.adjust')) {
    return (
      <>
        <Stack.Screen options={{ title: 'Ginti Karo' }} />
        <Screen>
          <Text variant="display">Ginti Karo</Text>
          <Empty title="Iski permission nahi hai" hint="Admin se stock badalne ka haq maango." />
        </Screen>
      </>
    );
  }

  if (step === 'confirm') {
    return (
      <>
        <Stack.Screen options={{ title: 'Ginti Karo' }} />
        <Screen>
          <View>
            <Text variant="display">Ek baar dekh lo</Text>
            <Text variant="small" color="textMuted">
              Yeh {changes.length} item badlenge. Baaki sab waise hi rahenge.
            </Text>
          </View>

          <Card>
            {changes.map((c, i) => (
              <View key={c.variantId}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={c.label}
                  subtitle={`${c.sku} · ${c.reason.label}`}
                  right={
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="number" color={c.diff < 0 ? 'danger' : 'ok'} mono>
                        {c.diff > 0 ? `+${c.diff}` : c.diff}
                      </Text>
                      <Text variant="small" color="textFaint" mono>{c.system} → {c.actual}</Text>
                    </View>
                  }
                />
              </View>
            ))}
          </Card>

          {lossValue > 0 ? (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text color="textMuted">Kam nikla maal</Text>
                <Text variant="number" color="danger">−{formatINR(lossValue)}</Text>
              </Row>
            </Card>
          ) : null}

          {/* Disabled the moment the differences go to zero — a bill posting
              while this screen sat open can empty the list, and pressing a
              live button on an empty list is how a no-op document gets made. */}
          <Button
            title="Haan, ginti theek kar do"
            size="lg"
            full
            onPress={apply}
            loading={saving}
            disabled={changes.length === 0}
          />
          <Button title="Peeche jao" tone="ghost" full onPress={() => setStep('count')} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Ginti Karo' }} />
      <Screen>
        <View>
          <Text variant="display">Ginti Karo</Text>
          <Text variant="small" color="textMuted">
            Shelf par ginti karo aur jo nikla wo yahan bharo — app ka stock ussi ke hisab se theek ho jayega.
          </Text>
        </View>

        <VariantPicker onPick={add} locationId={locationId} showCost={can('catalog.view_cost')} />

        {rows.length === 0 ? (
          <Empty title="Abhi koi item nahi" hint="Upar scan karo ya naam likho, phir ginti bharo." />
        ) : (
          <Card style={{ gap: space.md }}>
            {counted.map((c, i) => (
              <View key={c.variantId} style={{ gap: space.sm }}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2}>{c.label}</Text>
                    <Text variant="small" color="textFaint" mono>{c.sku}</Text>
                  </View>
                  <Button title="Hatao" tone="ghost" size="sm" onPress={() => drop(c.variantId)} />
                </Row>

                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="label" color="textMuted">App ka stock</Text>
                  <Text variant="number" mono>{c.system} pcs</Text>
                </Row>

                <Input
                  label="Ginti mein kitna nikla"
                  value={c.actual === null ? '' : String(c.actual)}
                  onChangeText={(v) => patch(c.variantId, { actual: v.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad"
                  placeholder="Jitne gine, wo likho"
                  returnKeyType="done"
                />

                {c.actual !== null ? (
                  <>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text variant="label" color="textMuted">Farak</Text>
                      <Text variant="number" mono color={c.diff === 0 ? 'ok' : c.diff < 0 ? 'danger' : 'ok'}>
                        {c.diff === 0 ? 'Sahi hai' : c.diff > 0 ? `+${c.diff}` : String(c.diff)}
                      </Text>
                    </Row>
                    {c.diff !== 0 ? (
                      <Row gap={space.sm} wrap>
                        {REASONS.map((r) => (
                          <Chip
                            key={r.key}
                            label={r.label}
                            selected={r.key === c.reasonKey}
                            onPress={() => patch(c.variantId, { reasonKey: r.key })}
                          />
                        ))}
                      </Row>
                    ) : null}
                  </>
                ) : null}
              </View>
            ))}
          </Card>
        )}

        <Card style={{ gap: space.md }}>
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
            returnKeyType="next"
            onSubmitEditing={() => noteRef.current?.focus()}
            submitBehavior="submit"
          />
          <Input
            ref={noteRef}
            label="Note"
            value={note}
            onChangeText={setNote}
            placeholder="Kis rack ka count, kisne kiya"
            returnKeyType="done"
            onSubmitEditing={review}
          />
        </Card>

        {rows.length > 0 ? (
          <Card>
            <SectionTitle>Abhi tak</SectionTitle>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text color="textMuted">{rows.length} item gine</Text>
              <Text color={changes.length ? 'danger' : 'textMuted'}>
                {changes.length ? `${changes.length} mein farak` : 'sab sahi'}
              </Text>
            </Row>
            {uncounted > 0 ? (
              <Text variant="small" color="textFaint">{uncounted} item ki ginti abhi baaki hai.</Text>
            ) : null}
          </Card>
        ) : null}

        <Button
          title={changes.length ? `${changes.length} item theek kar do` : 'Ginti theek kar do'}
          size="lg"
          full
          onPress={review}
          disabled={rows.length === 0}
        />
      </Screen>
    </>
  );
}
