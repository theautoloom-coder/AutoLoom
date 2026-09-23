import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { renderSku } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { updateRow } from '@/lib/writes';
import { Badge, Button, Card, Divider, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, SelectField, SwitchRow, confirm, notify } from '@/ui/forms';

type Fam = {
  id: string; code: string; name: string; description: string | null; sku_prefix: string; sku_template: string; default_hsn_code: string | null;
  default_unit_id: string | null; default_tax_rate_id: string | null; is_fitment_required: number; sort_order: number; is_active: number;
};
type Spec = { id: string; code: string; name: string; data_type: string; unit: string | null; is_required: number; is_variant_axis: number; is_filterable: number; show_in_variant_name: number; sort_order: number; is_active: number; options: number };

export default function FamilyEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can } = useSession();
  const editable = can('catalog.edit');

  const { data: rows } = useQuery<Fam>('SELECT * FROM product_families WHERE id = ?', [id]);
  const fam = rows?.[0];
  const { data: specs } = useQuery<Spec>(
    `SELECT sd.*, (SELECT COUNT(*) FROM spec_options so WHERE so.spec_definition_id = sd.id AND so.is_active = 1) AS options
     FROM spec_definitions sd WHERE sd.family_id = ? ORDER BY sd.is_active DESC, sd.sort_order, sd.name`,
    [id]
  );
  const { data: units } = useQuery<{ id: string; code: string; name: string }>('SELECT id, code, name FROM units ORDER BY code');
  const { data: taxes } = useQuery<{ id: string; name: string }>('SELECT id, name FROM tax_rates WHERE is_active = 1 ORDER BY rate_pct');
  const { data: hsns } = useQuery<{ code: string; description: string | null }>('SELECT code, description FROM hsn_codes WHERE is_active = 1 ORDER BY code');

  const [form, setForm] = useState<Partial<Fam>>({});
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (fam && !dirty) setForm(fam);
  }, [fam, dirty]);
  const set = <K extends keyof Fam>(k: K, v: Fam[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  async function save() {
    if (!fam) return;
    if (!form.name?.trim() || !form.sku_prefix?.trim()) {
      notify('Name and SKU prefix are required.');
      return;
    }
    await updateRow(db, 'product_families', fam.id, {
      name: form.name.trim(),
      description: form.description ?? null,
      sku_prefix: form.sku_prefix.trim().toUpperCase(),
      sku_template: form.sku_template?.trim() || '{FAMILY}-{BRAND}-{AXES}',
      default_hsn_code: form.default_hsn_code ?? null,
      default_unit_id: form.default_unit_id ?? null,
      default_tax_rate_id: form.default_tax_rate_id ?? null,
      is_fitment_required: !!form.is_fitment_required,
      sort_order: form.sort_order ?? 0,
      is_active: !!form.is_active,
    });
    setDirty(false);
    notify('Saved.');
  }

  async function move(spec: Spec, dir: -1 | 1) {
    const list = (specs ?? []).filter((s) => s.is_active);
    const i = list.findIndex((s) => s.id === spec.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    await db.writeTransaction(async (tx) => {
      await updateRow(tx, 'spec_definitions', list[i].id, { sort_order: j + 1 });
      await updateRow(tx, 'spec_definitions', list[j].id, { sort_order: i + 1 });
      // normalise the rest
      list.forEach(async (s, k) => {
        if (k !== i && k !== j) await updateRow(tx, 'spec_definitions', s.id, { sort_order: k + 1 });
      });
    });
  }

  const preview = renderSku(form.sku_template ?? '', {
    familyCode: fam?.code ?? 'FAM',
    familyPrefix: form.sku_prefix ?? fam?.sku_prefix,
    brandCode: 'XYZ',
    vehicleCode: form.is_fitment_required ? 'CRETA' : null,
    axes: (specs ?? [])
      .filter((s) => s.is_variant_axis && s.is_active)
      .slice(0, 3)
      .map((s) => ({ code: s.code, value: s.data_type === 'number' ? '60' : s.code.toUpperCase().slice(0, 3), optionCode: s.data_type === 'select' ? s.code.toUpperCase().slice(0, 3) : null, unit: s.unit })),
  });

  if (!fam) return <Screen><Text>Loading…</Text></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: fam.name }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="display">{fam.name}</Text>
          <Badge>{fam.code}</Badge>
        </Row>

        <FormSection title="Family">
          <Input label="Name" value={form.name ?? ''} onChangeText={(v) => set('name', v)} editable={editable} />
          <Input label="Description" value={form.description ?? ''} onChangeText={(v) => set('description', v)} editable={editable} placeholder="Shown to staff on the product wizard" />
          <Row gap={12} align="flex-start">
            <Input containerStyle={{ flex: 1 }} label="SKU prefix" value={form.sku_prefix ?? ''} onChangeText={(v) => set('sku_prefix', v.toUpperCase())} autoCapitalize="characters" editable={editable} />
            <Input containerStyle={{ flex: 2 }} label="SKU template" value={form.sku_template ?? ''} onChangeText={(v) => set('sku_template', v)} autoCapitalize="characters" editable={editable} hint={`Tokens: {FAMILY} {BRAND} {VEHICLE} {AXES} or a spec code like {socket}. Preview: ${preview}`} />
          </Row>
          <SwitchRow label="Vehicle-specific family" hint="Mats, seat covers, assemblies: the wizard requires a fitment and SKUs include the vehicle." value={!!form.is_fitment_required} onChange={(v) => set('is_fitment_required', v ? 1 : 0)} />
          <SwitchRow label="Active" hint="Inactive families are hidden from the wizard but existing products remain." value={!!form.is_active} onChange={(v) => set('is_active', v ? 1 : 0)} />
        </FormSection>

        <FormSection title="Defaults for new products" hint="Pre-filled on every product in this family; editable per product.">
          <SelectField label="Unit" value={form.default_unit_id} options={(units ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))} onChange={(v) => set('default_unit_id', v)} />
          <SelectField label="GST rate" value={form.default_tax_rate_id} options={(taxes ?? []).map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => set('default_tax_rate_id', v)} />
          <SelectField label="HSN code" value={form.default_hsn_code} options={(hsns ?? []).map((h) => ({ value: h.code, label: h.code, sublabel: h.description ?? undefined }))} onChange={(v) => set('default_hsn_code', v)} allowClear />
        </FormSection>

        {editable ? <Button title={dirty ? 'Save changes' : 'Saved'} onPress={save} disabled={!dirty} /> : null}

        <SectionTitle right={editable ? <Button title="Add spec" size="sm" tone="secondary" onPress={() => router.push(`/admin/spec/new?family=${fam.id}`)} /> : undefined}>
          Specification template · {(specs ?? []).filter((s) => s.is_active).length}
        </SectionTitle>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(specs ?? []).length === 0 ? (
            <Text variant="small" color="textMuted" style={{ padding: 12 }}>
              No specifications yet. Add the fields that describe products in this family, e.g. Socket, Wattage, Colour.
            </Text>
          ) : null}
          {(specs ?? []).map((s, i) => (
            <ListRow
              key={s.id}
              left={
                editable && s.is_active ? (
                  <Row gap={2}>
                    <Button title="▲" tone="ghost" size="sm" onPress={() => move(s, -1)} disabled={i === 0} />
                    <Button title="▼" tone="ghost" size="sm" onPress={() => move(s, 1)} />
                  </Row>
                ) : undefined
              }
              title={
                <Row gap={6} wrap>
                  <Text variant="heading">{s.name}</Text>
                  {s.is_variant_axis ? <Badge tone="accent">variant axis</Badge> : null}
                  {s.is_required ? <Badge tone="warn">required</Badge> : null}
                  {!s.is_active ? <Badge tone="danger">inactive</Badge> : null}
                </Row>
              }
              subtitle={`${s.code} · ${s.data_type}${s.unit ? ` (${s.unit})` : ''}${s.data_type === 'select' || s.data_type === 'multiselect' ? ` · ${s.options} options` : ''}${s.show_in_variant_name ? ' · in name' : ''}${s.is_filterable ? ' · filter' : ''}`}
              onPress={() => router.push(`/admin/spec/${s.id}`)}
             
            />
          ))}
        </Card>

        <Divider />
        <Text variant="small" color="textFaint">
          Variant axis specs (like Socket or Colour) create separate SKUs with their own stock and prices. The rest are entered once per product and inherited by every variant.
        </Text>
      </Screen>
    </>
  );
}
