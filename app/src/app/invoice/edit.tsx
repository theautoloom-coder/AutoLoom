/**
 * BILL BANAO — grahak ko maal ja raha hai (and the return / credit note that
 * comes back against a bill).
 *
 *   Choose customer → scan or search items → price (last price for this
 *   customer prefilled, else the admin price) → cash / online / udhaar → post.
 *
 * GST is only applied when the owner turns it on in Settings.
 */
import { useQuery } from '@powersync/react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { checkCredit, checkPrice, formatINR, isDateString, isInterstate, resolvePrice, statusLabel, toDateString } from '@domain';

import { takeBack } from '@/lib/hand-back';
import { CUSTOMER_LAST_RATE, CUSTOMER_PRICE_CONTEXT } from '@/lib/queries';
import { postInvoice, totalLines, type DraftLine } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { useShopSettings } from '@/lib/use-settings';
import { customerTypeLabel } from '@/lib/words';
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
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'Online / UPI' }, { value: 'credit', label: 'Udhaar' },
  { value: 'card', label: 'Card' }, { value: 'bank', label: 'Bank' }, { value: 'mixed', label: 'Kuch abhi, kuch baad mein' },
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
    // A wapasi has to wait for the bill it is against. This effect used to run
    // on the first render, before the two useQuery calls had come back, so
    // `original` and `originalLines` were both undefined: the credit note was
    // created with no grahak and none of the sold lines copied across. Then it
    // set creating = true and never ran again, and because a credit note
    // deliberately has no item picker, there was no way to add a line by hand
    // either. Every return was a dead end — MAAL · 0, total ₹0, button
    // disabled — and each visit left another empty draft behind.
    if (against && (original === undefined || originalLines === undefined)) return;
    setCreating(true);
    (async () => {
      const base = original?.[0];
      const newId = await insertRow(db, 'sales_invoices', {
        doc_type: against ? 'credit_note' : 'invoice', doc_date: toDateString(), customer_id: base?.customer_id ?? (customerParam || null), location_id: base?.location_id ?? locationId,
        price_list_id: base?.price_list_id ?? null, is_interstate: base?.is_interstate ?? false, other_charges: 0,
        // Cash, not credit. Every new bill used to open on Udhaar, so a bill
        // made by tapping straight through went into the grahak's khata as
        // money owed — money the shop had actually taken in hand. The books
        // then showed receivables that were never receivable, and the owner
        // chased people who had already paid. A counter sale is cash until
        // somebody says otherwise.
        payment_mode: 'cash', credit_days: 0, status: 'draft',
        against_invoice_id: against || null, salesperson_id: profile?.id ?? null,
      }, actor);
      if (against && originalLines) {
        for (const ol of originalLines) {
          const remaining = ol.qty - ol.returned;
          if (remaining <= 0) continue;
          await insertRow(db, 'sales_invoice_lines', { invoice_id: newId, line_no: ol.line_no, variant_id: ol.variant_id, description: ol.description, hsn_code: ol.hsn_code, qty: remaining, unit_code: ol.unit_code, mrp: ol.mrp, list_price: ol.list_price, rate: ol.rate, discount_pct: ol.discount_pct, discount_amt: 0, tax_rate_pct: ol.tax_rate_pct, price_source: ol.price_source, return_condition: 'sellable', against_line_id: ol.id });
        }
      }
      createdHere.current = newId;
      setId(newId);
    })().catch((e) => notify(`Naya bill nahi khula: ${String((e as Error).message ?? e)}`, 'danger'));
  }, [id, creating, locationId, db, actor, against, original, originalLines, customerParam, profile?.id]);

  // Opening Bill Banao makes a draft at once, so the screen has something to
  // write lines into. Backing out without adding anything left that empty
  // draft behind — on the phone and, once synced, on the server — one per
  // visit. A draft this screen made, still empty when the screen goes, is
  // removed. One opened from the list (?id=) is never touched: its lines may
  // simply not have loaded yet.
  const createdHere = useRef<string | null>(null);
  const leftEmpty = useRef(false);
  leftEmpty.current = doc?.status === 'draft' && lines !== undefined && lines.length === 0;
  useEffect(() => () => {
    const draft = createdHere.current;
    if (draft && leftEmpty.current) {
      db.writeTransaction((tx) => deleteRow(tx, 'sales_invoices', draft)).catch(() => {});
    }
  }, [db]);

  const interstate = gst && !!doc?.is_interstate;
  const totals = useMemo(() => totalLines(lines ?? [], interstate, doc?.other_charges ?? 0, shop.company?.round_to_rupee !== 0), [lines, interstate, doc?.other_charges, shop.company]);
  const credit = useMemo(() => checkCredit({ outstanding: customer?.balance ?? 0, creditLimit: customer?.credit_limit ?? 0, invoiceAmount: doc?.payment_mode === 'credit' ? totals.totals.grand_total : 0 }), [customer, doc?.payment_mode, totals.totals.grand_total]);

  const patch = (p: Record<string, string | number | boolean | null>) => id && updateRow(db, 'sales_invoices', id, p);

  // Back from "+ Naya banao" with a grahak made for this bill: choose them.
  useFocusEffect(
    React.useCallback(() => {
      if (!id) return;
      const made = takeBack('customer');
      if (made) void chooseCustomer(made);
      // chooseCustomer reads lines and customers; re-running is harmless,
      // takeBack hands the id over only once.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, lines, customers]),
  );

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
    // A customer made a moment ago from this bill may not be in the list yet.
    const c = customers?.find((x) => x.id === cid)
      ?? (cid ? await db.getOptional<Customer>('SELECT id, name, state_code, price_list_id, credit_days FROM customers WHERE id = ?', [cid]) : null)
      ?? undefined;
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
      else notify(`${check.message} Owner ya admin se approve karwao.`);
    }
    await updateRow(db, 'sales_invoice_lines', l.id, { rate: r, price_source: Math.abs(r - (l.list_price ?? -1)) < 0.005 ? l.price_source : 'manual', override_approved_by: approvedBy });
  }

  async function post() {
    if (!id || !doc) return;
    if (!doc.customer_id) { notify('Grahak chuno.'); return; }
    // See isDateString: a blank date is discarded by the sync long after the
    // screen has said the bill was made.
    if (!isDateString(doc.doc_date)) { notify('Tareekh theek nahi hai — YYYY-MM-DD likho, jaise 2026-09-30.', 'danger'); return; }
    if (!(lines ?? []).length) { notify('Kam se kam ek item daalo.'); return; }
    for (const l of lines ?? []) {
      if (l.qty <= 0) { notify(`${l.description}: qty zero se zyada honi chahiye.`); return; }
      if (l.rate <= 0 && doc.doc_type === 'invoice') { notify(`${l.description}: rate daalo.`); return; }
      const check = needsFloorCheck(l) ? checkPrice(l.rate, l, {}) : null;
      if (check?.needsApproval && !l.override_approved_by) { notify(`${l.description}: ${check.message} Owner ya admin se approve karwao.`); return; }
      if (doc.doc_type === 'invoice' && !negativeOk && l.qty > l.here) { notify(`${l.description}: yahan sirf ${l.here} pade hain.`); return; }
      if (doc.doc_type === 'credit_note') {
        const ol = originalLines?.find((x) => x.id === l.against_line_id);
        if (ol && l.qty > ol.qty - ol.returned) { notify(`${l.description}: sirf ${ol.qty - ol.returned} hi aur wapas ho sakte hain.`); return; }
      }
    }
    let creditOverrideBy: string | null = null;
    if (doc.doc_type === 'invoice' && credit.exceeded) {
      if (!can('sale.override_credit')) { notify(`${credit.message} Owner ya admin se approve karwao.`); return; }
      if (!(await confirm('Udhaar ki limit paar ho gayi', `${credit.message}\n\nAapki approval par phir bhi post karein?`))) return;
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

    if (!(await confirm(isCN ? 'Wapasi likh dein?' : 'Bill bana dein?', `${formatINR(totals.totals.grand_total)} · ${customer?.name} · ${MODES.find((m) => m.value === doc.payment_mode)?.label ?? doc.payment_mode}. Bill number abhi lag jaayega.`))) return;
    setPosting(true);
    try {
      let docNo = '';
      await db.writeTransaction(async (tx) => { docNo = await postInvoice(tx, id, actor, { creditOverrideBy }); });
      router.replace(`/invoice/${id}`);
      notify(isCN ? `Wapasi ${docNo} likh di.` : `Bill ${docNo} ban gaya.`, 'ok');
    } catch (e) { notify(`Bill nahi bana: ${(e as Error).message}. Dobara koshish karo.`, 'danger'); } finally { setPosting(false); }
  }

  async function discard() {
    if (!id || !(await confirm('Adhoora bill chhod dein?', 'Ye adhoora bill aur iski saari line mit jaayengi. Wapas nahi aayengi.'))) return;
    await db.writeTransaction(async (tx) => { await tx.execute('DELETE FROM sales_invoice_lines WHERE invoice_id = ?', [id]); await deleteRow(tx, 'sales_invoices', id); });
    router.back();
  }

  if (!can('sale.create')) return <Screen><Text>Aapko bill banane ki permission nahi hai.</Text></Screen>;
  if (!doc) return <PreparingDraft what="bill" />;
  if (doc.status !== 'draft') { router.replace(`/invoice/${doc.id}`); return null; }
  const isCN = doc.doc_type === 'credit_note';
  const showCost = can('catalog.view_cost');
  // The two things post() refuses outright and no amount of retrying fixes.
  // Everything else it checks needs a message, so it stays inside post().
  const canPost = !!doc.customer_id && (lines ?? []).length > 0;

  // The cost of the maal on this bill, from each variant's moving average —
  // the same figure posting is about to stamp on the stock movement, so the
  // profit shown here is the profit Hisab will report later.
  const costOfGoods = (lines ?? []).reduce((a, l) => a + l.qty * (l.avg_cost || 0), 0);
  const billProfit = totals.totals.grand_total - costOfGoods;
  const sourceLabel: Record<string, string> = { last: 'pichla rate', customer: 'special rate', price_list: 'list ka rate', dealer: 'dealer rate', wholesale: 'thok rate', retail: 'dukaan ka rate', manual: 'haath se' };

  return (
    <>
      <Stack.Screen options={{ title: isCN ? 'Wapasi' : 'Bill Banao' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }} align="flex-start">
          <View style={{ flex: 1 }}>
            <Text variant="display">{isCN ? 'Wapasi' : 'Bill Banao'}</Text>
            <Text variant="small" color="textMuted">
              {isCN
                ? 'Grahak jo maal wapas laaya, wo yahan likho — paisa uske khaate mein wapas jud jayega.'
                : 'Grahak ko maal de rahe ho? Yahan bill banao — stock kam hoga aur udhaar ho to khaate mein chadh jayega.'}
            </Text>
          </View>
          <Text variant="mono" color="textFaint">{statusLabel(doc.status)}</Text>
        </Row>
        {isCN && original?.[0] ? <Text variant="small" color="textMuted">Bill {original[0].doc_no} ke against. Qty utni hi rakho jitna maal sach mein wapas aaya. Jo toota ya kharab hai use "Kharab / toota hua" mark karo — wo bechne wale stock mein wapas nahi jayega.</Text> : null}

        <FormSection title="Grahak">
          <SelectField label="Kaun le raha hai" value={doc.customer_id} options={(customers ?? []).map((c) => ({ value: c.id, label: c.name, sublabel: `${customerTypeLabel(c.customer_type)}${c.balance ? ` · ${formatINR(c.balance)} baaki` : ''}` }))} onChange={chooseCustomer} onCreate={(text) => router.push({ pathname: '/customer/edit', params: { name: text, forBill: '1' } })} />
          {customer ? <CreditBlock customer={customer} credit={credit} gst={gst} interstate={interstate} /> : null}
          <Row gap={12}>
            {/* Already today's date — the draft was created with it. The job
                here is only to stop autocorrect rewriting it on the rare day
                somebody backdates a bill. */}
            <Input
              containerStyle={{ flex: 1 }}
              label="Tareekh"
              value={doc.doc_date}
              onChangeText={(v) => patch({ doc_date: v })}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />
            <View style={{ flex: 1 }}><SelectField label="Maal kahan se" value={doc.location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => patch({ location_id: v })} /></View>
          </Row>
        </FormSection>

        <SectionTitle>Maal · {(lines ?? []).length}</SectionTitle>
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
            <LineCard key={l.id} title={l.description} subtitle={`${l.sku} · stock mein ${l.here}${gst ? ` · GST ${l.tax_rate_pct}%` : ''}`} onRemove={() => deleteRow(db, 'sales_invoice_lines', l.id)}
              right={l.price_source && l.price_source !== 'manual' ? <Badge tone={l.price_source === 'last' ? 'info' : 'accent'}>{sourceLabel[l.price_source] ?? l.price_source}</Badge> : l.override_approved_by ? <Badge tone="warn">rate manzoor</Badge> : null}>
              <Row gap={12} wrap>
                <View style={{ flex: 1, minWidth: 90 }}><NumberField label={`Qty${l.unit_code ? ` (${l.unit_code})` : ''}`} value={l.qty} onChange={(v) => updateRow(db, 'sales_invoice_lines', l.id, { qty: v ?? 0 })} decimals={3} error={!isCN && !negativeOk && l.qty > l.here ? `Yahan sirf ${l.here} pade hain` : null} /></View>
                <View style={{ flex: 1.2, minWidth: 120 }}><NumberField label="Rate" value={l.rate} onChange={(v) => setRate(l, v)} error={check.severity === 'floor' || check.severity === 'cost' ? check.message : null} hint={l.list_price != null && Math.abs(l.rate - l.list_price) > 0.005 ? `Pehle ${formatINR(l.list_price)} tha` : undefined} /></View>
                <View style={{ flex: 1, minWidth: 90 }}><NumberField label="Chhoot %" value={l.discount_pct} onChange={(v) => updateRow(db, 'sales_invoice_lines', l.id, { discount_pct: v ?? 0 })} /></View>
                {gst ? <View style={{ flex: 1, minWidth: 80 }}><NumberField label="GST %" value={l.tax_rate_pct} onChange={(v) => updateRow(db, 'sales_invoice_lines', l.id, { tax_rate_pct: v ?? 0 })} /></View> : null}
              </Row>
              {isCN ? (
                <>
                  <Row gap={8} align="center" wrap>
                    <Text variant="label" color="textMuted">Maal ki haalat</Text>
                    <Chip label="Theek hai · stock mein wapas" selected={l.return_condition !== 'damaged'} onPress={() => updateRow(db, 'sales_invoice_lines', l.id, { return_condition: 'sellable' })} />
                    <Chip label="Kharab / toota hua" selected={l.return_condition === 'damaged'} onPress={() => updateRow(db, 'sales_invoice_lines', l.id, { return_condition: 'damaged' })} />
                  </Row>
                  <Input label="Wapasi ka note" value={l.return_note ?? ''} onChangeText={(v) => updateRow(db, 'sales_invoice_lines', l.id, { return_note: v || null })} placeholder="Size galat · ek bulb nahi chala · dabba toota" returnKeyType="done" />
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

        <FormSection title="Payment aur total">
          {!isCN ? (
            <>
              <Text variant="label" color="textMuted">PAISA KAISE AAYA</Text>
              <Row gap={space.xs} wrap>{MODES.map((m) => <Chip key={m.value} label={m.label} selected={doc.payment_mode === m.value} onPress={() => patch({ payment_mode: m.value })} />)}</Row>
            </>
          ) : null}
          {doc.payment_mode === 'credit' && !isCN && customer?.credit_days ? <Text variant="small" color="textFaint">{doc.credit_days || customer.credit_days} din mein paisa dena hai</Text> : null}
          {credit.exceeded && doc.payment_mode === 'credit' ? <Card tone="alt" style={{ borderColor: t.danger }}><Text color="danger">{credit.message}</Text></Card> : null}
          <NumberField label="Aur kharcha (delivery, fitting)" value={doc.other_charges} onChange={(v) => patch({ other_charges: v ?? 0 })} />
          {/* The last box on the bill, so its key is done and it posts — but
              only through the same confirm the button goes through, and only
              when the bill would have been allowed to post anyway. */}
          <Input
            label="Bill par note"
            value={doc.notes ?? ''}
            onChangeText={(v) => patch({ notes: v })}
            placeholder={isCN ? 'Kyun wapas aaya' : 'Ramesh ne pahunchaya · shaam ko'}
            returnKeyType="done"
            onSubmitEditing={() => { if (canPost && !posting) post(); }}
          />
          <Divider />
          {totals.totals.discount_total ? <KV k="Chhoot" v={`- ${formatINR(totals.totals.discount_total)}`} mono /> : null}
          {gst ? (<><KV k="Taxable" v={formatINR(totals.totals.taxable_total)} mono />{interstate ? <KV k="IGST" v={formatINR(totals.totals.igst_total)} mono /> : <><KV k="CGST" v={formatINR(totals.totals.cgst_total)} mono /><KV k="SGST" v={formatINR(totals.totals.sgst_total)} mono /></>}</>) : null}
          {doc.other_charges ? <KV k="Aur kharcha" v={formatINR(doc.other_charges)} mono /> : null}
          {totals.totals.round_off ? <KV k="Round off" v={formatINR(totals.totals.round_off, { paise: true })} mono /> : null}
          {/* What this bill is actually worth to the shop.
              Selling is grand_total — the same basis Hisab sums, so a day's
              bills and the day's Hisab can never disagree. Cost is each line's
              qty times the variant's moving average, which is what posting
              will stamp on the stock movement a moment from now. */}
          {!isCN && showCost && costOfGoods > 0 ? (
            <View style={{ gap: 2, paddingTop: space.xs }}>
              <KV k="Maal ki cost" v={formatINR(costOfGoods)} mono />
              <KV k="Bechne ka" v={formatINR(totals.totals.grand_total)} mono />
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="label" color="textMuted">Is bill par munafa</Text>
                <Text mono color={billProfit < 0 ? 'danger' : 'ok'}>{formatINR(billProfit)}</Text>
              </Row>
            </View>
          ) : null}

          <View style={{ borderTopWidth: 1.5, borderTopColor: t.keyline, paddingTop: space.md, marginTop: space.xs }}>
            <Row style={{ justifyContent: 'space-between' }} align="center">
              <Text variant="title">{isCN ? 'Credit' : 'Total'}</Text>
              <Text variant="mono" style={{ fontSize: 27, lineHeight: 32, fontWeight: '600' }}>{formatINR(totals.totals.grand_total)}</Text>
            </Row>
          </View>
        </FormSection>

        <Row gap={space.sm}>
          <Button title="Chhod do" tone="secondary" onPress={discard} />
          {/* A bill with no grahak or no maal can never post; post() only
              said so after the press. Now the button says it before. */}
          <Button title={isCN ? 'Wapasi likh do' : 'Bill bana do'} size="lg" onPress={post} loading={posting} disabled={!canPost} style={{ flex: 1.25 }} />
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
      {gst ? <Text variant="small" color="textFaint">{interstate ? 'Doosre state ka · IGST' : 'Apne state ka · CGST + SGST'}</Text> : null}
    </Card>
  );
}

function LastRate({ customerId, variantId, currentRate }: { customerId: string; variantId: string; currentRate: number }) {
  const { data } = useQuery<{ rate: number; doc_date: string; doc_no: string }>(CUSTOMER_LAST_RATE.sql, [customerId, variantId]);
  const last = data?.[0];
  if (!last) return null;
  return <Text variant="small" color={last.rate !== currentRate ? 'warn' : 'textFaint'}>Pichli baar ₹{formatINR(last.rate, { symbol: false })} · {last.doc_date}</Text>;
}
