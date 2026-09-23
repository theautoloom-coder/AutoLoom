/**
 * Receive a purchase (or record a purchase return as a debit note).
 *
 * The draft is saved to the local database as you go, so a half-entered bill
 * survives closing the app. Posting assigns the number, writes the stock
 * movements and the supplier ledger entry in one transaction.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR, isInterstate, toDateString, uuidv7 } from '@domain';

import { postPurchase, totalLines, type DraftLine } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { deleteRow, insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Divider, Input, KV, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, NumberField, SelectField, confirm, notify } from '@/ui/forms';
import { LineCard, VariantPicker, type PickedVariant } from '@/ui/lines';
import { space } from '@/ui/theme';
import { PreparingDraft } from '@/ui/pending';

type Purchase = { id: string; doc_type: 'purchase' | 'debit_note'; status: string; supplier_id: string | null; supplier_invoice_no: string | null; supplier_invoice_date: string | null; doc_date: string; location_id: string | null; is_interstate: number; other_charges: number; notes: string | null; against_purchase_id: string | null };
type Line = DraftLine & { purchase_id: string; line_no: number };

export default function PurchaseEdit() {
  const { id: paramId, against } = useLocalSearchParams<{ id?: string; against?: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();

  const [id, setId] = useState<string | null>(paramId ?? null);
  const { data: rows } = useQuery<Purchase>('SELECT * FROM purchases WHERE id = ?', [id ?? '']);
  const doc = rows?.[0] ?? null;
  const { data: lines } = useQuery<Line>('SELECT * FROM purchase_lines WHERE purchase_id = ? ORDER BY line_no', [id ?? '']);
  const { data: suppliers } = useQuery<{ id: string; name: string; state_code: string | null; gstin: string | null; company_name: string | null }>('SELECT id, name, state_code, gstin, company_name FROM suppliers WHERE is_active = 1 ORDER BY name');
  const { data: locations } = useQuery<{ id: string; name: string; type: string }>("SELECT id, name, type FROM locations WHERE is_active = 1 AND type <> 'damaged' ORDER BY sort_order");
  const { data: company } = useQuery<{ state_code: string; round_to_rupee: number }>('SELECT state_code, round_to_rupee FROM company_settings LIMIT 1');
  const { data: original } = useQuery<{ id: string; doc_no: string; supplier_id: string; location_id: string; is_interstate: number }>('SELECT id, doc_no, supplier_id, location_id, is_interstate FROM purchases WHERE id = ?', [against ?? '']);
  const { data: originalLines } = useQuery<Line & { returned: number }>(
    `SELECT pl.*, COALESCE((SELECT SUM(x.qty) FROM purchase_lines x JOIN purchases px ON px.id = x.purchase_id WHERE x.against_line_id = pl.id AND px.status <> 'cancelled'), 0) AS returned
     FROM purchase_lines pl WHERE pl.purchase_id = ? ORDER BY pl.line_no`, [against ?? '']);

  const [posting, setPosting] = useState(false);
  const [creating, setCreating] = useState(false);
  const supplier = suppliers?.find((s) => s.id === doc?.supplier_id) ?? null;

  // Create the draft row on first open.
  useEffect(() => {
    if (id || creating || !locationId) return;
    setCreating(true);
    (async () => {
      const base = original?.[0];
      const newId = await insertRow(db, 'purchases', {
        doc_type: against ? 'debit_note' : 'purchase', doc_date: toDateString(), supplier_id: base?.supplier_id ?? null, location_id: base?.location_id ?? locationId,
        is_interstate: base?.is_interstate ?? false, other_charges: 0, status: 'draft', against_purchase_id: against || null,
      }, actor);
      if (against && originalLines) {
        for (const ol of originalLines) {
          const remaining = ol.qty - ol.returned;
          if (remaining <= 0) continue;
          await insertRow(db, 'purchase_lines', { purchase_id: newId, line_no: ol.line_no, variant_id: ol.variant_id, description: ol.description, hsn_code: ol.hsn_code, qty: remaining, unit_code: ol.unit_code, rate: ol.rate, discount_pct: ol.discount_pct, discount_amt: 0, tax_rate_pct: ol.tax_rate_pct, against_line_id: ol.id });
        }
      }
      setId(newId);
    })().catch((e) => notify(String(e)));
  }, [id, creating, locationId, db, actor, against, original, originalLines]);

  const interstate = !!doc?.is_interstate;
  const totals = useMemo(() => totalLines(lines ?? [], interstate, doc?.other_charges ?? 0, company?.[0]?.round_to_rupee !== 0), [lines, interstate, doc?.other_charges, company]);

  async function patch(p: Record<string, string | number | boolean | null>) {
    if (!id) return;
    await updateRow(db, 'purchases', id, p);
  }

  async function chooseSupplier(sid: string | null) {
    const s = suppliers?.find((x) => x.id === sid);
    await patch({ supplier_id: sid, supplier_name: s?.company_name ?? s?.name ?? null, supplier_gstin: s?.gstin ?? null, supplier_state_code: s?.state_code ?? null, is_interstate: isInterstate(company?.[0]?.state_code, s?.state_code) });
  }

  async function addLine(v: PickedVariant) {
    if (!id) return;
    const existing = (lines ?? []).find((l) => l.variant_id === v.id);
    if (existing) {
      await updateRow(db, 'purchase_lines', existing.id, { qty: existing.qty + 1 });
      return;
    }
    await insertRow(db, 'purchase_lines', {
      purchase_id: id, line_no: (lines?.length ?? 0) + 1, variant_id: v.id, description: `${v.product_name} ${v.variant_name}`, hsn_code: v.hsn_code ?? null, qty: 1, unit_code: v.unit_code ?? null,
      rate: v.last_purchase_cost || 0, discount_pct: 0, discount_amt: 0, tax_rate_pct: v.tax_rate_pct ?? 0, mrp: v.mrp,
    });
  }

  async function patchLine(lineId: string, p: Record<string, string | number | null>) {
    await updateRow(db, 'purchase_lines', lineId, p);
  }

  async function post() {
    if (!id || !doc) return;
    if (!doc.supplier_id) { notify('Supplier chuno.'); return; }
    if (!doc.location_id) { notify('Jahan maal aa raha hai wo location chuno.'); return; }
    if (!(lines ?? []).length) { notify('Kam se kam ek item daalo.'); return; }
    if ((lines ?? []).some((l) => l.qty <= 0 || l.rate < 0)) { notify('Har line mein qty aur rate dono chahiye.'); return; }
    if (doc.doc_type === 'debit_note') {
      for (const l of lines ?? []) {
        const ol = originalLines?.find((x) => x.id === l.against_line_id);
        if (ol && l.qty > ol.qty - ol.returned) { notify(`Cannot return ${l.qty} of ${l.description}: only ${ol.qty - ol.returned} left to return.`); return; }
      }
    }
    const ok = await confirm(doc.doc_type === 'purchase' ? 'Post purchase?' : 'Post debit note?', `${formatINR(totals.totals.grand_total)} for ${supplier?.name}. Stock and the supplier ledger will be updated. This cannot be edited afterwards.`);
    if (!ok) return;
    setPosting(true);
    try {
      let docNo = '';
      await db.writeTransaction(async (tx) => { docNo = await postPurchase(tx, id, actor); });
      router.replace(`/purchase/${id}`);
      notify(`Posted ${docNo}`);
    } catch (e) {
      notify(`Could not post: ${(e as Error).message}`);
    } finally {
      setPosting(false);
    }
  }

  async function discard() {
    if (!id) return;
    if (!(await confirm('Adhoora bill chhod dein?', 'The draft and its lines will be deleted.'))) return;
    await db.writeTransaction(async (tx) => {
      await tx.execute('DELETE FROM purchase_lines WHERE purchase_id = ?', [id]);
      await deleteRow(tx, 'purchases', id);
    });
    router.back();
  }

  if (!can('purchase.create')) return <Screen><Text>Aapko purchase lene ki permission nahi hai.</Text></Screen>;
  if (!doc) return <PreparingDraft what="draft" />;
  if (doc.status !== 'draft') { router.replace(`/purchase/${doc.id}`); return null; }

  const isReturn = doc.doc_type === 'debit_note';

  return (
    <>
      <Stack.Screen options={{ title: isReturn ? 'Purchase wapasi' : 'Purchase bill' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="display">{isReturn ? 'Purchase wapasi' : 'Purchase bill'}</Text>
          <Badge>draft</Badge>
        </Row>
        {isReturn && original?.[0] ? <Text variant="small" color="textMuted">Against {original[0].doc_no}. Quantities are pre-filled with what has not been returned yet; reduce them as needed.</Text> : null}

        <FormSection title="Supplier aur bill">
          <SelectField label="Supplier" value={doc.supplier_id} options={(suppliers ?? []).map((s) => ({ value: s.id, label: s.name, sublabel: s.gstin ?? undefined }))} onChange={chooseSupplier} />
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="Supplier bill no." value={doc.supplier_invoice_no ?? ''} onChangeText={(v) => patch({ supplier_invoice_no: v })} autoCapitalize="characters" />
            <Input containerStyle={{ flex: 1 }} label="Bill ki date" value={doc.supplier_invoice_date ?? ''} onChangeText={(v) => patch({ supplier_invoice_date: v })} placeholder="YYYY-MM-DD" />
          </Row>
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="Humari date" value={doc.doc_date} onChangeText={(v) => patch({ doc_date: v })} placeholder="YYYY-MM-DD" />
            <View style={{ flex: 1 }}>
              <SelectField label={isReturn ? 'Return from' : 'Receive into'} value={doc.location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => patch({ location_id: v })} />
            </View>
          </Row>
          <Row gap={8}>
            <Badge tone={interstate ? 'info' : 'neutral'}>{interstate ? 'Inter-state · IGST' : 'Same state · CGST + SGST'}</Badge>
            <Button title="Toggle" tone="ghost" size="sm" onPress={() => patch({ is_interstate: !interstate })} />
          </Row>
        </FormSection>

        <SectionTitle>Maal · {(lines ?? []).length}</SectionTitle>
        {!isReturn ? (
          <Card>
            <VariantPicker onPick={addLine} showCost locationId={doc.location_id} autoFocus={false}
                canCreate={can('catalog.edit')}
                onCreate={(text) =>
                  router.push(
                    `/admin/item?name=${encodeURIComponent(text)}&back=${encodeURIComponent(`/purchase/edit?id=${doc.id}`)}`
                  )
                }
              />
          </Card>
        ) : null}
        {(lines ?? []).map((l, i) => {
          const tl = totals.taxed[i];
          return (
            <LineCard key={l.id} title={l.description} subtitle={`HSN ${l.hsn_code ?? '—'} · GST ${l.tax_rate_pct}%`} onRemove={() => deleteRow(db, 'purchase_lines', l.id)}>
              <Row gap={12} wrap>
                <View style={{ flex: 1, minWidth: 90 }}><NumberField label={`Qty${l.unit_code ? ` (${l.unit_code})` : ''}`} value={l.qty} onChange={(v) => patchLine(l.id, { qty: v ?? 0 })} decimals={3} /></View>
                <View style={{ flex: 1, minWidth: 110 }}><NumberField label="Rate (GST se pehle)" value={l.rate} onChange={(v) => patchLine(l.id, { rate: v ?? 0 })} /></View>
                <View style={{ flex: 1, minWidth: 90 }}><NumberField label="Chhoot %" value={l.discount_pct} onChange={(v) => patchLine(l.id, { discount_pct: v ?? 0 })} /></View>
                <View style={{ flex: 1, minWidth: 90 }}><NumberField label="GST %" value={l.tax_rate_pct} onChange={(v) => patchLine(l.id, { tax_rate_pct: v ?? 0 })} /></View>
                {!isReturn ? <View style={{ flex: 1, minWidth: 90 }}><NumberField label="MRP" value={l.mrp ?? null} onChange={(v) => patchLine(l.id, { mrp: v })} /></View> : null}
              </Row>
              {!isReturn ? (
                <Row gap={12}>
                  <Input containerStyle={{ flex: 1 }} label="Batch" value={l.batch_no ?? ''} onChangeText={(v) => patchLine(l.id, { batch_no: v || null })} />
                  <View style={{ flex: 1 }}><NumberField label="Warranty (mahine)" value={l.warranty_months ?? null} onChange={(v) => patchLine(l.id, { warranty_months: v })} decimals={0} /></View>
                </Row>
              ) : null}
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="small" color="textMuted">Taxable {formatINR(tl?.taxable_value ?? 0)} · tax {formatINR(tl?.tax_total ?? 0)} · landed {formatINR(totals.landed[i] ?? 0)}/unit</Text>
                <Text mono style={{ fontWeight: '600' }}>{formatINR(tl?.line_total ?? 0)}</Text>
              </Row>
            </LineCard>
          );
        })}

        <FormSection title="Total">
          <NumberField label="Bhada / aur kharcha (har item ke cost mein bat jaayega)" value={doc.other_charges} onChange={(v) => patch({ other_charges: v ?? 0 })} />
          <Input label="Note" value={doc.notes ?? ''} onChangeText={(v) => patch({ notes: v })} />
          <Divider />
          <KV k="Subtotal" v={formatINR(totals.totals.subtotal)} mono />
          {totals.totals.discount_total ? <KV k="Chhoot" v={`- ${formatINR(totals.totals.discount_total)}`} mono /> : null}
          <KV k="Taxable" v={formatINR(totals.totals.taxable_total)} mono />
          {interstate ? <KV k="IGST" v={formatINR(totals.totals.igst_total)} mono /> : <><KV k="CGST" v={formatINR(totals.totals.cgst_total)} mono /><KV k="SGST" v={formatINR(totals.totals.sgst_total)} mono /></>}
          {doc.other_charges ? <KV k="Aur kharcha" v={formatINR(doc.other_charges)} mono /> : null}
          {totals.totals.round_off ? <KV k="Round off" v={formatINR(totals.totals.round_off, { paise: true })} mono /> : null}
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="title">Poora total</Text>
            <Text variant="number" mono>{formatINR(totals.totals.grand_total)}</Text>
          </Row>
        </FormSection>

        <Row gap={space.sm}>
          <Button title={isReturn ? 'Post debit note' : 'Post purchase'} size="lg" onPress={post} loading={posting} style={{ flex: 1 }} />
          <Button title="Chhod do" tone="danger" onPress={discard} />
        </Row>
        <Text variant="small" color="textFaint">Adhoore bill likhte hi is phone par save hote rehte hain, aur baaki sab ki tarah sync ho jaate hain.</Text>
      </Screen>
    </>
  );
}
