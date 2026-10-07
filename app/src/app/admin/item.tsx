/**
 * Add / edit one item.
 *
 * The owner thinks in plain lines: "ye category hai, ye maal hai, ye socket
 * hai, ye car hai, ye saal, ye rate". This screen is exactly that, on one
 * page (owner, 6 Oct 2026: "naam + category + gaadi + saal + model + product
 * specs bhi chaiye — bulb mai socket type H4, H7 nahi show ho raha tha").
 *
 *   · Category picks the family; the family's own spec list (socket, watt,
 *     colour temperature for a bulb; type, colour, material for a mat) opens
 *     right under it as chips and boxes.
 *   · Gaadi is a list: company + model, each with the years it fits, or "Sab
 *     gaadi" for things sold by spec rather than by car.
 *
 * Underneath it writes the rows the rest of the app reads — product, one
 * variant, spec_values, product_fitments, opening stock — in one transaction.
 * The variant's name is built from the specs that name it ("H4 · 60/55 W"),
 * so the stock list, the bill search and the item page all show them.
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
import { Button, Chip, Input, Row, Screen, Text } from '@/ui';
import { Disclosure, FormSection, NumberField, SelectField, notify } from '@/ui/forms';
import { PhotoPicker } from '@/ui/photo';
import { space } from '@/ui/theme';

type Family = { id: string; name: string; sku_prefix: string };
type Model = { id: string; name: string; make_name: string };
type Gen = { id: string; model_id: string; name: string; year_from: number | null; year_to: number | null };
type Def = { id: string; code: string; name: string; data_type: string; unit: string | null; is_required: number; is_variant_axis: number; show_in_variant_name: number; sort_order: number };
type Opt = { id: string; spec_definition_id: string; value: string };
type Existing = {
  id: string; name: string; family_id: string; variant_id: string; variant_name: string; sku: string; is_universal_fit: number;
  retail_price: number; dealer_price: number | null; avg_cost: number; pack_size: number; pack_label: string | null; warranty_months: number;
};
/** What the person has put in one spec box. */
type SpecVal = { option_id?: string | null; option_ids?: string[]; text?: string; number?: number | null; bool?: boolean | null };

const yearsLabel = (f: { year_from?: number | null; year_to?: number | null }) =>
  f.year_from ? ` ${f.year_from}${f.year_to ? (f.year_to === f.year_from ? '' : `–${f.year_to}`) : '+'}` : '';

