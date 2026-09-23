/**
 * Bill editor (and return / credit note against a bill).
 *
 *   Choose customer → scan or search items → price (last price for this
 *   customer prefilled, else the admin price) → cash / online / udhaar → post.
 *
 * GST is only applied when the owner turns it on in Settings.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { checkCredit, checkPrice, formatINR, isInterstate, resolvePrice, toDateString } from '@domain';

import { CUSTOMER_LAST_RATE, CUSTOMER_PRICE_CONTEXT } from '@/lib/queries';
import { postInvoice, totalLines, type DraftLine } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { useShopSettings } from '@/lib/use-settings';
import { deleteRow, insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Divider, Input, KV, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';
import { FormSection, NumberField, SelectField, confirm, notify } from '@/ui/forms';
import { LineCard, VariantPicker, type PickedVariant } from '@/ui/lines';
import { space } from '@/ui/theme';
import { PreparingDraft } from '@/ui/pending';

type Inv = { id: string; doc_type: 'invoice' | 'credit_note'; status: string; customer_id: string | null; customer_vehicle_id: string | null; location_id: string | null; price_list_id: string | null; doc_date: string; is_interstate: number; place_of_supply_state: string | null; other_charges: number; payment_mode: string | null; credit_days: number; notes: string | null; against_invoice_id: string | null; salesperson_id: string | null };
type Line = DraftLine & { invoice_id: string; line_no: number; list_price: number | null; price_source: string | null; override_approved_by: string | null; return_condition: string | null; return_note: string | null; sku: string; avg_cost: number; min_selling_price: number | null; last_purchase_cost: number; retail_price: number; dealer_price: number | null; wholesale_price: number | null; here: number };
type Customer = { id: string; name: string; mobile: string | null; state_code: string | null; gstin: string | null; price_list_id: string | null; credit_limit: number; credit_days: number; customer_type: string; balance: number };

/** A rate equal to the resolved approved/last price is pre-approved; the floor only guards manual changes. */
function needsFloorCheck(l: { rate: number; list_price: number | null; price_source: string | null }): boolean {
  return !(l.price_source && l.price_source !== 'manual' && l.list_price != null && Math.abs(l.rate - l.list_price) < 0.005);
}

const MODES = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'Online / UPI' }, { value: 'credit', label: 'Udhaar (pay later)' },
  { value: 'card', label: 'Card' }, { value: 'bank', label: 'Bank transfer' }, { value: 'mixed', label: 'Part payment (record separately)' },
];

