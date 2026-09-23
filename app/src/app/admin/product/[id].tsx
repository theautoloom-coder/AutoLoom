/**
 * Product wizard: create or edit a product with its dynamic specifications,
 * variants (SKUs), vehicle fitment, prices and opening stock.
 *
 * Steps: Family → Details → Variants → Fitment → Review.
 * Everything is saved in ONE local transaction at the end, so a product never
 * exists half-created on any device.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { axisCombinations, fitmentLabel, renderSku, renderVariantName, slug, uniqueSku, uuidv7, type AxisValue } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, searchText, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Divider, Input, KV, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';
import { FormSection, MultiSelectField, NumberField, SelectField, SwitchRow, confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
type Family = { id: string; code: string; name: string; sku_prefix: string; sku_template: string; default_hsn_code: string | null; default_unit_id: string | null; default_tax_rate_id: string | null; is_fitment_required: number; description: string | null };
type SpecDef = { id: string; code: string; name: string; data_type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect'; unit: string | null; is_required: number; is_variant_axis: number; show_in_variant_name: number; help_text: string | null; sort_order: number };
type SpecOpt = { id: string; spec_definition_id: string; value: string; code: string | null; aliases: string | null };
type SpecVal = { option_id?: string | null; option_ids?: string[]; value_number?: number | null; value_text?: string | null; value_bool?: boolean | null };

type VariantDraft = {
  key: string;
  id: string | null;
  axes: AxisValue[];
  axisValues: Record<string, SpecVal>;
  variant_name: string;
  sku: string;
  barcode: string;
  mrp: number | null;
  retail_price: number | null;
  dealer_price: number | null;
  wholesale_price: number | null;
  min_selling_price: number | null;
  min_stock: number | null;
  reorder_level: number | null;
  reorder_qty: number | null;
  opening_qty: number | null;
  opening_cost: number | null;
  is_active: boolean;
  existingQty: number;
};
type FitmentDraft = { key: string; id: string | null; model_id: string; generation_id: string | null; position: string | null; variant_key: string | null; label: string };

type Step = 'family' | 'details' | 'variants' | 'fitment' | 'review';
const STEPS: Step[] = ['family', 'details', 'variants', 'fitment', 'review'];
const STEP_LABEL: Record<Step, string> = { family: 'Family', details: 'Details', variants: 'Variants', fitment: 'Fitment', review: 'Review' };
const POSITIONS = ['front', 'rear', 'left', 'right', 'both', 'full_set', 'boot'];

function axisKey(v: VariantDraft): string {
  return v.axes.map((a) => `${a.code}=${a.value}`).join('|');
}

// -----------------------------------------------------------------------------
// Screen
// -----------------------------------------------------------------------------
export default function ProductWizard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const t = useTheme();
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();

  const [step, setStep] = useState<Step>(isNew ? 'family' : 'details');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(isNew);

  // product fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [hsn, setHsn] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [taxRateId, setTaxRateId] = useState<string | null>(null);
  const [universal, setUniversal] = useState(false);
  const [active, setActive] = useState(true);
  const [productSpecs, setProductSpecs] = useState<Record<string, SpecVal>>({});

  // variants
  const [axisChoices, setAxisChoices] = useState<Record<string, string[]>>({}); // defId -> option ids or raw values
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [openingLocation, setOpeningLocation] = useState<string | null>(null);

  // fitment
  const [fitments, setFitments] = useState<FitmentDraft[]>([]);
  const [fitModel, setFitModel] = useState<string | null>(null);
  const [fitGen, setFitGen] = useState<string | null>(null);
  const [fitPos, setFitPos] = useState<string | null>(null);
  const [fitVariant, setFitVariant] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Reference data
  // ---------------------------------------------------------------------------
  const { data: families } = useQuery<Family>('SELECT * FROM product_families WHERE is_active = 1 ORDER BY sort_order, name');
  const family = families?.find((f) => f.id === familyId) ?? null;
  const { data: defs } = useQuery<SpecDef>('SELECT * FROM spec_definitions WHERE family_id = ? AND is_active = 1 ORDER BY sort_order', [familyId ?? '']);
  const { data: opts } = useQuery<SpecOpt>('SELECT so.* FROM spec_options so JOIN spec_definitions sd ON sd.id = so.spec_definition_id WHERE sd.family_id = ? AND so.is_active = 1 ORDER BY so.sort_order', [familyId ?? '']);
  const { data: brands } = useQuery<{ id: string; name: string; code: string }>('SELECT id, name, code FROM brands WHERE is_active = 1 ORDER BY name');
  const { data: categories } = useQuery<{ id: string; name: string; level: number; parent_id: string | null; family_id: string | null }>('SELECT id, name, level, parent_id, family_id FROM categories WHERE is_active = 1 ORDER BY level, name');
  const { data: units } = useQuery<{ id: string; code: string; name: string }>('SELECT id, code, name FROM units ORDER BY code');
  const { data: taxes } = useQuery<{ id: string; name: string }>('SELECT id, name FROM tax_rates WHERE is_active = 1 ORDER BY rate_pct');
  const { data: hsns } = useQuery<{ code: string; description: string | null }>('SELECT code, description FROM hsn_codes WHERE is_active = 1 ORDER BY code');
  const { data: locations } = useQuery<{ id: string; name: string }>('SELECT id, name FROM locations WHERE is_active = 1 AND type <> "damaged" ORDER BY sort_order');
  const { data: models } = useQuery<{ id: string; name: string; code: string; make_name: string }>('SELECT vm.id, vm.name, vm.code, mk.name AS make_name FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id WHERE vm.is_active = 1 ORDER BY mk.sort_order, vm.name');
  const { data: gens } = useQuery<{ id: string; name: string; year_from: number; year_to: number | null }>('SELECT id, name, year_from, year_to FROM vehicle_generations WHERE model_id = ? ORDER BY year_from DESC', [fitModel ?? '']);
  const { data: allSkus } = useQuery<{ sku: string; product_id: string }>('SELECT sku, product_id FROM product_variants');

  const axisDefs = useMemo(() => (defs ?? []).filter((d) => d.is_variant_axis), [defs]);
  const productDefs = useMemo(() => (defs ?? []).filter((d) => !d.is_variant_axis), [defs]);
  const optsFor = (defId: string) => (opts ?? []).filter((o) => o.spec_definition_id === defId);
  const brand = brands?.find((b) => b.id === brandId) ?? null;
  const takenSkus = useMemo(() => new Set((allSkus ?? []).filter((s) => isNew || s.product_id !== id).map((s) => s.sku)), [allSkus, id, isNew]);

  // ---------------------------------------------------------------------------
  // Load existing product for edit
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isNew || loaded) return;
    (async () => {
      const p = (await db.getOptional<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', [id])) as Record<string, string | number | null> | null;
      if (!p) {
        notify('Product not found on this device.');
        router.back();
        return;
      }
      setFamilyId(p.family_id as string);
      setName(String(p.name ?? ''));
      setDescription(String(p.description ?? ''));
      setBrandId((p.brand_id as string) ?? null);
      setCategoryId((p.category_id as string) ?? null);
      setSubcategoryId((p.subcategory_id as string) ?? null);
      setHsn((p.hsn_code as string) ?? null);
      setUnitId((p.unit_id as string) ?? null);
      setTaxRateId((p.tax_rate_id as string) ?? null);
      setUniversal(!!p.is_universal_fit);
      setActive(!!p.is_active);

      const svs = await db.getAll<{ variant_id: string | null; spec_definition_id: string; option_id: string | null; option_ids: string | null; value_number: number | null; value_text: string | null; value_bool: number | null }>(
        'SELECT * FROM spec_values WHERE product_id = ?', [id]);
      const ps: Record<string, SpecVal> = {};
      for (const sv of svs.filter((s) => s.variant_id === null)) {
        ps[sv.spec_definition_id] = { option_id: sv.option_id, option_ids: sv.option_ids ? sv.option_ids.split(',') : undefined, value_number: sv.value_number, value_text: sv.value_text, value_bool: sv.value_bool == null ? null : !!sv.value_bool };
      }
      setProductSpecs(ps);

      const vs = await db.getAll<Record<string, string | number | null>>('SELECT pv.*, COALESCE((SELECT SUM(qty) FROM stock_on_hand sl WHERE sl.variant_id = pv.id), 0) AS qty FROM product_variants pv WHERE product_id = ? ORDER BY sort_order, variant_name', [id]);
      const sdefs = await db.getAll<SpecDef>('SELECT * FROM spec_definitions WHERE family_id = ? ORDER BY sort_order', [p.family_id as string]);
      const sopts = await db.getAll<SpecOpt>('SELECT so.* FROM spec_options so JOIN spec_definitions sd ON sd.id = so.spec_definition_id WHERE sd.family_id = ?', [p.family_id as string]);
      const drafts: VariantDraft[] = vs.map((v) => {
        const mine = svs.filter((s) => s.variant_id === v.id);
        const axisValues: Record<string, SpecVal> = {};
        const axes: AxisValue[] = [];
        for (const sv of mine) {
          const d = sdefs.find((x) => x.id === sv.spec_definition_id);
          if (!d) continue;
          axisValues[d.id] = { option_id: sv.option_id, value_number: sv.value_number, value_text: sv.value_text, value_bool: sv.value_bool == null ? null : !!sv.value_bool };
          const o = sopts.find((x) => x.id === sv.option_id);
          axes.push({ code: d.code, value: o?.value ?? (sv.value_number != null ? String(sv.value_number) : sv.value_text ?? ''), optionCode: o?.code ?? null, unit: d.unit, showInName: !!d.show_in_variant_name });
        }
        return {
          key: v.id as string, id: v.id as string, axes, axisValues,
          variant_name: String(v.variant_name ?? ''), sku: String(v.sku ?? ''), barcode: String(v.barcode ?? ''),
          mrp: v.mrp as number | null, retail_price: v.retail_price as number | null, dealer_price: v.dealer_price as number | null, wholesale_price: v.wholesale_price as number | null,
          min_selling_price: v.min_selling_price as number | null, min_stock: v.min_stock as number | null, reorder_level: v.reorder_level as number | null, reorder_qty: v.reorder_qty as number | null,
          opening_qty: null, opening_cost: null, is_active: !!v.is_active, existingQty: Number(v.qty ?? 0),
        };
      });
      setVariants(drafts);

      const fs = await db.getAll<{ id: string; variant_id: string | null; model_id: string; generation_id: string | null; position: string | null; model_name: string; make_name: string; gen_name: string | null; year_from: number | null; year_to: number | null }>(
        `SELECT pf.id, pf.variant_id, pf.model_id, pf.generation_id, pf.position, vm.name AS model_name, mk.name AS make_name, vg.name AS gen_name, vg.year_from, vg.year_to
         FROM product_fitments pf JOIN vehicle_models vm ON vm.id = pf.model_id JOIN vehicle_makes mk ON mk.id = vm.make_id LEFT JOIN vehicle_generations vg ON vg.id = pf.generation_id WHERE pf.product_id = ?`, [id]);
      setFitments(fs.map((f) => ({ key: f.id, id: f.id, model_id: f.model_id, generation_id: f.generation_id, position: f.position, variant_key: f.variant_id, label: `${f.make_name} ${fitmentLabel({ modelName: f.model_name, yearFrom: f.year_from, yearTo: f.year_to })}${f.gen_name ? ` · ${f.gen_name}` : ''}` })));
      setLoaded(true);
    })().catch((e) => notify(String(e)));
  }, [db, id, isNew, loaded, router]);

  useEffect(() => {
    if (!openingLocation && locationId) setOpeningLocation(locationId);
  }, [locationId, openingLocation]);

  // ---------------------------------------------------------------------------
  // Family choice applies defaults
  // ---------------------------------------------------------------------------
  function chooseFamily(f: Family) {
    setFamilyId(f.id);
    if (isNew) {
      setHsn(f.default_hsn_code);
      setUnitId(f.default_unit_id);
      setTaxRateId(f.default_tax_rate_id);
      setUniversal(!f.is_fitment_required);
      setProductSpecs({});
      setVariants([]);
      setAxisChoices({});
      const cat = (categories ?? []).find((c) => c.family_id === f.id && c.level === 1);
      setCategoryId(cat?.id ?? null);
    }
    setStep('details');
  }

  // ---------------------------------------------------------------------------
  // Variant generation
  // ---------------------------------------------------------------------------
  const firstFitmentModel = models?.find((m) => m.id === fitments[0]?.model_id) ?? null;
  const vehicleLabel = firstFitmentModel ? fitments[0]?.label.replace(`${firstFitmentModel.make_name} `, '') : null;

  function skuFor(axes: AxisValue[]): string {
    if (!family) return '';
    return renderSku(family.sku_template, { familyCode: family.code, familyPrefix: family.sku_prefix, brandCode: brand?.code ?? null, vehicleCode: family.is_fitment_required ? firstFitmentModel?.code ?? null : null, axes });
  }

  function generateVariants() {
    if (axisDefs.length === 0) {
      if (variants.length === 0) setVariants([blankVariant([], 'Standard')]);
      return;
    }
    const axesInput = axisDefs.map((d) => {
      const chosen = axisChoices[d.id] ?? [];
      const values = d.data_type === 'select'
        ? chosen.map((oid) => { const o = optsFor(d.id).find((x) => x.id === oid); return { value: o?.value ?? '', optionCode: o?.code ?? null, optionId: oid }; })
        : chosen.map((v) => ({ value: v, optionCode: null, optionId: null }));
      return { code: d.code, unit: d.unit, showInName: !!d.show_in_variant_name, values, defId: d.id, type: d.data_type };
    });
    if (axesInput.some((a) => a.values.length === 0)) {
      notify('Choose at least one value for every variant axis.');
      return;
    }
    const combos = axisCombinations(axesInput);
    const existingKeys = new Set(variants.map(axisKey));
    const additions: VariantDraft[] = [];
    for (const combo of combos) {
      const draft = blankVariant(combo, renderVariantName(combo, family?.is_fitment_required ? vehicleLabel : null));
      if (existingKeys.has(axisKey(draft))) continue;
      // axis spec values for saving
      combo.forEach((a) => {
        const ax = axesInput.find((x) => x.code === a.code)!;
        const chosen = ax.values.find((v) => v.value === a.value)!;
        draft.axisValues[ax.defId] = ax.type === 'select' ? { option_id: chosen.optionId } : ax.type === 'number' ? { value_number: Number(a.value) } : { value_text: a.value };
      });
      additions.push(draft);
    }
    if (additions.length === 0) {
      notify('Those variants already exist.');
      return;
    }
    setVariants((vs) => [...vs, ...additions]);
  }

  function blankVariant(axes: AxisValue[], variantName: string): VariantDraft {
    const base = variants[0];
    const sku = uniqueSku(skuFor(axes) || slug(`${family?.sku_prefix ?? 'SKU'}-${variantName}`, 24), new Set([...takenSkus, ...variants.map((v) => v.sku)]));
    return {
      key: uuidv7(), id: null, axes, axisValues: {}, variant_name: variantName, sku, barcode: '',
      mrp: base?.mrp ?? null, retail_price: base?.retail_price ?? null, dealer_price: base?.dealer_price ?? null, wholesale_price: base?.wholesale_price ?? null,
      min_selling_price: base?.min_selling_price ?? null, min_stock: base?.min_stock ?? null, reorder_level: base?.reorder_level ?? null, reorder_qty: base?.reorder_qty ?? null,
      opening_qty: null, opening_cost: null, is_active: true, existingQty: 0,
    };
  }

  function patchVariant(key: string, patch: Partial<VariantDraft>) {
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function copyPricesToAll(from: VariantDraft) {
    setVariants((vs) => vs.map((v) => ({ ...v, mrp: from.mrp, retail_price: from.retail_price, dealer_price: from.dealer_price, wholesale_price: from.wholesale_price, min_selling_price: from.min_selling_price, min_stock: from.min_stock, reorder_level: from.reorder_level, reorder_qty: from.reorder_qty })));
  }

  // ---------------------------------------------------------------------------
  // Fitment
  // ---------------------------------------------------------------------------
  function addFitment() {
    const m = models?.find((x) => x.id === fitModel);
    if (!m) {
      notify('Choose a vehicle model.');
      return;
    }
    const g = gens?.find((x) => x.id === fitGen) ?? null;
    const label = `${m.make_name} ${fitmentLabel({ modelName: m.name, yearFrom: g?.year_from, yearTo: g?.year_to })}${g ? ` · ${g.name}` : ''}`;
    const dup = fitments.some((f) => f.model_id === m.id && f.generation_id === (g?.id ?? null) && f.variant_key === fitVariant && f.position === fitPos);
    if (dup) return;
    setFitments((fs) => [...fs, { key: uuidv7(), id: null, model_id: m.id, generation_id: g?.id ?? null, position: fitPos, variant_key: fitVariant, label }]);
    setFitGen(null);
  }

  // ---------------------------------------------------------------------------
  // Validation and save
  // ---------------------------------------------------------------------------
  function validate(): string | null {
    if (!family) return 'Choose a product family.';
    if (!name.trim()) return 'Product name is required.';
    for (const d of productDefs) {
      if (d.is_required && isEmpty(productSpecs[d.id], d)) return `${d.name} is required.`;
    }
    if (variants.filter((v) => v.is_active).length === 0) return 'Add at least one variant.';
    const skus = new Set<string>();
    for (const v of variants) {
      if (!v.sku.trim()) return `Variant “${v.variant_name}” needs a SKU.`;
      if (skus.has(v.sku)) return `SKU ${v.sku} is used twice.`;
      skus.add(v.sku);
      if (takenSkus.has(v.sku) && !v.id) return `SKU ${v.sku} already exists on another product.`;
      if (v.retail_price == null) return `Variant “${v.variant_name}” needs a retail price.`;
    }
    if (family.is_fitment_required && !universal && fitments.length === 0) return `${family.name} products need at least one vehicle fitment.`;
    if (!isNew) return null;
    if (variants.some((v) => (v.opening_qty ?? 0) > 0) && !openingLocation) return 'Choose a location for opening stock.';
    return null;
  }

  function isEmpty(v: SpecVal | undefined, d: SpecDef): boolean {
    if (!v) return true;
    if (d.data_type === 'select') return !v.option_id;
    if (d.data_type === 'multiselect') return !v.option_ids?.length;
    if (d.data_type === 'number') return v.value_number == null;
    if (d.data_type === 'boolean') return v.value_bool == null;
    return !v.value_text?.trim();
  }

  function displayOf(v: SpecVal | undefined, d: SpecDef): string {
    if (!v) return '';
    if (d.data_type === 'select') return optsFor(d.id).find((o) => o.id === v.option_id)?.value ?? '';
    if (d.data_type === 'multiselect') return (v.option_ids ?? []).map((oid) => optsFor(d.id).find((o) => o.id === oid)?.value).filter(Boolean).join(', ');
    if (d.data_type === 'number') return v.value_number == null ? '' : d.unit ? `${v.value_number} ${d.unit}` : String(v.value_number);
    if (d.data_type === 'boolean') return v.value_bool == null ? '' : v.value_bool ? 'Yes' : 'No';
    return v.value_text ?? '';
  }

  async function save() {
    const err = validate();
    if (err) {
      notify(err);
      return;
    }
    if (!family) return;
    setSaving(true);
    try {
      const productId = isNew ? uuidv7() : id;
      const fam = family;
      const brandName = brand?.name ?? '';
      const cat = categories?.find((c) => c.id === categoryId)?.name ?? '';
      const productSpecText = productDefs.map((d) => displayOf(productSpecs[d.id], d)).join(' ');
      const fitText = fitments.map((f) => f.label).join(' ');
      const pSearch = searchText(name, brandName, brand?.code, fam.name, fam.code, cat, description, productSpecText, fitText);

      await db.writeTransaction(async (tx) => {
        const productRow = {
          family_id: fam.id, category_id: categoryId, subcategory_id: subcategoryId, brand_id: brandId, name: name.trim(), description: description.trim() || null,
          hsn_code: hsn, unit_id: unitId, tax_rate_id: taxRateId, is_universal_fit: universal, search_text: pSearch, is_active: active,
        };
        if (isNew) await insertRow(tx, 'products', { ...productRow, id: productId }, actor);
        else await updateRow(tx, 'products', productId, productRow);

        // product-level specs: replace
        await tx.execute('DELETE FROM spec_values WHERE product_id = ? AND variant_id IS NULL', [productId]);
        for (const d of productDefs) {
          const v = productSpecs[d.id];
          if (isEmpty(v, d)) continue;
          await insertRow(tx, 'spec_values', specRow(productId, null, d, v!));
        }

        // variants
        const idByKey = new Map<string, string>();
        for (const [i, v] of variants.entries()) {
          const variantId = v.id ?? uuidv7();
          idByKey.set(v.key, variantId);
          const axisText = axisDefs.map((d) => displayOf(v.axisValues[d.id], d)).join(' ');
          const aliasText = axisDefs.map((d) => optsFor(d.id).find((o) => o.id === v.axisValues[d.id]?.option_id)?.aliases ?? '').join(' ');
          const vRow = {
            product_id: productId, variant_name: v.variant_name.trim(), sku: v.sku.trim().toUpperCase(), barcode: v.barcode.trim() || null,
            mrp: v.mrp, retail_price: v.retail_price ?? 0, dealer_price: v.dealer_price, wholesale_price: v.wholesale_price, min_selling_price: v.min_selling_price,
            min_stock: v.min_stock ?? 0, reorder_level: v.reorder_level ?? v.min_stock ?? 0, reorder_qty: v.reorder_qty ?? 0,
            search_text: searchText(pSearch, v.variant_name, v.sku, v.barcode, axisText, aliasText), sort_order: i, is_active: v.is_active,
          };
          if (v.id) await updateRow(tx, 'product_variants', variantId, vRow);
          else await insertRow(tx, 'product_variants', { ...vRow, id: variantId, last_purchase_cost: v.opening_cost ?? 0, avg_cost: v.opening_cost ?? 0 }, actor);

          await tx.execute('DELETE FROM spec_values WHERE variant_id = ?', [variantId]);
          for (const d of axisDefs) {
            const av = v.axisValues[d.id];
            if (isEmpty(av, d)) continue;
            await insertRow(tx, 'spec_values', specRow(productId, variantId, d, av!));
          }

          // opening stock for brand-new variants only
          if (!v.id && (v.opening_qty ?? 0) > 0 && openingLocation) {
            await insertRow(tx, 'stock_movements', {
              variant_id: variantId, location_id: openingLocation, qty: v.opening_qty, movement_type: 'opening', unit_cost: v.opening_cost ?? 0,
              occurred_at: new Date().toISOString(), note: 'Opening stock from product wizard',
            }, actor);
          }
        }

        // fitments: replace
        await tx.execute('DELETE FROM product_fitments WHERE product_id = ?', [productId]);
        for (const f of fitments) {
          await insertRow(tx, 'product_fitments', {
            product_id: productId, variant_id: f.variant_key ? idByKey.get(f.variant_key) ?? null : null, model_id: f.model_id, generation_id: f.generation_id, position: f.position,
          }, actor);
        }
      });
      router.replace(`/product/${productId}`);
    } catch (e) {
      notify(`Could not save: ${String((e as Error).message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  function specRow(productId: string, variantId: string | null, d: SpecDef, v: SpecVal) {
    return {
      product_id: productId, variant_id: variantId, spec_definition_id: d.id,
      value_text: d.data_type === 'text' ? v.value_text ?? null : null,
      value_number: d.data_type === 'number' ? v.value_number ?? null : null,
      value_bool: d.data_type === 'boolean' ? v.value_bool ?? null : null,
      option_id: d.data_type === 'select' ? v.option_id ?? null : null,
      option_ids: d.data_type === 'multiselect' ? (v.option_ids ?? []).join(',') || null : null,
      display_value: displayOf(v, d),
    };
  }

  async function deactivate() {
    if (!(await confirm('Deactivate product?', 'It disappears from search and billing. Stock and history are kept.'))) return;
    await updateRow(db, 'products', id, { is_active: false });
    router.back();
  }

  if (!can('catalog.edit')) return <Screen><Text>Only administrators and owners can edit the catalogue.</Text></Screen>;
  if (!isNew && !loaded) return <Screen><Text>Loading…</Text></Screen>;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const stepIndex = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(stepIndex - 1, 0)]);

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New product' : name || 'Edit product' }} />
      <Screen>
        <Text variant="display">{isNew ? 'New product' : name}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
          {STEPS.map((s, i) => (
            <Chip key={s} label={`${i + 1} ${STEP_LABEL[s]}`} selected={s === step} onPress={() => (isNew && !familyId && s !== 'family' ? null : setStep(s))} />
          ))}
        </ScrollView>

        {/* STEP 1: family */}
        {step === 'family' ? (
          <>
            <Text variant="small" color="textMuted">
              The family decides which specifications are asked for. Bulbs ask for socket and wattage; mats ask for type, colour and vehicle.
            </Text>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(families ?? []).map((f) => (
                <Row key={f.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="heading">{f.name}</Text>
                    <Text variant="small" color="textMuted">
                      {f.description ?? `SKU ${f.sku_prefix}-…`}{f.is_fitment_required ? ' · vehicle specific' : ''}
                    </Text>
                  </View>
                  <Button title={familyId === f.id ? 'Selected' : 'Choose'} size="sm" tone={familyId === f.id ? 'primary' : 'secondary'} onPress={() => chooseFamily(f)} />
                </Row>
              ))}
            </Card>
          </>
        ) : null}

        {/* STEP 2: details */}
        {step === 'details' && family ? (
          <>
            <FormSection title={`${family.name} · product`}>
              <SelectField
                label="Brand"
                value={brandId}
                options={(brands ?? []).map((b) => ({ value: b.id, label: b.name, sublabel: b.code }))}
                onChange={setBrandId}
                onCreate={async (text) => setBrandId(await insertRow(db, 'brands', { name: text, code: slug(text, 3), is_active: true }))}
              />
              <Input label="Product name" value={name} onChangeText={setName} placeholder={`e.g. ${brand?.name ?? 'Brand'} Ultra LED Headlight Bulb`} hint="Do not put the vehicle or the variant (socket, colour) in the name; those come from fitment and variants." />
              <Input label="Description" value={description} onChangeText={setDescription} multiline />
              <SwitchRow label="Universal fit" hint="Sold by specification rather than by vehicle. Appears under “Universal” in every vehicle search." value={universal} onChange={setUniversal} />
            </FormSection>

            <FormSection title="Specifications" hint="Shared by every variant. Variant-specific fields come next.">
              {productDefs.length === 0 ? <Text variant="small" color="textMuted">This family has no shared specifications.</Text> : null}
              {productDefs.map((d) => (
                <SpecInput key={d.id} def={d} options={optsFor(d.id)} value={productSpecs[d.id]} onChange={(v) => setProductSpecs((s) => ({ ...s, [d.id]: v }))} />
              ))}
            </FormSection>

            <FormSection title="Classification & tax">
              <SelectField label="Category" value={categoryId} options={(categories ?? []).filter((c) => c.level === 1).map((c) => ({ value: c.id, label: c.name }))} onChange={setCategoryId} allowClear />
              <SelectField label="Subcategory" value={subcategoryId} options={(categories ?? []).filter((c) => c.level === 2 && (!categoryId || c.parent_id === categoryId)).map((c) => ({ value: c.id, label: c.name }))} onChange={setSubcategoryId} allowClear />
              <SelectField label="HSN code" value={hsn} options={(hsns ?? []).map((h) => ({ value: h.code, label: h.code, sublabel: h.description ?? undefined }))} onChange={setHsn} allowClear />
              <Row gap={12}>
                <View style={{ flex: 1 }}>
                  <SelectField label="GST" value={taxRateId} options={(taxes ?? []).map((x) => ({ value: x.id, label: x.name }))} onChange={setTaxRateId} />
                </View>
                <View style={{ flex: 1 }}>
                  <SelectField label="Unit" value={unitId} options={(units ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))} onChange={setUnitId} />
                </View>
              </Row>
              {!isNew ? <SwitchRow label="Active" value={active} onChange={setActive} /> : null}
            </FormSection>
          </>
        ) : null}

        {/* STEP 3: variants */}
        {step === 'variants' && family ? (
          <>
            {axisDefs.length > 0 ? (
              <FormSection title="Variant axes" hint="Pick every value you stock. One SKU is created per combination, each with its own stock and prices.">
                {axisDefs.map((d) =>
                  d.data_type === 'select' ? (
                    <MultiSelectField key={d.id} label={d.name} values={axisChoices[d.id] ?? []} options={optsFor(d.id).map((o) => ({ value: o.id, label: o.value }))} onChange={(vals) => setAxisChoices((a) => ({ ...a, [d.id]: vals }))} />
                  ) : (
                    <Input
                      key={d.id}
                      label={`${d.name}${d.unit ? ` (${d.unit})` : ''}`}
                      value={(axisChoices[d.id] ?? []).join(', ')}
                      onChangeText={(s) => setAxisChoices((a) => ({ ...a, [d.id]: s.split(',').map((x) => x.trim()).filter(Boolean) }))}
                      placeholder={d.data_type === 'number' ? '60, 80, 100' : 'comma separated values'}
                      hint="Comma separated"
                    />
                  )
                )}
                <Button title="Generate variants" tone="secondary" onPress={generateVariants} />
              </FormSection>
            ) : (
              <Card tone="alt">
                <Text variant="small" color="textMuted">
                  This family has no variant axes, so the product has a single SKU.
                </Text>
                {variants.length === 0 ? <Button title="Create the SKU" tone="secondary" onPress={generateVariants} /> : null}
              </Card>
            )}

            {isNew ? (
              <SelectField label="Opening stock location" value={openingLocation} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={setOpeningLocation} hint="Opening quantities below are recorded as opening-stock movements at this location." />
            ) : null}

            {variants.map((v, i) => (
              <Card key={v.key} style={{ opacity: v.is_active ? 1 : 0.6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={6} wrap style={{ flex: 1 }}>
                    <Text variant="title">{v.variant_name || `Variant ${i + 1}`}</Text>
                    {v.axes.map((a) => (
                      <Badge key={a.code}>{a.unit ? `${a.value}${a.unit}` : a.value}</Badge>
                    ))}
                  </Row>
                  {v.id ? (
                    <Button title={v.is_active ? 'Deactivate' : 'Restore'} tone="ghost" size="sm" onPress={() => patchVariant(v.key, { is_active: !v.is_active })} />
                  ) : (
                    <Button title="Remove" tone="ghost" size="sm" onPress={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))} />
                  )}
                </Row>
                <Row gap={12}>
                  <Input containerStyle={{ flex: 1.2 }} label="Variant name" value={v.variant_name} onChangeText={(x) => patchVariant(v.key, { variant_name: x })} />
                  <Input containerStyle={{ flex: 1.2 }} label="SKU" value={v.sku} onChangeText={(x) => patchVariant(v.key, { sku: x.toUpperCase() })} autoCapitalize="characters" error={!v.id && takenSkus.has(v.sku) ? 'Already used' : null} />
                  <Input containerStyle={{ flex: 1 }} label="Barcode" value={v.barcode} onChangeText={(x) => patchVariant(v.key, { barcode: x })} keyboardType="number-pad" />
                </Row>
                <Row gap={12} wrap>
                  <View style={{ flex: 1, minWidth: 110 }}><NumberField label="MRP" value={v.mrp} onChange={(x) => patchVariant(v.key, { mrp: x })} /></View>
                  <View style={{ flex: 1, minWidth: 110 }}><NumberField label="Retail" value={v.retail_price} onChange={(x) => patchVariant(v.key, { retail_price: x })} /></View>
                  <View style={{ flex: 1, minWidth: 110 }}><NumberField label="Dealer" value={v.dealer_price} onChange={(x) => patchVariant(v.key, { dealer_price: x })} /></View>
                  <View style={{ flex: 1, minWidth: 110 }}><NumberField label="Wholesale" value={v.wholesale_price} onChange={(x) => patchVariant(v.key, { wholesale_price: x })} /></View>
                  <View style={{ flex: 1, minWidth: 110 }}><NumberField label="Min. selling" value={v.min_selling_price} onChange={(x) => patchVariant(v.key, { min_selling_price: x })} /></View>
                </Row>
                <Row gap={12} wrap>
                  <View style={{ flex: 1, minWidth: 110 }}><NumberField label="Min stock" value={v.min_stock} onChange={(x) => patchVariant(v.key, { min_stock: x })} decimals={0} /></View>
                  <View style={{ flex: 1, minWidth: 110 }}><NumberField label="Reorder level" value={v.reorder_level} onChange={(x) => patchVariant(v.key, { reorder_level: x })} decimals={0} /></View>
                  <View style={{ flex: 1, minWidth: 110 }}><NumberField label="Reorder qty" value={v.reorder_qty} onChange={(x) => patchVariant(v.key, { reorder_qty: x })} decimals={0} /></View>
                  {!v.id ? (
                    <>
                      <View style={{ flex: 1, minWidth: 110 }}><NumberField label="Opening qty" value={v.opening_qty} onChange={(x) => patchVariant(v.key, { opening_qty: x })} decimals={3} /></View>
                      <View style={{ flex: 1, minWidth: 110 }}><NumberField label="Unit cost" value={v.opening_cost} onChange={(x) => patchVariant(v.key, { opening_cost: x })} /></View>
                    </>
                  ) : (
                    <View style={{ flex: 1, minWidth: 110, justifyContent: 'flex-end' }}>
                      <Text variant="label" color="textMuted">On hand</Text>
                      <Text mono>{v.existingQty}</Text>
                    </View>
                  )}
                </Row>
                {variants.length > 1 ? <Button title="Copy these prices & levels to all variants" tone="ghost" size="sm" onPress={() => copyPricesToAll(v)} /> : null}
              </Card>
            ))}
          </>
        ) : null}

        {/* STEP 4: fitment */}
        {step === 'fitment' && family ? (
          <>
            <Text variant="small" color="textMuted">
              {universal ? 'This product is universal fit. Fitments are optional and only add it to “fits this model” lists.' : 'Add every vehicle this product fits. Leave the generation blank to cover all years.'}
            </Text>
            <FormSection title="Add fitment">
              <SelectField label="Model" value={fitModel} options={(models ?? []).map((m) => ({ value: m.id, label: `${m.make_name} ${m.name}` }))} onChange={(v) => { setFitModel(v); setFitGen(null); }} />
              <SelectField label="Generation / years" value={fitGen} options={(gens ?? []).map((g) => ({ value: g.id, label: `${g.name} (${g.year_from}–${g.year_to ?? 'now'})` }))} onChange={setFitGen} allowClear placeholder="All generations" />
              <Row gap={12}>
                <View style={{ flex: 1 }}>
                  <SelectField label="Position" value={fitPos} options={POSITIONS.map((p) => ({ value: p, label: p.replace('_', ' ') }))} onChange={setFitPos} allowClear placeholder="Any" />
                </View>
                <View style={{ flex: 1 }}>
                  <SelectField label="Applies to" value={fitVariant} options={variants.map((v) => ({ value: v.key, label: v.variant_name || v.sku }))} onChange={setFitVariant} allowClear placeholder="All variants" />
                </View>
              </Row>
              <Button title="Add fitment" tone="secondary" onPress={addFitment} />
            </FormSection>
            <Card style={{ gap: 0 }}>
              {fitments.length === 0 ? <Text variant="small" color="textMuted" style={{ padding: 8 }}>No fitments yet.</Text> : null}
              {fitments.map((f) => (
                <Row key={f.key} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}>
                  <View style={{ flex: 1 }}>
                    <Text>{f.label}</Text>
                    <Text variant="small" color="textMuted">
                      {f.variant_key ? variants.find((v) => v.key === f.variant_key)?.variant_name ?? 'variant' : 'all variants'}{f.position ? ` · ${f.position.replace('_', ' ')}` : ''}
                    </Text>
                  </View>
                  <Button title="×" tone="ghost" size="sm" onPress={() => setFitments((fs) => fs.filter((x) => x.key !== f.key))} />
                </Row>
              ))}
            </Card>
          </>
        ) : null}

        {/* STEP 5: review */}
        {step === 'review' && family ? (
          <>
            <Card>
              <KV k="Family" v={family.name} />
              <KV k="Brand" v={brand?.name ?? '—'} />
              <KV k="Name" v={name || '—'} />
              <KV k="Universal fit" v={universal ? 'Yes' : 'No'} />
              <KV k="HSN / GST" v={`${hsn ?? '—'} / ${taxes?.find((x) => x.id === taxRateId)?.name ?? '—'}`} />
              <Divider />
              {productDefs.map((d) => (
                <KV key={d.id} k={d.name} v={displayOf(productSpecs[d.id], d) || '—'} />
              ))}
            </Card>
            <SectionTitle>Variants · {variants.length}</SectionTitle>
            <Card style={{ gap: 0 }}>
              {variants.map((v) => (
                <Row key={v.key} style={{ paddingVertical: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="heading">{v.variant_name}</Text>
                    <Text variant="small" color="textMuted" mono>{v.sku}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text mono>₹{v.retail_price ?? '—'} / ₹{v.dealer_price ?? '—'}</Text>
                    {!v.id && v.opening_qty ? <Text variant="small" color="textMuted" mono>opening {v.opening_qty} @ ₹{v.opening_cost ?? 0}</Text> : null}
                  </View>
                </Row>
              ))}
            </Card>
            <SectionTitle>Fitment · {fitments.length}</SectionTitle>
            <Card style={{ gap: 4 }}>
              {fitments.length === 0 ? <Text variant="small" color="textMuted">{universal ? 'Universal fit' : 'None'}</Text> : fitments.map((f) => <Text key={f.key} variant="small">{f.label}</Text>)}
            </Card>
            {validate() ? (
              <Card tone="alt">
                <Text color="danger">{validate()}</Text>
              </Card>
            ) : null}
          </>
        ) : null}

        <Row gap={8} style={{ marginTop: space.md }}>
          {stepIndex > 0 ? <Button title="Back" tone="secondary" onPress={back} /> : null}
          {step !== 'review' ? <Button title="Next" onPress={next} disabled={step === 'family' && !familyId} /> : <Button title={isNew ? 'Create product' : 'Save changes'} onPress={save} loading={saving} disabled={!!validate()} />}
          {!isNew && active ? <Button title="Deactivate" tone="danger" onPress={deactivate} /> : null}
        </Row>
      </Screen>
    </>
  );
}

