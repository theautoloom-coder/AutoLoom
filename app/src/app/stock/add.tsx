/**
 * "Maal aaya" — put stock in, in about ten seconds.
 *
 * The long way round already exists: a purchase bill with a supplier, rates and
 * payment terms, or an adjustment with a reason, a location and a date. Both
 * are right when there is paperwork to match. Neither is what happens when a
 * tempo drops off ten mats at four in the afternoon and the counter is busy.
 *
 * So: scan or type, set how many, press once. It posts a `found` adjustment —
 * the same rows, the same stock movements and the same ledger the long way
 * writes, so nothing downstream can tell the difference. A bill can still be
 * entered later; this is about the shelf being right now.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { postAdjustment } from '@/lib/posting';
import { insertRow } from '@/lib/writes';
import { Button, Card, Divider, Empty, Input, Row, Screen, Text } from '@/ui';
import { notify } from '@/ui/forms';
import { VariantPicker, type PickedVariant } from '@/ui/lines';
import { space } from '@/ui/theme';

type Line = { variantId: string; label: string; sku: string; qty: number };

export default function StockAdd() {
  const router = useRouter();
  const { db } = useSystem();
  const { actor, locationId, can } = useSession();
  const { variant: variantParam } = useLocalSearchParams<{ variant?: string }>();
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // What is on the shelf right now, so the new total is visible before saving.
  const { data: onHand } = useQuery<{ variant_id: string; qty: number }>(
    'SELECT variant_id, qty FROM stock_on_hand WHERE location_id = ?',
    [locationId ?? '']
  );
  const hereMap = useMemo(() => new Map((onHand ?? []).map((r) => [r.variant_id, r.qty])), [onHand]);

  // Opened from a product page: that item is already the first line.
  const { data: preRows } = useQuery<{ id: string; sku: string; variant_name: string; product_name: string }>(
    `SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name
       FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ? LIMIT 1`,
    [variantParam ?? '']
  );
  const [seeded, setSeeded] = useState(false);
  const pre = preRows?.[0];
  if (pre && !seeded) {
    setSeeded(true);
    setLines([{ variantId: pre.id, label: `${pre.product_name} · ${pre.variant_name}`, sku: pre.sku, qty: 1 }]);
  }

  function add(v: PickedVariant) {
    // Scanning the same box twice means two of them, not a second row.
    setLines((prev) => {
      const at = prev.findIndex((l) => l.variantId === v.id);
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], qty: next[at].qty + 1 };
        return next;
      }
      return [...prev, { variantId: v.id, label: `${v.product_name} · ${v.variant_name}`, sku: v.sku, qty: 1 }];
    });
  }

  function setQty(variantId: string, qty: number) {
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, qty } : l)));
  }

  function remove(variantId: string) {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  const total = lines.reduce((a, l) => a + (l.qty || 0), 0);

  async function save() {
    const usable = lines.filter((l) => l.qty > 0);
    if (usable.length === 0) {
      notify('Pehle maal choose karo aur qty daalo.');
      return;
    }
    if (!locationId) {
      notify('Location nahi mili. Admin se location set karwao.');
      return;
    }
    setSaving(true);
    try {
      await db.writeTransaction(async (tx) => {
        const adjId = await insertRow(
          tx,
          'stock_adjustments',
          {
            doc_date: new Date().toISOString().slice(0, 10),
            location_id: locationId,
            reason: 'found',
            notes: note.trim() || 'Maal aaya',
            status: 'draft',
          },
          actor
        );
        for (const l of usable) {
          await insertRow(
            tx,
            'stock_adjustment_lines',
            { adjustment_id: adjId, variant_id: l.variantId, qty_delta: l.qty, unit_cost: 0, note: null },
            actor
          );
        }
        await postAdjustment(tx, adjId, actor);
      });
      notify(`${total} pcs stock mein chadh gaya.`);
      router.back();
    } catch (e) {
      notify(`Nahi chadha: ${String((e as Error).message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!can('stock.adjust')) {
    return (
      <>
        <Stack.Screen options={{ title: 'Maal aaya' }} />
        <Screen>
          <Text variant="display">Maal aaya</Text>
          <Empty
            title="Iski permission nahi hai"
            hint="Admin se 'stock.adjust' maango, ya purchase bill bana ke maal chadhao."
          />
          <Button title="Purchase bill banao" tone="secondary" onPress={() => router.replace('/purchase/edit')} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Maal aaya' }} />
      <Screen>
        <Text variant="display">Maal aaya</Text>
        <Text color="textMuted">Scan karo ya naam likho, qty daalo, ek baar dabao. Bas.</Text>

        <VariantPicker
          onPick={add}
          locationId={locationId}
          canCreate={can('catalog.edit')}
          onCreate={(text) => router.push(`/admin/item?name=${encodeURIComponent(text)}&back=/stock/add` as never)}
        />

        {lines.length === 0 ? (
          <Empty title="Abhi kuch nahi" hint="Upar se maal dhoondo — jitne piece aaye hain wo daal do." />
        ) : (
          <Card style={{ gap: space.md }}>
            {lines.map((l, i) => {
              const here = hereMap.get(l.variantId) ?? 0;
              return (
                <View key={l.variantId} style={{ gap: space.xs }}>
                  {i > 0 ? <Divider /> : null}
                  <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
                    <Text style={{ flex: 1 }} numberOfLines={2}>
                      {l.label}
                    </Text>
                    <Button title="Hatao" tone="ghost" size="sm" onPress={() => remove(l.variantId)} />
                  </Row>
                  <Row gap={space.sm}>
                    <Button
                      title="−"
                      tone="secondary"
                      size="lg"
                      onPress={() => setQty(l.variantId, Math.max(0, l.qty - 1))}
                    />
                    <Input
                      containerStyle={{ flex: 1 }}
                      value={String(l.qty)}
                      onChangeText={(v) => setQty(l.variantId, Math.max(0, Math.floor(Number(v.replace(/[^0-9]/g, '')) || 0)))}
                      keyboardType="number-pad"
                    />
                    <Button title="+" size="lg" onPress={() => setQty(l.variantId, l.qty + 1)} />
                  </Row>
                  <Text variant="small" color="textFaint">
                    {l.sku} · abhi {here} → {here + l.qty}
                  </Text>
                </View>
              );
            })}
          </Card>
        )}

        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Sharma auto se aaya" />

        <Button
          title={total > 0 ? `${total} pcs chadha do` : 'Chadha do'}
          size="lg"
          full
          onPress={save}
          loading={saving}
          disabled={total === 0}
        />
        <Button
          title="Bill ke saath aaya hai? Purchase banao"
          tone="ghost"
          onPress={() => router.replace('/purchase/edit')}
        />
      </Screen>
    </>
  );
}
