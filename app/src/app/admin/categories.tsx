/**
 * Category settings — the catalogue's shape, kept in the database (owner,
 * 8 Oct 2026: "backend driven rakho jisse apk change na karni pade").
 *
 * A category (product_families) carries its detail fields (spec_definitions)
 * and each field's options (spec_options). Every item form, kism form and
 * Stock Chadhao reads them live, so a new category, a new detail ("Beam
 * pattern") or a new option ("HB3") reaches every phone through sync — no new
 * app.
 *
 *   /admin/categories          the list, and a new category
 *   /admin/categories?id=<c>   one category: rename, its fields, their options
 *
 * Nothing is deleted. A field or option taken away is switched off — items
 * already carrying it keep their value and their history.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { slug } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Divider, Empty, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type Family = { id: string; code: string; name: string; is_active: number; items: number; fields: number };
type Field = { id: string; code: string; name: string; data_type: string; unit: string | null; is_required: number; is_variant_axis: number; sort_order: number; is_active: number };
type Opt = { id: string; spec_definition_id: string; value: string; is_active: number; sort_order: number };

const TYPES = [
  { v: 'select', label: 'Ek chuno' },
  { v: 'multiselect', label: 'Kai chuno' },
  { v: 'number', label: 'Number' },
  { v: 'text', label: 'Likho' },
  { v: 'boolean', label: 'Haan / Nahi' },
];
const typeLabel = (t: string) => TYPES.find((x) => x.v === t)?.label ?? t;

export default function Categories() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { can } = useSession();
  if (!can('catalog.edit')) return <Screen><Empty title="Ye sirf owner badal sakta hai" /></Screen>;
  return id ? <OneCategory id={id} /> : <AllCategories />;
}

function AllCategories() {
  const router = useRouter();
  const { db } = useSystem();
  const [name, setName] = useState('');
  const { data: fams } = useQuery<Family>(`
    SELECT f.id, f.code, f.name, f.is_active,
           (SELECT COUNT(*) FROM products p WHERE p.family_id = f.id AND p.is_active = 1) AS items,
           (SELECT COUNT(*) FROM spec_definitions d WHERE d.family_id = f.id AND COALESCE(d.is_active, 1) = 1) AS fields
      FROM product_families f ORDER BY f.is_active DESC, f.sort_order, f.name`);

  async function add() {
    const n = name.trim();
    if (!n) { notify('Category ka naam likho.'); return; }
    if ((fams ?? []).some((f) => f.name.toLowerCase() === n.toLowerCase())) { notify('Ye category pehle se hai.'); return; }
    let code = slug(n, 6) || 'CAT';
    while ((fams ?? []).some((f) => f.code === code)) code = `${code.slice(0, 5)}${Math.floor(Math.random() * 10)}`;
    const fid = await insertRow(db, 'product_families', {
      code, name: n, sku_prefix: slug(n, 4) || code, sku_template: '{FAMILY}-{AXES}', is_fitment_required: false, is_active: true, sort_order: 100,
    });
    setName('');
    router.push(`/admin/categories?id=${fid}` as never);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Category' }} />
      <Screen>
        <Text variant="display">Category</Text>
        <Text variant="small" color="textMuted">
          Har category ki apni detail hoti hai — bulb ka socket aur watt, mat ka type aur colour. Yahan jodo ya badlo; sab phones par apne aap pahunch jayega.
        </Text>
        <Card style={{ gap: space.sm }}>
          <Input label="Nayi category" value={name} onChangeText={setName} placeholder="Floor Mats / LED Bulb / Seat Cover" autoCapitalize="words" />
          <Button title="Category banao" onPress={add} disabled={!name.trim()} />
        </Card>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(fams ?? []).map((f) => (
            <ListRow key={f.id} title={f.name} subtitle={`${f.fields} detail · ${f.items} item`}
              onPress={() => router.push(`/admin/categories?id=${f.id}` as never)}
              right={f.is_active ? undefined : <Badge tone="neutral">band</Badge>} />
          ))}
        </Card>
      </Screen>
    </>
  );
}

function OneCategory({ id }: { id: string }) {
  const { db } = useSystem();
  const { data: famRows } = useQuery<{ id: string; name: string; is_active: number }>('SELECT id, name, is_active FROM product_families WHERE id = ?', [id]);
  const fam = famRows?.[0];
  const { data: fields } = useQuery<Field>(
    `SELECT id, code, name, data_type, unit, is_required, is_variant_axis, sort_order, COALESCE(is_active, 1) AS is_active
       FROM spec_definitions WHERE family_id = ? ORDER BY COALESCE(is_active, 1) DESC, sort_order, name`, [id]);
  const { data: opts } = useQuery<Opt>(
    `SELECT o.id, o.spec_definition_id, o.value, COALESCE(o.is_active, 1) AS is_active, o.sort_order
       FROM spec_options o JOIN spec_definitions d ON d.id = o.spec_definition_id
      WHERE d.family_id = ? ORDER BY o.sort_order, o.value`, [id]);

  const [rename, setRename] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [newField, setNewField] = useState('');
  const [newType, setNewType] = useState('select');
  const [newOpt, setNewOpt] = useState('');

  async function addField() {
    const n = newField.trim();
    if (!n) { notify('Detail ka naam likho — jaise Socket, Colour, Watt.'); return; }
    let code = slug(n, 12).toLowerCase() || 'detail';
    while ((fields ?? []).some((f) => f.code === code)) code = `${code}${Math.floor(Math.random() * 10)}`;
    const sort = Math.max(0, ...(fields ?? []).map((f) => f.sort_order)) + 10;
    const did = await insertRow(db, 'spec_definitions', {
      family_id: id, code, name: n, data_type: newType, unit: null, is_required: false, is_variant_axis: false,
      is_filterable: true, show_in_variant_name: false, sort_order: sort, is_active: true,
    });
    setNewField('');
    setOpen(did);
  }

  async function addOption(f: Field) {
    const v = newOpt.trim();
    if (!v) return;
    if ((opts ?? []).some((o) => o.spec_definition_id === f.id && o.value.toLowerCase() === v.toLowerCase())) {
      const old = (opts ?? []).find((o) => o.spec_definition_id === f.id && o.value.toLowerCase() === v.toLowerCase())!;
      if (!old.is_active) await updateRow(db, 'spec_options', old.id, { is_active: true });
      else notify('Ye option pehle se hai.');
      setNewOpt('');
      return;
    }
    const sort = Math.max(0, ...(opts ?? []).filter((o) => o.spec_definition_id === f.id).map((o) => o.sort_order)) + 10;
    await insertRow(db, 'spec_options', {
      spec_definition_id: f.id, value: v, code: slug(v, 12) || v.toUpperCase(), aliases: null, sort_order: sort, is_active: true,
    });
    setNewOpt('');
  }

  if (!fam) return <Screen><Text color="textMuted">Khul raha hai…</Text></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: fam.name }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }} align="flex-start">
          <Text variant="display" style={{ flex: 1 }}>{fam.name}</Text>
          <Button title={fam.is_active ? 'Band karo' : 'Chalu karo'} tone="ghost" size="sm"
            onPress={() => updateRow(db, 'product_families', fam.id, { is_active: !fam.is_active })} />
        </Row>
        {rename === null ? (
          <Button title="Naam badlo" tone="secondary" size="sm" onPress={() => setRename(fam.name)} />
        ) : (
          <Card style={{ gap: space.sm }}>
            <Input label="Category ka naam" value={rename} onChangeText={setRename} />
            <Row gap={space.sm}>
              <Button title="Save" onPress={async () => { if (rename.trim()) await updateRow(db, 'product_families', fam.id, { name: rename.trim() }); setRename(null); }} />
              <Button title="Rehne do" tone="ghost" onPress={() => setRename(null)} />
            </Row>
          </Card>
        )}

        <Text variant="small" color="textMuted">
          “Kism ki pehchaan” wali detail har kism ki alag hoti hai (bulb ka socket, mat ka colour) — stock chadhate waqt chuni jaati hai aur kism ke naam mein aati hai. Baaki detail item ki hoti hai, sab kism mein same.
        </Text>

        <SectionTitle>Detail · {(fields ?? []).filter((f) => f.is_active).length}</SectionTitle>
        {(fields ?? []).map((f) => {
          const mine = (opts ?? []).filter((o) => o.spec_definition_id === f.id);
          const isOpen = open === f.id;
          return (
            <Card key={f.id} style={{ gap: space.sm, opacity: f.is_active ? 1 : 0.6 }}>
              <Row style={{ justifyContent: 'space-between' }} align="flex-start">
                <View style={{ flex: 1 }}>
                  <Text variant="heading">{f.name}{f.unit ? ` (${f.unit})` : ''}</Text>
                  <Text variant="small" color="textMuted">
                    {[typeLabel(f.data_type), f.is_variant_axis ? 'kism ki pehchaan' : 'item ki', f.is_required ? 'zaroori' : null, !f.is_active ? 'band' : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Button title={isOpen ? 'Band' : 'Badlo'} tone="ghost" size="sm" onPress={() => { setOpen(isOpen ? null : f.id); setNewOpt(''); }} />
              </Row>
              {(f.data_type === 'select' || f.data_type === 'multiselect') && !isOpen ? (
                <Text variant="small" color="textFaint" numberOfLines={2}>{mine.filter((o) => o.is_active).map((o) => o.value).join(', ') || 'Koi option nahi'}</Text>
              ) : null}
              {isOpen ? (
                <View style={{ gap: space.sm }}>
                  <Divider />
                  <Row gap={space.xs} wrap>
                    <Chip label="Kism ki pehchaan" selected={!!f.is_variant_axis}
                      onPress={() => updateRow(db, 'spec_definitions', f.id, { is_variant_axis: !f.is_variant_axis, show_in_variant_name: !f.is_variant_axis })} />
                    <Chip label="Zaroori" selected={!!f.is_required} onPress={() => updateRow(db, 'spec_definitions', f.id, { is_required: !f.is_required })} />
                    <Chip label={f.is_active ? 'Chalu' : 'Band'} selected={!!f.is_active} onPress={() => updateRow(db, 'spec_definitions', f.id, { is_active: !f.is_active })} />
                  </Row>
                  <Row gap={space.xs} wrap>
                    {TYPES.map((t) => (
                      <Chip key={t.v} label={t.label} selected={f.data_type === t.v} onPress={async () => {
                        if (t.v === f.data_type) return;
                        if (!(await confirm('Type badlein?', 'Pehle se bhari detail jaisi hai waisi rahegi; naya type naye items par lagega.'))) return;
                        await updateRow(db, 'spec_definitions', f.id, { data_type: t.v });
                      }} />
                    ))}
                  </Row>
                  {f.data_type === 'number' ? (
                    <Input label="Unit (zaroori nahi)" defaultValue={f.unit ?? ''} placeholder="W, mm, inch"
                      onEndEditing={(e) => updateRow(db, 'spec_definitions', f.id, { unit: e.nativeEvent.text.trim() || null })} />
                  ) : null}
                  {f.data_type === 'select' || f.data_type === 'multiselect' ? (
                    <>
                      <Text variant="label" color="textMuted">Options · tap karke band ya chalu karo</Text>
                      <Row gap={space.xs} wrap>
                        {mine.map((o) => (
                          <Chip key={o.id} label={o.is_active ? o.value : `${o.value} (band)`} selected={!!o.is_active}
                            onPress={() => updateRow(db, 'spec_options', o.id, { is_active: !o.is_active })} />
                        ))}
                      </Row>
                      <Row gap={space.sm} align="flex-end">
                        <Input containerStyle={{ flex: 1 }} label="Naya option" value={newOpt} onChangeText={setNewOpt} placeholder="H4, Black, 7D…" autoCapitalize="characters" onSubmitEditing={() => addOption(f)} />
                        <Button title="Jodo" onPress={() => addOption(f)} disabled={!newOpt.trim()} />
                      </Row>
                    </>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })}

        <Card style={{ gap: space.sm }}>
          <Text variant="heading">Nayi detail</Text>
          <Input label="Naam" value={newField} onChangeText={setNewField} placeholder="Socket, Colour, Watt, Material" autoCapitalize="words" />
          <Row gap={space.xs} wrap>
            {TYPES.map((t) => <Chip key={t.v} label={t.label} selected={newType === t.v} onPress={() => setNewType(t.v)} />)}
          </Row>
          <Button title="Detail jodo" onPress={addField} disabled={!newField.trim()} />
        </Card>
      </Screen>
    </>
  );
}
