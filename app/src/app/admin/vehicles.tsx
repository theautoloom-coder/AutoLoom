import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';

import { slug } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, SelectField, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type Make = { id: string; name: string; code: string; models: number };
type Model = { id: string; make_id: string; name: string; code: string; body_type: string | null; make_name: string; gens: number; fitments: number; is_active: number };

const BODY_TYPES = ['hatchback', 'sedan', 'suv', 'muv', 'pickup', 'van', 'coupe', 'other'];

export default function VehiclesScreen() {
  const router = useRouter();
  const { db } = useSystem();
  const { can } = useSession();
  const editable = can('catalog.edit');

  const { data: makes } = useQuery<Make>('SELECT m.*, (SELECT COUNT(*) FROM vehicle_models vm WHERE vm.make_id = m.id) AS models FROM vehicle_makes m WHERE m.is_active = 1 ORDER BY m.sort_order, m.name');
  const { data: models } = useQuery<Model>(`
    SELECT vm.*, mk.name AS make_name,
           (SELECT COUNT(*) FROM vehicle_generations g WHERE g.model_id = vm.id) AS gens,
           (SELECT COUNT(*) FROM product_fitments pf WHERE pf.model_id = vm.id) AS fitments
    FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id ORDER BY mk.sort_order, mk.name, vm.name`);

  const [makeFilter, setMakeFilter] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newMake, setNewMake] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newBody, setNewBody] = useState<string | null>('suv');
  const [newMakeName, setNewMakeName] = useState('');

  const visible = useMemo(
    () => (models ?? []).filter((m) => (!makeFilter || m.make_id === makeFilter) && (!q || `${m.make_name} ${m.name}`.toLowerCase().includes(q.toLowerCase()))),
    [models, makeFilter, q]
  );

  async function addMake() {
    const n = newMakeName.trim();
    if (!n) return;
    const id = await insertRow(db, 'vehicle_makes', { name: n, code: slug(n, 4), sort_order: (makes?.length ?? 0) + 1, is_active: true });
    setNewMakeName('');
    setNewMake(id);
  }

  async function addModel() {
    const n = newName.trim();
    if (!newMake || !n) {
      notify('Choose a make and enter the model name.');
      return;
    }
    if ((models ?? []).some((m) => m.make_id === newMake && m.name.toLowerCase() === n.toLowerCase())) {
      notify('That model already exists for this make.');
      return;
    }
    const id = await insertRow(db, 'vehicle_models', { make_id: newMake, name: n, code: slug(n, 10), body_type: newBody, search_text: n.toLowerCase(), is_active: true });
    setNewName('');
    setAdding(false);
    router.push(`/admin/vehicle/${id}`);
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Vehicle master</Text>
        {editable && !adding ? <Button title="Add model" onPress={() => setAdding(true)} /> : null}
      </Row>

      {adding ? (
        <FormSection title="New model" hint="Generations (year ranges, facelifts) and aliases are added on the model page.">
          <SelectField
            label="Make"
            value={newMake}
            options={(makes ?? []).map((m) => ({ value: m.id, label: m.name }))}
            onChange={setNewMake}
            onCreate={async (text) => {
              setNewMakeName(text);
              const id = await insertRow(db, 'vehicle_makes', { name: text, code: slug(text, 4), sort_order: (makes?.length ?? 0) + 1, is_active: true });
              setNewMake(id);
            }}
          />
          <Input label="Model name" value={newName} onChangeText={setNewName} placeholder="Creta" />
          <SelectField label="Body type" value={newBody} options={BODY_TYPES.map((b) => ({ value: b, label: b }))} onChange={setNewBody} />
          <Row gap={8}>
            <Button title="Create model" onPress={addModel} />
            <Button title="Cancel" tone="ghost" onPress={() => setAdding(false)} />
          </Row>
        </FormSection>
      ) : null}

      <Input value={q} onChangeText={setQ} placeholder="Find a model" autoCapitalize="none" />
      <Row gap={space.xs} wrap>
        <Chip label={`All · ${models?.length ?? 0}`} selected={!makeFilter} onPress={() => setMakeFilter(null)} />
        {(makes ?? []).map((m) => (
          <Chip key={m.id} label={`${m.name} · ${m.models}`} selected={makeFilter === m.id} onPress={() => setMakeFilter(makeFilter === m.id ? null : m.id)} />
        ))}
      </Row>

      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {visible.map((m) => (
          <ListRow
            key={m.id}
            title={
              <Row gap={6}>
                <Text variant="heading">
                  {m.make_name} {m.name}
                </Text>
                {!m.is_active ? <Badge tone="danger">inactive</Badge> : null}
              </Row>
            }
            subtitle={`${m.code} · ${m.body_type ?? '—'} · ${m.gens} generation${m.gens === 1 ? '' : 's'} · ${m.fitments} fitment${m.fitments === 1 ? '' : 's'}`}
            onPress={() => router.push(`/admin/vehicle/${m.id}`)}
           
          />
        ))}
      </Card>

      {editable ? (
        <>
          <SectionTitle>Makes</SectionTitle>
          <Row gap={8} align="flex-end">
            <Input containerStyle={{ flex: 1 }} value={newMakeName} onChangeText={setNewMakeName} placeholder="New make, e.g. BYD" onSubmitEditing={addMake} />
            <Button title="Add make" tone="secondary" onPress={addMake} disabled={!newMakeName.trim()} />
          </Row>
        </>
      ) : null}
    </Screen>
  );
}
