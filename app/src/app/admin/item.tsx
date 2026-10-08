/**
 * The item — made once (owner, 8 Oct 2026: "ek product/item creation ka
 * rakhte hai alag, whi se uski category details add karenge").
 *
 * An item is its name, its category, its usual selling and buying rate, and
 * the details every kism of it shares (a mat's material, a bulb's colour
 * temperature). It has no stock and no car here: those belong to its kisms,
 * which are chosen while writing stock in (Stock Chadhao) or added by hand
 * from the item's page.
 *
 * Kism links (`?product=`, `?id=&variant=`, a kism request) land here too and
 * are handed to the kism form, so every old link still goes somewhere right.
 */
import { useQuery } from '@powersync/react';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR, slug } from '@domain';

import {
  applyItemEdit, applyItemProposal, formHref, parseProposal, resubmitRequest, submitRequest, validateProposal,
  type ChangeRequest, type EditSnapshot, type ItemProposal,
} from '@/lib/requests';
import { tokenClause, tokenize } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Empty, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { SpecFields, buildSpecs, toVal, useFamilySpecs, type SpecRow, type SpecVal } from '@/ui/catalog-fields';
import { FormSection, NumberField, SelectField, notify } from '@/ui/forms';
import { PhotoPicker } from '@/ui/photo';
import { space } from '@/ui/theme';

import KismForm from './kism';

type Params = { id?: string; variant?: string; product?: string; request?: string; name?: string; back?: string };

export default function ItemRoute() {
  const params = useLocalSearchParams<Params>();
  const { data: reqRows, isLoading } = useQuery<ChangeRequest>('SELECT * FROM change_requests WHERE id = ? LIMIT 1', [params.request ?? '']);
  const proposal = params.request && reqRows?.[0] ? parseProposal(reqRows[0]) : null;

  // A change to a kism opens on that kism, whatever link brought it here.
  if (proposal?.edit_variant_id && !params.variant) return <Redirect href={formHref(reqRows![0]) as never} />;
  if (params.variant || params.product || proposal?.product_id) return <KismForm />;
  if (params.request && isLoading) return <Screen><Text color="textMuted">Khul raha hai…</Text></Screen>;
  return <ItemMaster request={params.request ? reqRows?.[0] ?? null : null} proposal={proposal} />;
}

type Family = { id: string; name: string; sku_prefix: string };
type Item = { id: string; name: string; family_id: string | null; default_price: number | null; default_cost: number | null; is_universal_fit: number };
type Kism = { id: string; variant_name: string; retail_price: number; qty: number };

