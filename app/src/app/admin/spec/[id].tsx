import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { slug } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, SelectField, SwitchRow, confirm, notify } from '@/ui/forms';

type Spec = {
  id: string; family_id: string; code: string; name: string; data_type: string; unit: string | null; is_required: number; is_variant_axis: number;
  is_filterable: number; show_in_variant_name: number; help_text: string | null; sort_order: number; is_active: number;
};
type Opt = { id: string; value: string; code: string | null; aliases: string | null; sort_order: number; is_active: number; used: number };

const TYPES = [
  { value: 'select', label: 'Dropdown (one value)', sublabel: 'Socket, Colour, Type — staff pick from a list' },
  { value: 'multiselect', label: 'Dropdown (many values)', sublabel: 'Compatible sockets, Features' },
  { value: 'number', label: 'Number', sublabel: 'Wattage, Lumens, Thickness — with a unit' },
  { value: 'text', label: 'Free text', sublabel: 'Chip model, Connector name' },
  { value: 'boolean', label: 'Yes / No', sublabel: 'Waterproof, CANBUS' },
];

export default function SpecEditor() {
  const { id, family } = useLocalSearchParams<{ id: string; family?: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { db } = useSystem();
  const { can } = useSession();
  const editable = can('catalog.edit');

  const { data: rows } = useQuery<Spec>('SELECT * FROM spec_definitions WHERE id = ?', [isNew ? '' : id]);
  const existing = rows?.[0];
  const familyId = existing?.family_id ?? family ?? '';
  const { data: famRows } = useQuery<{ name: string; count: number }>('SELECT name, (SELECT COUNT(*) FROM spec_definitions WHERE family_id = ?1) AS count FROM product_families WHERE id = ?1', [familyId]);
  const fam = famRows?.[0];
  const { data: options } = useQuery<Opt>(
    `SELECT so.*, (SELECT COUNT(*) FROM spec_values sv WHERE sv.option_id = so.id) AS used
     FROM spec_options so WHERE so.spec_definition_id = ? ORDER BY so.is_active DESC, so.sort_order, so.value`,
    [isNew ? '' : id]
  );

  const [form, setForm] = useState<Partial<Spec>>({ data_type: 'select', is_required: 0, is_variant_axis: 0, is_filterable: 1, show_in_variant_name: 0, is_active: 1 });
  const [dirty, setDirty] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);
  useEffect(() => {
    if (existing && !dirty) setForm(existing);
  }, [existing, dirty]);
  const set = <K extends keyof Spec>(k: K, v: Spec[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const [newOption, setNewOption] = useState('');
  const [newCode, setNewCode] = useState('');

  async function save() {
    const name = form.name?.trim();
    const code = (form.code?.trim() || slug(name ?? '', 20).toLowerCase()).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    if (!name || !code) {
      notify('Naam likho.');
      return;
    }
    const dup = await db.execute('SELECT id FROM spec_definitions WHERE family_id = ? AND code = ? AND id <> ?', [familyId, code, existing?.id ?? '']);
    if (dup.rows?.length) {
      notify(`Another specification in this family already uses the code “${code}”.`);
      return;
    }
    const payload = {
      family_id: familyId,
      code,
      name,
      data_type: form.data_type ?? 'select',
      unit: form.data_type === 'number' ? form.unit?.trim() || null : null,
      is_required: !!form.is_required,
      is_variant_axis: !!form.is_variant_axis,
      is_filterable: !!form.is_filterable,
      show_in_variant_name: !!form.show_in_variant_name,
      help_text: form.help_text ?? null,
      sort_order: form.sort_order ?? (fam?.count ?? 0) + 1,
      is_active: form.is_active == null ? true : !!form.is_active,
    };
    if (existing) {
      await updateRow(db, 'spec_definitions', existing.id, payload);
      setDirty(false);
      notify('Save ho gaya.');
    } else {
      const newId = await insertRow(db, 'spec_definitions', payload);
      router.replace(`/admin/spec/${newId}`);
    }
  }

  async function addOption() {
    if (!existing) return;
    const v = newOption.trim();
    if (!v) return;
    if ((options ?? []).some((o) => o.value.toLowerCase() === v.toLowerCase())) {
      notify('Ye value pehle se hai.');
      return;
    }
    await insertRow(db, 'spec_options', {
      spec_definition_id: existing.id,
      value: v,
      code: (newCode.trim() || slug(v, 6)).toUpperCase(),
      sort_order: (options?.length ?? 0) + 1,
      is_active: true,
    });
    setNewOption('');
    setNewCode('');
  }

  async function toggleOption(o: Opt) {
    if (o.is_active && o.used > 0) {
      const ok = await confirm('Ye value band karein?', `“${o.value}” is used by ${o.used} product${o.used === 1 ? '' : 's'}. It will stay on them but disappear from new selections.`);
      if (!ok) return;
    }
    await updateRow(db, 'spec_options', o.id, { is_active: !o.is_active });
  }

  async function editAliases(o: Opt) {
    const current = o.aliases ?? '';
    let next: string | null = null;
    if (typeof globalThis.prompt === 'function') {
      next = globalThis.prompt(`Search synonyms for “${o.value}” (space separated)`, current);
    }
    if (next === null) return;
    await updateRow(db, 'spec_options', o.id, { aliases: next.trim() || null });
  }

  const isList = form.data_type === 'select' || form.data_type === 'multiselect';

  return (
    <>
      <Stack.Screen options={{ title: existing ? existing.name : 'New specification' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="display">{existing ? existing.name : 'New specification'}</Text>
          {fam ? <Badge>{fam.name}</Badge> : null}
        </Row>

        <FormSection title="Khaana">
          <Input
            label="Naam"
            value={form.name ?? ''}
            onChangeText={(v) => {
              set('name', v);
              if (!codeTouched && !existing) setForm((f) => ({ ...f, code: slug(v, 20).toLowerCase() }));
            }}
            placeholder="Socket / Base"
            editable={editable}
          />
          <Input
            label="Code"
            value={form.code ?? ''}
            onChangeText={(v) => {
              setCodeTouched(true);
              set('code', v.toLowerCase());
            }}
            autoCapitalize="none"
            hint="SKU template aur import mein isi se pehchana jaata hai. Chhote akshar, beech mein space nahi."
            editable={editable && !existing}
          />
          <SelectField label="Kis type ka data" value={form.data_type} options={TYPES} onChange={(v) => set('data_type', v ?? 'select')} />
          {form.data_type === 'number' ? <Input label="Unit" value={form.unit ?? ''} onChangeText={(v) => set('unit', v)} placeholder="W, V, lm, K, mm, dB" editable={editable} /> : null}
          <Input label="Madad ki line" value={form.help_text ?? ''} onChangeText={(v) => set('help_text', v)} placeholder="Item ke form mein khaane ke neeche dikhega" editable={editable} />
        </FormSection>

        <FormSection title="Kaise chale">
          <SwitchRow label="Bharna zaroori hai" value={!!form.is_required} onChange={(v) => set('is_required', v ? 1 : 0)} />
          <SwitchRow label="Isse alag type bante hain" hint="Har value ka apna SKU banta hai, apna stock aur apna rate (Socket, Colour, Size)." value={!!form.is_variant_axis} onChange={(v) => set('is_variant_axis', v ? 1 : 0)} />
          <SwitchRow label="Type ke naam mein dikhao" hint="“H4 60W Pair” isi tarah ke khaano se banta hai." value={!!form.show_in_variant_name} onChange={(v) => set('show_in_variant_name', v ? 1 : 0)} />
          <SwitchRow label="Isse chhaant sakte ho" hint="Dhoondne par chip ban kar dikhega." value={!!form.is_filterable} onChange={(v) => set('is_filterable', v ? 1 : 0)} />
          {existing ? <SwitchRow label="Active" value={!!form.is_active} onChange={(v) => set('is_active', v ? 1 : 0)} /> : null}
        </FormSection>

        {editable ? <Button title={existing ? (dirty ? 'Save changes' : 'Saved') : 'Create specification'} onPress={save} disabled={existing ? !dirty : !form.name?.trim()} /> : null}

        {existing && isList ? (
          <>
            <SectionTitle>Jo value chal sakti hain · {(options ?? []).filter((o) => o.is_active).length}</SectionTitle>
            {editable ? (
              <Row gap={8} align="flex-end">
                <Input containerStyle={{ flex: 2 }} label="Value" value={newOption} onChangeText={setNewOption} placeholder="H15" onSubmitEditing={addOption} />
                <Input containerStyle={{ flex: 1 }} label="SKU code" value={newCode} onChangeText={(v) => setNewCode(v.toUpperCase())} placeholder="H15" autoCapitalize="characters" />
                <Button title="Jodo" onPress={addOption} disabled={!newOption.trim()} />
              </Row>
            ) : null}
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(options ?? []).map((o) => (
                <ListRow
                  key={o.id}
                  title={
                    <Row gap={6}>
                      <Text variant="heading" color={o.is_active ? 'text' : 'textFaint'}>
                        {o.value}
                      </Text>
                      {o.code ? <Badge>{o.code}</Badge> : null}
                      {!o.is_active ? <Badge tone="danger">retired</Badge> : null}
                    </Row>
                  }
                  subtitle={`${o.used} product${o.used === 1 ? '' : 's'}${o.aliases ? ` · also: ${o.aliases}` : ''}`}
                  onPress={editable ? () => editAliases(o) : undefined}
                  right={editable ? <Button title={o.is_active ? 'Retire' : 'Restore'} tone="ghost" size="sm" onPress={() => toggleOption(o)} /> : undefined}
                />
              ))}
              {(options ?? []).length === 0 ? (
                <Text variant="small" color="textMuted" style={{ padding: 12 }}>
                  Add the values staff can choose from. Tap a value to set search synonyms (for example 9005 for HB3).
                </Text>
              ) : null}
            </Card>
          </>
        ) : null}
      </Screen>
    </>
  );
}
