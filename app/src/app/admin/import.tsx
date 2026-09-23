/**
 * CSV import: products & variants, customers, suppliers, opening stock,
 * vehicles. Parse → validate every row against live master data → show a
 * review grid → write in one transaction. Re-running the same file updates
 * by SKU / code instead of duplicating.
 */
import { useQuery } from '@powersync/react';
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { csvToObjects, IMPORT_TEMPLATES, isValidGstin, parseBool, parseNumber, slug, stateCodeFromGstin, templateCsv, uuidv7, type ImportType } from '@domain';

import { INDIAN_STATES } from '@/lib/states';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, nextCode, searchText, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Divider, Input, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';
import { notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type Issue = { row: number; message: string };
type Preview = { ok: number; issues: Issue[]; summary: string };

export default function ImportScreen() {
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const t = useTheme();
  const [type, setType] = useState<ImportType>('products');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const { data: families } = useQuery<{ id: string; code: string; name: string; default_hsn_code: string | null; default_unit_id: string | null; default_tax_rate_id: string | null; sku_template: string; sku_prefix: string; is_fitment_required: number }>('SELECT * FROM product_families');
  const { data: defs } = useQuery<{ id: string; family_id: string; code: string; data_type: string; unit: string | null; is_variant_axis: number; is_required: number; show_in_variant_name: number }>('SELECT * FROM spec_definitions WHERE is_active = 1');
  const { data: opts } = useQuery<{ id: string; spec_definition_id: string; value: string; code: string | null; aliases: string | null }>('SELECT * FROM spec_options WHERE is_active = 1');
  const { data: brands } = useQuery<{ id: string; name: string; code: string }>('SELECT id, name, code FROM brands');
  const { data: taxes } = useQuery<{ id: string; rate_pct: number; name: string }>('SELECT id, rate_pct, name FROM tax_rates WHERE is_active = 1');
  const { data: locations } = useQuery<{ id: string; code: string }>('SELECT id, code FROM locations WHERE is_active = 1');
  const { data: makes } = useQuery<{ id: string; name: string }>('SELECT id, name FROM vehicle_makes');
  const { data: models } = useQuery<{ id: string; make_id: string; name: string; code: string }>('SELECT id, make_id, name, code FROM vehicle_models');
  const { data: gens } = useQuery<{ id: string; model_id: string; name: string; year_from: number; year_to: number | null }>('SELECT id, model_id, name, year_from, year_to FROM vehicle_generations');
  const { data: variants } = useQuery<{ id: string; sku: string; product_id: string; avg_cost: number }>('SELECT id, sku, product_id, avg_cost FROM product_variants');
  const { data: products } = useQuery<{ id: string; name: string; brand_id: string | null; family_id: string }>('SELECT id, name, brand_id, family_id FROM products');
  const { data: priceLists } = useQuery<{ id: string; code: string; name: string }>('SELECT id, code, name FROM price_lists');
  const { data: customers } = useQuery<{ id: string; code: string; name: string }>('SELECT id, code, name FROM customers');
  const { data: suppliers } = useQuery<{ id: string; code: string; name: string }>('SELECT id, code, name FROM suppliers');
  const { data: categories } = useQuery<{ id: string; name: string; family_id: string | null; level: number }>('SELECT id, name, family_id, level FROM categories');

  const tpl = IMPORT_TEMPLATES[type];
  const parsed = useMemo(() => (text.trim() ? csvToObjects(text) : { headers: [], rows: [] }), [text]);

  const findOption = (defId: string, raw: string) => {
    const v = raw.trim().toLowerCase();
    return (opts ?? []).find((o) => o.spec_definition_id === defId && (o.value.toLowerCase() === v || o.code?.toLowerCase() === v || (o.aliases ?? '').toLowerCase().split(/\s+/).includes(v)));
  };
  const findModel = (makeName: string, modelName: string) => {
    const mk = (makes ?? []).find((m) => m.name.toLowerCase() === makeName.trim().toLowerCase());
    return (models ?? []).find((m) => (!mk || m.make_id === mk.id) && (m.name.toLowerCase() === modelName.trim().toLowerCase() || m.code.toLowerCase() === modelName.trim().toLowerCase()));
  };

  // ---------------------------------------------------------------------------
  // Validate (pure, no writes)
  // ---------------------------------------------------------------------------
  function validate(): Preview {
    const issues: Issue[] = [];
    const rows = parsed.rows;
    const missing = tpl.required.filter((h) => !parsed.headers.includes(h));
    if (missing.length) return { ok: 0, issues: [{ row: 0, message: `Missing required columns: ${missing.join(', ')}` }], summary: '' };

    let ok = 0;
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const n = i + 2; // spreadsheet row number
      const bad = (m: string) => issues.push({ row: n, message: m });
      let rowOk = true;
      const fail = (m: string) => { bad(m); rowOk = false; };

      if (type === 'products') {
        const fam = (families ?? []).find((f) => f.code.toLowerCase() === r.family_code.toLowerCase());
        if (!fam) fail(`Unknown family_code “${r.family_code}”`);
        if (!r.product_name) fail('product_name is empty');
        if (!r.sku) fail('sku is empty');
        if (seen.has(r.sku.toUpperCase())) fail(`Duplicate sku ${r.sku} in file`);
        seen.add(r.sku.toUpperCase());
        if (parseNumber(r.retail_price) == null) fail('retail_price is not a number');
        if (r.brand && !(brands ?? []).some((b) => b.name.toLowerCase() === r.brand.toLowerCase())) bad(`Brand “${r.brand}” will be created`);
        if (fam) {
          for (const d of (defs ?? []).filter((x) => x.family_id === fam.id)) {
            const raw = r[d.code];
            if (raw == null || raw === '') {
              if (d.is_required) fail(`${d.code} is required for ${fam.code}`);
              continue;
            }
            if ((d.data_type === 'select' || d.data_type === 'multiselect') && !raw.split('|').every((piece) => findOption(d.id, piece))) fail(`${d.code}: “${raw}” is not an allowed value`);
            if (d.data_type === 'number' && parseNumber(raw) == null) fail(`${d.code}: “${raw}” is not a number`);
          }
          if (fam.is_fitment_required && parseBool(r.universal) !== true && !r.fitment_model) fail(`${fam.code} products need fitment_model`);
        }
        if (r.fitment_model && !findModel(r.fitment_make ?? '', r.fitment_model)) fail(`Unknown vehicle ${r.fitment_make} ${r.fitment_model}`);
        if (r.location_code && !(locations ?? []).some((l) => l.code.toLowerCase() === r.location_code.toLowerCase())) fail(`Unknown location_code ${r.location_code}`);
        if (r.gst_rate && !(taxes ?? []).some((x) => x.rate_pct === parseNumber(r.gst_rate))) fail(`No tax rate for ${r.gst_rate}%`);
      }

      if (type === 'customers' || type === 'suppliers') {
        if (!r.name) fail('name is empty');
        if (r.gstin && !isValidGstin(r.gstin)) fail(`GSTIN “${r.gstin}” is not valid`);
        if (r.mobile && !/^\d{10}$/.test(r.mobile.replace(/\D/g, ''))) bad('mobile is not 10 digits');
        if (r.state_code && !INDIAN_STATES.some((s) => s.code === r.state_code.padStart(2, '0'))) fail(`Unknown state_code ${r.state_code}`);
        if (type === 'customers' && r.price_list && !(priceLists ?? []).some((p) => p.code.toLowerCase() === r.price_list.toLowerCase() || p.name.toLowerCase() === r.price_list.toLowerCase())) fail(`Unknown price_list ${r.price_list}`);
        if (r.code) {
          const exists = (type === 'customers' ? customers : suppliers)?.some((c) => c.code.toLowerCase() === r.code.toLowerCase());
          if (exists) bad(`Code ${r.code} exists: row will update it`);
        }
      }

      if (type === 'opening_stock') {
        if (!(variants ?? []).some((v) => v.sku.toUpperCase() === r.sku.toUpperCase())) fail(`Unknown sku ${r.sku}`);
        if (!(locations ?? []).some((l) => l.code.toLowerCase() === r.location_code.toLowerCase())) fail(`Unknown location_code ${r.location_code}`);
        if (parseNumber(r.qty) == null) fail('qty is not a number');
      }

      if (type === 'vehicles') {
        if (!r.make || !r.model || !r.generation) fail('make, model and generation are required');
        if (parseNumber(r.year_from) == null) fail('year_from is not a number');
      }

      if (rowOk) ok++;
    });
    return { ok, issues, summary: `${ok} of ${rows.length} rows can be imported` };
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------
  async function run() {
    const p = validate();
    setPreview(p);
    const fatal = p.issues.filter((i) => !/will be created|will update|not 10 digits/.test(i.message));
    if (fatal.length) {
      notify('Pehle galtiyan theek karo. Warning (brand ban jayega, row update hogi) chalti hai.');
      return;
    }
    setBusy(true);
    try {
      let count = 0;
      await db.writeTransaction(async (tx) => {
        const brandIds = new Map((brands ?? []).map((b) => [b.name.toLowerCase(), b.id]));
        const productIds = new Map<string, string>();
        for (const r of parsed.rows) {
          if (type === 'products') {
            const fam = (families ?? []).find((f) => f.code.toLowerCase() === r.family_code.toLowerCase())!;
            let brandId: string | null = null;
            if (r.brand) {
              brandId = brandIds.get(r.brand.toLowerCase()) ?? null;
              if (!brandId) {
                brandId = await insertRow(tx, 'brands', { name: r.brand, code: slug(r.brand, 3), is_active: true });
                brandIds.set(r.brand.toLowerCase(), brandId);
              }
            }
            const pKey = `${fam.id}|${brandId ?? ''}|${r.product_name.toLowerCase()}`;
            let productId = productIds.get(pKey) ?? (products ?? []).find((p) => p.family_id === fam.id && (p.brand_id ?? '') === (brandId ?? '') && p.name.toLowerCase() === r.product_name.toLowerCase())?.id;
            const famDefs = (defs ?? []).filter((d) => d.family_id === fam.id);
            const tax = r.gst_rate ? (taxes ?? []).find((x) => x.rate_pct === parseNumber(r.gst_rate)) : null;
            const cat = r.category ? (categories ?? []).find((c) => c.name.toLowerCase() === r.category.toLowerCase()) : (categories ?? []).find((c) => c.family_id === fam.id && c.level === 1);
            if (!productId) {
              productId = await insertRow(tx, 'products', {
                family_id: fam.id, brand_id: brandId, category_id: cat?.id ?? null, name: r.product_name, description: r.description || null, hsn_code: r.hsn_code || fam.default_hsn_code,
                unit_id: fam.default_unit_id, tax_rate_id: tax?.id ?? fam.default_tax_rate_id, is_universal_fit: parseBool(r.universal) ?? !fam.is_fitment_required, is_active: true,
                search_text: searchText(r.product_name, r.brand, fam.name, fam.code, r.description),
              }, actor);
              productIds.set(pKey, productId);
              // product-level (non-axis) specs from the first row of the product
              for (const d of famDefs.filter((x) => !x.is_variant_axis)) {
                const raw = r[d.code];
                if (!raw) continue;
                await insertRow(tx, 'spec_values', specRow(productId, null, d, raw));
              }
            }
            const existing = (variants ?? []).find((v) => v.sku.toUpperCase() === r.sku.toUpperCase());
            const axisText = famDefs.filter((d) => d.is_variant_axis).map((d) => r[d.code] ?? '').join(' ');
            const vRow = {
              product_id: productId, variant_name: r.variant_name || axisText || 'Standard', sku: r.sku.toUpperCase(), barcode: r.barcode || null,
              mrp: parseNumber(r.mrp), retail_price: parseNumber(r.retail_price) ?? 0, dealer_price: parseNumber(r.dealer_price), wholesale_price: parseNumber(r.wholesale_price),
              min_selling_price: parseNumber(r.min_selling_price), min_stock: parseNumber(r.min_stock) ?? 0, reorder_level: parseNumber(r.reorder_level) ?? parseNumber(r.min_stock) ?? 0, reorder_qty: parseNumber(r.reorder_qty) ?? 0,
              search_text: searchText(r.product_name, r.brand, fam.name, r.variant_name, r.sku, r.barcode, axisText, r.fitment_make, r.fitment_model), is_active: true,
            };
            let variantId = existing?.id;
            if (variantId) await updateRow(tx, 'product_variants', variantId, vRow);
            else variantId = await insertRow(tx, 'product_variants', { ...vRow, last_purchase_cost: parseNumber(r.opening_cost) ?? 0, avg_cost: parseNumber(r.opening_cost) ?? 0 }, actor);
            await tx.execute('DELETE FROM spec_values WHERE variant_id = ?', [variantId]);
            for (const d of famDefs.filter((x) => x.is_variant_axis)) {
              const raw = r[d.code];
              if (!raw) continue;
              await insertRow(tx, 'spec_values', specRow(productId, variantId, d, raw));
            }
            if (r.fitment_model) {
              const m = findModel(r.fitment_make ?? '', r.fitment_model)!;
              const yf = parseNumber(r.fitment_year_from);
              const g = yf ? (gens ?? []).find((x) => x.model_id === m.id && x.year_from === yf) : null;
              await insertRow(tx, 'product_fitments', { product_id: productId, variant_id: variantId, model_id: m.id, generation_id: g?.id ?? null, year_from: g ? null : yf, year_to: g ? null : parseNumber(r.fitment_year_to), position: r.fitment_position || null }, actor);
            }
            const oq = parseNumber(r.opening_qty);
            if (!existing && oq && oq > 0) {
              const loc = (locations ?? []).find((l) => l.code.toLowerCase() === (r.location_code || '').toLowerCase())?.id ?? locationId;
              if (loc) await insertRow(tx, 'stock_movements', { variant_id: variantId, location_id: loc, qty: oq, movement_type: 'opening', unit_cost: parseNumber(r.opening_cost) ?? 0, occurred_at: new Date().toISOString(), note: 'Opening stock (import)' }, actor);
            }
            count++;
          }

          if (type === 'customers' || type === 'suppliers') {
            const table = type;
            const list = type === 'customers' ? customers : suppliers;
            const prefix = type === 'customers' ? 'C' : 'S';
            const st = r.state_code ? INDIAN_STATES.find((s) => s.code === r.state_code.padStart(2, '0')) : r.gstin ? INDIAN_STATES.find((s) => s.code === stateCodeFromGstin(r.gstin)) : null;
            const existing = r.code ? list?.find((c) => c.code.toLowerCase() === r.code.toLowerCase()) : list?.find((c) => c.name.toLowerCase() === r.name.toLowerCase());
            let code = r.code || existing?.code;
            if (!code) {
              const max = await tx.execute(`SELECT MAX(code) AS m FROM ${table} WHERE code LIKE '${prefix}%'`);
              code = nextCode(prefix, (max.rows?._array?.[0]?.m as string) ?? null);
            }
            const common = {
              code, name: r.name, mobile: r.mobile?.replace(/\D/g, '') || null, alt_phone: r.alt_phone || null, email: r.email || null, gstin: r.gstin?.toUpperCase() || null, pan: r.pan || (r.gstin ? r.gstin.slice(2, 12) : null),
              address_line1: r.address_line1 || null, address_line2: r.address_line2 || null, city: r.city || null, state_code: st?.code ?? null, state_name: st?.name ?? null, pincode: r.pincode || null,
              opening_balance: parseNumber(r.opening_balance) ?? 0, opening_balance_date: r.opening_balance_date || null, notes: r.notes || null, is_active: true,
              search_text: searchText(r.name, r.business_name ?? r.company_name, code, r.mobile, r.gstin, r.city),
            };
            const row = type === 'customers'
              ? { ...common, business_name: r.business_name || null, owner_name: r.owner_name || null, customer_type: ['retail', 'dealer', 'wholesale', 'workshop', 'other'].includes(r.customer_type) ? r.customer_type : 'dealer', price_list_id: (priceLists ?? []).find((p) => p.code.toLowerCase() === (r.price_list || '').toLowerCase() || p.name.toLowerCase() === (r.price_list || '').toLowerCase())?.id ?? null, credit_limit: parseNumber(r.credit_limit) ?? 0, credit_days: parseNumber(r.credit_days) ?? 0 }
              : { ...common, company_name: r.company_name || null, contact_person: r.contact_person || null, payment_terms_days: parseNumber(r.payment_terms_days) ?? 0 };
            let partyId = existing?.id;
            if (partyId) await updateRow(tx, table, partyId, row);
            else {
              partyId = await insertRow(tx, table, row, actor);
              const amt = parseNumber(r.opening_balance) ?? 0;
              if (amt !== 0) {
                const isCust = type === 'customers';
                await insertRow(tx, 'ledger_entries', { party_type: isCust ? 'customer' : 'supplier', party_id: partyId, entry_date: r.opening_balance_date || new Date().toISOString().slice(0, 10), doc_type: 'opening', debit: (isCust ? amt > 0 : amt < 0) ? Math.abs(amt) : 0, credit: (isCust ? amt < 0 : amt > 0) ? Math.abs(amt) : 0, narration: 'Opening balance (import)' }, actor);
              }
            }
            count++;
          }

          if (type === 'opening_stock') {
            const v = (variants ?? []).find((x) => x.sku.toUpperCase() === r.sku.toUpperCase())!;
            const loc = (locations ?? []).find((l) => l.code.toLowerCase() === r.location_code.toLowerCase())!;
            const cost = parseNumber(r.unit_cost) ?? v.avg_cost ?? 0;
            await insertRow(tx, 'stock_movements', { variant_id: v.id, location_id: loc.id, qty: parseNumber(r.qty), movement_type: 'opening', unit_cost: cost, occurred_at: new Date().toISOString(), note: r.note || 'Opening stock (import)' }, actor);
            if (!v.avg_cost && cost) await updateRow(tx, 'product_variants', v.id, { avg_cost: cost, last_purchase_cost: cost });
            count++;
          }

          if (type === 'vehicles') {
            let mk = (makes ?? []).find((m) => m.name.toLowerCase() === r.make.toLowerCase());
            let makeId = mk?.id;
            if (!makeId) makeId = await insertRow(tx, 'vehicle_makes', { name: r.make, code: slug(r.make, 4), sort_order: 99, is_active: true });
            let m = (models ?? []).find((x) => x.make_id === makeId && x.name.toLowerCase() === r.model.toLowerCase());
            let modelId = m?.id;
            if (!modelId) modelId = await insertRow(tx, 'vehicle_models', { make_id: makeId, name: r.model, code: (r.model_code || slug(r.model, 10)).toUpperCase(), body_type: r.body_type || null, search_text: `${r.make} ${r.model}`.toLowerCase(), is_active: true });
            const g = (gens ?? []).find((x) => x.model_id === modelId && x.name.toLowerCase() === r.generation.toLowerCase());
            const gRow = { model_id: modelId, name: r.generation, year_from: parseNumber(r.year_from), year_to: parseNumber(r.year_to), is_facelift: parseBool(r.facelift) ?? false, sort_order: parseNumber(r.year_from) ?? 0, is_active: true };
            if (g) await updateRow(tx, 'vehicle_generations', g.id, gRow);
            else await insertRow(tx, 'vehicle_generations', gRow);
            for (const a of (r.aliases || '').split('|').map((x) => x.trim()).filter(Boolean)) {
              await tx.execute('INSERT OR IGNORE INTO vehicle_model_aliases (id, model_id, alias, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [uuidv7(), modelId, a, new Date().toISOString(), new Date().toISOString()]);
            }
            count++;
          }
        }
      });
      setDone(`Imported ${count} rows. Products and vehicles created here sync to every device; the server rebuilds search text on arrival.`);
      setText('');
      setPreview(null);
    } catch (e) {
      notify(`Import failed and nothing was written: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function specRow(productId: string, variantId: string | null, d: { id: string; data_type: string; unit: string | null }, raw: string) {
    const base = { product_id: productId, variant_id: variantId, spec_definition_id: d.id, value_text: null as string | null, value_number: null as number | null, value_bool: null as boolean | null, option_id: null as string | null, option_ids: null as string | null, display_value: raw };
    if (d.data_type === 'select') { const o = findOption(d.id, raw)!; return { ...base, option_id: o.id, display_value: o.value }; }
    if (d.data_type === 'multiselect') { const os = raw.split('|').map((p) => findOption(d.id, p)!); return { ...base, option_ids: os.map((o) => o.id).join(','), display_value: os.map((o) => o.value).join(', ') }; }
    if (d.data_type === 'number') { const n = parseNumber(raw)!; return { ...base, value_number: n, display_value: d.unit ? `${n} ${d.unit}` : String(n) }; }
    if (d.data_type === 'boolean') { const b = parseBool(raw)!; return { ...base, value_bool: b, display_value: b ? 'Yes' : 'No' }; }
    return { ...base, value_text: raw };
  }

  function pickFile() {
    if (Platform.OS !== 'web') { notify('Phone par CSV text paste karo. File chunna web par milta hai.'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      f.text().then((s) => { setText(s); setPreview(null); setDone(null); });
    };
    input.click();
  }

  function downloadTemplate() {
    const csv = templateCsv(type);
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = `autogrid-${type}-template.csv`;
      a.click();
    } else {
      setText(csv);
    }
  }

  if (!can('catalog.edit') && !can('party.edit')) return <Screen><Text>Import ke liye maal ya party edit ki permission chahiye.</Text></Screen>;

  return (
    <Screen>
      <Text variant="display">Import</Text>
      <Row gap={space.xs} wrap>
        {(Object.keys(IMPORT_TEMPLATES) as ImportType[]).map((k) => (
          <Chip key={k} label={IMPORT_TEMPLATES[k].label} selected={type === k} onPress={() => { setType(k); setPreview(null); setDone(null); }} />
        ))}
      </Row>
      <Card tone="alt">
        <Text variant="small" color="textMuted">{tpl.description}</Text>
        <Text variant="small"><Text variant="small" style={{ fontWeight: '600' }}>Zaroori: </Text>{tpl.required.join(', ')}</Text>
        <Text variant="small" color="textMuted"><Text variant="small" style={{ fontWeight: '600' }}>Marzi se: </Text>{tpl.optional.join(', ')}</Text>
        {type === 'products' ? (
          <Text variant="small" color="textFaint">
            Spec codes: {[...new Set((defs ?? []).map((d) => d.code))].sort().join(', ')}. Dropdown values must match the option value, code or alias (H4, HB3, 9005). Multi-select values are separated with |.
          </Text>
        ) : null}
        <Row gap={8}>
          <Button title="Template download karo" tone="secondary" size="sm" onPress={downloadTemplate} />
          <Button title="CSV file chuno" tone="secondary" size="sm" onPress={pickFile} />
        </Row>
      </Card>

      <Input label="Ya CSV yahan paste karo" value={text} onChangeText={(v) => { setText(v); setPreview(null); setDone(null); }} multiline numberOfLines={8} placeholder="sku,name,…" autoCapitalize="none" autoCorrect={false} style={{ minHeight: 140, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, fontSize: 13 }} />

      <Row gap={8}>
        <Button title="Row check karo" tone="secondary" onPress={() => setPreview(validate())} disabled={!parsed.rows.length} />
        <Button title={`Import ${parsed.rows.length} rows`} onPress={run} loading={busy} disabled={!parsed.rows.length} />
      </Row>

      {preview ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="heading">{preview.summary || 'Cannot import'}</Text>
            <Badge tone={preview.issues.some((i) => !/will be created|will update|not 10 digits/.test(i.message)) ? 'danger' : 'ok'}>{preview.issues.length} notes</Badge>
          </Row>
          <Divider />
          <ScrollView style={{ maxHeight: 320 }}>
            {preview.issues.slice(0, 200).map((i, k) => (
              <Text key={k} variant="small" color={/will be created|will update|not 10 digits/.test(i.message) ? 'warn' : 'danger'}>
                Row {i.row}: {i.message}
              </Text>
            ))}
            {preview.issues.length === 0 ? <Text variant="small" color="ok">Saari row theek hain.</Text> : null}
          </ScrollView>
        </Card>
      ) : null}

      {done ? (
        <Card style={{ borderColor: t.ok }}>
          <Text color="ok">{done}</Text>
        </Card>
      ) : null}

      {parsed.rows.length ? (
        <>
          <SectionTitle>Jhalak · pehli 5 row</SectionTitle>
          <ScrollView horizontal>
            <View>
              <Row gap={12} style={{ paddingVertical: 6 }}>
                {parsed.headers.map((h) => <Text key={h} variant="label" color="textMuted" style={{ width: 120 }}>{h}</Text>)}
              </Row>
              {parsed.rows.slice(0, 5).map((r, i) => (
                <Row key={i} gap={12} style={{ paddingVertical: 4 }}>
                  {parsed.headers.map((h) => <Text key={h} variant="small" style={{ width: 120 }} numberOfLines={1}>{r[h]}</Text>)}
                </Row>
              ))}
            </View>
          </ScrollView>
        </>
      ) : null}
    </Screen>
  );
}
