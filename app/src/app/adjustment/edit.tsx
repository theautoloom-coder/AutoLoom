import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { toDateString } from '@domain';

import { postAdjustment } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { deleteRow, insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Input, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, NumberField, SelectField, confirm, notify } from '@/ui/forms';
import { LineCard, VariantPicker, type PickedVariant } from '@/ui/lines';
import { space } from '@/ui/theme';
import { PreparingDraft } from '@/ui/pending';

type A = { id: string; status: string; doc_date: string; location_id: string; reason: string; notes: string | null };
type L = { id: string; variant_id: string; qty_delta: number; unit_cost: number; reason_code: string | null; note: string | null; description: string; sku: string; here: number; avg_cost: number };

const REASONS = [
  { value: 'damage', label: 'Damage', sublabel: 'Broken or unsellable; removes stock' },
  { value: 'missing', label: 'Missing', sublabel: 'Cannot be found' },
  { value: 'found', label: 'Found', sublabel: 'Stock discovered that the system did not know about' },
  { value: 'wrong_entry', label: 'Wrong entry', sublabel: 'A past document was entered incorrectly' },
  { value: 'counting_error', label: 'Counting error' },
  { value: 'free_issue', label: 'Free / promotional issue', sublabel: 'Given away; removes stock' },
  { value: 'opening', label: 'Opening stock', sublabel: 'Go-live quantities' },
  { value: 'other', label: 'Other' },
];

export default function AdjustmentEdit() {
  const { id: paramId } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const [id, setId] = useState<string | null>(paramId ?? null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: rows } = useQuery<A>('SELECT * FROM stock_adjustments WHERE id = ?', [id ?? '']);
  const doc = rows?.[0] ?? null;
  const { data: lines } = useQuery<L>(
    `SELECT l.*, p.name || ' ' || pv.variant_name AS description, pv.sku, pv.avg_cost,
            COALESCE((SELECT qty FROM stock_on_hand sl WHERE sl.variant_id = l.variant_id AND sl.location_id = a.location_id), 0) AS here
     FROM stock_adjustment_lines l JOIN stock_adjustments a ON a.id = l.adjustment_id JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id
     WHERE l.adjustment_id = ? ORDER BY l.created_at`, [id ?? '']);
  const { data: locations } = useQuery<{ id: string; name: string }>("SELECT id, name FROM locations WHERE is_active = 1 ORDER BY sort_order");

  useEffect(() => {
    if (id || creating || !locationId) return;
    setCreating(true);
    insertRow(db, 'stock_adjustments', { doc_date: toDateString(), location_id: locationId, reason: 'damage', status: 'draft' }, actor).then(setId).catch((e) => notify(String(e)));
  }, [id, creating, locationId, db, actor]);

  const patch = (p: Record<string, string | number | null>) => id && updateRow(db, 'stock_adjustments', id, p);
  const sign = doc?.reason === 'found' || doc?.reason === 'opening' ? 1 : doc?.reason === 'wrong_entry' || doc?.reason === 'counting_error' || doc?.reason === 'other' ? 0 : -1;

  async function addLine(v: PickedVariant) {
    if (!id || (lines ?? []).some((l) => l.variant_id === v.id)) return;
    await insertRow(db, 'stock_adjustment_lines', { adjustment_id: id, variant_id: v.id, qty_delta: sign === 0 ? 0 : sign, unit_cost: v.avg_cost, reason_code: doc?.reason ?? null });
  }

  async function post() {
    if (!id || !doc) return;
    if (!(lines ?? []).length) { notify('Add at least one item.'); return; }
    if ((lines ?? []).some((l) => !l.qty_delta)) { notify('Every line needs a non-zero quantity change.'); return; }
    if (!can('stock.adjust')) { notify('Saved as draft. An owner or admin must post it.'); router.replace('/adjustments'); return; }
    if (!(await confirm('Post adjustment?', 'Stock changes immediately and the adjustment is logged with your name.'))) return;
    setBusy(true);
    try {
      await db.writeTransaction(async (tx) => postAdjustment(tx, id, actor));
      router.replace(`/adjustment/${id}`);
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  async function discard() {
    if (!id || !(await confirm('Discard draft?', 'Nothing has changed yet.'))) return;
    await db.writeTransaction(async (tx) => { await tx.execute('DELETE FROM stock_adjustment_lines WHERE adjustment_id = ?', [id]); await deleteRow(tx, 'stock_adjustments', id); });
    router.back();
  }

  if (!can('stock.count') && !can('stock.adjust')) return <Screen><Text>You do not have permission to adjust stock.</Text></Screen>;
  if (!doc) return <PreparingDraft what="draft" />;
  if (doc.status !== 'draft') { router.replace(`/adjustment/${doc.id}`); return null; }

  return (
    <>
      <Stack.Screen options={{ title: 'Stock adjustment' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}><Text variant="display">Adjustment</Text><Badge>draft</Badge></Row>
        <FormSection title="Why">
          <SelectField label="Reason" value={doc.reason} options={REASONS} onChange={(v) => patch({ reason: v ?? 'other' })} />
          <Row gap={12}>
            <View style={{ flex: 1 }}><SelectField label="Location" value={doc.location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => v && patch({ location_id: v })} /></View>
            <Input containerStyle={{ flex: 1 }} label="Date" value={doc.doc_date} onChangeText={(v) => patch({ doc_date: v })} />
          </Row>
          <Input label="Notes" value={doc.notes ?? ''} onChangeText={(v) => patch({ notes: v })} placeholder="What happened" />
        </FormSection>
        <SectionTitle>Items · {(lines ?? []).length}</SectionTitle>
        <Card><VariantPicker onPick={addLine} locationId={doc.location_id} showCost={can('catalog.view_cost')} autoFocus={false} /></Card>
        {(lines ?? []).map((l) => (
          <LineCard key={l.id} title={l.description} subtitle={`${l.sku} · ${l.here} on hand here`} onRemove={() => deleteRow(db, 'stock_adjustment_lines', l.id)}>
            <Row gap={12}>
              <View style={{ flex: 1 }}><NumberField label="Change (+ adds, − removes)" value={l.qty_delta} onChange={(v) => updateRow(db, 'stock_adjustment_lines', l.id, { qty_delta: v ?? 0 })} decimals={3} hint={`After: ${l.here + (l.qty_delta || 0)}`} /></View>
              {can('catalog.view_cost') ? <View style={{ flex: 1 }}><NumberField label="Unit cost" value={l.unit_cost} onChange={(v) => updateRow(db, 'stock_adjustment_lines', l.id, { unit_cost: v ?? 0 })} hint="Defaults to average cost" /></View> : null}
            </Row>
            <Input label="Line note" value={l.note ?? ''} onChangeText={(v) => updateRow(db, 'stock_adjustment_lines', l.id, { note: v || null })} />
          </LineCard>
        ))}
        <Row gap={space.sm}>
          <Button title={can('stock.adjust') ? 'Post adjustment' : 'Save for approval'} size="lg" onPress={post} loading={busy} style={{ flex: 1 }} />
          <Button title="Discard" tone="danger" onPress={discard} />
        </Row>
      </Screen>
    </>
  );
}