export default function InvoiceEdit() {
  const { id: paramId, against, customer: customerParam } = useLocalSearchParams<{ id?: string; against?: string; customer?: string }>();
  const router = useRouter();
  const t = useTheme();
  const { db } = useSystem();
  const { can, actor, locationId, profile } = useSession();
  const shop = useShopSettings();

  const [id, setId] = useState<string | null>(paramId ?? null);
  const [creating, setCreating] = useState(false);
  const [posting, setPosting] = useState(false);

  const { data: rows } = useQuery<Inv>('SELECT * FROM sales_invoices WHERE id = ?', [id ?? '']);
  const doc = rows?.[0] ?? null;
  const { data: lines } = useQuery<Line>(
    `SELECT l.*, pv.sku, pv.avg_cost, pv.min_selling_price, pv.last_purchase_cost, pv.retail_price, pv.dealer_price, pv.wholesale_price,
            COALESCE((SELECT qty FROM stock_on_hand sl WHERE sl.variant_id = l.variant_id AND sl.location_id = i.location_id), 0) AS here
     FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.invoice_id JOIN product_variants pv ON pv.id = l.variant_id WHERE l.invoice_id = ? ORDER BY l.line_no`, [id ?? '']);
  const { data: customers } = useQuery<Customer>(`SELECT c.id, c.name, c.mobile, c.state_code, c.gstin, c.price_list_id, c.credit_limit, c.credit_days, c.customer_type, COALESCE(pb.balance,0) AS balance FROM customers c LEFT JOIN party_balance_live pb ON pb.party_type='customer' AND pb.party_id=c.id WHERE c.is_active=1 ORDER BY c.name`);
  const customer = customers?.find((c) => c.id === doc?.customer_id) ?? null;
  const { data: vehicles } = useQuery<{ id: string; registration_no: string; model_name: string | null; model_id: string | null }>('SELECT cv.id, cv.registration_no, vm.name AS model_name, vm.id AS model_id FROM customer_vehicles cv LEFT JOIN vehicle_models vm ON vm.id = cv.model_id WHERE cv.customer_id = ? ORDER BY cv.registration_no', [doc?.customer_id ?? '']);
  const { data: locations } = useQuery<{ id: string; name: string }>("SELECT id, name FROM locations WHERE is_active = 1 AND type <> 'damaged' ORDER BY sort_order");
  const { data: original } = useQuery<{ id: string; doc_no: string; customer_id: string; location_id: string; is_interstate: number; price_list_id: string | null }>('SELECT id, doc_no, customer_id, location_id, is_interstate, price_list_id FROM sales_invoices WHERE id = ?', [against ?? '']);
  const { data: originalLines } = useQuery<Line & { returned: number }>(
    `SELECT l.*, pv.sku, pv.avg_cost, pv.min_selling_price, pv.last_purchase_cost, pv.retail_price, pv.dealer_price, pv.wholesale_price, 0 AS here,
            COALESCE((SELECT SUM(x.qty) FROM sales_invoice_lines x JOIN sales_invoices ix ON ix.id = x.invoice_id WHERE x.against_line_id = l.id AND ix.status <> 'cancelled'), 0) AS returned
     FROM sales_invoice_lines l JOIN product_variants pv ON pv.id = l.variant_id WHERE l.invoice_id = ? ORDER BY l.line_no`, [against ?? '']);

  const gst = shop.gstEnabled;
  const negativeOk = shop.allowNegativeStock;

  useEffect(() => {
    if (id || creating || !locationId) return;
    setCreating(true);
    (async () => {
      const base = original?.[0];
      const newId = await insertRow(db, 'sales_invoices', {
        doc_type: against ? 'credit_note' : 'invoice', doc_date: toDateString(), customer_id: base?.customer_id ?? (customerParam || null), location_id: base?.location_id ?? locationId,
        price_list_id: base?.price_list_id ?? null, is_interstate: base?.is_interstate ?? false, other_charges: 0, payment_mode: 'credit', credit_days: 0, status: 'draft',
        against_invoice_id: against || null, salesperson_id: profile?.id ?? null,
      }, actor);
      if (against && originalLines) {
        for (const ol of originalLines) {
          const remaining = ol.qty - ol.returned;
          if (remaining <= 0) continue;
          await insertRow(db, 'sales_invoice_lines', { invoice_id: newId, line_no: ol.line_no, variant_id: ol.variant_id, description: ol.description, hsn_code: ol.hsn_code, qty: remaining, unit_code: ol.unit_code, mrp: ol.mrp, list_price: ol.list_price, rate: ol.rate, discount_pct: ol.discount_pct, discount_amt: 0, tax_rate_pct: ol.tax_rate_pct, price_source: ol.price_source, return_condition: 'sellable', against_line_id: ol.id });
        }
      }
      setId(newId);
    })().catch((e) => notify(String(e)));
  }, [id, creating, locationId, db, actor, against, original, originalLines, customerParam, profile?.id]);

  const interstate = gst && !!doc?.is_interstate;
  const totals = useMemo(() => totalLines(lines ?? [], interstate, doc?.other_charges ?? 0, shop.company?.round_to_rupee !== 0), [lines, interstate, doc?.other_charges, shop.company]);
  const credit = useMemo(() => checkCredit({ outstanding: customer?.balance ?? 0, creditLimit: customer?.credit_limit ?? 0, invoiceAmount: doc?.payment_mode === 'credit' ? totals.totals.grand_total : 0 }), [customer, doc?.payment_mode, totals.totals.grand_total]);

  const patch = (p: Record<string, string | number | boolean | null>) => id && updateRow(db, 'sales_invoices', id, p);

  /** Last price this customer paid → admin price. */
  async function priceFor(cid: string | null, v: { id: string; retail_price: number; dealer_price?: number | null; wholesale_price?: number | null; min_selling_price?: number | null; avg_cost?: number | null; last_purchase_cost?: number | null }) {
    if (cid) {
      const last = await db.getOptional<{ rate: number }>(CUSTOMER_LAST_RATE.sql, [cid, v.id]);
      if (last) return { price: last.rate, source: 'last' as const };
    }
    const ctx = await db.getOptional<{ customer_price: number | null; price_list_item_price: number | null; price_list_column: string | null }>(CUSTOMER_PRICE_CONTEXT.sql, [cid ?? '', v.id]);
    const r = resolvePrice(v, { customerPrice: ctx?.customer_price, priceListItemPrice: ctx?.price_list_item_price, priceListColumn: (ctx?.price_list_column as 'retail_price' | 'dealer_price' | 'wholesale_price' | null) ?? null });
    return { price: r.price, source: r.source };
  }

  async function chooseCustomer(cid: string | null) {
    const c = customers?.find((x) => x.id === cid);
    await patch({ customer_id: cid, customer_vehicle_id: null, price_list_id: c?.price_list_id ?? null, place_of_supply_state: c?.state_code ?? null, is_interstate: isInterstate(shop.company?.state_code, c?.state_code), credit_days: c?.credit_days ?? 0 });
    for (const l of lines ?? []) {
      const p = await priceFor(cid, l);
      await updateRow(db, 'sales_invoice_lines', l.id, { list_price: p.price, rate: p.price, price_source: p.source, override_approved_by: null });
    }
  }

  async function addLine(v: PickedVariant) {
    if (!id) return;
    const existing = (lines ?? []).find((l) => l.variant_id === v.id);
    if (existing) { await updateRow(db, 'sales_invoice_lines', existing.id, { qty: existing.qty + 1 }); return; }
    const p = await priceFor(doc?.customer_id ?? null, v);
    await insertRow(db, 'sales_invoice_lines', {
      invoice_id: id, line_no: (lines?.length ?? 0) + 1, variant_id: v.id, description: `${v.product_name} ${v.variant_name}`, hsn_code: v.hsn_code ?? null, qty: 1, unit_code: v.unit_code ?? null,
      mrp: v.mrp, list_price: p.price, rate: p.price, discount_pct: 0, discount_amt: 0, tax_rate_pct: gst ? (v.tax_rate_pct ?? 0) : 0, price_source: p.source,
    });
  }

  async function setRate(l: Line, rate: number | null) {
    const r = rate ?? 0;
    const check = checkPrice(r, l, {});
    let approvedBy: string | null = null;
    if (check.needsApproval) {
      if (can('sale.override_price')) approvedBy = profile?.id ?? null;
      else notify(`${check.message} Owner/admin approval needed.`);
    }
    await updateRow(db, 'sales_invoice_lines', l.id, { rate: r, price_source: Math.abs(r - (l.list_price ?? -1)) < 0.005 ? l.price_source : 'manual', override_approved_by: approvedBy });
  }

  async function post() {
    if (!id || !doc) return;
    if (!doc.customer_id) { notify('Choose the customer.'); return; }
    if (!(lines ?? []).length) { notify('Add at least one item.'); return; }
    for (const l of lines ?? []) {
      if (l.qty <= 0) { notify(`${l.description}: quantity must be positive.`); return; }
      if (l.rate <= 0 && doc.doc_type === 'invoice') { notify(`${l.description}: enter the price.`); return; }
      const check = needsFloorCheck(l) ? checkPrice(l.rate, l, {}) : null;
      if (check?.needsApproval && !l.override_approved_by) { notify(`${l.description}: ${check.message} Owner/admin approval needed.`); return; }
      if (doc.doc_type === 'invoice' && !negativeOk && l.qty > l.here) { notify(`${l.description}: only ${l.here} at this location.`); return; }
      if (doc.doc_type === 'credit_note') {
        const ol = originalLines?.find((x) => x.id === l.against_line_id);
        if (ol && l.qty > ol.qty - ol.returned) { notify(`${l.description}: only ${ol.qty - ol.returned} can still be returned.`); return; }
      }
    }
    let creditOverrideBy: string | null = null;
    if (doc.doc_type === 'invoice' && credit.exceeded) {
      if (!can('sale.override_credit')) { notify(`${credit.message} Owner/admin approval needed.`); return; }
      if (!(await confirm('Credit limit exceeded', `${credit.message}\n\nPost anyway with your approval?`))) return;
      creditOverrideBy = profile?.id ?? null;
    }
    const isCN = doc.doc_type === 'credit_note';
    // When negative stock is NOT allowed, the loop above already refuses the
    // post outright. When it is allowed — the default, because an offline phone
    // may not know the latest stock — the bill used to go through in complete
    // silence and the stock drifted negative with nothing said. This is that
    // missing word: it asks, it does not block.
    if (!isCN && negativeOk) {
      const short = (lines ?? [])
        .filter((l) => l.variant_id && l.qty > l.here)
        .map((l) => `${l.description}: stock ${l.here}, bill ${l.qty}`);
      if (short.length) {
        const ok = await confirm(
          'Stock kam hai',
          `${short.join('\n')}\n\nPhir bhi bill banayein? Stock minus mein chala jayega.`,
        );
        if (!ok) return;
      }
    }

    if (!(await confirm(isCN ? 'Post return?' : 'Post bill?', `${formatINR(totals.totals.grand_total)} · ${customer?.name} · ${MODES.find((m) => m.value === doc.payment_mode)?.label ?? doc.payment_mode}. The bill number is assigned now.`))) return;
    setPosting(true);
    try {
      let docNo = '';
      await db.writeTransaction(async (tx) => { docNo = await postInvoice(tx, id, actor, { creditOverrideBy }); });
      router.replace(`/invoice/${id}`);
      notify(`Posted ${docNo}`);
    } catch (e) { notify(`Could not post: ${(e as Error).message}`); } finally { setPosting(false); }
  }

  async function discard() {
    if (!id || !(await confirm('Discard draft?', 'The draft and its lines will be deleted.'))) return;
    await db.writeTransaction(async (tx) => { await tx.execute('DELETE FROM sales_invoice_lines WHERE invoice_id = ?', [id]); await deleteRow(tx, 'sales_invoices', id); });
    router.back();
  }

  if (!can('sale.create')) return <Screen><Text>You do not have permission to bill.</Text></Screen>;
  if (!doc) return <PreparingDraft what="bill" />;
  if (doc.status !== 'draft') { router.replace(`/invoice/${doc.id}`); return null; }
  const isCN = doc.doc_type === 'credit_note';
  const showCost = can('catalog.view_cost');
  const sourceLabel: Record<string, string> = { last: 'last price', customer: 'special price', price_list: 'list price', dealer: 'dealer price', wholesale: 'wholesale price', retail: 'admin price', manual: 'typed' };

  return (
    <>
      <Stack.Screen options={{ title: isCN ? 'Return' : 'New bill' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }} align="flex-start">
          <Text variant="display">{isCN ? 'Return / credit' : gst ? 'Naya invoice' : 'Naya bill'}</Text>
          <Text variant="mono" color="textFaint">{doc.status}</Text>
        </Row>
        {isCN && original?.[0] ? <Text variant="small" color="textMuted">Against {original[0].doc_no}. Reduce quantities to what came back and mark faulty items so they stay out of sellable stock.</Text> : null}

        <FormSection title="Customer">
          <SelectField label="Customer" value={doc.customer_id} options={(customers ?? []).map((c) => ({ value: c.id, label: c.name, sublabel: `${c.customer_type}${c.balance ? ` · ${formatINR(c.balance)} pending` : ''}` }))} onChange={chooseCustomer} onCreate={() => router.push('/customer/edit')} />
          {customer ? <CreditBlock customer={customer} credit={credit} gst={gst} interstate={interstate} /> : null}
          {customer && (vehicles ?? []).length ? <SelectField label="Vehicle (optional)" value={doc.customer_vehicle_id} options={(vehicles ?? []).map((v) => ({ value: v.id, label: v.registration_no, sublabel: v.model_name ?? undefined }))} onChange={(v) => patch({ customer_vehicle_id: v })} allowClear /> : null}
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="Date" value={doc.doc_date} onChangeText={(v) => patch({ doc_date: v })} />
            <View style={{ flex: 1 }}><SelectField label="Stock from" value={doc.location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => patch({ location_id: v })} /></View>
          </Row>
        </FormSection>

        <SectionTitle>Items · {(lines ?? []).length}</SectionTitle>
        {!isCN ? <Card><VariantPicker onPick={addLine} showPrice locationId={doc.location_id} autoFocus={false}
                canCreate={can('catalog.edit')}
                onCreate={(text) =>
                  router.push(
                    `/admin/item?name=${encodeURIComponent(text)}&back=${encodeURIComponent(`/invoice/edit?id=${doc.id}`)}`
                  )
                }
              /></Card> : null}
        {(lines ?? []).map((l, i) => {
          const tl = totals.taxed[i];
          const check = needsFloorCheck(l) ? checkPrice(l.rate, l, {}) : { ok: true, severity: 'ok' as const, message: null, needsApproval: false };
          return (
            <LineCard key={l.id} title={l.description} subtitle={`${l.sku} · ${l.here} in stock${gst ? ` · GST ${l.tax_rate_pct}%` : ''}`} onRemove={() => deleteRow(db, 'sales_invoice_lines', l.id)}
              right={l.price_source && l.price_source !== 'manual' ? <Badge tone={l.price_source === 'last' ? 'info' : 'accent'}>{sourceLabel[l.price_source] ?? l.price_source}</Badge> : l.override_approved_by ? <Badge tone="warn">approved</Badge> : null}>
              <Row gap={12} wrap>
                <View style={{ flex: 1, minWidth: 90 }}><NumberField label={`Qty${l.unit_code ? ` (${l.unit_code})` : ''}`} value={l.qty} onChange={(v) => updateRow(db, 'sales_invoice_lines', l.id, { qty: v ?? 0 })} decimals={3} error={!isCN && !negativeOk && l.qty > l.here ? `Only ${l.here} here` : null} /></View>
                <View style={{ flex: 1.2, minWidth: 120 }}><NumberField label="Price" value={l.rate} onChange={(v) => setRate(l, v)} error={check.severity === 'floor' || check.severity === 'cost' ? check.message : null} hint={l.list_price != null && Math.abs(l.rate - l.list_price) > 0.005 ? `Was ${formatINR(l.list_price)}` : undefined} /></View>
                <View style={{ flex: 1, minWidth: 90 }}><NumberField label="Disc %" value={l.discount_pct} onChange={(v) => updateRow(db, 'sales_invoice_lines', l.id, { discount_pct: v ?? 0 })} /></View>
                {gst ? <View style={{ flex: 1, minWidth: 80 }}><NumberField label="GST %" value={l.tax_rate_pct} onChange={(v) => updateRow(db, 'sales_invoice_lines', l.id, { tax_rate_pct: v ?? 0 })} /></View> : null}
              </Row>
              {isCN ? (
                <>
                  <Row gap={8} align="center" wrap>
                    <Text variant="label" color="textMuted">Condition</Text>
                    <Chip label="Good · back to stock" selected={l.return_condition !== 'damaged'} onPress={() => updateRow(db, 'sales_invoice_lines', l.id, { return_condition: 'sellable' })} />
                    <Chip label="Faulty / damaged" selected={l.return_condition === 'damaged'} onPress={() => updateRow(db, 'sales_invoice_lines', l.id, { return_condition: 'damaged' })} />
                  </Row>
                  <Input label="Return note" value={l.return_note ?? ''} onChangeText={(v) => updateRow(db, 'sales_invoice_lines', l.id, { return_note: v || null })} placeholder="Wrong size · one bulb not working · box damaged" />
                </>
              ) : null}
              {doc.customer_id && !isCN && l.price_source !== 'last' ? <LastRate customerId={doc.customer_id} variantId={l.variant_id} currentRate={l.rate} /> : null}
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="small" color="textMuted">{gst ? `Taxable ${formatINR(tl?.taxable_value ?? 0)} · tax ${formatINR(tl?.tax_total ?? 0)}` : `${l.qty} × ${formatINR(l.rate)}`}{showCost ? ` · margin ${formatINR((l.rate * (1 - l.discount_pct / 100) - l.avg_cost) * l.qty)}` : ''}</Text>
                <Text mono style={{ fontWeight: '600' }}>{formatINR(tl?.line_total ?? 0)}</Text>
              </Row>
            </LineCard>
          );
        })}

        <FormSection title="Payment & total">
          {!isCN ? (
            <>
              <Text variant="label" color="textMuted">Payment</Text>
              <Row gap={space.xs} wrap>{MODES.map((m) => <Chip key={m.value} label={m.label} selected={doc.payment_mode === m.value} onPress={() => patch({ payment_mode: m.value })} />)}</Row>
            </>
          ) : null}
          {doc.payment_mode === 'credit' && !isCN && customer?.credit_days ? <Text variant="small" color="textFaint">Due in {doc.credit_days || customer.credit_days} days</Text> : null}
          {credit.exceeded && doc.payment_mode === 'credit' ? <Card tone="alt" style={{ borderColor: t.danger }}><Text color="danger">{credit.message}</Text></Card> : null}
          <NumberField label="Other charges (delivery, fitting)" value={doc.other_charges} onChange={(v) => patch({ other_charges: v ?? 0 })} />
          <Input label="Note on bill" value={doc.notes ?? ''} onChangeText={(v) => patch({ notes: v })} placeholder={isCN ? 'Why returned' : 'Delivered by Ramesh · evening'} />
          <Divider />
          {totals.totals.discount_total ? <KV k="Discount" v={`- ${formatINR(totals.totals.discount_total)}`} mono /> : null}
          {gst ? (<><KV k="Taxable" v={formatINR(totals.totals.taxable_total)} mono />{interstate ? <KV k="IGST" v={formatINR(totals.totals.igst_total)} mono /> : <><KV k="CGST" v={formatINR(totals.totals.cgst_total)} mono /><KV k="SGST" v={formatINR(totals.totals.sgst_total)} mono /></>}</>) : null}
          {doc.other_charges ? <KV k="Other charges" v={formatINR(doc.other_charges)} mono /> : null}
          {totals.totals.round_off ? <KV k="Round off" v={formatINR(totals.totals.round_off, { paise: true })} mono /> : null}
          <View style={{ borderTopWidth: 1.5, borderTopColor: t.keyline, paddingTop: space.md, marginTop: space.xs }}>
            <Row style={{ justifyContent: 'space-between' }} align="center">
              <Text variant="title">{isCN ? 'Credit' : 'Total'}</Text>
              <Text variant="mono" style={{ fontSize: 27, lineHeight: 32, fontWeight: '600' }}>{formatINR(totals.totals.grand_total)}</Text>
            </Row>
          </View>
        </FormSection>

        <Row gap={space.sm}>
          <Button title="Discard" tone="secondary" onPress={discard} />
          <Button title={isCN ? 'Post return' : 'Bill post karo'} size="lg" onPress={post} loading={posting} style={{ flex: 1.25 }} />
        </Row>
      </Screen>
    </>
  );
}

