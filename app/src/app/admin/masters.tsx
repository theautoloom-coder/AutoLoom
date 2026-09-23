/**
 * One editor for the small master tables: brands, categories, units, HSN
 * codes, tax rates, locations, price lists, numbering series.
 *
 * Each table is described by a field list; the screen renders the list and a
 * form from it. Rows are never deleted, only deactivated, because history
 * refers to them.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { slug } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, updateRow, type RowInput } from '@/lib/writes';
import { Badge, Button, Card, Input, ListRow, Row, Screen, Text } from '@/ui';
import { FormSection, NumberField, SelectField, SwitchRow, notify } from '@/ui/forms';

type Field = {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'bool' | 'select';
  required?: boolean;
  upper?: boolean;
  hint?: string;
  options?: (ctx: Record<string, unknown[]>) => Array<{ value: string; label: string }>;
  /** Derive from another field when creating (e.g. code from name). */
  deriveFrom?: string;
  deriveWidth?: number;
};

type Master = {
  title: string;
  table: string;
  permission: 'catalog.edit' | 'admin.settings' | 'catalog.edit_price';
  fields: Field[];
  titleKey: string;
  subtitle: (r: Record<string, unknown>) => string;
  orderBy: string;
  hasActive: boolean;
  lookups?: Record<string, string>;
};

