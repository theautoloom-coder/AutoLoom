import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { toDateString } from '@domain';

import { dispatchTransfer } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { deleteRow, insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Input, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, NumberField, SelectField, confirm, notify } from '@/ui/forms';
import { LineCard, VariantPicker, type PickedVariant } from '@/ui/lines';
import { space } from '@/ui/theme';
import { PreparingDraft } from '@/ui/pending';

type T = { id: string; status: string; doc_date: string; from_location_id: string; to_location_id: string; notes: string | null };
type L = { id: string; variant_id: string; qty: number; description: string; sku: string; here: number };

export default function TransferEdit() {
  const { id: paramId } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const [id, setId] = useState<string | null>(paramId ?? null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: rows } = useQuery<T>('SELECT * FROM stock_transfers WHERE id = ?', [id ?? '']);
  const doc = rows?.[0] ?? null;
  const { data: lines } = useQuery<L>(
    `SELECT l.id, l.variant_id, l.qty, p.name || ' ' || pv.variant_name AS description, pv.sku,
            COALESCE((SELECT qty FROM stock_on_hand sl WHERE sl.variant_id = l.variant_id AND sl.location_id = t.from_location_id), 0) AS here
     FROM stock_transfer_lines l JOIN stock_transfers t ON t.id = l.transfer_id JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id
     WHERE l.transfer_id = ? ORDER BY l.created_at`, [id ?? '']);
  const { data: locations } = useQuery<{ id: string; name: string }>("SELECT id, name FROM locations WHERE is_active = 1 AND type NOT IN ('damaged','transit') ORDER BY sort_order");

  useEffect(() => {
    if (id || creating || !locationId || !locations?.length) return;
    setCreating(true);
    const to = locations.find((l) => l.id !== locationId)?.id ?? locationId;
    insertRow(db, 'stock_transfers', { doc_date: toDateString(), from_location_id: locationId, to_location_id: to, status: 'draft' }, actor).then(setId).catch((e) => notify(String(e)));
  }, [id, creating, locationId, locations, db, actor]);

  const patch = (p: Record<string, string | number | null>) => id && updateRow(db, 'stock_transfers', id, p);

  async function addLine(v: PickedVariant) {
    if (!id) return;
    const ex = (lines ?? []).find((l) => l.variant_id === v.id);
    if (ex) { await updateRow(db, 'stock_transfer_lines', ex.id, { qty: ex.qty + 1 }); return; }
    await insertRow(db, 'stock_transfer_lines', { transfer_id: id, variant_id: v.id, qty: 1, unit_cost: v.avg_cost });
  }

  async function dispatch() {
    if (!id || !doc) return;
    if (doc.from_location_id === doc.to_location_id) { notify('Kahan se aur kahan tak alag hone chahiye.'); return; }
    if (!(lines ?? []).length) { notify('Kam se kam ek item daalo.'); return; }
    const short = (lines ?? []).filter((l) => l.qty > l.here);
    if (short.length && !(await confirm('Kuch line mein wahan ke stock se zyada qty hai', `${short.map((l) => l.description).join(', ')}. Dispatch anyway? Stock will go negative at the source until corrected.`))) return;
    if (!(await confirm('Transfer bhej dein?', 'Stock leaves the source location now and will be in transit until received.'))) return;
    setBusy(true);
    try {
      await db.writeTransaction(async (tx) => dispatchTransfer(tx, id, actor));
      router.replace(`/transfer/${id}`);
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  async function discard() {
    if (!id || !(await confirm('Adhoora bill chhod dein?', 'Nothing has moved yet.'))) return;
    await db.writeTransaction(async (tx) => { await tx.execute('DELETE FROM stock_transfer_lines WHERE transfer_id = ?', [id]); await deleteRow(tx, 'stock_transfers', id); });
    router.back();
  }

  if (!can('stock.transfer')) return <Screen><Text>Aapko stock transfer karne ki permission nahi hai.</Text></Screen>;
  if (!doc) return <PreparingDraft what="draft" />;
  if (doc.status !== 'draft') { router.replace(`/transfer/${doc.id}`); return null; }

  return (
    <>
      <Stack.Screen options={{ title: 'New transfer' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}><Text variant="display">Transfer</Text><Badge>draft</Badge></Row>
        <FormSection title="Kahan se kahan">
          <Row gap={12}>
            <View style={{ flex: 1 }}><SelectField label="Se" value={doc.from_location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => v && patch({ from_location_id: v })} /></View>
            <View style={{ flex: 1 }}><SelectField label="Tak" value={doc.to_location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => v && patch({ to_location_id: v })} /></View>
          </Row>
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="Date" value={doc.doc_date} onChangeText={(v) => patch({ doc_date: v })} />
            <Input containerStyle={{ flex: 2 }} label="Note" value={doc.notes ?? ''} onChangeText={(v) => patch({ notes: v })} placeholder="Gaadi, driver, wajah" />
          </Row>
        </FormSection>
        <SectionTitle>Maal · {(lines ?? []).length}</SectionTitle>
        <Card><VariantPicker onPick={addLine} locationId={doc.from_location_id} autoFocus={false} /></Card>
        {(lines ?? []).map((l) => (
          <LineCard key={l.id} title={l.description} subtitle={`${l.sku} · ${l.here} at source`} onRemove={() => deleteRow(db, 'stock_transfer_lines', l.id)}>
            <Row gap={12}>
              <View style={{ flex: 1 }}><NumberField label="Qty" value={l.qty} onChange={(v) => updateRow(db, 'stock_transfer_lines', l.id, { qty: v ?? 0 })} decimals={3} error={l.qty > l.here ? `Only ${l.here} here` : null} /></View>
            </Row>
          </LineCard>
        ))}
        <Row gap={space.sm}>
          <Button title="Bhej do" size="lg" onPress={dispatch} loading={busy} style={{ flex: 1 }} />
          <Button title="Chhod do" tone="danger" onPress={discard} />
        </Row>
      </Screen>
    </>
  );
}