// -----------------------------------------------------------------------------
// One dynamic spec input, driven by the definition's data type
// -----------------------------------------------------------------------------
function SpecInput({ def, options, value, onChange }: { def: SpecDef; options: SpecOpt[]; value: SpecVal | undefined; onChange: (v: SpecVal) => void }) {
  const label = `${def.name}${def.is_required ? ' *' : ''}`;
  switch (def.data_type) {
    case 'select':
      return <SelectField label={label} hint={def.help_text ?? undefined} value={value?.option_id ?? null} options={options.map((o) => ({ value: o.id, label: o.value }))} onChange={(v) => onChange({ option_id: v })} allowClear={!def.is_required} />;
    case 'multiselect':
      return <MultiSelectField label={label} hint={def.help_text ?? undefined} values={value?.option_ids ?? []} options={options.map((o) => ({ value: o.id, label: o.value }))} onChange={(v) => onChange({ option_ids: v })} />;
    case 'number':
      return <NumberField label={label} hint={def.help_text ?? undefined} value={value?.value_number ?? null} onChange={(v) => onChange({ value_number: v })} suffix={def.unit ?? undefined} decimals={3} />;
    case 'boolean':
      return <SwitchRow label={label} hint={def.help_text ?? undefined} value={!!value?.value_bool} onChange={(v) => onChange({ value_bool: v })} />;
    default:
      return <Input label={label} hint={def.help_text ?? undefined} value={value?.value_text ?? ''} onChangeText={(v) => onChange({ value_text: v })} />;
  }
}
