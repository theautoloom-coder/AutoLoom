/**
 * Maal ki entry — one form for every way maal moves between AutoLoom and a
 * supplier (owner, 6 Oct 2026):
 *
 *   /purchase/edit                     a new receipt (staff mostly use Stock Chadhao)
 *   /purchase/edit?id=…                a draft: a staff entry waiting for approval,
 *   /purchase/approve?id=…               or one sent back to be fixed
 *   /purchase/edit?against=<purchase>  good maal going back against a receipt
 *   /purchase/edit?kharab=1            kharab maal going back to the supplier
 *   /purchase/edit?replace=<return>    the supplier's replacement for a return
 *
 * Only an owner or admin posts. A staff member's receipt is sent for approval
 * instead — the owner checks the count, puts the buy rate on and approves, and
 * only then does stock go up and the supplier's khata get the amount. Returns
 * are the owner's to write: they take money off a supplier's khata.
 *
 * While it waits, the staff member who wrote it can still change it (owner,
 * 7 Oct 2026): the entry stays in the queue, every change is stamped
 * revised_at, and the owner sees "bhejne ke baad badla". Someone else's entry,
 * or one already approved or refused, is read-only to staff — the server
 * enforces the same (migration 20261007140000).
 *
 * The shop keeps GST off, so the form is qty and rate. The draft is saved to
 * the phone as you go, so a half-written entry survives closing the app.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { formatINR, isDateString, toDateString } from '@domain';

import { useDropEmptyDraft } from '@/lib/drafts';
import { postPurchase, totalLines, type DraftLine } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { deleteRow, insertRow, nextPartyCode, searchText, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Divider, Empty, Input, KV, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, NumberField, SelectField, confirm, notify } from '@/ui/forms';
import { LineCard, VariantPicker, type PickedVariant } from '@/ui/lines';
import { PreparingDraft } from '@/ui/pending';
import { space } from '@/ui/theme';
import { DateField } from '@/ui/date-field';

type Purchase = {
  id: string; doc_type: 'purchase' | 'debit_note'; status: string; supplier_id: string | null; doc_date: string;
  location_id: string | null; other_charges: number; notes: string | null; against_purchase_id: string | null;
  submitted_at: string | null; submitted_by: string | null; supplier_invoice_no: string | null;
  created_by: string | null; revised_at: string | null;
};
type Line = DraftLine & { purchase_id: string; line_no: number; sku: string | null; last_cost: number; here: number; retail_price: number };
type SourceLine = DraftLine & { line_no: number; done: number };

export default function PurchaseEdit() {
  const params = useLocalSearchParams<{ id?: string; against?: string; kharab?: string; replace?: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const approver = can('purchase.approve');
  const showCost = can('catalog.view_cost');

  const [id, setId] = useState<string | null>(params.id ?? null);
  const [creating, setCreating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [backNote, setBackNote] = useState('');
  // Kisms that had no selling rate when this opened keep their rate box while
  // it is typed into — otherwise the first digit would make it disappear.
  const unpricedKisms = useRef(new Set<string>());

  const { data: rows } = useQuery<Purchase>('SELECT * FROM purchases WHERE id = ?', [id ?? '']);
  const doc = rows?.[0] ?? null;
  const { data: lines } = useQuery<Line>(
    `SELECT l.*, pv.sku, pv.retail_price, COALESCE(NULLIF(pv.last_purchase_cost, 0), pv.avg_cost, 0) AS last_cost,
            COALESCE((SELECT SUM(qty) FROM stock_on_hand s WHERE s.variant_id = l.variant_id AND s.location_id = p.location_id), 0) AS here
       FROM purchase_lines l JOIN purchases p ON p.id = l.purchase_id JOIN product_variants pv ON pv.id = l.variant_id
      WHERE l.purchase_id = ? ORDER BY l.line_no`, [id ?? '']);
  const { data: suppliers } = useQuery<{ id: string; name: string }>('SELECT id, name FROM suppliers WHERE is_active = 1 ORDER BY name');
  const { data: kharabLoc } = useQuery<{ id: string }>("SELECT id FROM locations WHERE type = 'damaged' AND is_active = 1 ORDER BY sort_order LIMIT 1");
  const { data: submitter } = useQuery<{ full_name: string }>('SELECT full_name FROM profiles WHERE id = ?', [doc?.submitted_by ?? doc?.created_by ?? '']);

  // Whatever this entry is copied from: the receipt being returned against,
  // or the return being replaced. `done` is what has already gone back / come back.
  const sourceId = params.against ?? params.replace ?? doc?.against_purchase_id ?? '';
  const { data: source, isLoading: sourceLoading } = useQuery<{ id: string; doc_no: string; doc_type: string; supplier_id: string; location_id: string; settled_at: string | null }>(
    'SELECT id, doc_no, doc_type, supplier_id, location_id, settled_at FROM purchases WHERE id = ?', [sourceId]);
  const { data: sourceLines, isLoading: sourceLinesLoading } = useQuery<SourceLine>(
    `SELECT pl.*,
            CASE WHEN p.doc_type = 'purchase'
              THEN COALESCE((SELECT SUM(x.qty) FROM purchase_lines x JOIN purchases px ON px.id = x.purchase_id
                              WHERE x.against_line_id = pl.id AND px.status = 'posted'), 0)
              ELSE COALESCE((SELECT SUM(x.qty) FROM purchase_lines x JOIN purchases px ON px.id = x.purchase_id
                              WHERE px.against_purchase_id = p.id AND px.doc_type = 'purchase' AND px.status = 'posted'
                                AND x.variant_id = pl.variant_id), 0)
            END AS done
       FROM purchase_lines pl JOIN purchases p ON p.id = pl.purchase_id
      WHERE pl.purchase_id = ? ORDER BY pl.line_no`, [sourceId]);

  // Create the draft on first open, once whatever it copies from has loaded.
  // isLoading, not `undefined`: PowerSync answers [] while it is still reading.
  const markCreated = useDropEmptyDraft(db, 'purchases');
  useEffect(() => {
    if (id || creating || !locationId) return;
    const copying = params.against || params.replace;
    if (copying && (sourceLoading || sourceLinesLoading || !source?.[0])) return;
    if (params.kharab && !kharabLoc?.[0]) return;
    setCreating(true);
    (async () => {
      const base = source?.[0];
      const isReturn = !!params.against || !!params.kharab;
      const where = params.kharab ? kharabLoc![0].id
        : params.against ? base?.location_id ?? locationId
        : locationId;
      const newId = await insertRow(db, 'purchases', {
        doc_type: isReturn ? 'debit_note' : 'purchase', doc_date: toDateString(),
        supplier_id: base?.supplier_id ?? null, location_id: where,
        is_interstate: false, other_charges: 0, status: 'draft',
        against_purchase_id: params.against || params.replace || null,
      }, actor);
      if (copying && sourceLines) {
        let n = 0;
        for (const sl of sourceLines) {
          const left = sl.qty - sl.done;
          if (left <= 0) continue;
          n += 1;
          await insertRow(db, 'purchase_lines', {
            purchase_id: newId, line_no: n, variant_id: sl.variant_id, description: sl.description,
            qty: left, unit_code: sl.unit_code, rate: sl.rate, discount_pct: 0, discount_amt: 0, tax_rate_pct: 0,
            against_line_id: params.against ? sl.id : null,
          });
        }
      }
      markCreated(newId);
      setId(newId);
    })().catch((e) => notify(String((e as Error).message ?? e), 'danger'));
  }, [id, creating, locationId, db, actor, params.against, params.replace, params.kharab, source, sourceLines, sourceLoading, sourceLinesLoading, kharabLoc, markCreated]);

  const totals = useMemo(() => totalLines(lines ?? [], false, doc?.other_charges ?? 0, true), [lines, doc?.other_charges]);
  const supplier = suppliers?.find((s) => s.id === doc?.supplier_id) ?? null;

  // A staff member's change to an entry already with the owner is stamped, so
  // the owner can see it moved after it reached the queue.
  const stamp = async () => {
    if (!approver && id && doc?.submitted_at) await updateRow(db, 'purchases', id, { revised_at: new Date().toISOString() });
  };
  const patch = async (p: Record<string, string | number | boolean | null>) => {
    if (!id) return;
    await updateRow(db, 'purchases', id, p);
    if (!('submitted_at' in p)) await stamp();
  };
  const patchLine = async (lineId: string, p: Record<string, string | number | null>) => {
    await updateRow(db, 'purchase_lines', lineId, p);
    await stamp();
  };
  const removeLine = async (lineId: string) => {
    await deleteRow(db, 'purchase_lines', lineId);
    await stamp();
  };

  async function addSupplier(name: string) {
    const sid = await insertRow(db, 'suppliers', {
      code: await nextPartyCode(db, 'suppliers'), name: name.trim(), is_active: true, search_text: searchText(name),
    }, actor);
    await patch({ supplier_id: sid, supplier_name: name.trim() });
  }

  async function addLine(v: PickedVariant) {
    if (!id) return;
    const existing = (lines ?? []).find((l) => l.variant_id === v.id);
    if (existing) { await patchLine(existing.id, { qty: existing.qty + 1 }); return; }
    await insertRow(db, 'purchase_lines', {
      purchase_id: id, line_no: (lines?.length ?? 0) + 1, variant_id: v.id, description: `${v.product_name} · ${v.variant_name}`,
      qty: 1, unit_code: v.unit_code ?? null, discount_pct: 0, discount_amt: 0, tax_rate_pct: 0,
      // A return goes back at what the maal cost; a receipt starts at the last buy rate.
      rate: showCost ? (doc?.doc_type === 'debit_note' ? v.avg_cost || v.last_purchase_cost : v.last_purchase_cost || v.avg_cost) || 0 : 0,
    });
    await stamp();
  }

  function problems(): string | null {
    if (!doc) return 'Entry abhi khuli nahi';
    if (!doc.supplier_id) return 'Supplier chuno — ya naam likh ke naya bana lo.';
    if (!isDateString(doc.doc_date)) return 'Tareekh theek nahi hai — YYYY-MM-DD likho, jaise 2026-09-30.';
    if (!(lines ?? []).length) return 'Kam se kam ek item daalo.';
    if ((lines ?? []).some((l) => l.qty <= 0)) return 'Har line mein qty chahiye.';
    if (doc.doc_type === 'debit_note') {
      for (const l of lines ?? []) {
        const sl = sourceLines?.find((x) => x.id === l.against_line_id);
        if (sl && l.qty > sl.qty - sl.done) return `${l.description}: sirf ${sl.qty - sl.done} aur wapas ja sakte hain.`;
        if (!sl && l.qty > l.here) return `${l.description}: kharab mein sirf ${l.here} pade hain.`;
      }
    }
    return null;
  }

  /** Owner or admin: post it. Stock moves and the supplier's khata changes. */
  async function approve() {
    if (!id || !doc) return;
    const bad = problems();
    if (bad) { notify(bad, 'danger'); return; }
    const isReturn = doc.doc_type === 'debit_note';
    const unpriced = (lines ?? []).filter((l) => !l.rate).length;
    const ok = await confirm(
      isReturn ? 'Supplier ko wapsi likh dein?' : 'Approve karke stock chadha dein?',
      [
        `${supplier?.name ?? 'Supplier'} · ${(lines ?? []).reduce((a, l) => a + l.qty, 0)} pcs · ${formatINR(totals.totals.grand_total)}.`,
        isReturn
          ? 'Maal stock se nikal jayega aur supplier ke khaate se itna kam ho jayega.'
          : 'Stock badh jayega aur supplier ke khaate mein chadh jayega.',
        !isReturn && unpriced ? `${unpriced} item ka kharid rate nahi bhara — baad mein “Rate baaki” se bhar sakte ho.` : null,
      ].filter(Boolean).join('\n\n'),
    );
    if (!ok) return;
    setPosting(true);
    try {
      let docNo = '';
      await db.writeTransaction(async (tx) => { docNo = await postPurchase(tx, id, actor); });
      router.replace(`/purchase/${id}`);
      notify(isReturn ? `Wapsi ${docNo} likh di.` : `${docNo} approve — stock chadh gaya.`, 'ok');
    } catch (e) {
      notify(`Nahi hua: ${(e as Error).message}`, 'danger');
    } finally {
      setPosting(false);
    }
  }

  /** Staff: hand it to the owner. */
  async function submit() {
    if (!id) return;
    const bad = problems();
    if (bad) { notify(bad, 'danger'); return; }
    await patch({ submitted_at: new Date().toISOString(), submitted_by: actor.userId, revised_at: null });
    notify('Owner ko bhej diya. Approve hote hi stock mein chadh jayega.', 'ok');
    router.back();
  }

  /** Owner: send it back to the staff member with a reason. */
  async function sendBack() {
    if (!id || !doc) return;
    if (!backNote.trim()) { notify('Wajah likho — kya theek karna hai.', 'danger'); return; }
    await patch({ submitted_at: null, notes: [doc.notes, `Owner: ${backNote.trim()}`].filter(Boolean).join(' · ') });
    notify('Wapas bhej diya.', 'ok');
    router.back();
  }

  /** Owner: refuse it. Kept, marked refused with the reason, so the staff member sees why. */
  async function refuse() {
    if (!id) return;
    if (!backNote.trim()) { notify('Mana karne ki wajah likho.', 'danger'); return; }
    if (!(await confirm('Ye entry mana kar dein?', 'Stock nahi badhega. Staff ko wajah ke saath “Mana kiya” dikhega.'))) return;
    await updateRow(db, 'purchases', id, {
      status: 'cancelled', cancel_reason: backNote.trim(), cancelled_at: new Date().toISOString(), cancelled_by: actor.userId,
    });
    notify('Mana kar diya.', 'ok');
    router.back();
  }

  async function discard() {
    if (!id) return;
    if (!(await confirm('Ye entry hata dein?', 'Ye entry aur iski saari line mit jaayengi. Stock par koi asar nahi.'))) return;
    await db.writeTransaction(async (tx) => {
      await tx.execute('DELETE FROM purchase_lines WHERE purchase_id = ?', [id]);
      await deleteRow(tx, 'purchases', id);
    });
    router.back();
  }

  if (!can('purchase.create')) {
    return <Screen><Empty title="Iski permission nahi hai" hint="Owner se maal likhne ka haq maango." /></Screen>;
  }
  if (!doc) return <PreparingDraft what="entry" />;
  if (doc.status !== 'draft') { router.replace(`/purchase/${doc.id}`); return null; }

  const isReturn = doc.doc_type === 'debit_note';
  const isReplacement = !isReturn && source?.[0]?.doc_type === 'debit_note';
  const waiting = !!doc.submitted_at;
  // Staff may change their own entry, in the queue or not; someone else's is
  // read-only to them. The server holds the same line.
  const mine = doc.created_by === actor.userId || doc.submitted_by === actor.userId;
  const locked = !approver && !mine;
  const revisedAfterSend = !!doc.revised_at && !!doc.submitted_at && doc.revised_at > doc.submitted_at;
  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const fromKharab = isReturn && !doc.against_purchase_id;
  const title = isReturn ? 'Supplier ko wapsi' : isReplacement ? 'Replacement aaya' : 'Maal aaya';

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="display">{title}</Text>
          <Badge tone={waiting ? 'warn' : 'neutral'}>{waiting ? 'approval baaki' : 'adhoora'}</Badge>
        </Row>

        {waiting && approver ? (
          <Card spine="warn">
            <Text variant="heading">{submitter?.[0]?.full_name ?? 'Staff'} ne bheja hai</Text>
            <Text variant="small" color="textMuted">
              Gin ke dekho qty sahi hai na, har item ka kharid rate bharo, phir approve karo. Tab stock badhega.
            </Text>
            {revisedAfterSend ? (
              <Text variant="small" color="danger">Bhejne ke baad badla — {when(doc.revised_at!)}. Neeche jo hai wahi taaza hai.</Text>
            ) : null}
          </Card>
        ) : null}
        {waiting && !approver && mine ? (
          <Card spine="warn">
            <Text variant="heading">Owner ke review mein hai</Text>
            <Text variant="small" color="textMuted">
              Approve hone tak abhi bhi badal sakte ho — qty, maal, supplier, note. Jo badloge wo owner ko turant dikhega.
            </Text>
            {doc.revised_at ? <Text variant="small" color="textFaint">Aakhri badlav: {when(doc.revised_at)}</Text> : null}
          </Card>
        ) : null}
        {locked ? (
          <Card spine="warn">
            <Text variant="heading">Ye entry {submitter?.[0]?.full_name ?? 'kisi aur'} ki hai</Text>
            <Text variant="small" color="textMuted">Sirf wo ya owner ise badal sakta hai.</Text>
          </Card>
        ) : null}
        {!waiting && doc.notes?.includes('Owner:') && !approver ? (
          <Card spine="accent">
            <Text variant="heading">Owner ne wapas bheja</Text>
            <Text variant="small">{doc.notes}</Text>
          </Card>
        ) : null}
        {isReturn && source?.[0] ? <Text variant="small" color="textMuted">{source[0].doc_no} ka maal supplier ko wapas. Sirf utna rakho jitna sach mein ja raha hai.</Text> : null}
        {fromKharab ? <Text variant="small" color="textMuted">Kharab maal supplier ko wapas. Supplier ke khaate se iski keemat kam ho jayegi; replacement aaye to wapsi kholke “Replacement aaya” dabao.</Text> : null}
        {isReplacement ? <Text variant="small" color="textMuted">Wapsi {source?.[0]?.doc_no} ke badle aaya maal. Jitna aaya utna rakho — baaki baad mein aa sakta hai.</Text> : null}

        <FormSection title={isReturn ? 'Kisko wapas' : 'Kahan se aaya'}>
          <SelectField
            label="Supplier"
            value={doc.supplier_id}
            options={(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))}
            onChange={(v) => patch({ supplier_id: v, supplier_name: suppliers?.find((s) => s.id === v)?.name ?? null })}
            onCreate={locked || isReplacement || !!doc.against_purchase_id ? undefined : addSupplier}
            placeholder="Kis supplier ka maal?"
          />
          <Row gap={12}>
            <View style={{ flex: 1 }}>{locked ? <Input label="Tareekh" value={doc.doc_date} editable={false} /> : <DateField label="Maal kab aaya" value={doc.doc_date} onChange={(v) => patch({ doc_date: v })} />}</View>
            <Input containerStyle={{ flex: 1 }} label="Supplier ka bill no." value={doc.supplier_invoice_no ?? ''} onChangeText={(v) => patch({ supplier_invoice_no: v || null })} autoCapitalize="characters" editable={!locked} />
          </Row>
        </FormSection>

        <SectionTitle>Maal · {(lines ?? []).length}</SectionTitle>
        {!locked && !doc.against_purchase_id ? (
          <Card>
            <VariantPicker
              onPick={addLine}
              showCost={showCost}
              locationId={doc.location_id}
              autoFocus={false}
              canCreate={!isReturn && can('catalog.edit')}
              onCreate={(text) => router.push(`/admin/item?name=${encodeURIComponent(text)}&back=${encodeURIComponent(`/purchase/edit?id=${doc.id}`)}`)}
            />
          </Card>
        ) : null}
        {(lines ?? []).map((l, i) => (
          <LineCard
            key={l.id}
            title={l.description}
            subtitle={`${l.sku ?? ''} · ${fromKharab ? 'kharab mein' : 'godown mein'} ${l.here}`}
            onRemove={locked ? undefined : () => removeLine(l.id)}>
            <Row gap={12} wrap>
              <View style={{ flex: 1, minWidth: 90 }}>
                <NumberField label={isReturn ? 'Kitne wapas' : 'Kitne aaye'} value={l.qty} onChange={(v) => patchLine(l.id, { qty: v ?? 0 })} decimals={0} editable={!locked} />
              </View>
              {showCost ? (
                <View style={{ flex: 1, minWidth: 110 }}>
                  <NumberField
                    label={isReturn ? 'Ek ka rate' : 'Kharid rate'}
                    value={l.rate || null}
                    onChange={(v) => patchLine(l.id, { rate: v ?? 0 })}
                    hint={!l.rate && l.last_cost ? `Pichhli baar ${formatINR(l.last_cost)}` : undefined}
                  />
                </View>
              ) : null}
            </Row>
            {/* A kism staff made with this entry has no selling rate yet. */}
            {approver && doc.doc_type === 'purchase' && (!l.retail_price || unpricedKisms.current.has(l.variant_id)) ? (
              <NumberField label="Bechne ka rate (nayi kism)" value={l.retail_price || null}
                onChange={(v) => {
                  unpricedKisms.current.add(l.variant_id);
                  if (v && v > 0) updateRow(db, 'product_variants', l.variant_id, { retail_price: v, dealer_price: v });
                }}
                hint="Bill par yahi rate aayega" />
            ) : null}
            {showCost && !l.rate && l.last_cost && approver ? (
              <Button title={`${formatINR(l.last_cost)} lagao`} tone="ghost" size="sm" onPress={() => patchLine(l.id, { rate: l.last_cost })} />
            ) : null}
            {showCost ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="small" color="textMuted">{l.qty} × {formatINR(l.rate)}</Text>
                <Text mono style={{ fontWeight: '600' }}>{formatINR(totals.taxed[i]?.line_total ?? 0)}</Text>
              </Row>
            ) : null}
          </LineCard>
        ))}

        <FormSection title={showCost ? 'Total' : 'Note'}>
          <Input label="Note" value={doc.notes ?? ''} onChangeText={(v) => patch({ notes: v || null })} placeholder="Gaadi number, driver, kuch bhi" editable={!locked} />
          {showCost ? (
            <>
              <NumberField label="Bhada (har item ki cost mein bat jayega)" value={doc.other_charges || null} onChange={(v) => patch({ other_charges: v ?? 0 })} />
              <Divider />
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="title">{(lines ?? []).reduce((a, l) => a + l.qty, 0)} pcs</Text>
                <Text variant="number" mono>{formatINR(totals.totals.grand_total)}</Text>
              </Row>
            </>
          ) : (
            <KV k="Kul" v={`${(lines ?? []).reduce((a, l) => a + l.qty, 0)} pcs`} mono />
          )}
        </FormSection>

        {approver ? (
          <>
            <Button
              title={isReturn ? 'Wapsi likh do' : waiting ? 'Approve karo — stock chadhao' : 'Stock chadha do'}
              size="lg" full onPress={approve} loading={posting}
            />
            {waiting ? (
              <Card style={{ gap: space.sm }}>
                <Input label="Wapas bhejne ya mana karne ki wajah" value={backNote} onChangeText={setBackNote} placeholder="Qty galat hai, dobara gino" />
                <Row gap={space.sm}>
                  <Button title="Wapas bhejo — theek karke bheje" tone="secondary" onPress={sendBack} style={{ flex: 1 }} />
                  <Button title="Mana karo" tone="danger" onPress={refuse} />
                </Row>
              </Card>
            ) : (
              <Button title="Chhod do" tone="danger" onPress={discard} />
            )}
          </>
        ) : isReturn ? (
          <Empty title="Supplier ko wapsi owner likhta hai" hint="Kharab maal “Kharab Likho” se alag rakh do — owner supplier ko bhejega." />
        ) : locked ? null : waiting ? (
          <View style={{ gap: space.sm }}>
            {/* An entry left empty or with a zero would sit in the owner's queue
                unapprovable; say so here, where it can still be fixed. */}
            <Button title="Ho gaya" size="lg" full onPress={() => { const bad = problems(); if (bad) { notify(bad, 'danger'); return; } router.back(); }} />
            <Row gap={space.sm}>
              <Button title="Queue se wapas lo" tone="secondary" onPress={() => patch({ submitted_at: null, revised_at: null })} style={{ flex: 1 }} />
              <Button title="Hata do" tone="danger" onPress={discard} />
            </Row>
          </View>
        ) : (
          <Row gap={space.sm}>
            <Button title="Owner ko bhejo" size="lg" onPress={submit} style={{ flex: 1 }} />
            <Button title="Chhod do" tone="danger" onPress={discard} />
          </Row>
        )}
      </Screen>
    </>
  );
}
