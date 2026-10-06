/**
 * STOCK CHADHAO — godown mein naya maal aaye to yahan.
 *
 * This used to post a "found" adjustment, which moved the stock and left the
 * cost alone: tg_update_avg_cost only fires for movement_type 'purchase'. A
 * new item therefore arrived with avg_cost 0, and every later sale of it
 * reported the whole selling price as profit. The books looked healthy because
 * the cost was missing.
 *
 * So receiving is a purchase. That needs a supplier, which is why you can
 * create one here by typing a name — a supplier in this shop is a name and a
 * phone, and making somebody leave the screen to add one is how a five-second
 * job becomes a two-minute one.
 *
 * Counting something you did not know you had is a different job and belongs
 * to Ginti Karo.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR, isDateString, toDateString } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { postPurchase } from '@/lib/posting';
import { insertRow, nextPartyCode, searchText } from '@/lib/writes';
import { uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { Button, Card, Divider, Empty, Input, Row, Screen, Text } from '@/ui';
import { notify, SelectField } from '@/ui/forms';
import { PhotoPicker } from '@/ui/photo';
import { VariantPicker, type PickedVariant } from '@/ui/lines';
import { space } from '@/ui/theme';

type Line = { variantId: string; label: string; sku: string; qty: number; rate: number };
type Supplier = { id: string; name: string };

export default function StockChadhao() {
  const router = useRouter();
  const { db } = useSystem();
  const { actor, locationId, can } = useSession();
  const { variant: variantParam } = useLocalSearchParams<{ variant?: string }>();

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [date, setDate] = useState(toDateString());
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [billPhoto, setBillPhoto] = useState<PickedPhoto | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: suppliers } = useQuery<Supplier>('SELECT id, name FROM suppliers WHERE is_active = 1 ORDER BY name');
  const { data: onHand } = useQuery<{ variant_id: string; qty: number }>(
    'SELECT variant_id, qty FROM stock_on_hand WHERE location_id = ?', [locationId ?? '']);
  const hereMap = useMemo(() => new Map((onHand ?? []).map((r) => [r.variant_id, r.qty])), [onHand]);

  // Opened from an item's own page: that item is already the first line.
  const { data: preRows } = useQuery<{ id: string; sku: string; variant_name: string; product_name: string; last_purchase_cost: number; avg_cost: number }>(
    `SELECT pv.id, pv.sku, pv.variant_name, pv.last_purchase_cost, pv.avg_cost, p.name AS product_name
       FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ? LIMIT 1`,
    [variantParam ?? '']);
  const [seeded, setSeeded] = useState(false);
  const pre = preRows?.[0];
  if (pre && !seeded) {
    setSeeded(true);
    setLines([{ variantId: pre.id, label: `${pre.product_name} · ${pre.variant_name}`, sku: pre.sku, qty: 1, rate: pre.last_purchase_cost || pre.avg_cost || 0 }]);
  }

  async function addSupplier(name: string) {
    const id = await insertRow(db, 'suppliers', {
      code: await nextPartyCode(db, 'suppliers'),
      name: name.trim(), is_active: true, search_text: searchText(name),
    }, actor);
    setSupplierId(id);
  }

  function add(v: PickedVariant) {
    setLines((prev) => {
      const at = prev.findIndex((l) => l.variantId === v.id);
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], qty: next[at].qty + 1 };
        return next;
      }
      // The rate it came at last time is nearly always the rate it came at
      // this time, so it is filled in rather than asked for.
      return [...prev, {
        variantId: v.id,
        label: `${v.product_name} · ${v.variant_name}`,
        sku: v.sku,
        qty: 1,
        // Only for those allowed to see buy rates; everyone else types the
        // rate off the supplier's bill in their hand.
        rate: can('catalog.view_cost') ? v.last_purchase_cost || v.avg_cost || 0 : 0,
      }];
    });
  }

  const patch = (id: string, p: Partial<Line>) => setLines((prev) => prev.map((l) => (l.variantId === id ? { ...l, ...p } : l)));
  const drop = (id: string) => setLines((prev) => prev.filter((l) => l.variantId !== id));

  const totalQty = lines.reduce((a, l) => a + (l.qty || 0), 0);
  const totalValue = lines.reduce((a, l) => a + (l.qty || 0) * (l.rate || 0), 0);

  async function save() {
    const usable = lines.filter((l) => l.qty > 0);
    if (!supplierId) { notify('Supplier chuno — ya naam likh ke naya bana lo.', 'danger'); return; }
    if (usable.length === 0) { notify('Kam se kam ek item daalo.', 'danger'); return; }
    if (!locationId) { notify('Location nahi mili. Admin se location set karwao.', 'danger'); return; }
    // Staff no longer get last time's rate filled in (buy rates are the
    // owner's), so a forgotten rate would post the supplier's bill at ₹0 —
    // their khata would say the shop owes nothing for maal it received.
    const noRate = usable.find((l) => !(l.rate > 0));
    if (noRate) { notify(`${noRate.label}: ek ka rate likho — supplier ke bill se.`, 'danger'); return; }
    // A NOT NULL date column will not take "", and PowerSync discards the
    // whole transaction server-side when it tries — silently, long after
    // the screen said it saved. Catch it here, where the person can fix it.
    if (!isDateString(date)) { notify('Tareekh theek nahi hai — YYYY-MM-DD likho, jaise 2026-09-30.', 'danger'); return; }

    setSaving(true);
    try {
      // The photo goes up first: if the network is down we want to know before
      // the stock has moved, not after.
      let billPath: string | null = null;
      if (billPhoto) {
        try {
          billPath = await uploadPhoto(billPhoto, 'bills');
        } catch {
          notify('Bill ki photo nahi chadhi — stock phir bhi chadh raha hai.', 'danger');
        }
      }

      const supplier = suppliers?.find((s) => s.id === supplierId);
      await db.writeTransaction(async (tx) => {
        const id = await insertRow(tx, 'purchases', {
          doc_type: 'purchase',
          doc_date: date,
          supplier_id: supplierId,
          supplier_name: supplier?.name ?? null,
          location_id: locationId,
          bill_photo_path: billPath,
          notes: note.trim() || null,
          status: 'draft',
        }, actor);

        for (const [i, l] of usable.entries()) {
          await insertRow(tx, 'purchase_lines', {
            purchase_id: id, line_no: i + 1, variant_id: l.variantId, description: l.label,
            qty: l.qty, rate: l.rate, tax_rate_pct: 0,
          }, actor);
        }
        await postPurchase(tx, id, actor);
      });

      notify(`${totalQty} pcs stock mein chadh gaya.`, 'ok');
      router.back();
    } catch (e) {
      notify(`Stock nahi chadha: ${String((e as Error).message ?? e)}`, 'danger');
    } finally {
      setSaving(false);
    }
  }

  if (!can('purchase.create')) {
    return (
      <>
        <Stack.Screen options={{ title: 'Stock Chadhao' }} />
        <Screen>
          <Text variant="display">Stock Chadhao</Text>
          <Empty title="Iski permission nahi hai" hint="Admin se stock chadhane ka haq maango." />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Stock Chadhao' }} />
      <Screen>
        <View>
          <Text variant="display">Stock Chadhao</Text>
          <Text variant="small" color="textMuted">
            Supplier se naya maal aaya? Yahan daalo — stock bhi badhega aur supplier ka hisab bhi ban jayega.
          </Text>
        </View>

        <Card style={{ gap: space.md }}>
          <SelectField
            label="Supplier"
            value={supplierId}
            options={(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))}
            onChange={setSupplierId}
            onCreate={addSupplier}
            placeholder="Kis supplier se aaya?"
            hint="Naam likh ke naya supplier bhi bana sakte ho."
          />
          <Input label="Tareekh" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" hint="Aaj ki tareekh pehle se bhari hai." />
        </Card>

        {/* No autofocus: the first question here is the supplier, and a
            keyboard already open over it hid the very field to fill first. */}
        <VariantPicker
          onPick={add}
          locationId={locationId}
          autoFocus={false}
          canCreate={can('catalog.edit')}
          onCreate={(text) => router.push(`/admin/item?name=${encodeURIComponent(text)}&back=/stock/add` as never)}
        />

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
                      label="Kitne aaye"
                      value={String(l.qty)}
                      onChangeText={(v) => patch(l.variantId, { qty: Math.max(0, Math.floor(Number(v.replace(/[^0-9]/g, '')) || 0)) })}
                      keyboardType="number-pad"
                    />
                    <Input
                      containerStyle={{ flex: 1 }}
                      label="Ek ka rate"
                      value={l.rate ? String(l.rate) : ''}
                      onChangeText={(v) => patch(l.variantId, { rate: Number(v.replace(/[^0-9.]/g, '')) || 0 })}
                      keyboardType="decimal-pad"
                      hint="Supplier ko jitne ka diya"
                    />
                  </Row>
                  <Text variant="small" color="textFaint">
                    {l.sku} · abhi {here} → {here + l.qty} · {formatINR(l.qty * l.rate)}
                  </Text>
                </View>
              );
            })}
          </Card>
        )}

        <Card style={{ gap: space.md }}>
          <Text variant="label" color="textMuted">Bill ki photo</Text>
          <PhotoPicker
            localUri={billPhoto?.uri}
            name="Bill"
            onPickLocal={setBillPhoto}
          />
          <Input label="Note" value={note} onChangeText={setNote} placeholder="Gaadi number, driver, kuch bhi" />
        </Card>

        {lines.length > 0 ? (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text color="textMuted">{totalQty} pcs</Text>
              <Text variant="number">{formatINR(totalValue)}</Text>
            </Row>
          </Card>
        ) : null}

        <Button
          title={totalQty > 0 ? `${totalQty} pcs chadha do` : 'Stock chadha do'}
          size="lg"
          full
          onPress={save}
          loading={saving}
          disabled={totalQty === 0}
        />
      </Screen>
    </>
  );
}