export default function ItemForm() {
  const { id, request: requestId, name: nameParam, back } = useLocalSearchParams<{ id?: string; request?: string; name?: string; back?: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { actor, locationId, can } = useSession();
  const isNew = !id;
  const [saving, setSaving] = useState(false);

  const { data: families } = useQuery<Family>('SELECT id, name, sku_prefix FROM product_families WHERE is_active = 1 ORDER BY sort_order, name');
  const { data: models } = useQuery<Model>(
    'SELECT vm.id, vm.name, mk.name AS make_name FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id WHERE vm.is_active = 1 ORDER BY mk.name, vm.name');
  const { data: rows } = useQuery<Existing>(
    `SELECT p.id, p.name, p.family_id, p.is_universal_fit, pv.id AS variant_id, pv.variant_name, pv.sku, pv.retail_price, pv.dealer_price,
            pv.avg_cost, pv.pack_size, pv.pack_label, pv.warranty_months
       FROM products p JOIN product_variants pv ON pv.product_id = p.id WHERE p.id = ? ORDER BY pv.sort_order LIMIT 1`,
    [id ?? '']);
  const existing = rows?.[0] ?? null;
  const { data: oldSpecs } = useQuery<{ spec_definition_id: string; option_id: string | null; option_ids: string | null; value_text: string | null; value_number: number | null; value_bool: number | null }>(
    'SELECT spec_definition_id, option_id, option_ids, value_text, value_number, value_bool FROM spec_values WHERE product_id = ?', [id ?? '']);
  const { data: oldFits } = useQuery<{ model_id: string; year_from: number | null; year_to: number | null; gen_from: number | null; gen_to: number | null }>(
    `SELECT pf.model_id, pf.year_from, pf.year_to, g.year_from AS gen_from, g.year_to AS gen_to
       FROM product_fitments pf LEFT JOIN vehicle_generations g ON g.id = pf.generation_id WHERE pf.product_id = ?`, [id ?? '']);

  // Reopening a rejected proposal: the same form, prefilled with what was sent
  // last time, so the submitter fixes the one thing instead of retyping it all.
  const { data: reqRows } = useQuery<ChangeRequest>('SELECT * FROM change_requests WHERE id = ? LIMIT 1', [requestId ?? '']);
  const request = requestId ? (reqRows?.[0] ?? null) : null;
  const canEdit = can('catalog.edit');

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [name, setName] = useState(nameParam ?? '');
  const [type, setType] = useState('');
  const [colour, setColour] = useState('');
  const [specVals, setSpecVals] = useState<Record<string, SpecVal>>({});
  const [fits, setFits] = useState<ProposalFit[]>([]);
  const [universal, setUniversal] = useState(false);
  const [pickModel, setPickModel] = useState<string | null>(null);
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
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
  const { data: gens } = useQuery<Gen>(
    'SELECT id, model_id, name, year_from, year_to FROM vehicle_generations WHERE model_id = ? ORDER BY year_from', [pickModel ?? '']);

  // Load the existing item once its rows arrive.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (existing && oldSpecs && oldFits && loadedId !== existing.id) {
    setLoadedId(existing.id);
    setFamilyId(existing.family_id);
    setName(existing.name);
    setPrice(existing.retail_price);
    setCost(existing.avg_cost || null);
    setPackSize(existing.pack_size > 1 ? existing.pack_size : null);
    setPackLabel(existing.pack_label ?? '');
    setWarrantyMonths(existing.warranty_months || null);
    const sv: Record<string, SpecVal> = {};
    for (const r of oldSpecs) {
      sv[r.spec_definition_id] = {
        option_id: r.option_id, option_ids: r.option_ids ? r.option_ids.split(',').filter(Boolean) : undefined,
        text: r.value_text ?? undefined, number: r.value_number, bool: r.value_bool == null ? null : !!r.value_bool,
      };
    }
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

  // Load a reopened request once its row arrives.
  const [loadedReq, setLoadedReq] = useState<string | null>(null);
  if (request && loadedReq !== request.id) {
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
      setSpecVals(sv);
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

  const modelLabel = (mid: string) => {
    const m = models?.find((x) => x.id === mid);
    return m ? `${m.make_name} ${m.name}` : 'Gaadi';
  };

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

  async function addCar(text: string): Promise<void> {
    // A model typed here lands under an "Other" make; the vehicle list can
    // tidy it later. Staff cannot write vehicles, so for them it is refused.
    if (!canEdit) { notify('Nayi gaadi owner jodta hai. List mein se chuno ya note mein likh do.'); return; }
    const makes = await db.getAll<{ id: string }>("SELECT id FROM vehicle_makes WHERE name = 'Other' LIMIT 1");
    const makeId = makes[0]?.id ?? (await insertRow(db, 'vehicle_makes', { name: 'Other', code: 'OTHER', is_active: true }));
    const newId = await insertRow(db, 'vehicle_models', {
      make_id: makeId, name: text.trim(), code: slug(text, 8) || `M${Date.now() % 10000}`,
      search_text: text.trim().toLowerCase(), is_active: true,
    });
    setPickModel(newId);
  }

  function addFit() {
    if (!pickModel) { notify('Pehle gaadi chuno.'); return; }
    if (yearFrom && yearTo && yearTo < yearFrom) { notify('“Tak” wala saal “Se” se pehle nahi ho sakta.'); return; }
    const f: ProposalFit = { model_id: pickModel, year_from: yearFrom, year_to: yearTo };
    setFits((prev) => [...prev.filter((x) => !(x.model_id === f.model_id && x.year_from === f.year_from && x.year_to === f.year_to)), f]);
    setUniversal(false);
    setPickModel(null);
    setYearFrom(null);
    setYearTo(null);
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
      };
    }).filter((s) => s.display);
  }

  function buildProposal(): ItemProposal {
    const fam = families?.find((f) => f.id === familyId);
    return {
      family_id: familyId,
      family_name: fam?.name ?? (newFamilyName.trim() || null),
      name, type, colour,
      specs: builtSpecs(),
      fits: universal ? [] : fits.map((f) => ({ ...f, label: `${modelLabel(f.model_id)}${yearsLabel(f)}` })),
      universal,
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
  const mustFill = (d: Def) => d.id === keySpecId;
  function missingRequired(): string | null {
    const filled = new Set(builtSpecs().map((s) => s.def_id));
    const gap = (defs ?? []).find((d) => mustFill(d) && !filled.has(d.id));
    return gap ? `${gap.name} chuno.` : null;
  }

  async function save() {
    const proposal = buildProposal();
    const bad = validateProposal(proposal) ?? missingRequired();
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
          await writeSpecsAndFits(tx, existing.id, existing.variant_id, proposal, actor);
        });
      } else {
        // The same function an approval runs, so a hand-typed item and an
        // approved one are the same rows.
        const made = await db.writeTransaction(async (tx) =>
          applyItemProposal(tx, proposal, { actor, locationId, takenSkus, skuPrefix: fam?.sku_prefix }));

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
      <Stack.Screen options={{ title: isNew ? 'Naya item' : 'Item badlo' }} />
      <Screen>
        <Text variant="display">{isNew ? 'Naya item' : 'Item badlo'}</Text>

        <FormSection title="Maal" hint="Category, naam, qty aur rate.">
          <PhotoPicker
            variantId={existing?.variant_id}
            path={photo?.storage_path}
            localUri={pendingPhoto?.uri}
            name={name || 'Item'}
            onChange={setPhoto}
            onPickLocal={setPendingPhoto}
            canEdit={canEdit}
          />
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
        <FormSection title="Kis gaadi mein lagta hai" hint="Company + model chuno, saal likho, “Gaadi jodo”. Har gaadi mein lagta ho to “Sab gaadi”.">
          <Row gap={space.xs} wrap>
            <Chip label="Sab gaadi" selected={universal} onPress={() => { setUniversal(!universal); if (!universal) setFits([]); }} />
            {fits.map((f, i) => (
              <Chip key={`${f.model_id}-${i}`} label={`${modelLabel(f.model_id)}${yearsLabel(f)}  ✕`} selected
                onPress={() => setFits((prev) => prev.filter((_, j) => j !== i))} />
            ))}
          </Row>
          {!universal ? (
            <>
              <SelectField
                label="Gaadi (company + model)"
                value={pickModel}
                options={(models ?? []).map((m) => ({ value: m.id, label: `${m.make_name} ${m.name}` }))}
                onChange={(v) => { setPickModel(v); setYearFrom(null); setYearTo(null); }}
                onCreate={addCar}
                allowClear
                placeholder="Creta, Swift, Nexon…"
              />
              {pickModel && (gens ?? []).length > 0 ? (
                <Row gap={space.xs} wrap>
                  {(gens ?? []).map((g) => (
                    <Chip key={g.id} label={`${g.name}${yearsLabel(g)}`} selected={yearFrom === g.year_from && yearTo === g.year_to}
                      onPress={() => { setYearFrom(g.year_from); setYearTo(g.year_to); }} />
                  ))}
                </Row>
              ) : null}
              <Row gap={12} align="flex-end">
                <View style={{ flex: 1 }}><NumberField label="Saal se" value={yearFrom} onChange={setYearFrom} decimals={0} placeholder="2019" /></View>
                <View style={{ flex: 1 }}><NumberField label="Saal tak" value={yearTo} onChange={setYearTo} decimals={0} placeholder="2023" /></View>
              </Row>
              <Button title="+ Gaadi jodo" tone="secondary" onPress={addFit} disabled={!pickModel} />
            </>
          ) : null}
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
