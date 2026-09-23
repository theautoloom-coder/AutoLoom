import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { slug } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, NumberField, SelectField, SwitchRow, confirm, notify } from '@/ui/forms';

type Model = { id: string; make_id: string; name: string; code: string; body_type: string | null; segment: string | null; is_active: number; make_name: string };
type Gen = { id: string; name: string; year_from: number; year_to: number | null; is_facelift: number; seating: number | null; notes: string | null; is_active: number; fitments: number; sockets: number };
type Alias = { id: string; alias: string };
type SocketMap = { id: string; generation_id: string; position_label: string; socket: string };

const BODY_TYPES = ['hatchback', 'sedan', 'suv', 'muv', 'pickup', 'van', 'coupe', 'other'];

export default function VehicleModelEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can } = useSession();
  const editable = can('catalog.edit');

  const { data: rows } = useQuery<Model>('SELECT vm.*, mk.name AS make_name FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id WHERE vm.id = ?', [id]);
  const model = rows?.[0];
  const { data: makes } = useQuery<{ id: string; name: string }>('SELECT id, name FROM vehicle_makes WHERE is_active = 1 ORDER BY sort_order, name');
  const { data: gens } = useQuery<Gen>(
    `SELECT g.*, (SELECT COUNT(*) FROM product_fitments pf WHERE pf.generation_id = g.id) AS fitments,
            (SELECT COUNT(*) FROM vehicle_spec_map m WHERE m.generation_id = g.id) AS sockets
     FROM vehicle_generations g WHERE g.model_id = ? ORDER BY g.year_from DESC`,
    [id]
  );
  const { data: aliases } = useQuery<Alias>('SELECT id, alias FROM vehicle_model_aliases WHERE model_id = ? ORDER BY alias', [id]);
  const { data: socketMap } = useQuery<SocketMap>(
    `SELECT m.id, m.generation_id, m.position_label, so.value AS socket
     FROM vehicle_spec_map m JOIN spec_options so ON so.id = m.option_id
     JOIN vehicle_generations g ON g.id = m.generation_id WHERE g.model_id = ? ORDER BY g.year_from DESC, m.position_label`,
    [id]
  );
  const { data: socketOptions } = useQuery<{ id: string; value: string; spec_definition_id: string }>(
    `SELECT so.id, so.value, so.spec_definition_id FROM spec_options so JOIN spec_definitions sd ON sd.id = so.spec_definition_id
     JOIN product_families f ON f.id = sd.family_id WHERE f.code = 'LED' AND sd.code = 'socket' AND so.is_active = 1 ORDER BY so.sort_order`
  );

  const [form, setForm] = useState<Partial<Model>>({});
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (model && !dirty) setForm(model);
  }, [model, dirty]);
  const set = <K extends keyof Model>(k: K, v: Model[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const [gen, setGen] = useState<Partial<Gen> | null>(null);
  const [alias, setAlias] = useState('');
  const [sock, setSock] = useState<{ generation_id: string | null; position: string; option_id: string | null }>({ generation_id: null, position: 'Low Beam', option_id: null });

  async function save() {
    if (!model || !form.name?.trim()) return;
    await updateRow(db, 'vehicle_models', model.id, {
      make_id: form.make_id ?? model.make_id,
      name: form.name.trim(),
      code: (form.code?.trim() || slug(form.name, 10)).toUpperCase(),
      body_type: form.body_type ?? null,
      segment: form.segment ?? null,
      is_active: !!form.is_active,
    });
    setDirty(false);
    notify('Save ho gaya.');
  }

  async function saveGen() {
    if (!gen || !gen.name?.trim() || !gen.year_from) {
      notify('Generation ka naam aur shuru ka saal zaroori hai.');
      return;
    }
    const payload = {
      model_id: id,
      name: gen.name.trim(),
      year_from: gen.year_from,
      year_to: gen.year_to ?? null,
      is_facelift: !!gen.is_facelift,
      seating: gen.seating ?? null,
      notes: gen.notes ?? null,
      sort_order: gen.year_from,
      is_active: gen.is_active == null ? true : !!gen.is_active,
    };
    if (gen.id) await updateRow(db, 'vehicle_generations', gen.id, payload);
    else await insertRow(db, 'vehicle_generations', payload);
    setGen(null);
  }

  async function addAlias() {
    const a = alias.trim();
    if (!a) return;
    await insertRow(db, 'vehicle_model_aliases', { model_id: id, alias: a });
    setAlias('');
  }

  async function removeAlias(a: Alias) {
    if (await confirm('Ye doosra naam hatayein?', `“${a.alias}” will no longer find this model in search.`)) {
      await db.execute('DELETE FROM vehicle_model_aliases WHERE id = ?', [a.id]);
    }
  }

  async function addSocket() {
    const opt = (socketOptions ?? []).find((o) => o.id === sock.option_id);
    if (!sock.generation_id || !opt || !sock.position.trim()) {
      notify('Generation, jagah aur socket chuno.');
      return;
    }
    await insertRow(db, 'vehicle_spec_map', { generation_id: sock.generation_id, spec_definition_id: opt.spec_definition_id, position_label: sock.position.trim(), option_id: opt.id });
    setSock((s) => ({ ...s, option_id: null }));
  }

  if (!model) return <Screen><Text>Loading…</Text></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: `${model.make_name} ${model.name}` }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="display">
            {model.make_name} {model.name}
          </Text>
          <Button title="Is model ka maal" tone="secondary" size="sm" onPress={() => router.push(`/vehicle/${model.id}`)} />
        </Row>

        <FormSection title="Model">
          <SelectField label="Company" value={form.make_id} options={(makes ?? []).map((m) => ({ value: m.id, label: m.name }))} onChange={(v) => v && set('make_id', v)} />
          <Input label="Naam" value={form.name ?? ''} onChangeText={(v) => set('name', v)} editable={editable} />
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="SKU code" value={form.code ?? ''} onChangeText={(v) => set('code', v.toUpperCase())} autoCapitalize="characters" hint="SKU mein aata hai: MAT-ELG-CRETA-7D-BLK" editable={editable} />
            <Input containerStyle={{ flex: 1 }} label="Segment" value={form.segment ?? ''} onChangeText={(v) => set('segment', v)} placeholder="compact SUV" editable={editable} />
          </Row>
          <SelectField label="Body type" value={form.body_type} options={BODY_TYPES.map((b) => ({ value: b, label: b }))} onChange={(v) => set('body_type', v)} allowClear />
          <SwitchRow label="Active" value={!!form.is_active} onChange={(v) => set('is_active', v ? 1 : 0)} />
          {editable ? <Button title={dirty ? 'Save changes' : 'Saved'} onPress={save} disabled={!dirty} /> : null}
        </FormSection>

        <SectionTitle right={editable && !gen ? <Button title="Generation jodo" size="sm" tone="secondary" onPress={() => setGen({ is_facelift: 0, is_active: 1 })} /> : undefined}>
          Generations · {gens?.length ?? 0}
        </SectionTitle>
        {gen ? (
          <FormSection title={gen.id ? 'Edit generation' : 'New generation'} hint="Generation matlab saal ka range. Gaadi abhi bik rahi ho to aakhri saal khaali chhod do.">
            <Input label="Naam" value={gen.name ?? ''} onChangeText={(v) => setGen((g) => ({ ...g, name: v }))} placeholder="2nd Gen 2020-2023 ya Facelift 2024+" />
            <Row gap={12}>
              <NumberField label="Saal se" value={gen.year_from ?? null} onChange={(v) => setGen((g) => ({ ...g, year_from: v ?? undefined }))} decimals={0} />
              <NumberField label="Year to" value={gen.year_to ?? null} onChange={(v) => setGen((g) => ({ ...g, year_to: v }))} decimals={0} placeholder="khaali = abhi tak" />
              <NumberField label="Kitni seat" value={gen.seating ?? null} onChange={(v) => setGen((g) => ({ ...g, seating: v }))} decimals={0} />
            </Row>
            <SwitchRow label="Facelift" hint="Wahi gaadi, thoda naya look — aksar lamp aur grille alag." value={!!gen.is_facelift} onChange={(v) => setGen((g) => ({ ...g, is_facelift: v ? 1 : 0 }))} />
            <Input label="Note" value={gen.notes ?? ''} onChangeText={(v) => setGen((g) => ({ ...g, notes: v }))} />
            <Row gap={8}>
              <Button title="Generation save karo" onPress={saveGen} />
              <Button title="Rehne do" tone="ghost" onPress={() => setGen(null)} />
            </Row>
          </FormSection>
        ) : null}
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(gens ?? []).map((g) => (
            <ListRow
              key={g.id}
              title={
                <Row gap={6}>
                  <Text variant="heading">{g.name}</Text>
                  {g.is_facelift ? <Badge tone="info">facelift</Badge> : null}
                </Row>
              }
              subtitle={`${g.year_from}–${g.year_to ?? 'now'} · ${g.fitments} fitments · ${g.sockets} socket entries`}
              onPress={editable ? () => setGen({ ...g }) : undefined}
              right={editable ? <Text color="accent">Badlo</Text> : undefined}
            />
          ))}
          {(gens ?? []).length === 0 ? (
            <Text variant="small" color="textMuted" style={{ padding: 12 }}>
              No generations yet. Products can still be fitted to the model as a whole.
            </Text>
          ) : null}
        </Card>

        <SectionTitle>Doosre naam jinse dhoondh sakte ho</SectionTitle>
        <Card>
          <Text variant="small" color="textMuted">
            Other spellings staff and customers use: “Wagon R”, “Scorpio-N”, “Grand i10 Nios”.
          </Text>
          <Row gap={6} wrap>
            {(aliases ?? []).map((a) => (
              <Button key={a.id} title={`${a.alias} ×`} tone="secondary" size="sm" onPress={() => removeAlias(a)} disabled={!editable} />
            ))}
          </Row>
          {editable ? (
            <Row gap={8} align="flex-end">
              <Input containerStyle={{ flex: 1 }} value={alias} onChangeText={setAlias} placeholder="Add alias" onSubmitEditing={addAlias} />
              <Button title="Jodo" tone="secondary" onPress={addAlias} disabled={!alias.trim()} />
            </Row>
          ) : null}
        </Card>

        <SectionTitle>Generation ke hisaab se bulb socket</SectionTitle>
        <Card>
          <Text variant="small" color="textMuted">
            “Creta 2024 low beam = H7” lets a vehicle search surface the right universal bulbs. Confirm against the actual car before selling.
          </Text>
          {(socketMap ?? []).map((m) => (
            <Row key={m.id} style={{ justifyContent: 'space-between' }}>
              <Text variant="small">
                {(gens ?? []).find((g) => g.id === m.generation_id)?.name ?? '?'} · {m.position_label}
              </Text>
              <Row gap={8}>
                <Badge tone="info">{m.socket}</Badge>
                {editable ? <Button title="×" tone="ghost" size="sm" onPress={() => db.execute('DELETE FROM vehicle_spec_map WHERE id = ?', [m.id])} /> : null}
              </Row>
            </Row>
          ))}
          {editable && (gens ?? []).length > 0 ? (
            <>
              <SelectField label="Generation" value={sock.generation_id} options={(gens ?? []).map((g) => ({ value: g.id, label: g.name }))} onChange={(v) => setSock((s) => ({ ...s, generation_id: v }))} />
              <Row gap={8} align="flex-end">
                <SelectField
                  label="Jagah"
                  value={sock.position}
                  options={['Low Beam', 'High Beam', 'Fog', 'Parking', 'Indicator', 'Reverse', 'Brake', 'Tail', 'Number Plate', 'DRL'].map((p) => ({ value: p, label: p }))}
                  onChange={(v) => setSock((s) => ({ ...s, position: v ?? 'Low Beam' }))}
                />
                <SelectField label="Socket" value={sock.option_id} options={(socketOptions ?? []).map((o) => ({ value: o.id, label: o.value }))} onChange={(v) => setSock((s) => ({ ...s, option_id: v }))} />
                <Button title="Jodo" tone="secondary" onPress={addSocket} />
              </Row>
            </>
          ) : null}
        </Card>
      </Screen>
    </>
  );
}