function ItemMaster({ request: asked, proposal: askedProposal }: { request: ChangeRequest | null; proposal: ItemProposal | null }) {
  const { id, name: nameParam, back } = useLocalSearchParams<Params>();
  const router = useRouter();
  const { db } = useSystem();
  const { actor, locationId, can } = useSession();
  const canEdit = can('catalog.edit');
  const showCost = can('catalog.view_cost');
  const isNew = !id;
  const [saving, setSaving] = useState(false);

  const { data: families } = useQuery<Family>('SELECT id, name, sku_prefix FROM product_families WHERE is_active = 1 ORDER BY sort_order, name');
  const { data: items } = useQuery<Item>('SELECT id, name, family_id, default_price, default_cost, is_universal_fit FROM products WHERE id = ?', [id ?? '']);
  const item = items?.[0] ?? null;
  // A staff member's change to this item already with the owner, or sent
  // back: reopened and sent again, never sent twice (owner, 8 Oct 2026).
  const { data: openEdits } = useQuery<ChangeRequest>(
    `SELECT * FROM change_requests WHERE kind = 'edit_item' AND status IN ('pending', 'rejected') AND submitted_by = ? AND payload LIKE ?
      ORDER BY submitted_at DESC LIMIT 1`,
    [actor.userId ?? '', `%"edit_product_id":"${id ?? '-'}"%`]);
  const request = asked ?? (!canEdit && id ? openEdits?.[0] ?? null : null);
  const proposal = askedProposal ?? (request ? parseProposal(request) : null);
  const { data: sharedRows } = useQuery<SpecRow & { product_id: string; display_value: string | null }>(
    'SELECT product_id, spec_definition_id, variant_id, option_id, option_ids, value_text, value_number, value_bool, display_value FROM spec_values WHERE product_id = ? AND variant_id IS NULL', [id ?? '']);
  const { data: kisms } = useQuery<Kism>(
    `SELECT pv.id, pv.variant_name, pv.retail_price,
            COALESCE((SELECT SUM(s.qty) FROM stock_on_hand s JOIN locations l ON l.id = s.location_id
                       WHERE s.variant_id = pv.id AND l.type <> 'damaged'), 0) AS qty
       FROM product_variants pv WHERE pv.product_id = ? AND pv.is_active = 1 ORDER BY pv.sort_order, pv.variant_name`, [id ?? '']);

  // The item's photo: one picture of the box, shown on every kism that has
  // none of its own. A new item has no id yet, so its photo waits for save.
  const { data: photoRows } = useQuery<{ id: string; storage_path: string }>(
    'SELECT id, storage_path FROM product_images WHERE product_id = ? AND variant_id IS NULL ORDER BY sort_order LIMIT 1', [id ?? '']);
  const photo = photoRows?.[0] ?? null;
  const [pendingPhoto, setPendingPhoto] = useState<PickedPhoto | null>(null);
  async function setItemPhoto(storagePath: string | null) {
    if (!item) return;
    if (storagePath) {
      if (photo) await updateRow(db, 'product_images', photo.id, { storage_path: storagePath });
      else await insertRow(db, 'product_images', { product_id: item.id, variant_id: null, storage_path: storagePath, sort_order: 0 }, actor);
    } else if (photo) {
      await db.execute('DELETE FROM product_images WHERE id = ?', [photo.id]);
    }
  }

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [name, setName] = useState(nameParam ?? '');
  const [price, setPrice] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [universal, setUniversal] = useState(false);
  const [vals, setVals] = useState<Record<string, SpecVal>>({});
  const [note, setNote] = useState('');
  // The item as it stood when opened: travels with a staff member's change.
  const [before, setBefore] = useState<EditSnapshot | null>(null);

  const { defs, optsByDef } = useFamilySpecs(familyId);
  // The item's own details: the ones every kism shares. Socket, colour and
  // the like belong to each kism and are chosen with the stock.
  const sharedDefs = useMemo(() => defs.filter((d) => !d.is_variant_axis), [defs]);
  const kismDefs = useMemo(() => defs.filter((d) => d.is_variant_axis), [defs]);

  // Load the item being edited, once its rows are there.
  const [loaded, setLoaded] = useState<string | null>(null);
  if (item && sharedRows && loaded !== item.id && sharedRows.every((r) => r.product_id === item.id)) {
    setLoaded(item.id);
    setFamilyId(item.family_id);
    setName(item.name);
    setPrice(item.default_price);
    setCost(item.default_cost);
    setBefore({
      name: item.name, family_name: families?.find((f) => f.id === item.family_id)?.name ?? null, price: item.default_price,
      specs: sharedRows.map((r) => ({ def_id: r.spec_definition_id, display: r.display_value ?? '' })), universal: !!item.is_universal_fit,
    });
    setUniversal(!!item.is_universal_fit);
    const sv: Record<string, SpecVal> = {};
    for (const r of sharedRows) sv[r.spec_definition_id] = toVal(r);
    setVals(sv);
  }
  // A staff member's request, reopened to fix.
  const [loadedReq, setLoadedReq] = useState<string | null>(null);
  if (request && proposal && loadedReq !== request.id) {
    setLoadedReq(request.id);
    setFamilyId(proposal.family_id);
    if (!proposal.family_id) setNewFamilyName(proposal.family_name ?? '');
    setName(proposal.name ?? '');
    setPrice(proposal.price ?? null);
    setUniversal(!!proposal.universal);
    const sv: Record<string, SpecVal> = {};
    for (const s of proposal.specs ?? []) {
      if (!s.axis) sv[s.def_id] = { option_id: s.option_id, option_ids: s.option_ids?.split(',').filter(Boolean), text: s.text ?? undefined, number: s.number, bool: s.bool };
    }
    setVals(sv);
    setNote(request.note ?? '');
  }

  // An item that exists is not made twice.
  const twinSearch = tokenClause('p.name', tokenize(name).filter((t) => t.length >= 2).slice(0, 4));
  const lookFor = isNew && name.trim().length >= 3 && twinSearch.params.length > 0;
  const { data: twins } = useQuery<{ id: string; name: string; family: string | null; kisms: number }>(
    `SELECT p.id, p.name, f.name AS family,
            (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS kisms
       FROM products p LEFT JOIN product_families f ON f.id = p.family_id
      WHERE p.is_active = 1 AND ? = 1 AND ${twinSearch.sql}
      ORDER BY p.name LIMIT 5`,
    [lookFor ? 1 : 0, ...twinSearch.params]);

  async function addCategory(text: string): Promise<void> {
    if (!canEdit) { setNewFamilyName(text.trim()); setFamilyId(null); return; }
    const code = slug(text, 6) || `CAT${Date.now() % 1000}`;
    const fid = await insertRow(db, 'product_families', {
      code, name: text.trim(), sku_prefix: slug(text, 4) || code, sku_template: '{FAMILY}-{AXES}', is_fitment_required: false, is_active: true, sort_order: 100,
    });
    setFamilyId(fid);
  }

  function proposalNow(): ItemProposal {
    const fam = families?.find((f) => f.id === familyId);
    return {
      // A new item, or a change to this one (owner, 8 Oct 2026).
      master: !item,
      edit_product_id: item?.id ?? null,
      before: item ? before : null,
      family_id: familyId,
      family_name: fam?.name ?? (newFamilyName.trim() || null),
      name, price, cost: showCost ? cost : null, universal,
      specs: buildSpecs(sharedDefs, optsByDef, vals),
    };
  }

  async function save() {
    const p = proposalNow();
    const bad = validateProposal(p);
    if (bad) { notify(bad); return; }
    // The same name twice is the same item twice: the stock would split
    // between them and neither count would be right.
    const same = await db.getAll<{ id: string }>(
      'SELECT id FROM products WHERE lower(trim(name)) = ? AND is_active = 1 AND id <> ? LIMIT 1', [name.trim().toLowerCase(), item?.id ?? '']);
    if (same.length) { notify(`“${name.trim()}” naam ka item pehle se hai — wahi use karo.`, 'danger'); return; }
    setSaving(true);
    try {
      if (!canEdit) {
        if (request) { await resubmitRequest(db, request.id, p, note); notify(request.status === 'pending' ? 'Badlav owner tak pahunch gaya.' : 'Dobara bhej diya.', 'ok'); }
        else {
          await submitRequest(db, p, { actor, locationId, note });
          notify(item ? 'Badlav owner ko bhej diya — approve hote hi lagega.' : 'Owner ko bhej diya. Approve hote hi item ban jayega.', 'ok');
        }
        if ((back || item) && router.canGoBack()) router.back(); else router.replace('/requests');
        return;
      }
      if (item) {
        // The same path an approved staff change takes.
        await db.writeTransaction((tx) => applyItemEdit(tx, p, actor));
        notify('Item badal gaya.', 'ok');
        router.back();
        return;
      }
      const made = await db.writeTransaction((tx) => applyItemProposal(tx, p, { actor, locationId, takenSkus: new Set() }));
      notify('Item ban gaya.', 'ok');
      // The photo goes up once the item has an id. If it fails the item is
      // still made, and says so.
      if (pendingPhoto) {
        try {
          const stored = await uploadPhoto(pendingPhoto, made.productId);
          await insertRow(db, 'product_images', { product_id: made.productId, variant_id: null, storage_path: stored, sort_order: 0 }, actor);
        } catch (e) {
          notify(`Item ban gaya, par photo nahi chadhi: ${String((e as Error).message ?? e)}. Item kholke dobara lagao.`, 'danger');
        }
      }
      // From Stock Chadhao: back there — the kism is chosen with the stock.
      // From a bill: on to its first kism, so the bill can go on.
      if (back === '/stock/add' && router.canGoBack()) router.back();
      else if (back) router.replace(`/admin/item?product=${made.productId}&back=${encodeURIComponent(back)}` as never);
      else router.replace(`/product/${made.productId}` as never);
    } catch (e) {
      notify(`Save nahi hua: ${String((e as Error).message ?? e)}`, 'danger');
    } finally {
      setSaving(false);
    }
  }

  const missing = validateProposal(proposalNow());

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'Naya item' : canEdit ? 'Item badlo' : 'Item mein badlav' }} />
      <Screen>
        <Text variant="display">{isNew ? 'Naya item' : canEdit ? 'Item badlo' : 'Item mein badlav'}</Text>
        {!isNew && !canEdit ? (
          <Card spine="warn" style={{ gap: space.xs }}>
            <Text variant="heading">{request ? (request.status === 'rejected' ? 'Owner ne wapas bheja' : 'Aapka badlav review mein hai') : 'Jo galat hai wo theek karo'}</Text>
            <Text variant="small" color="textMuted">
              {request?.status === 'rejected'
                ? `Wajah: ${request.review_note ?? '—'}. Theek karke dobara bhejo.`
                : 'Naam, category, rate ya common detail badlo — owner approve karega tab lagega.'}
            </Text>
          </Card>
        ) : null}
        <Text variant="small" color="textMuted">
          Item ek baar banta hai — naam, category, rate aur common detail. Kism (socket, colour, gaadi) stock chadhate waqt chunoge.
        </Text>

        {lookFor && (twins ?? []).length > 0 ? (
          <Card spine="warn" style={{ gap: space.xs }}>
            <Text variant="heading">Ye item pehle se hai?</Text>
            <Text variant="small" color="textMuted">Dobara mat banao — wahi item use karo. Nayi gaadi ya colour stock chadhate waqt kism mein chunoge.</Text>
            {(twins ?? []).map((t) => (
              <ListRow key={t.id} title={t.name} subtitle={[t.family, `${t.kisms} kism`].filter(Boolean).join(' · ')}
                onPress={() => (back === '/stock/add' && router.canGoBack() ? router.back() : router.replace(`/product/${t.id}` as never))} />
            ))}
          </Card>
        ) : null}

        <FormSection title="Item">
          <SelectField
            label="Category"
            value={familyId}
            options={(families ?? []).map((f) => ({ value: f.id, label: f.name }))}
            onChange={(v) => { setFamilyId(v); setVals({}); }}
            onCreate={addCategory}
            placeholder="LED Bulb / Mats / Seat cover…"
            hint={!canEdit && newFamilyName ? `Nayi category "${newFamilyName}" — owner approve karega` : undefined}
          />
          <Input label="Item ka naam" value={name} onChangeText={setName} placeholder="ABC 7D Mat / Philips Ultinon LED" autoCapitalize="words" />
          <Row gap={12}>
            <View style={{ flex: 1 }}>
              <NumberField label="Bechne ka rate" value={price} onChange={setPrice} placeholder="2400" hint="Nayi kism isi se shuru" />
            </View>
            {showCost ? (
              <View style={{ flex: 1 }}>
                <NumberField label="Kharid rate" value={cost} onChange={setCost} placeholder="1600" hint="Zaroori nahi" />
              </View>
            ) : null}
          </Row>
          <Row gap={space.xs}>
            <Chip label="Har gaadi mein lagta hai" selected={universal} onPress={() => setUniversal(!universal)} />
          </Row>
        </FormSection>

        {canEdit ? (
          <FormSection title="Photo" hint="Ek photo poore item ki — jis kism ki apni photo nahi, us par yahi dikhegi.">
            <PhotoPicker folder={item?.id} path={photo?.storage_path} localUri={pendingPhoto?.uri} name={name || 'Item'}
              onChange={setItemPhoto} onPickLocal={setPendingPhoto} />
          </FormSection>
        ) : null}

        {sharedDefs.length > 0 ? (
          <FormSection title="Common detail" hint="Jo is item ki har kism mein same hai.">
            <SpecFields defs={sharedDefs} optsByDef={optsByDef} values={vals} onChange={(d, v) => setVals((p) => ({ ...p, [d]: v }))} />
          </FormSection>
        ) : null}
        {familyId && kismDefs.length > 0 ? (
          <Text variant="small" color="textFaint">
            {kismDefs.map((d) => d.name).join(', ')} aur gaadi — har kism ki alag, stock chadhate waqt chunoge.
          </Text>
        ) : null}

        {!isNew ? (
          <>
            <SectionTitle right={canEdit ? <Button title="+ Nayi kism" size="sm" tone="secondary" onPress={() => router.push(`/admin/item?product=${id}` as never)} /> : undefined}>
              Kism · {(kisms ?? []).length}
            </SectionTitle>
            {(kisms ?? []).length === 0 ? (
              <Empty title="Abhi koi kism nahi" hint="Stock chadhate waqt ye item chuno — kism wahin ban jayegi." />
            ) : (
              <Card style={{ gap: 0, paddingVertical: 4 }}>
                {(kisms ?? []).map((k) => (
                  <ListRow key={k.id} title={k.variant_name} subtitle={`Bechna ${formatINR(k.retail_price)}`}
                    onPress={() => router.push(`/admin/item?id=${id}&variant=${k.id}` as never)}
                    right={<Badge tone={k.qty > 0 ? 'ok' : 'neutral'}>{`${k.qty} pcs`}</Badge>} />
                ))}
              </Card>
            )}
          </>
        ) : null}

        {!canEdit ? (
          <Input label="Owner ke liye note" value={note} onChangeText={setNote} placeholder="Kyu chahiye — ek line" multiline />
        ) : null}

        {missing ? <Text variant="small" color="textFaint">{missing}</Text> : null}
        <Row gap={space.sm}>
          <Button
            title={canEdit ? (isNew ? 'Item bana do' : 'Badlav kar do') : (request ? (request.status === 'pending' ? 'Badlav bhejo' : 'Dobara bhejo') : 'Owner ko bhejo')}
            size="lg" onPress={save} loading={saving} disabled={!!missing} style={{ flex: 1 }}
          />
          <Button title="Rehne do" tone="secondary" onPress={() => router.back()} />
        </Row>
      </Screen>
    </>
  );
}
