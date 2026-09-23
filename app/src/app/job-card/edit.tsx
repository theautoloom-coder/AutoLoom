/**
 * Workshop job card: customer + vehicle → requirement → parts consumed →
 * labour → status → close (creates and posts the invoice).
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { formatINR, normaliseRegistration, resolvePrice, toDateString } from '@domain';

import { CUSTOMER_PRICE_CONTEXT } from '@/lib/queries';
import { closeJobCard } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { deleteRow, insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Divider, Input, KV, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, NumberField, SelectField, confirm, notify } from '@/ui/forms';
import { LineCard, VariantPicker, type PickedVariant } from '@/ui/lines';
import { space } from '@/ui/theme';
import { PreparingDraft } from '@/ui/pending';

type J = { id: string; status: string; doc_date: string; doc_no: string | null; customer_id: string | null; customer_vehicle_id: string | null; location_id: string; technician_id: string | null; requirement: string | null; odometer_km: number | null; notes: string | null };
type Part = { id: string; variant_id: string; description: string; qty: number; rate: number; tax_rate_pct: number; sku: string; here: number };
type Labour = { id: string; description: string; amount: number; tax_rate_pct: number; sac_code: string | null };
type Vehicle = { id: string; registration_no: string; model_name: string | null; model_id: string | null };

const STATUSES = [{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In progress' }, { value: 'ready', label: 'Ready for delivery' }];
const MODES = [{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'bank', label: 'Bank' }, { value: 'credit', label: 'Credit' }];

export default function JobCardEdit() {
  const { id: paramId, customer: customerParam } = useLocalSearchParams<{ id?: string; customer?: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const [id, setId] = useState<string | null>(paramId ?? null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('cash');
  const [newReg, setNewReg] = useState('');
  const [newRegModel, setNewRegModel] = useState<string | null>(null);
  const [labourText, setLabourText] = useState('');
  const [labourAmt, setLabourAmt] = useState<number | null>(null);

  const { data: rows } = useQuery<J>('SELECT * FROM job_cards WHERE id = ?', [id ?? '']);
  const doc = rows?.[0] ?? null;
  const { data: customers } = useQuery<{ id: string; name: string; mobile: string | null; customer_type: string }>('SELECT id, name, mobile, customer_type FROM customers WHERE is_active = 1 ORDER BY name');
  const { data: vehicles } = useQuery<Vehicle>('SELECT cv.id, cv.registration_no, vm.name AS model_name, vm.id AS model_id FROM customer_vehicles cv LEFT JOIN vehicle_models vm ON vm.id = cv.model_id WHERE cv.customer_id = ? ORDER BY cv.registration_no', [doc?.customer_id ?? '']);
  const { data: models } = useQuery<{ id: string; name: string; make_name: string }>('SELECT vm.id, vm.name, mk.name AS make_name FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id WHERE vm.is_active = 1 ORDER BY mk.sort_order, vm.name');
  const { data: techs } = useQuery<{ id: string; full_name: string }>("SELECT id, full_name FROM profiles WHERE is_active = 1 AND role IN ('workshop','owner','admin') ORDER BY full_name");
  const { data: locations } = useQuery<{ id: string; name: string; type: string }>("SELECT id, name, type FROM locations WHERE is_active = 1 AND type <> 'damaged' ORDER BY CASE type WHEN 'workshop' THEN 0 ELSE 1 END, sort_order");
  const { data: parts } = useQuery<Part>(`SELECT l.*, pv.sku, COALESCE((SELECT qty FROM stock_on_hand s WHERE s.variant_id = l.variant_id AND s.location_id = j.location_id), 0) AS here FROM job_card_lines l JOIN job_cards j ON j.id = l.job_card_id JOIN product_variants pv ON pv.id = l.variant_id WHERE l.job_card_id = ? ORDER BY l.created_at`, [id ?? '']);
  const { data: labour } = useQuery<Labour>('SELECT * FROM job_card_labour WHERE job_card_id = ? ORDER BY created_at', [id ?? '']);

  useEffect(() => {
    if (id || creating || !locations?.length) return;
    setCreating(true);
    const loc = locations.find((l) => l.type === 'workshop')?.id ?? locationId ?? locations[0].id;
    insertRow(db, 'job_cards', { doc_date: toDateString(), customer_id: customerParam || null, location_id: loc, status: 'open', parts_total: 0, labour_total: 0, discount_total: 0, tax_total: 0, grand_total: 0, technician_id: actor.userId }, actor).then(setId).catch((e) => notify(String(e)));
  }, [id, creating, locations, locationId, db, actor, customerParam]);

  const patch = (p: Record<string, string | number | null>) => id && updateRow(db, 'job_cards', id, p);

  async function addVehicle() {
    if (!doc?.customer_id) { notify('Choose the customer first.'); return; }
    const reg = normaliseRegistration(newReg);
    if (reg.length < 6) { notify('Enter the registration number.'); return; }
    const vid = await insertRow(db, 'customer_vehicles', { customer_id: doc.customer_id, registration_no: reg, model_id: newRegModel }, actor);
    await patch({ customer_vehicle_id: vid });
    setNewReg('');
  }

  async function addPart(v: PickedVariant) {
    if (!id) return;
    const ex = (parts ?? []).find((p) => p.variant_id === v.id);
    if (ex) { await updateRow(db, 'job_card_lines', ex.id, { qty: ex.qty + 1 }); return; }
    const ctx = await db.getOptional<{ customer_price: number | null; price_list_item_price: number | null; price_list_column: string | null }>(CUSTOMER_PRICE_CONTEXT.sql, [doc?.customer_id ?? '', v.id]);
    const r = resolvePrice(v, { customerPrice: ctx?.customer_price, priceListItemPrice: ctx?.price_list_item_price, priceListColumn: (ctx?.price_list_column as 'retail_price' | 'dealer_price' | 'wholesale_price' | null) ?? null });
    await insertRow(db, 'job_card_lines', { job_card_id: id, variant_id: v.id, description: `${v.product_name} ${v.variant_name}`, qty: 1, rate: r.price, tax_rate_pct: v.tax_rate_pct ?? 0, line_total: r.price });
  }

  async function addLabour() {
    if (!id || !labourText.trim() || !labourAmt) return;
    await insertRow(db, 'job_card_labour', { job_card_id: id, description: labourText.trim(), amount: labourAmt, sac_code: '9987', tax_rate_pct: 18, technician_id: doc?.technician_id ?? null });
    setLabourText(''); setLabourAmt(null);
  }

  async function close() {
    if (!id || !doc) return;
    if (!doc.customer_id) { notify('Choose the customer.'); return; }
    if (!(parts ?? []).length && !(labour ?? []).length) { notify('Add parts or labour first.'); return; }
    const total = (parts ?? []).reduce((a, p) => a + p.qty * p.rate * (1 + p.tax_rate_pct / 100), 0) + (labour ?? []).reduce((a, l) => a + l.amount * (1 + l.tax_rate_pct / 100), 0);
    if (!(await confirm('Close job card and invoice?', `An invoice of about ${formatINR(total)} will be posted (${mode.toUpperCase()}); parts leave workshop stock.`))) return;
    setBusy(true);
    try {
      let res = { invoiceId: '', docNo: '' };
      await db.writeTransaction(async (tx) => { res = await closeJobCard(tx, id, actor, { paymentMode: mode }); });
      notify(`Closed. Invoice ${res.docNo} posted.`);
      router.replace(`/invoice/${res.invoiceId}`);
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  async function discard() {
    if (!id || !(await confirm('Discard job card?', 'Nothing has been billed or moved.'))) return;
    await db.writeTransaction(async (tx) => { await tx.execute('DELETE FROM job_card_lines WHERE job_card_id = ?', [id]); await tx.execute('DELETE FROM job_card_labour WHERE job_card_id = ?', [id]); await deleteRow(tx, 'job_cards', id); });
    router.back();
  }

  if (!can('jobcard.edit')) return <Screen><Text>You do not have permission to edit job cards.</Text></Screen>;
  if (!doc) return <PreparingDraft what="job card" />;
  if (doc.status === 'closed' || doc.status === 'cancelled') { router.replace(`/job-card/${doc.id}`); return null; }

  const vehicle = vehicles?.find((v) => v.id === doc.customer_vehicle_id);
  const partsTotal = (parts ?? []).reduce((a, p) => a + p.qty * p.rate, 0);
  const labourTotal = (labour ?? []).reduce((a, l) => a + l.amount, 0);

  return (
    <>
      <Stack.Screen options={{ title: doc.doc_no ?? 'Job card' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="display">Job card</Text>
          <Badge tone={doc.status === 'ready' ? 'info' : doc.status === 'in_progress' ? 'warn' : 'neutral'}>{doc.status.replace('_', ' ')}</Badge>
        </Row>

        <FormSection title="Customer & vehicle">
          <SelectField label="Customer" value={doc.customer_id} options={(customers ?? []).map((c) => ({ value: c.id, label: c.name, sublabel: [c.customer_type, c.mobile].filter(Boolean).join(' · ') }))} onChange={(v) => patch({ customer_id: v, customer_vehicle_id: null })} onCreate={() => router.push('/customer/edit')} />
          {doc.customer_id ? (
            <>
              <SelectField label="Vehicle" value={doc.customer_vehicle_id} options={(vehicles ?? []).map((v) => ({ value: v.id, label: v.registration_no, sublabel: v.model_name ?? undefined }))} onChange={(v) => patch({ customer_vehicle_id: v })} allowClear placeholder="Choose or add below" />
              {!doc.customer_vehicle_id ? (
                <Row gap={8} align="flex-end">
                  <Input containerStyle={{ flex: 1 }} label="Registration" value={newReg} onChangeText={(v) => setNewReg(v.toUpperCase())} placeholder="UP16AB1234" autoCapitalize="characters" />
                  <View style={{ flex: 1.3 }}><SelectField label="Model" value={newRegModel} options={(models ?? []).map((m) => ({ value: m.id, label: `${m.make_name} ${m.name}` }))} onChange={setNewRegModel} allowClear /></View>
                  <Button title="Add vehicle" tone="secondary" onPress={addVehicle} />
                </Row>
              ) : vehicle?.model_id ? <Button title={`Products for ${vehicle.model_name}`} tone="ghost" size="sm" onPress={() => router.push(`/vehicle/${vehicle.model_id}`)} /> : null}
            </>
          ) : null}
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="Date" value={doc.doc_date} onChangeText={(v) => patch({ doc_date: v })} />
            <View style={{ flex: 1 }}><NumberField label="Odometer (km)" value={doc.odometer_km} onChange={(v) => patch({ odometer_km: v })} decimals={0} /></View>
          </Row>
          <Input label="Customer requirement" value={doc.requirement ?? ''} onChangeText={(v) => patch({ requirement: v })} placeholder="Fit LED headlights + fog lamps, check horn" multiline />
          <Row gap={12}>
            <View style={{ flex: 1 }}><SelectField label="Technician" value={doc.technician_id} options={(techs ?? []).map((t) => ({ value: t.id, label: t.full_name }))} onChange={(v) => patch({ technician_id: v })} allowClear /></View>
            <View style={{ flex: 1 }}><SelectField label="Parts from" value={doc.location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => v && patch({ location_id: v })} /></View>
          </Row>
          <Row gap={space.xs}>{STATUSES.map((s) => <Chip key={s.value} label={s.label} selected={doc.status === s.value} onPress={() => patch({ status: s.value })} />)}</Row>
        </FormSection>

        <SectionTitle>Parts · {(parts ?? []).length}</SectionTitle>
        <Card><VariantPicker onPick={addPart} showPrice locationId={doc.location_id} autoFocus={false} /></Card>
        {(parts ?? []).map((p) => (
          <LineCard key={p.id} title={p.description} subtitle={`${p.sku} · ${p.here} at ${locations?.find((l) => l.id === doc.location_id)?.name ?? 'location'}`} onRemove={() => deleteRow(db, 'job_card_lines', p.id)}>
            <Row gap={12}>
              <View style={{ flex: 1 }}><NumberField label="Qty" value={p.qty} onChange={(v) => updateRow(db, 'job_card_lines', p.id, { qty: v ?? 0, line_total: (v ?? 0) * p.rate })} decimals={3} /></View>
              <View style={{ flex: 1 }}><NumberField label="Rate" value={p.rate} onChange={(v) => updateRow(db, 'job_card_lines', p.id, { rate: v ?? 0, line_total: p.qty * (v ?? 0) })} /></View>
              <View style={{ flex: 1 }}><NumberField label="GST %" value={p.tax_rate_pct} onChange={(v) => updateRow(db, 'job_card_lines', p.id, { tax_rate_pct: v ?? 0 })} /></View>
            </Row>
          </LineCard>
        ))}

        <SectionTitle>Labour · {(labour ?? []).length}</SectionTitle>
        <Card>
          <Row gap={8} align="flex-end">
            <Input containerStyle={{ flex: 2 }} label="Work done" value={labourText} onChangeText={setLabourText} placeholder="Headlight fitting" onSubmitEditing={addLabour} />
            <View style={{ flex: 1 }}><NumberField label="Amount (₹)" value={labourAmt} onChange={setLabourAmt} placeholder="Horn labour amount" /></View>
            <Button title="Add" tone="secondary" onPress={addLabour} disabled={!labourText.trim() || !labourAmt} />
          </Row>
          {(labour ?? []).map((l) => (
            <Row key={l.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ flex: 1 }}>{l.description} <Text variant="small" color="textMuted">SAC {l.sac_code ?? '9987'} · GST {l.tax_rate_pct}%</Text></Text>
              <Text mono>{formatINR(l.amount)}</Text>
              <Button title="×" tone="ghost" size="sm" onPress={() => deleteRow(db, 'job_card_labour', l.id)} />
            </Row>
          ))}
        </Card>

        <FormSection title="Close & bill">
          <KV k="Parts" v={formatINR(partsTotal)} mono />
          <KV k="Labour" v={formatINR(labourTotal)} mono />
          <Divider />
          <SelectField label="Payment" value={mode} options={MODES} onChange={(v) => setMode(v ?? 'cash')} />
          <Input label="Internal notes" value={doc.notes ?? ''} onChangeText={(v) => patch({ notes: v })} />
          <Row gap={space.sm}>
            <Button title="Close job card & post invoice" size="lg" onPress={close} loading={busy} style={{ flex: 1 }} disabled={!can('sale.create')} />
            <Button title="Discard" tone="danger" onPress={discard} />
          </Row>
          {!can('sale.create') ? <Text variant="small" color="textMuted">Closing needs the sale.create permission; the workshop role has it by default.</Text> : null}
        </FormSection>
      </Screen>
    </>
  );
}
