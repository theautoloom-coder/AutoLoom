/**
 * STOCK CHADHAO — supplier se maal aaya.
 *
 * By item, then kism (owner, 8 Oct 2026): "product ko sidha select karke
 * specifications, car model, qty, date set karke chadate jaye". The item is
 * made once in its own screen; here it is picked, and its kism — socket,
 * colour, car and years — is chosen on the spot. A kism that does not exist
 * yet is made with the entry; one that does is reused, never duplicated.
 *
 * The date is picked (Aaj / Kal / Parso / calendar), not typed, and cannot
 * be in the future.
 *
 * Staff entries wait for the owner (see /purchase/approve); an owner's own
 * entry posts at once. Receiving is a purchase, so the supplier is required —
 * one can be made here by typing a name.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import React, { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { formatINR, slug, toDateString } from '@domain';

import { postPurchase } from '@/lib/posting';
import { tokenClause, tokenize } from '@/lib/queries';
import { applyItemProposal } from '@/lib/requests';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, nextPartyCode, searchText } from '@/lib/writes';
import { uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { Button, Card, Divider, Empty, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { DateField } from '@/ui/date-field';
import { NumberField, SelectField, confirm, notify } from '@/ui/forms';
import { KismBuilder, type PickedItem, type StockLine } from '@/ui/kism-builder';
import { PhotoPicker } from '@/ui/photo';
import { space } from '@/ui/theme';

type Supplier = { id: string; name: string };

export default function StockChadhao() {
  const router = useRouter();
  const { db } = useSystem();
  const { actor, locationId, can } = useSession();
  const showCost = can('catalog.view_cost');
  const approver = can('purchase.approve');
  const { variant: variantParam } = useLocalSearchParams<{ variant?: string }>();

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [date, setDate] = useState(toDateString());
  const [lines, setLines] = useState<StockLine[]>([]);
  const [note, setNote] = useState('');
  const [billPhoto, setBillPhoto] = useState<PickedPhoto | null>(null);
  const [saving, setSaving] = useState(false);

  // Adding a line: search the items, then choose its kism.
  const [adding, setAdding] = useState(true);
  const [q, setQ] = useState('');
  const [item, setItem] = useState<PickedItem | null>(null);

  const { data: suppliers } = useQuery<Supplier>('SELECT id, name FROM suppliers WHERE is_active = 1 ORDER BY name');
  const search = useMemo(
    () => tokenClause(`p.name || ' ' || COALESCE(f.name, '') || ' ' || COALESCE(p.search_text, '')`, tokenize(q).slice(0, 4)),
    [q]);
  const { data: items } = useQuery<PickedItem & { kisms: number }>(
    `SELECT p.id, p.name, p.family_id, f.name AS family, p.default_price, p.default_cost,
            (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS kisms
       FROM products p LEFT JOIN product_families f ON f.id = p.family_id
      WHERE p.is_active = 1 AND ${search.sql}
      ORDER BY p.name LIMIT 40`,
    search.params);
  // A scanned barcode or a typed SKU is one exact kism: add it straight away.
  const { data: exact } = useQuery<{ id: string; variant_name: string; product_id: string; product_name: string; cost: number }>(
    `SELECT pv.id, pv.variant_name, p.id AS product_id, p.name AS product_name,
            COALESCE(NULLIF(pv.last_purchase_cost, 0), pv.avg_cost, 0) AS cost
       FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.is_active = 1 AND (lower(pv.sku) = ?1 OR pv.barcode = ?2) LIMIT 1`,
    [q.trim().toLowerCase(), q.trim()]);

  // Opened from a kism's own page: that kism is the first line.
  const { data: preRows } = useQuery<{ id: string; variant_name: string; product_id: string; product_name: string; cost: number }>(
    `SELECT pv.id, pv.variant_name, p.id AS product_id, p.name AS product_name,
            COALESCE(NULLIF(pv.last_purchase_cost, 0), pv.avg_cost, 0) AS cost
       FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ? LIMIT 1`, [variantParam ?? '']);
  const [seeded, setSeeded] = useState(false);
  const pre = preRows?.[0];
  if (pre && !seeded) {
    setSeeded(true);
    setLines([{ key: pre.id, productId: pre.product_id, productName: pre.product_name, variantId: pre.id, kismLabel: pre.variant_name, qty: 1, rate: showCost ? pre.cost : 0 }]);
    setAdding(false);
  }

  async function addSupplier(name: string) {
    const id = await insertRow(db, 'suppliers', {
      code: await nextPartyCode(db, 'suppliers'), name: name.trim(), is_active: true, search_text: searchText(name),
    }, actor);
    setSupplierId(id);
  }

  async function addCar(name: string): Promise<string | null> {
    if (!can('catalog.edit')) { notify('Nayi gaadi owner jodta hai. List mein se chuno ya note mein likh do.'); return null; }
    const makes = await db.getAll<{ id: string }>("SELECT id FROM vehicle_makes WHERE name = 'Other' LIMIT 1");
    const makeId = makes[0]?.id ?? (await insertRow(db, 'vehicle_makes', { name: 'Other', code: 'OTHER', is_active: true }));
    return insertRow(db, 'vehicle_models', {
      make_id: makeId, name: name.trim(), code: slug(name, 8) || `M${Date.now() % 10000}`, search_text: name.trim().toLowerCase(), is_active: true,
    });
  }

  /** A line in: the same kism twice is one line with both quantities. */
  function addLine(l: StockLine) {
    setLines((prev) => {
      const at = prev.findIndex((x) => (l.variantId && x.variantId === l.variantId) || (!l.variantId && x.key === l.key));
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], qty: next[at].qty + l.qty, rate: l.rate || next[at].rate };
        return next;
      }
      return [...prev, l];
    });
    setItem(null);
    setQ('');
    setAdding(false);
  }

  // The lines live only on this screen until saved: going back with them on
  // it asks first, instead of a whole truck's count vanishing with one tap.
  const navigation = useNavigation();
  const saved = useRef(false);
  usePreventRemove(lines.length > 0, ({ data }) => {
    if (saved.current) { navigation.dispatch(data.action); return; }
    confirm('Entry chhod dein?', `${lines.length} line abhi chadhi nahi hain — chhodoge to mit jayengi.`)
      .then((ok) => { if (ok) navigation.dispatch(data.action); });
  });

  const patch = (key: string, p: Partial<StockLine>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const drop = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const totalQty = lines.reduce((a, l) => a + (l.qty || 0), 0);
  const totalValue = lines.reduce((a, l) => a + (l.qty || 0) * (l.rate || 0), 0);

  async function save() {
    const usable = lines.filter((l) => l.qty > 0);
    if (!supplierId) { notify('Supplier chuno — ya naam likh ke naya bana lo.', 'danger'); return; }
    if (usable.length === 0) { notify('Kam se kam ek maal jodo.', 'danger'); return; }
    if (!locationId) { notify('Godown nahi mila. Sync hone do, phir dobara karo.', 'danger'); return; }
    if (date > toDateString()) { notify('Aage ki tareekh nahi chal sakti.', 'danger'); return; }

    setSaving(true);
    try {
      // The photo goes up first: if the network is down we want to know before
      // the stock has moved, not after.
      let billPath: string | null = null;
      if (billPhoto) {
        try { billPath = await uploadPhoto(billPhoto, 'bills'); }
        catch { notify('Bill ki photo nahi chadhi — stock phir bhi likh rahe hain.', 'danger'); }
      }

      const supplier = suppliers?.find((s) => s.id === supplierId);
      const taken = new Set((await db.getAll<{ sku: string }>('SELECT sku FROM product_variants')).map((r) => r.sku));
      await db.writeTransaction(async (tx) => {
        // New kisms first — the entry's lines point at them.
        const made = new Map<string, string>();
        for (const l of usable) {
          if (l.variantId || !l.newKism || made.has(l.key)) continue;
          const fam = await tx.execute('SELECT family_id, name FROM products WHERE id = ?', [l.productId]);
          const prod = fam.rows?._array?.[0] as { family_id: string | null; name: string } | undefined;
          const res = await applyItemProposal(tx, {
            family_id: prod?.family_id ?? null, name: prod?.name ?? l.productName, product_id: l.productId, product_name: l.productName,
            specs: l.newKism.specs, fits: l.newKism.fits, price: l.newKism.price, cost: showCost && l.rate ? l.rate : null, qty: 0,
          }, { actor, locationId, takenSkus: taken, canEditItem: can('catalog.edit') });
          made.set(l.key, res.variantId);
        }

        const id = await insertRow(tx, 'purchases', {
          doc_type: 'purchase', doc_date: date, supplier_id: supplierId, supplier_name: supplier?.name ?? null,
          location_id: locationId, bill_photo_path: billPath, notes: note.trim() || null, status: 'draft',
          // A staff entry is handed to the owner; the owner's own goes in now.
          submitted_at: approver ? null : new Date().toISOString(),
          submitted_by: approver ? null : actor.userId,
          approved_by: approver ? actor.userId : null,
        }, actor);
        for (const [i, l] of usable.entries()) {
          await insertRow(tx, 'purchase_lines', {
            purchase_id: id, line_no: i + 1, variant_id: l.variantId ?? made.get(l.key), description: `${l.productName} · ${l.kismLabel}`,
            qty: l.qty, rate: l.rate || 0, tax_rate_pct: 0,
          }, actor);
        }
        if (approver) await postPurchase(tx, id, actor);
      });

      notify(approver
        ? `${totalQty} pcs stock mein chadh gaya.`
        : `${totalQty} pcs owner ko bhej diya. Approve hote hi stock mein chadh jayega.`, 'ok');
      saved.current = true;
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
          <Empty title="Iski permission nahi hai" hint="Owner se stock chadhane ka haq maango." />
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
            {approver
              ? 'Supplier, tareekh, phir har maal: item chuno → kism chuno → kitne aaye. Stock turant badh jayega.'
              : 'Supplier, tareekh, phir har maal: item chuno → kism chuno → kitne aaye. Owner approve karega, tab stock badhega.'}
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
          <DateField label="Maal kab aaya" value={date} onChange={setDate} />
        </Card>

        <SectionTitle right={<Text variant="small" color="textFaint">{totalQty} pcs</Text>}>Maal · {lines.length}</SectionTitle>
        {lines.length > 0 ? (
          <Card style={{ gap: space.md }}>
            {lines.map((l, i) => (
              <View key={l.key} style={{ gap: space.xs }}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ justifyContent: 'space-between' }} gap={space.sm} align="flex-start">
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2}>{l.productName}</Text>
                    <Text variant="small" color={l.variantId ? 'textMuted' : 'accent'}>{l.kismLabel}{l.variantId ? '' : ' · nayi kism'}</Text>
                  </View>
                  <Button title="Hatao" tone="ghost" size="sm" onPress={() => drop(l.key)} />
                </Row>
                <Row gap={space.sm}>
                  <View style={{ flex: 1 }}>
                    <NumberField label="Kitne aaye" value={l.qty} onChange={(v) => patch(l.key, { qty: Math.max(0, Math.floor(v ?? 0)) })} decimals={0} />
                  </View>
                  {showCost ? (
                    <View style={{ flex: 1 }}>
                      <NumberField label="Kharid rate" value={l.rate || null} onChange={(v) => patch(l.key, { rate: v ?? 0 })} hint="Zaroori nahi" />
                    </View>
                  ) : null}
                </Row>
              </View>
            ))}
          </Card>
        ) : null}

        {adding ? (
          item ? (
            <KismBuilder item={item} showCost={showCost} pending={lines} onAdd={addLine} onCancel={() => setItem(null)} onAddCar={addCar} />
          ) : (
            <Card style={{ gap: space.sm }}>
              <Input label="Item chuno" value={q} onChangeText={setQ} placeholder="Naam, category, SKU ya barcode" autoCapitalize="none" autoCorrect={false} />
              {exact?.[0] ? (
                <Button title={`${exact[0].product_name} · ${exact[0].variant_name} — jodo`} onPress={() => {
                  const x = exact[0];
                  addLine({ key: x.id, productId: x.product_id, productName: x.product_name, variantId: x.id, kismLabel: x.variant_name, qty: 1, rate: showCost ? x.cost : 0 });
                }} />
              ) : null}
              <View>
                {(items ?? []).map((it) => (
                  <ListRow key={it.id} title={it.name} subtitle={[it.family, `${it.kisms} kism`].filter(Boolean).join(' · ')}
                    onPress={() => setItem(it)} />
                ))}
              </View>
              {(items ?? []).length === 0 ? (
                <Empty art="search" title={q.trim() ? `“${q.trim()}” naam ka item nahi mila` : 'Abhi koi item nahi'}
                  hint={can('catalog.edit') ? 'Pehle item banao — naam aur category. Kism yahin chunoge.' : 'Owner ko naya item bhejo — approve hote hi yahan milega.'} />
              ) : null}
              <Row gap={space.sm}>
                <Button title={can('catalog.edit') ? '+ Naya item banao' : 'Owner ko naya item bhejo'} tone="secondary" size="sm"
                  onPress={() => router.push(`/admin/item?name=${encodeURIComponent(q.trim())}&back=/stock/add` as never)} />
                {lines.length ? <Button title="Rehne do" tone="ghost" size="sm" onPress={() => setAdding(false)} /> : null}
              </Row>
            </Card>
          )
        ) : (
          <Button title="+ Maal jodo" tone="secondary" onPress={() => setAdding(true)} />
        )}

        <Card style={{ gap: space.md }}>
          <Text variant="label" color="textMuted">Supplier ke bill ki photo (zaroori nahi)</Text>
          <PhotoPicker localUri={billPhoto?.uri} name="Bill" onPickLocal={setBillPhoto}
            hint="Supplier ka bill — baad mein hisaab milane ke kaam aata hai." />
          <Input label="Note" value={note} onChangeText={setNote} placeholder="Gaadi number, driver, kuch bhi" />
        </Card>

        {lines.length > 0 ? (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text color="textMuted">{totalQty} pcs · {lines.length} line</Text>
              {showCost && totalValue > 0 ? <Text variant="number">{formatINR(totalValue)}</Text> : null}
            </Row>
          </Card>
        ) : null}

        <Button
          title={approver
            ? (totalQty > 0 ? `${totalQty} pcs chadha do` : 'Stock chadha do')
            : (totalQty > 0 ? `${totalQty} pcs owner ko bhejo` : 'Owner ko bhejo')}
          size="lg" full onPress={save} loading={saving} disabled={totalQty === 0}
        />
      </Screen>
    </>
  );
}
