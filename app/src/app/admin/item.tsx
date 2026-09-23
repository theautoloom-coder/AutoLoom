/**
 * Add / edit one item — the simple way.
 *
 * The owner thinks in plain lines: "ye category hai, ye maal hai, ye type hai,
 * ye car hai, itni qty hai, ye colour, ye rate". This screen is exactly that,
 * on one page. The five-step wizard (family → specs → variants → fitment →
 * review) still exists at /admin/product/[id] for anyone who needs axes and
 * multi-SKU generation, but it is no longer the way in.
 *
 * Underneath it still writes the same rows the rest of the app reads —
 * product + one variant + optional fitment + opening stock — in one
 * transaction, so billing, stock and reports keep working unchanged.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { slug, uniqueSku, uuidv7 } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import {
  applyItemProposal, parseProposal, resubmitRequest, submitRequest, validateProposal,
  type ChangeRequest, type ItemProposal,
} from '@/lib/requests';
import { insertRow, searchText, updateRow } from '@/lib/writes';
import { Button, Input, Row, Screen, Text } from '@/ui';
import { Disclosure, FormSection, NumberField, SelectField, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type Family = { id: string; name: string; sku_prefix: string };
type Model = { id: string; name: string; make_name: string };
type Existing = {
  id: string; name: string; family_id: string; variant_id: string; variant_name: string; sku: string;
  retail_price: number; dealer_price: number | null; avg_cost: number; pack_size: number; pack_label: string | null; warranty_months: number; model_id: string | null;
};

export default function ItemForm() {
  const { id, request: requestId, name: nameParam, back } = useLocalSearchParams<{ id?: string; request?: string; name?: string; back?: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { actor, locationId, can } = useSession();
  const isNew = !id;
  const [saving, setSaving] = useState(false);

  const { data: families } = useQuery<Family>('SELECT id, name, sku_prefix FROM product_families WHERE is_active = 1 ORDER BY name');
  const { data: models } = useQuery<Model>(
    'SELECT vm.id, vm.name, mk.name AS make_name FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id WHERE vm.is_active = 1 ORDER BY mk.name, vm.name'
  );
  const { data: rows } = useQuery<Existing>(
    `SELECT p.id, p.name, p.family_id, pv.id AS variant_id, pv.variant_name, pv.sku, pv.retail_price, pv.dealer_price, pv.avg_cost, pv.pack_size, pv.pack_label, pv.warranty_months,
            (SELECT pf.model_id FROM product_fitments pf WHERE pf.product_id = p.id LIMIT 1) AS model_id
     FROM products p JOIN product_variants pv ON pv.product_id = p.id WHERE p.id = ? LIMIT 1`,
    [id ?? '']
  );
  const existing = rows?.[0] ?? null;

  // Reopening a rejected proposal: the same form, prefilled with what was sent
  // last time, so the submitter fixes the one thing instead of retyping it all.
  const { data: reqRows } = useQuery<ChangeRequest>(
    'SELECT * FROM change_requests WHERE id = ? LIMIT 1', [requestId ?? '']
  );
  const request = requestId ? (reqRows?.[0] ?? null) : null;
  const canEdit = can('catalog.edit');

  const [familyId, setFamilyId] = useState<string | null>(null);
  // Opened from a bill with the text the salesman had already typed.
  const [name, setName] = useState(nameParam ?? '');
  const [type, setType] = useState('');
  const [modelId, setModelId] = useState<string | null>(null);
  const [yearText, setYearText] = useState('');
  const [colour, setColour] = useState('');
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

  // Load the existing item once its row arrives.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (existing && loadedId !== existing.id) {
    setLoadedId(existing.id);
    setFamilyId(existing.family_id);
    setName(existing.name);
    setModelId(existing.model_id);
    setPrice(existing.retail_price);
    setCost(existing.avg_cost || null);
    setPackSize(existing.pack_size > 1 ? existing.pack_size : null);
    setPackLabel(existing.pack_label ?? '');
    setWarrantyMonths(existing.warranty_months || null);
    const parts = (existing.variant_name || '').split(' · ');
    setType(parts[0] ?? '');
    setColour(parts[1] ?? '');
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
      setModelId(p.model_id ?? null);
      setYearText(p.year_text ?? '');
      setQty(p.qty ?? null);
      setPrice(p.price ?? null);
      setCost(p.cost ?? null);
      setPackSize(p.pack_size ?? null);
      setPackLabel(p.pack_label ?? '');
      setWarrantyMonths(p.warranty_months ?? null);
      setNote(request.note ?? '');
    }
  }

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

  async function addCar(text: string): Promise<void> {
    // Everything typed here lands under one "Other" make so the owner never
    // has to think about makes; the vehicle master can tidy it later.
    const makes = await db.getAll<{ id: string }>("SELECT id FROM vehicle_makes WHERE name = 'Other' LIMIT 1");
    const makeId = makes[0]?.id ?? (await insertRow(db, 'vehicle_makes', { name: 'Other', code: 'OTHER', is_active: true }));
    const newId = await insertRow(db, 'vehicle_models', {
      make_id: makeId, name: text.trim(), code: slug(text, 8) || `M${Date.now() % 10000}`,
      search_text: text.trim().toLowerCase(), is_active: true,
    });
    setModelId(newId);
  }

  function buildProposal(): ItemProposal {
    const fam = families?.find((f) => f.id === familyId);
    const car = models?.find((m) => m.id === modelId);
    return {
      family_id: familyId,
      family_name: fam?.name ?? (newFamilyName.trim() || null),
      name,
      type,
      colour,
      model_id: modelId,
      car_text: car ? `${car.make_name} ${car.name}` : null,
      year_text: yearText,
      qty,
      price,
      cost,
      pack_size: packSize,
      pack_label: packLabel,
      warranty_months: warrantyMonths,
    };
  }

  async function save() {
    const proposal = buildProposal();
    const bad = validateProposal(proposal);
    if (bad) { notify(bad); return; }

    setSaving(true);
    try {
      // Staff have no `catalog.edit`, so the same form sends a proposal to the
      // admin instead of writing the catalogue. They used to hit a dead end
      // here and ring the owner.
      if (!canEdit) {
        if (!actor.userId) { notify('Session purana ho gaya. Dobara sign in karo.'); return; }
        if (requestId) {
          await resubmitRequest(db, requestId, proposal, note);
          notify('Dobara bhej diya. Admin dekhega.');
        } else {
          await submitRequest(db, proposal, { actor, locationId, note });
          notify('Admin ko bhej diya. Approve hote hi item ban jayega.');
        }
        router.replace('/requests');
        return;
      }

      const fam = families?.find((f) => f.id === familyId);

      if (existing) {
        const car = models?.find((m) => m.id === modelId);
        const carText = car ? `${car.make_name} ${car.name}` : '';
        const variantName = [type.trim(), colour.trim()].filter(Boolean).join(' · ') || 'Standard';
        const text = searchText(name, fam?.name, type, colour, carText, yearText);
        await db.writeTransaction(async (tx) => {
          await updateRow(tx, 'products', existing.id, {
            family_id: familyId, name: name.trim(), is_universal_fit: !modelId, search_text: text,
          });
          await updateRow(tx, 'product_variants', existing.variant_id, {
            variant_name: variantName, retail_price: price, dealer_price: price,
            pack_size: packSize ?? 1, pack_label: packLabel.trim() || null, warranty_months: warrantyMonths ?? 0,
            search_text: searchText(text, existing.sku, variantName),
          });
          await tx.execute('DELETE FROM product_fitments WHERE product_id = ?', [existing.id]);
          if (modelId) await insertRow(tx, 'product_fitments', { product_id: existing.id, variant_id: null, model_id: modelId }, actor);
        });
      } else {
        // The same function an approval runs, so a hand-typed item and an
        // approved one are the same rows.
        await db.writeTransaction(async (tx) => {
          await applyItemProposal(tx, proposal, {
            actor, locationId, takenSkus, skuPrefix: fam?.sku_prefix,
          });
        });
      }
      router.replace((back as never) ?? ('/admin/products' as never));
    } catch (e) {
      notify(`Save nahi hua: ${String((e as Error).message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  // Editing an existing item stays admin-only; proposing a new one does not.
  if (!canEdit && !isNew) {
    return <Screen><Text>Sirf admin item edit kar sakta hai.</Text></Screen>;
  }

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New item' : 'Edit item' }} />
      <Screen>
        <Text variant="display">{isNew ? 'Naya item' : 'Item edit'}</Text>

        {/* Naam, kitna aaya, kya rate — teen cheezein. Baaki sab neeche
            folded hai, kyunki das mein se ek item par hi zaroori hoti hai. */}
        <FormSection title="Maal" hint="Naam, qty aur rate — bas itna kaafi hai.">
          <SelectField
            label="Category"
            value={familyId}
            options={(families ?? []).map((f) => ({ value: f.id, label: f.name }))}
            onChange={setFamilyId}
            onCreate={addCategory}
            placeholder="Mats / LED / Side stepper…"
            hint={
              !canEdit && newFamilyName
                ? `Nayi category "${newFamilyName}" — admin approve karega`
                : undefined
            }
          />
          <Input label="Item ka naam" value={name} onChangeText={setName} placeholder="7D Luxury Mat" />
          <Row gap={12}>
            <View style={{ flex: 1 }}>
              <NumberField label="Qty" value={qty} onChange={setQty} decimals={0} placeholder="10" hint={isNew ? undefined : 'Stock yahan se nahi badalta'} />
            </View>
            <View style={{ flex: 1 }}>
              <NumberField label="Bechne ka rate" value={price} onChange={setPrice} placeholder="1550" />
            </View>
          </Row>
        </FormSection>

        {/* Open whenever there is already something in here to look at: an item
            being edited, or a rejected proposal being fixed. Collapsed over
            prefilled fields just hides the thing they came back to change. */}
        <Disclosure
          title="Aur detail"
          hint="Gaadi, colour, kharid rate, set/pair, warranty — zaroorat ho to kholo."
          defaultOpen={!isNew || !!requestId}>
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="Type" value={type} onChangeText={setType} placeholder="7D / Premium" />
            <Input containerStyle={{ flex: 1 }} label="Colour" value={colour} onChangeText={setColour} placeholder="Black" />
          </Row>
          <SelectField
            label="Gaadi"
            value={modelId}
            options={(models ?? []).map((m) => ({ value: m.id, label: `${m.make_name} ${m.name}` }))}
            onChange={setModelId}
            onCreate={addCar}
            allowClear
            placeholder="Sab gaadi ke liye — khaali chhod do"
          />
          <Input label="Model / saal" value={yearText} onChangeText={setYearText} placeholder="2020-2024" />
          <NumberField label="Kharid rate" value={cost} onChange={setCost} placeholder="1200" hint="Margin report ke liye." />
          <Row gap={12}>
            <View style={{ flex: 1 }}>
              <NumberField label="Ek set mein pieces" value={packSize} onChange={setPackSize} decimals={0} placeholder="7" />
            </View>
            <Input containerStyle={{ flex: 1 }} label="Kya bolte ho" value={packLabel} onChangeText={setPackLabel} placeholder="set / pair / box" />
          </Row>
          <NumberField
            label="Warranty (mahine)"
            value={warrantyMonths}
            onChange={setWarrantyMonths}
            decimals={0}
            placeholder="6"
            hint="LED, screen, camera par likho — customer page par apne aap dikhega."
          />
        </Disclosure>

        <Row gap={space.sm}>
          <Button
            title={canEdit ? (isNew ? 'Save item' : 'Update item') : (requestId ? 'Dobara bhejo' : 'Admin ko bhejo')}
            size="lg"
            onPress={save}
            loading={saving}
            style={{ flex: 1 }}
          />
          <Button title="Rehne do" tone="secondary" onPress={() => router.back()} />
        </Row>
      </Screen>
    </>
  );
}