const MASTERS: Record<string, Master> = {
  brands: {
    title: 'Brands', table: 'brands', permission: 'catalog.edit', titleKey: 'name', orderBy: 'name', hasActive: true,
    subtitle: (r) => String(r.code ?? ''),
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'code', label: 'SKU code', kind: 'text', required: true, upper: true, deriveFrom: 'name', deriveWidth: 3, hint: 'Short code used in SKUs, e.g. PHL for Philips' },
    ],
  },
  categories: {
    title: 'Categories', table: 'categories', permission: 'catalog.edit', titleKey: 'name', orderBy: 'level, sort_order, name', hasActive: true,
    subtitle: (r) => (r.level === 2 ? 'Subcategory' : 'Category'),
    lookups: { families: 'SELECT id, name FROM product_families WHERE is_active = 1 ORDER BY sort_order', parents: 'SELECT id, name FROM categories WHERE level = 1 AND is_active = 1 ORDER BY name' },
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'level', label: 'Level', kind: 'select', required: true, options: () => [{ value: '1', label: 'Category' }, { value: '2', label: 'Subcategory' }] },
      { key: 'parent_id', label: 'Parent category', kind: 'select', options: (ctx) => (ctx.parents as { id: string; name: string }[]).map((p) => ({ value: p.id, label: p.name })), hint: 'Only for subcategories' },
      { key: 'family_id', label: 'Family', kind: 'select', options: (ctx) => (ctx.families as { id: string; name: string }[]).map((p) => ({ value: p.id, label: p.name })) },
      { key: 'sort_order', label: 'Sort order', kind: 'number' },
    ],
  },
  units: {
    title: 'Units', table: 'units', permission: 'catalog.edit', titleKey: 'name', orderBy: 'code', hasActive: false,
    subtitle: (r) => `${r.code}${r.allow_decimal ? ' · decimals allowed' : ''}`,
    fields: [
      { key: 'code', label: 'Code', kind: 'text', required: true, hint: 'pcs, set, pair, kit, mtr' },
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'allow_decimal', label: 'Allow decimal quantities', kind: 'bool', hint: 'Wire by the metre, liquids by the litre' },
    ],
  },
  hsn_codes: {
    title: 'HSN codes', table: 'hsn_codes', permission: 'catalog.edit', titleKey: 'code', orderBy: 'code', hasActive: true,
    subtitle: (r) => String(r.description ?? ''),
    lookups: { taxes: 'SELECT id, name FROM tax_rates WHERE is_active = 1 ORDER BY rate_pct' },
    fields: [
      { key: 'code', label: 'HSN / SAC', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'text' },
      { key: 'default_tax_rate_id', label: 'Default GST rate', kind: 'select', options: (ctx) => (ctx.taxes as { id: string; name: string }[]).map((t) => ({ value: t.id, label: t.name })) },
    ],
  },
  tax_rates: {
    title: 'Tax rates', table: 'tax_rates', permission: 'admin.settings', titleKey: 'name', orderBy: 'rate_pct', hasActive: true,
    subtitle: (r) => `CGST ${r.cgst_pct}% + SGST ${r.sgst_pct}% · IGST ${r.igst_pct}% · from ${r.effective_from}`,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true, hint: 'GST 18%' },
      { key: 'rate_pct', label: 'Total rate %', kind: 'number', required: true },
      { key: 'cgst_pct', label: 'CGST %', kind: 'number', required: true },
      { key: 'sgst_pct', label: 'SGST %', kind: 'number', required: true },
      { key: 'igst_pct', label: 'IGST %', kind: 'number', required: true },
      { key: 'cess_pct', label: 'Cess %', kind: 'number' },
      { key: 'effective_from', label: 'Effective from (YYYY-MM-DD)', kind: 'text', required: true },
      { key: 'effective_to', label: 'Effective to (YYYY-MM-DD)', kind: 'text', hint: 'Leave blank while current. Rates are frozen on each invoice line, so changing a slab never rewrites history.' },
    ],
  },
  locations: {
    title: 'Locations', table: 'locations', permission: 'admin.settings', titleKey: 'name', orderBy: 'sort_order', hasActive: true,
    subtitle: (r) => `${r.code} · ${r.type}`,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'code', label: 'Code', kind: 'text', required: true, upper: true, deriveFrom: 'name', deriveWidth: 4 },
      { key: 'type', label: 'Type', kind: 'select', required: true, options: () => ['warehouse', 'shop', 'workshop', 'branch', 'damaged', 'transit'].map((t) => ({ value: t, label: t })) },
      { key: 'address', label: 'Address', kind: 'text' },
      { key: 'sort_order', label: 'Sort order', kind: 'number' },
    ],
  },
  price_lists: {
    title: 'Price lists', table: 'price_lists', permission: 'catalog.edit_price', titleKey: 'name', orderBy: 'name', hasActive: true,
    subtitle: (r) => `${r.code} · uses ${String(r.price_column).replace('_price', '')} price${r.is_default ? ' · default' : ''}`,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'code', label: 'Code', kind: 'text', required: true, deriveFrom: 'name', deriveWidth: 12 },
      { key: 'price_column', label: 'Base price column', kind: 'select', required: true, options: () => [{ value: 'retail_price', label: 'Retail' }, { value: 'dealer_price', label: 'Dealer' }, { value: 'wholesale_price', label: 'Wholesale' }], hint: 'Per-SKU overrides for a list are set on the product.' },
      { key: 'is_default', label: 'Default for new customers', kind: 'bool' },
    ],
  },
  document_sequences: {
    title: 'Numbering series', table: 'document_sequences', permission: 'admin.settings', titleKey: 'prefix', orderBy: 'doc_type, series_code', hasActive: false,
    subtitle: (r) => `${r.doc_type} · series ${r.series_code} · FY ${r.financial_year} · next ${String(r.next_number).padStart(Number(r.pad_width ?? 4), '0')}`,
    lookups: { locations: 'SELECT id, name FROM locations WHERE is_active = 1 ORDER BY sort_order', devices: 'SELECT id, name, platform FROM devices WHERE is_active = 1 ORDER BY name' },
    fields: [
      { key: 'doc_type', label: 'Document', kind: 'select', required: true, options: () => ['sales_invoice', 'credit_note', 'purchase', 'debit_note', 'payment_in', 'payment_out', 'stock_adjustment', 'stock_transfer', 'stock_audit', 'job_card'].map((t) => ({ value: t, label: t.replace('_', ' ') })) },
      { key: 'series_code', label: 'Series', kind: 'text', required: true, upper: true, hint: 'A for the shop counter, B for the warehouse tablet…' },
      { key: 'financial_year', label: 'Financial year', kind: 'text', required: true, hint: '26-27' },
      { key: 'prefix', label: 'Prefix', kind: 'text', required: true, hint: 'NOI/A/26-27/' },
      { key: 'next_number', label: 'Next number', kind: 'number', required: true },
      { key: 'pad_width', label: 'Digits', kind: 'number', hint: '4 → 0042' },
      { key: 'location_id', label: 'Location', kind: 'select', options: (ctx) => (ctx.locations as { id: string; name: string }[]).map((l) => ({ value: l.id, label: l.name })) },
      { key: 'owner_device_id', label: 'Owned by device', kind: 'select', options: (ctx) => (ctx.devices as { id: string; name: string; platform: string }[]).map((d) => ({ value: d.id, label: `${d.name} (${d.platform})` })), hint: 'Only this device increments the series, so offline numbering never collides.' },
    ],
  },
};

