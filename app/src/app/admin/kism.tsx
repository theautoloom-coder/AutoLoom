/**
 * One kism of an item: its own details (socket, colour), its cars and years,
 * its rate, photo and pack — reached through /admin/item:
 *
 *   ?product=<item>          a new kism of an item that exists
 *   ?id=<item>&variant=<k>   change that kism (and the item's shared details)
 *   ?request=<r>             a staff member's kism request, to fix or resend
 *
 * The item itself — name, category, usual rate — is the item form's
 * (admin/item.tsx). Most kisms are made while writing stock in (Stock
 * Chadhao, owner 8 Oct 2026); this screen is for adding one by hand, or for
 * changing one later.
 *
 * Underneath it writes the variant, its spec_values and its product_fitments
 * in one transaction; the kism's name is built from its cars and the specs
 * that name it ("Creta 2019–2023 · H4"), so every list shows them.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { slug } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import {
  applyItemProposal, fitsOf, parseProposal, resubmitRequest, submitRequest, validateProposal, variantNameOf, writeSpecsAndFits,
  type ChangeRequest, type ItemProposal, type ProposalFit, type ProposalSpec,
} from '@/lib/requests';
import { insertRow, searchText, updateRow } from '@/lib/writes';
import { uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { Button, Card, Chip, Input, Row, Screen, Text } from '@/ui';
import { Disclosure, FormSection, NumberField, SelectField, notify } from '@/ui/forms';
import { CarPicker, badYears } from '@/ui/catalog-fields';
import { PhotoPicker } from '@/ui/photo';
import { space } from '@/ui/theme';

type Family = { id: string; name: string; sku_prefix: string };
type Model = { id: string; name: string; make_name: string };
type Def = { id: string; code: string; name: string; data_type: string; unit: string | null; is_required: number; is_variant_axis: number; show_in_variant_name: number; sort_order: number };
type Opt = { id: string; spec_definition_id: string; value: string };
type SpecRow = { product_id: string; spec_definition_id: string; variant_id: string | null; option_id: string | null; option_ids: string | null; value_text: string | null; value_number: number | null; value_bool: number | null };
type Base = { id: string; name: string; family_id: string; family_name: string | null; kisms: number; first_kism: string | null; spec_count: number; fit_count: number };
type Existing = {
  id: string; name: string; family_id: string; variant_id: string; variant_name: string; sku: string; is_universal_fit: number;
  retail_price: number; dealer_price: number | null; avg_cost: number; pack_size: number; pack_label: string | null; warranty_months: number;
};
/** What the person has put in one spec box. */
type SpecVal = { option_id?: string | null; option_ids?: string[]; text?: string; number?: number | null; bool?: boolean | null };

const yearsLabel = (f: { year_from?: number | null; year_to?: number | null }) =>
  f.year_from ? ` ${f.year_from}${f.year_to ? (f.year_to === f.year_from ? '' : `–${f.year_to}`) : '+'}` : '';

const toVal = (r: SpecRow): SpecVal => ({
  option_id: r.option_id, option_ids: r.option_ids ? r.option_ids.split(',').filter(Boolean) : undefined,
  text: r.value_text ?? undefined, number: r.value_number, bool: r.value_bool == null ? null : !!r.value_bool,
});
/** Two spec values that say the same thing, however they were stored. */
const sameVal = (a?: SpecVal, b?: SpecVal) => JSON.stringify([a?.option_id ?? null, [...(a?.option_ids ?? [])].sort(), (a?.text ?? '').trim(), a?.number ?? null, a?.bool ?? null])
  === JSON.stringify([b?.option_id ?? null, [...(b?.option_ids ?? [])].sort(), (b?.text ?? '').trim(), b?.number ?? null, b?.bool ?? null]);