/**
 * What the customer already owes, right where the biller decides the rate.
 * The bar is the whole point: 84% full reads faster than two numbers do.
 */
function CreditBlock({ customer, credit, gst, interstate }: {
  customer: Customer; credit: ReturnType<typeof checkCredit>; gst: boolean; interstate: boolean;
}) {
  const t = useTheme();
  const used = customer.credit_limit > 0 ? Math.min(customer.balance / customer.credit_limit, 1) : 0;
  return (
    <Card spine="accent" style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }} align="flex-start">
        <View style={{ flex: 1 }}>
          <Text variant="label" color="textMuted">Pehle ka udhaar</Text>
          <Text variant="mono" color={customer.balance > 0 ? 'warn' : 'ok'} style={{ fontSize: 17, fontWeight: '600' }}>
            {formatINR(customer.balance)}
          </Text>
        </View>
        {customer.credit_limit ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="label" color="textMuted">Limit bachi</Text>
            <Text variant="mono" color={credit.exceeded ? 'danger' : 'text'} style={{ fontSize: 17, fontWeight: '600' }}>
              {formatINR(Math.max(customer.credit_limit - customer.balance, 0))}
            </Text>
          </View>
        ) : null}
      </Row>
      {customer.credit_limit ? (
        <View style={{ height: 5, borderRadius: 3, backgroundColor: t.bg, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(used * 100)}%`, height: 5, backgroundColor: credit.exceeded ? t.danger : t.warn }} />
        </View>
      ) : null}
      {gst ? <Text variant="small" color="textFaint">{interstate ? 'Inter-state · IGST' : 'Intra-state · CGST + SGST'}</Text> : null}
    </Card>
  );
}

function LastRate({ customerId, variantId, currentRate }: { customerId: string; variantId: string; currentRate: number }) {
  const { data } = useQuery<{ rate: number; doc_date: string; doc_no: string }>(CUSTOMER_LAST_RATE.sql, [customerId, variantId]);
  const last = data?.[0];
  if (!last) return null;
  return <Text variant="small" color={last.rate !== currentRate ? 'warn' : 'textFaint'}>Last time ₹{formatINR(last.rate, { symbol: false })} on {last.doc_date}</Text>;
}