export default function MastersScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const master = MASTERS[type ?? 'brands'];
  const { db } = useSystem();
  const { can } = useSession();
  const editable = master ? can(master.permission) : false;

  const { data: rows } = useQuery<Record<string, unknown> & { id: string }>(`SELECT * FROM ${master.table} ORDER BY ${master.hasActive ? 'is_active DESC, ' : ''}${master.orderBy}`);
  const lookupKeys = Object.keys(master.lookups ?? {});
  const l0 = useQuery<Record<string, unknown>>(master.lookups?.[lookupKeys[0]] ?? 'SELECT 1 WHERE 0');
  const l1 = useQuery<Record<string, unknown>>(master.lookups?.[lookupKeys[1]] ?? 'SELECT 1 WHERE 0');
  const ctx = useMemo(() => ({ [lookupKeys[0] ?? '_a']: l0.data ?? [], [lookupKeys[1] ?? '_b']: l1.data ?? [] }), [lookupKeys, l0.data, l1.data]);

  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [filter, setFilter] = useState('');

  const visible = (rows ?? []).filter((r) => !filter || JSON.stringify(r).toLowerCase().includes(filter.toLowerCase()));

  function startNew() {
    const blank: Record<string, unknown> = {};
    for (const f of master.fields) blank[f.key] = f.kind === 'bool' ? false : null;
    if (master.hasActive) blank.is_active = true;
    setEditing(blank);
  }

  function setField(f: Field, v: unknown) {
    setEditing((e) => {
      if (!e) return e;
      const next = { ...e, [f.key]: v };
      // derive codes from names on new rows
      for (const g of master.fields) {
        if (g.deriveFrom === f.key && !e.id && typeof v === 'string') next[g.key] = slug(v, g.deriveWidth ?? 6);
      }
      return next;
    });
  }

  async function save() {
    if (!editing) return;
    for (const f of master.fields) {
      const v = editing[f.key];
      if (f.required && (v === null || v === undefined || v === '')) {
        notify(`${f.label} is required.`);
        return;
      }
    }
    const payload: RowInput = {};
    for (const f of master.fields) {
      let v = editing[f.key] as string | number | boolean | null;
      if (f.kind === 'text' && typeof v === 'string') v = f.upper ? v.trim().toUpperCase() : v.trim() || null;
      if (f.kind === 'select' && f.key === 'level') v = Number(v);
      payload[f.key] = v;
    }
    if (master.hasActive) payload.is_active = !!editing.is_active;
    if (editing.id) await updateRow(db, master.table, String(editing.id), payload);
    else await insertRow(db, master.table, payload);
    setEditing(null);
  }

  if (!master) return <Screen><Text>Unknown master “{type}”.</Text></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: master.title }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="display">{master.title}</Text>
          {editable && !editing ? <Button title="Add" onPress={startNew} /> : null}
        </Row>

        {editing ? (
          <FormSection title={editing.id ? 'Edit' : 'New'}>
            {master.fields.map((f) => {
              const v = editing[f.key];
              if (f.kind === 'bool') return <SwitchRow key={f.key} label={f.label} hint={f.hint} value={!!v} onChange={(x) => setField(f, x)} />;
              if (f.kind === 'number') return <NumberField key={f.key} label={f.label} hint={f.hint} value={v == null ? null : Number(v)} onChange={(x) => setField(f, x)} />;
              if (f.kind === 'select')
                return <SelectField key={f.key} label={f.label} hint={f.hint} value={v == null ? null : String(v)} options={f.options?.(ctx) ?? []} onChange={(x) => setField(f, x)} allowClear={!f.required} />;
              return <Input key={f.key} label={f.label} hint={f.hint} value={v == null ? '' : String(v)} onChangeText={(x) => setField(f, x)} autoCapitalize={f.upper ? 'characters' : 'sentences'} />;
            })}
            {master.hasActive && editing.id ? <SwitchRow label="Active" value={!!editing.is_active} onChange={(x) => setEditing((e) => e && { ...e, is_active: x })} /> : null}
            <Row gap={8}>
              <Button title="Save" onPress={save} />
              <Button title="Cancel" tone="ghost" onPress={() => setEditing(null)} />
            </Row>
          </FormSection>
        ) : null}

        <Input value={filter} onChangeText={setFilter} placeholder={`Filter ${master.title.toLowerCase()}`} autoCapitalize="none" />
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {visible.map((r) => (
            <ListRow
              key={r.id}
              title={
                <Row gap={6}>
                  <Text variant="heading" color={master.hasActive && !r.is_active ? 'textFaint' : 'text'}>
                    {String(r[master.titleKey] ?? '')}
                  </Text>
                  {master.hasActive && !r.is_active ? <Badge tone="danger">inactive</Badge> : null}
                </Row>
              }
              subtitle={master.subtitle(r)}
              onPress={editable ? () => setEditing({ ...r }) : undefined}
              right={editable ? <Text color="accent">Edit</Text> : undefined}
            />
          ))}
          {visible.length === 0 ? (
            <View style={{ padding: 12 }}>
              <Text variant="small" color="textMuted">
                Nothing here yet.
              </Text>
            </View>
          ) : null}
        </Card>
      </Screen>
    </>
  );
}