export default function KismForm() {
  const { id, variant: variantParam, product: productParam, request: requestId, name: nameParam, back } =
    useLocalSearchParams<{ id?: string; variant?: string; product?: string; request?: string; name?: string; back?: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { actor, locationId, can } = useSession();
  const isNew = !id;
  const [saving, setSaving] = useState(false);

  const { data: families } = useQuery<Family>('SELECT id, name, sku_prefix FROM product_families WHERE is_active = 1 ORDER BY sort_order, name');
  const { data: models } = useQuery<Model>(
    'SELECT vm.id, vm.name, mk.name AS make_name FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id WHERE vm.is_active = 1 ORDER BY mk.name, vm.name');
  // Editing: the kism asked for (?variant=), else the item's first.
  const { data: rows } = useQuery<Existing>(
    `SELECT p.id, p.name, p.family_id, p.is_universal_fit, pv.id AS variant_id, pv.variant_name, pv.sku, pv.retail_price, pv.dealer_price,
            pv.avg_cost, pv.pack_size, pv.pack_label, pv.warranty_months
       FROM products p JOIN product_variants pv ON pv.product_id = p.id
      WHERE p.id = ?1 AND (?2 = '' OR pv.id = ?2) ORDER BY pv.sort_order LIMIT 1`,
    [id ?? '', variantParam ?? '']);
  const existing = rows?.[0] ?? null;

  // Reopening a proposal: the same form, prefilled with what was sent, so the
  // submitter fixes the one thing instead of retyping it all.
  const { data: reqRows } = useQuery<ChangeRequest>('SELECT * FROM change_requests WHERE id = ? LIMIT 1', [requestId ?? '']);
  const request = requestId ? (reqRows?.[0] ?? null) : null;
  const proposalOfRequest = request ? parseProposal(request) : null;

  // A new kism of an item that exists: from ?product=, or a request for one.
  const kismOf = !id ? (productParam || proposalOfRequest?.product_id || null) : null;
  const { data: baseRows } = useQuery<Base>(
    `SELECT p.id, p.name, p.family_id, f.name AS family_name,
            (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS kisms,
            (SELECT v.id FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 ORDER BY v.sort_order LIMIT 1) AS first_kism,
            (SELECT COUNT(*) FROM spec_values sv WHERE sv.product_id = p.id) AS spec_count,
            (SELECT COUNT(*) FROM product_fitments pf WHERE pf.product_id = p.id) AS fit_count
       FROM products p LEFT JOIN product_families f ON f.id = p.family_id WHERE p.id = ?`, [kismOf ?? id ?? '']);
  const base = baseRows?.[0] ?? null;

  // Every spec and car row of the item; each mode takes the ones it needs.
  const itemId = id ?? kismOf ?? '';
  const { data: specRows } = useQuery<SpecRow>(
    'SELECT product_id, spec_definition_id, variant_id, option_id, option_ids, value_text, value_number, value_bool FROM spec_values WHERE product_id = ?', [itemId]);
  const { data: fitRows } = useQuery<{ product_id: string; variant_id: string | null; model_id: string; year_from: number | null; year_to: number | null; gen_from: number | null; gen_to: number | null }>(
    `SELECT pf.product_id, pf.variant_id, pf.model_id, pf.year_from, pf.year_to, g.year_from AS gen_from, g.year_to AS gen_to
       FROM product_fitments pf LEFT JOIN vehicle_generations g ON g.id = pf.generation_id WHERE pf.product_id = ?`, [itemId]);
  // The item's own (shared) values — what a new kism starts from.
  // PowerSync answers [] while a query is still running, and on this screen
  // the item can change under it (new item → "Isi mein nayi kism"). The rows
  // are only taken once there are as many as the item has, and all its own.
  const itemReady = !!base && base.id === itemId
    && !!specRows && specRows.length === base.spec_count && specRows.every((r) => r.product_id === itemId)
    && !!fitRows && fitRows.length === base.fit_count && fitRows.every((r) => r.product_id === itemId);
  const baseVals = useMemo(() => {
    const m: Record<string, SpecVal> = {};
    for (const r of specRows ?? []) if (!r.variant_id) m[r.spec_definition_id] = toVal(r);
    return m;
  }, [specRows]);

  const canEdit = can('catalog.edit');

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [name, setName] = useState(nameParam ?? '');
  const [type, setType] = useState('');
  const [colour, setColour] = useState('');
  const [specVals, setSpecVals] = useState<Record<string, SpecVal>>({});
  const [fits, setFits] = useState<ProposalFit[]>([]);
  const [universal, setUniversal] = useState(false);
  const [qty, setQty] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [packSize, setPackSize] = useState<number | null>(null);
  const [packLabel, setPackLabel] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState<number | null>(null);
  const [note, setNote] = useState('');
  // A category the submitter is proposing rather than choosing. Staff cannot
  // create one — `product_families` is gated by `catalog.edit` — so the name
  // travels with the proposal and the approver creates it.
  const [newFamilyName, setNewFamilyName] = useState('');

  // The chosen family's spec list and each spec's options.
  const { data: defs } = useQuery<Def>(
    `SELECT id, code, name, data_type, unit, is_required, is_variant_axis, show_in_variant_name, sort_order
       FROM spec_definitions WHERE family_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY sort_order, name`, [familyId ?? '']);
  const { data: opts } = useQuery<Opt>(
    `SELECT o.id, o.spec_definition_id, o.value FROM spec_options o
       JOIN spec_definitions d ON d.id = o.spec_definition_id
      WHERE d.family_id = ? AND COALESCE(o.is_active, 1) = 1 ORDER BY o.sort_order, o.value`, [familyId ?? '']);
  const optsByDef = useMemo(() => {
    const m = new Map<string, Opt[]>();
    for (const o of opts ?? []) {
      if (!m.has(o.spec_definition_id)) m.set(o.spec_definition_id, []);
      m.get(o.spec_definition_id)!.push(o);
    }
    return m;
  }, [opts]);

  // Load the kism being edited once its rows arrive: the item's shared
  // values, with this kism's own laid over them.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (existing && itemReady && specRows && fitRows && loadedId !== existing.variant_id) {
    setLoadedId(existing.variant_id);
    const oldSpecs = (specRows ?? []).filter((r) => !r.variant_id || r.variant_id === existing.variant_id)
      .sort((a, b) => (a.variant_id ? 1 : 0) - (b.variant_id ? 1 : 0));
    const own = fitRows.filter((f) => f.variant_id === existing.variant_id);
    const oldFits = own.length ? own : fitRows.filter((f) => !f.variant_id);
    setFamilyId(existing.family_id);
    setName(existing.name);
    setPrice(existing.retail_price);
    setCost(existing.avg_cost || null);
    setPackSize(existing.pack_size > 1 ? existing.pack_size : null);
    setPackLabel(existing.pack_label ?? '');
    setWarrantyMonths(existing.warranty_months || null);
    const sv: Record<string, SpecVal> = {};
    for (const r of oldSpecs) sv[r.spec_definition_id] = toVal(r);
    setSpecVals(sv);
    // An item with no specs yet keeps its typed name parts in Type / Colour.
    if (oldSpecs.length === 0) {
      const parts = (existing.variant_name || '').split(' · ');
      setType(parts[0] === 'Standard' ? '' : parts[0] ?? '');
      setColour(parts[1] ?? '');
    }
    setFits(oldFits.map((f) => ({ model_id: f.model_id, year_from: f.year_from ?? f.gen_from, year_to: f.year_to ?? f.gen_to })));
    setUniversal(!!existing.is_universal_fit && oldFits.length === 0);
  }

  // A new kism starts from the item and its first kism — the same socket, the
  // same mat type — so only what is different (the car, a colour) is changed.
  const [loadedKism, setLoadedKism] = useState<string | null>(null);
  if (kismOf && !requestId && base && itemReady && specRows && loadedKism !== kismOf) {
    setLoadedKism(kismOf);
    setFamilyId(base.family_id);
    setName(base.name);
    const sv: Record<string, SpecVal> = {};
    for (const r of specRows) if (r.variant_id && r.variant_id === base.first_kism) sv[r.spec_definition_id] = toVal(r);
    setSpecVals({ ...sv, ...baseVals });
  }

  // Load a reopened request once its row arrives.
  const [loadedReq, setLoadedReq] = useState<string | null>(null);
  // A kism request also waits for its item's own rows: the item fills in
  // whatever the request did not change.
  if (request && loadedReq !== request.id && (!proposalOfRequest?.product_id || itemReady)) {
    setLoadedReq(request.id);
    const p = parseProposal(request);
    if (p) {
      setFamilyId(p.family_id);
      if (!p.family_id) setNewFamilyName(p.family_name ?? '');
      setName(p.name ?? '');
      setType(p.type ?? '');
      setColour(p.colour ?? '');
      const sv: Record<string, SpecVal> = {};
      for (const s of p.specs ?? []) {
        sv[s.def_id] = { option_id: s.option_id, option_ids: s.option_ids?.split(',').filter(Boolean), text: s.text ?? undefined, number: s.number, bool: s.bool };
      }
      // A kism request carries only what differs; the item's own fills the rest.
      setSpecVals(p.product_id ? { ...baseVals, ...sv } : sv);
      setFits(fitsOf(p));
      setUniversal(!!p.universal);
      setQty(p.qty ?? null);
      setPrice(p.price ?? null);
      setCost(p.cost ?? null);
      setPackSize(p.pack_size ?? null);
      setPackLabel(p.pack_label ?? '');
      setWarrantyMonths(p.warranty_months ?? null);
      setNote(request.note ?? '');
    }
  }

  // The photo already on this item, if any.
  const { data: photoRows } = useQuery<{ id: string; storage_path: string }>(
    'SELECT id, storage_path FROM product_images WHERE variant_id = ? ORDER BY sort_order LIMIT 1', [existing?.variant_id ?? '']);
  const photo = photoRows?.[0] ?? null;
  // A brand new item has no variant to attach a photo to, so one chosen now
  // waits here and is uploaded once the save has minted the ids.
  const [pendingPhoto, setPendingPhoto] = useState<PickedPhoto | null>(null);

  const { data: skuRows } = useQuery<{ sku: string }>('SELECT sku FROM product_variants');
  const takenSkus = useMemo(() => new Set((skuRows ?? []).map((r) => r.sku)), [skuRows]);

  async function addCategory(text: string): Promise<void> {
    if (!canEdit) {
      // Do not write it: the server would refuse and PowerSync would revert the
      // row, leaving the form quietly invalid with nothing on screen to say so.
      setNewFamilyName(text.trim());
      setFamilyId(null);
      return;
    }
    const code = slug(text, 6) || `CAT${Date.now() % 1000}`;
    const newId = await insertRow(db, 'product_families', {
      code, name: text.trim(), sku_prefix: slug(text, 4) || code,
      sku_template: '{FAMILY}-{AXES}', is_fitment_required: false, is_active: true, sort_order: 100,
    });
    setFamilyId(newId);
  }

  // Typing a name that already exists offers that item, so it is not made
  // twice — a second car or colour is a new kism of it, not a new item.
  const nameTokens = name.trim().toLowerCase().split(/\s+/).filter((t) => t.length >= 2).slice(0, 4);
  const lookFor = isNew && !kismOf && name.trim().length >= 3;
  const { data: twins } = useQuery<{ id: string; name: string; family: string | null; kisms: number }>(
    `SELECT p.id, p.name, f.name AS family,
            (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS kisms
       FROM products p LEFT JOIN product_families f ON f.id = p.family_id
      WHERE p.is_active = 1 AND ?1 = 1 ${nameTokens.map((_, i) => `AND lower(p.name) LIKE ?${i + 2}`).join(' ')}
      ORDER BY p.name LIMIT 5`,
    [lookFor ? 1 : 0, ...nameTokens.map((t) => `%${t}%`)]);
  const asKism = (pid: string) =>
    router.replace(`/admin/item?product=${pid}${back ? `&back=${encodeURIComponent(back)}` : ''}` as never);

  async function addCar(text: string): Promise<string | null> {
    // A model typed here lands under an "Other" make; the vehicle list can
    // tidy it later. Staff cannot write vehicles, so for them it is refused.
    if (!canEdit) { notify('Nayi gaadi owner jodta hai. List mein se chuno ya note mein likh do.'); return null; }
    const makes = await db.getAll<{ id: string }>("SELECT id FROM vehicle_makes WHERE name = 'Other' LIMIT 1");
    const makeId = makes[0]?.id ?? (await insertRow(db, 'vehicle_makes', { name: 'Other', code: 'OTHER', is_active: true }));
    return insertRow(db, 'vehicle_models', {
      make_id: makeId, name: text.trim(), code: slug(text, 8) || `M${Date.now() % 10000}`,
      search_text: text.trim().toLowerCase(), is_active: true,
    });
  }

  const setSpec = (defId: string, v: SpecVal) => setSpecVals((prev) => ({ ...prev, [defId]: v }));

  /** The specs as the proposal carries them, with the words people will read. */
  function builtSpecs(): ProposalSpec[] {
    return (defs ?? []).map((d) => {
      const v = specVals[d.id] ?? {};
      const options = optsByDef.get(d.id) ?? [];
      let display = '';
      if (d.data_type === 'select') display = options.find((o) => o.id === v.option_id)?.value ?? '';
      else if (d.data_type === 'multiselect') display = (v.option_ids ?? []).map((oid) => options.find((o) => o.id === oid)?.value).filter(Boolean).join(', ');
      else if (d.data_type === 'number') display = v.number != null ? `${v.number}${d.unit ? ` ${d.unit}` : ''}` : '';
      else if (d.data_type === 'boolean') display = v.bool == null ? '' : v.bool ? `${d.name}: Haan` : '';
      else display = (v.text ?? '').trim();
      return {
        def_id: d.id, name: d.name, axis: !!d.is_variant_axis, in_name: !!d.show_in_variant_name, sort: d.sort_order, display,
        option_id: d.data_type === 'select' ? v.option_id ?? null : null,
        option_ids: d.data_type === 'multiselect' && v.option_ids?.length ? v.option_ids.join(',') : null,
        text: d.data_type === 'text' || d.data_type === 'multiselect' ? display || null : null,
        number: d.data_type === 'number' ? v.number ?? null : null,
        bool: d.data_type === 'boolean' ? v.bool ?? null : null,
        inherited: !!kismOf && sameVal(v, baseVals[d.id]),
      };
    }).filter((s) => s.display);
  }

  function buildProposal(): ItemProposal {
    const fam = families?.find((f) => f.id === familyId);
    return {
      family_id: kismOf ? base?.family_id ?? familyId : familyId,
      family_name: kismOf ? base?.family_name ?? fam?.name ?? null : fam?.name ?? (newFamilyName.trim() || null),
      name: kismOf ? base?.name ?? name : name, type, colour,
      specs: builtSpecs(),
      fits: universal ? [] : fits.map((f) => {
        const m = models?.find((x) => x.id === f.model_id);
        return { ...f, label: `${m?.name ?? ''}${yearsLabel(f)}`.trim(), make: m?.make_name };
      }),
      universal: kismOf ? false : universal,
      product_id: kismOf,
      product_name: kismOf ? base?.name ?? null : null,
      qty, price, cost,
      pack_size: packSize, pack_label: packLabel, warranty_months: warrantyMonths,
    };
  }

  /** Attach or detach the photo row for an item that already exists. */
  async function setPhoto(storagePath: string | null) {
    if (!existing) return;
    if (storagePath) {
      if (photo) await updateRow(db, 'product_images', photo.id, { storage_path: storagePath });
      else await insertRow(db, 'product_images', { product_id: existing.id, variant_id: existing.variant_id, storage_path: storagePath, sort_order: 0 }, actor);
    } else if (photo) {
      await db.execute('DELETE FROM product_images WHERE id = ?', [photo.id]);
    }
  }

  // Only the one spec that tells one item from the next (a bulb's socket, the
  // family's first required axis) has to be filled; the rest are welcome but
  // never hold up an entry at the counter.
  // An item made before specs existed can still be edited (a new price) without
  // first being made to fill them; a new item has to say what it is.
  const keySpecId = isNew ? (defs ?? []).find((d) => d.is_required && d.is_variant_axis)?.id ?? null : null;
  const kismCount = base?.kisms ?? 0;
  const mustFill = (d: Def) => d.id === keySpecId;
  function missingRequired(): string | null {
    const filled = new Set(builtSpecs().map((s) => s.def_id));
    const gap = (defs ?? []).find((d) => mustFill(d) && !filled.has(d.id));
    return gap ? `${gap.name} chuno.` : null;
  }

  async function save() {
    const proposal = buildProposal();
    const bad = validateProposal(proposal) ?? missingRequired()
      ?? (badYears(proposal.fits ?? []) ? 'Gaadi ka “tak” wala saal “se” se pehle hai — theek karo.' : null);
    if (bad) { notify(bad); return; }

    setSaving(true);
    try {
      // Staff have no `catalog.edit`, so the same form sends a proposal to the
      // owner instead of writing the catalogue.
      if (!canEdit) {
        if (!actor.userId) { notify('Session purana ho gaya. Dobara sign in karo.', 'danger'); return; }
        if (requestId) {
          await resubmitRequest(db, requestId, proposal, note);
          notify(request?.status === 'pending' ? 'Badlav owner tak pahunch gaya.' : 'Dobara bhej diya. Owner dekhega.', 'ok');
        } else {
          await submitRequest(db, proposal, { actor, locationId, note });
          notify('Owner ko bhej diya. Approve hote hi item ban jayega.', 'ok');
        }
        // Sent from Stock Chadhao or a bill (?back=): go back to it, the
        // half-made entry is still there. Otherwise show the request list.
        if (back && router.canGoBack()) router.back();
        else router.replace('/requests');
        return;
      }

      const fam = families?.find((f) => f.id === familyId);

      if (existing) {
        const variantName = variantNameOf(proposal);
        const text = searchText(name, fam?.name, type, colour, ...(proposal.specs ?? []).map((s) => s.display), ...(proposal.fits ?? []).map((f) => f.label ?? ''));
        await db.writeTransaction(async (tx) => {
          await updateRow(tx, 'products', existing.id, {
            family_id: familyId, name: name.trim(), is_universal_fit: universal || (proposal.fits ?? []).length === 0, search_text: text,
          });
          await updateRow(tx, 'product_variants', existing.variant_id, {
            variant_name: variantName, retail_price: price, dealer_price: price,
            pack_size: packSize ?? 1, pack_label: packLabel.trim() || null, warranty_months: warrantyMonths ?? 0,
            search_text: searchText(text, existing.sku, variantName),
            // The Kharid rate is the cost every later sale is booked at.
            ...(can('catalog.view_cost') && cost != null && cost > 0 && cost !== existing.avg_cost
              ? { avg_cost: cost, last_purchase_cost: cost }
              : {}),
          });
          await writeSpecsAndFits(tx, existing.id, existing.variant_id, proposal, actor, { scope: 'item', onlyKism: kismCount <= 1 });
        });
      } else {
        // The same function an approval runs, so a hand-typed item and an
        // approved one are the same rows.
        const made = await db.writeTransaction(async (tx) =>
          applyItemProposal(tx, proposal, { actor, locationId, takenSkus, skuPrefix: fam?.sku_prefix }));
        if (kismOf && !back) {
          router.replace(`/product/${made.productId}?variant=${made.variantId}` as never);
          notify('Nayi kism ban gayi.', 'ok');
          return;
        }

        // The photo could not be uploaded earlier because the item did not
        // exist yet. Do it now — and if it fails, the item is still saved.
        if (pendingPhoto) {
          try {
            const stored = await uploadPhoto(pendingPhoto, made.variantId);
            await insertRow(db, 'product_images', { product_id: made.productId, variant_id: made.variantId, storage_path: stored, sort_order: 0 }, actor);
          } catch (e) {
            notify(`Item ban gaya, par photo nahi chadhi: ${String((e as Error).message ?? e)}. Item kholke dobara lagao.`, 'ok');
          }
        }
      }
      router.replace((back as never) ?? ('/admin/products' as never));
    } catch (e) {
      notify(`Save nahi hua: ${String((e as Error).message ?? e)}`, 'danger');
    } finally {
      setSaving(false);
    }
  }

  // Editing an existing item stays owner-only; proposing a new one does not.
  if (!canEdit && !isNew) {
    return <Screen><Text>Sirf owner item badal sakta hai.</Text></Screen>;
  }

  const proposal = buildProposal();
  const missing = validateProposal(proposal) ?? missingRequired();
  const preview = variantNameOf(proposal);

  return (
    <>
      <Stack.Screen options={{ title: kismOf ? 'Nayi kism' : isNew ? 'Naya item' : 'Item badlo' }} />
      <Screen>
        <Text variant="display">{kismOf ? 'Nayi kism' : isNew ? 'Naya item' : 'Item badlo'}</Text>

        {kismOf ? (
          <Card spine="accent">
            <Text variant="heading">{base?.name ?? 'Item'}</Text>
            <Text variant="small" color="textMuted">
              {[base?.family_name, base ? `abhi ${base.kisms} kism` : null].filter(Boolean).join(' · ')}
            </Text>
            <Text variant="small" color="textMuted">
              Isi item ki nayi kism — sirf gaadi, saal, colour jaisi jo cheez alag hai wo chuno. Naam, category aur baaki detail wahi rahegi.
            </Text>
          </Card>
        ) : null}
        {!isNew && kismCount > 1 ? (
          <Card spine="warn">
            <Text variant="small" color="textMuted">
              Is item ki {kismCount} kism hain — yahan “{existing?.variant_name}” badal rahe ho. Naam, category aur common detail sab kism par lagegi; gaadi aur rate sirf isi kism ka.
            </Text>
          </Card>
        ) : null}
        {lookFor && (twins ?? []).length > 0 ? (
          <Card spine="warn" style={{ gap: space.xs }}>
            <Text variant="heading">Ye item pehle se hai?</Text>
            <Text variant="small" color="textMuted">Doosri gaadi ya colour ke liye naya item mat banao — usi mein nayi kism jodo.</Text>
            {(twins ?? []).map((t) => (
              <Row key={t.id} style={{ justifyContent: 'space-between' }} gap={space.sm}>
                <View style={{ flex: 1 }}>
                  <Text>{t.name}</Text>
                  <Text variant="small" color="textFaint">{[t.family, `${t.kisms} kism`].filter(Boolean).join(' · ')}</Text>
                </View>
                <Button title="Isi mein nayi kism" size="sm" tone="secondary" onPress={() => asKism(t.id)} />
              </Row>
            ))}
          </Card>
        ) : null}

        <FormSection title="Maal" hint="Category, naam, qty aur rate.">
          <PhotoPicker
            folder={existing?.id}
            path={photo?.storage_path}
            localUri={pendingPhoto?.uri}
            name={name || 'Item'}
            onChange={setPhoto}
            onPickLocal={setPendingPhoto}
            canEdit={canEdit}
          />
          {kismOf ? null : (<>
          <SelectField
            label="Category"
            value={familyId}
            options={(families ?? []).map((f) => ({ value: f.id, label: f.name }))}
            onChange={(v) => { setFamilyId(v); setSpecVals({}); }}
            onCreate={addCategory}
            placeholder="LED Bulb / Mats / Seat cover…"
            hint={!canEdit && newFamilyName ? `Nayi category "${newFamilyName}" — owner approve karega` : undefined}
          />
          <Input label="Item ka naam" value={name} onChangeText={setName} placeholder="Philips Ultinon LED" autoCapitalize="words" />
          </>)}
          <Row gap={12}>
            <View style={{ flex: 1 }}>
              <NumberField label="Qty" value={qty} onChange={setQty} decimals={0} placeholder="10" hint={isNew ? undefined : 'Stock yahan se nahi badalta'} editable={isNew} />
            </View>
            <View style={{ flex: 1 }}>
              <NumberField label="Bechne ka rate" value={price} onChange={setPrice} placeholder="1550" />
            </View>
          </Row>
          {can('catalog.view_cost') ? (
            <NumberField label="Kharid rate" value={cost} onChange={setCost} placeholder="1200" hint="Isi se bikri ki cost aur munafa ginte hain." />
          ) : null}
        </FormSection>

        {/* The family's own specs: what tells one bulb from another. */}
        {(defs ?? []).length > 0 ? (
          <FormSection title="Detail" hint={`Ye detail stock list, bill aur item ke page par dikhegi${preview !== 'Standard' ? ` — “${preview}”` : ''}.`}>
            {(defs ?? []).map((d) => {
              const v = specVals[d.id] ?? {};
              const options = optsByDef.get(d.id) ?? [];
              const label = `${d.name}${d.unit ? ` (${d.unit})` : ''}${mustFill(d) ? ' *' : ''}`;
              if (d.data_type === 'select' && options.length > 14) {
                return (
                  <SelectField key={d.id} label={label} value={v.option_id ?? null} allowClear
                    options={options.map((o) => ({ value: o.id, label: o.value }))}
                    onChange={(oid) => setSpec(d.id, { option_id: oid })} />
                );
              }
              if (d.data_type === 'select' || d.data_type === 'multiselect') {
                const multi = d.data_type === 'multiselect';
                return (
                  <View key={d.id} style={{ gap: space.xs }}>
                    <Text variant="label" color="textMuted">{label}</Text>
                    <Row gap={space.xs} wrap>
                      {options.map((o) => {
                        const on = multi ? (v.option_ids ?? []).includes(o.id) : v.option_id === o.id;
                        return (
                          <Chip key={o.id} label={o.value} selected={on} onPress={() => setSpec(d.id, multi
                            ? { option_ids: on ? (v.option_ids ?? []).filter((x) => x !== o.id) : [...(v.option_ids ?? []), o.id] }
                            : { option_id: on ? null : o.id })} />
                        );
                      })}
                    </Row>
                  </View>
                );
              }
              if (d.data_type === 'number') {
                return <NumberField key={d.id} label={label} value={v.number ?? null} onChange={(n) => setSpec(d.id, { number: n })} />;
              }
              if (d.data_type === 'boolean') {
                return (
                  <View key={d.id} style={{ gap: space.xs }}>
                    <Text variant="label" color="textMuted">{label}</Text>
                    <Row gap={space.xs}>
                      <Chip label="Haan" selected={v.bool === true} onPress={() => setSpec(d.id, { bool: v.bool === true ? null : true })} />
                      <Chip label="Nahi" selected={v.bool === false} onPress={() => setSpec(d.id, { bool: v.bool === false ? null : false })} />
                    </Row>
                  </View>
                );
              }
              return <Input key={d.id} label={label} value={v.text ?? ''} onChangeText={(text) => setSpec(d.id, { text })} autoCorrect={false} />;
            })}
          </FormSection>
        ) : (
          <FormSection title="Detail" hint="Is category mein tay detail nahi hai — type aur colour likh do.">
            <Row gap={12}>
              <Input containerStyle={{ flex: 1 }} label="Type" value={type} onChangeText={setType} placeholder="7D / Premium" autoCapitalize="words" autoCorrect={false} />
              <Input containerStyle={{ flex: 1 }} label="Colour" value={colour} onChangeText={setColour} placeholder="Black" autoCapitalize="words" autoCorrect={false} />
            </Row>
          </FormSection>
        )}

        {/* Which cars: a list, each car with its own years. */}
        <FormSection title="Kis gaadi mein lagta hai" hint="Gaadi chuno — turant jud jaati hai — phir saal. Har gaadi mein lagta ho to “Sab gaadi”.">
          <CarPicker fits={fits} onChange={setFits} models={models ?? []} universal={universal}
            onUniversal={kismOf ? undefined : setUniversal} onAddCar={addCar} />
        </FormSection>

        <Disclosure title="Aur detail" hint="Set/pair, warranty — zaroorat ho to kholo." defaultOpen={!isNew && (packSize != null || warrantyMonths != null)}>
          <Row gap={12}>
            <View style={{ flex: 1 }}>
              <NumberField label="Ek set mein pieces" value={packSize} onChange={setPackSize} decimals={0} placeholder="7" />
            </View>
            <Input containerStyle={{ flex: 1 }} label="Kya bolte ho" value={packLabel} onChangeText={setPackLabel} placeholder="set / pair / box" autoCapitalize="none" autoCorrect={false} />
          </Row>
          <NumberField label="Warranty (mahine)" value={warrantyMonths} onChange={setWarrantyMonths} decimals={0} placeholder="6"
            hint="LED, screen, camera par likho — bill par apne aap dikhega." />
        </Disclosure>

        {!canEdit ? (
          <Input
            label="Owner ke liye note"
            value={note}
            onChangeText={setNote}
            placeholder="Kyu chahiye, ya kya badla — ek line"
            hint={requestId && request?.status === 'rejected' ? 'Pichli baar wapas aayi thi — yahan likho ki ab kya theek kiya.' : 'Owner yahi padhega jab approve karega.'}
            multiline
          />
        ) : null}

        {/* The button asks the same question save() does, so it greys out for
            exactly the reasons the save would have refused — and says which. */}
        {missing ? <Text variant="small" color="textFaint">{missing}</Text> : null}
        <Row gap={space.sm}>
          <Button
            title={canEdit ? (isNew ? 'Item bana do' : 'Badlav kar do') : (requestId ? (request?.status === 'pending' ? 'Badlav bhejo' : 'Dobara bhejo') : 'Owner ko bhejo')}
            size="lg" onPress={save} loading={saving} disabled={!!missing} style={{ flex: 1 }}
          />
          <Button title="Rehne do" tone="secondary" onPress={() => router.back()} />
        </Row>
      </Screen>
    </>
  );
}
