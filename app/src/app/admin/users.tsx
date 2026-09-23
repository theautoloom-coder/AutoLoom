import { useQuery } from '@powersync/react';
import React, { useState } from 'react';

import { createStaff } from '@/lib/staff';

import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { updateRow } from '@/lib/writes';
import { Badge, Button, Card, Input, ListRow, Row, Screen, Text } from '@/ui';
import { FormSection, SelectField, SwitchRow, notify } from '@/ui/forms';

type Profile = { id: string; full_name: string; mobile: string | null; role: Role; default_location_id: string | null; is_active: number; devices: number; last_seen: string | null };

export default function UsersScreen() {
  const { db } = useSystem();
  const { can, profile: me } = useSession();
  const editable = can('admin.users');
  const { data: users } = useQuery<Profile>(`
    SELECT p.*, (SELECT COUNT(*) FROM devices d WHERE d.user_id = p.id AND d.is_active = 1) AS devices,
           (SELECT MAX(last_seen_at) FROM devices d WHERE d.user_id = p.id) AS last_seen
    FROM profiles p ORDER BY p.is_active DESC, p.full_name`);
  const { data: locations } = useQuery<{ id: string; name: string }>('SELECT id, name FROM locations WHERE is_active = 1 ORDER BY sort_order');
  const { data: perms } = useQuery<{ role: string; permission: string }>('SELECT role, permission FROM role_permissions ORDER BY permission');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const emptyDraft = { full_name: '', email: '', password: '', mobile: '', role: 'sales' as Role, default_location_id: null as string | null };
  const [draft, setDraft] = useState(emptyDraft);

  async function addStaff() {
    setCreating(true);
    const err = await createStaff(draft);
    setCreating(false);
    if (err) { notify(err); return; }
    notify(`${draft.full_name} ban gaya. Login: ${draft.email}`);
    setDraft(emptyDraft);
    setAdding(false);
  }

  async function save() {
    if (!editing) return;
    if (editing.id === me?.id && editing.role !== 'admin') {
      notify('You cannot remove your own admin role.');
      return;
    }
    await updateRow(db, 'profiles', editing.id, { full_name: editing.full_name.trim(), mobile: editing.mobile || null, role: editing.role, default_location_id: editing.default_location_id, is_active: !!editing.is_active });
    setEditing(null);
  }

  async function togglePermission(role: string, permission: string, on: boolean) {
    if (on) await db.execute('DELETE FROM role_permissions WHERE role = ? AND permission = ?', [role, permission]);
    else await db.execute('INSERT INTO role_permissions (id, role, permission, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), role, permission, new Date().toISOString(), new Date().toISOString()]);
  }

  const allPerms = [...new Set((perms ?? []).map((p) => p.permission))].sort();

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }} align="flex-start">
        <Text variant="display">Staff</Text>
        {editable ? (
          <Button title={adding ? 'Band karo' : '+ Naya staff'} tone={adding ? 'secondary' : 'primary'} onPress={() => { setAdding(!adding); setEditing(null); }} />
        ) : null}
      </Row>

      {adding ? (
        <FormSection title="Naya staff" hint="Login yahin ban jaayega — Supabase dashboard kholne ki zaroorat nahi.">
          <Input label="Naam" value={draft.full_name} onChangeText={(v) => setDraft({ ...draft, full_name: v })} placeholder="Ramesh Kumar" />
          <Input label="Email" value={draft.email} onChangeText={(v) => setDraft({ ...draft, email: v })} autoCapitalize="none" keyboardType="email-address" placeholder="ramesh@shop.in" />
          <Input label="Password" value={draft.password} onChangeText={(v) => setDraft({ ...draft, password: v })} hint="Kam se kam 8 character. Staff ko bata dena." />
          <Input label="Mobile" value={draft.mobile} onChangeText={(v) => setDraft({ ...draft, mobile: v })} keyboardType="phone-pad" />
          <SelectField label="Role" value={draft.role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], sublabel: ROLE_DESCRIPTIONS[r] }))} onChange={(v) => setDraft({ ...draft, role: (v as Role) ?? 'sales' })} />
          <SelectField label="Default location" value={draft.default_location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => setDraft({ ...draft, default_location_id: v })} allowClear />
          <Button title="Staff banao" size="lg" loading={creating} onPress={addStaff} />
        </FormSection>
      ) : null}

      {editing ? (
        <FormSection title={editing.full_name}>
          <Input label="Full name" value={editing.full_name} onChangeText={(v) => setEditing({ ...editing, full_name: v })} />
          <Input label="Mobile" value={editing.mobile ?? ''} onChangeText={(v) => setEditing({ ...editing, mobile: v })} keyboardType="phone-pad" />
          <SelectField label="Role" value={editing.role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], sublabel: ROLE_DESCRIPTIONS[r] }))} onChange={(v) => setEditing({ ...editing, role: (v as Role) ?? 'sales' })} />
          <SelectField label="Default location" value={editing.default_location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => setEditing({ ...editing, default_location_id: v })} allowClear />
          <SwitchRow label="Active" hint="Inactive users cannot read or write anything, on any device." value={!!editing.is_active} onChange={(v) => setEditing({ ...editing, is_active: v ? 1 : 0 })} />
          <Row gap={8}>
            <Button title="Save" onPress={save} />
            <Button title="Cancel" tone="ghost" onPress={() => setEditing(null)} />
          </Row>
        </FormSection>
      ) : null}

      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {(users ?? []).map((u) => (
          <ListRow
            key={u.id}
            title={
              <Row gap={6}>
                <Text variant="heading" color={u.is_active ? 'text' : 'textFaint'}>{u.full_name}</Text>
                <Badge tone="accent">{ROLE_LABELS[u.role]}</Badge>
                {!u.is_active ? <Badge tone="danger">inactive</Badge> : null}
              </Row>
            }
            subtitle={`${(locations ?? []).find((l) => l.id === u.default_location_id)?.name ?? 'no default location'} · ${u.devices} device${u.devices === 1 ? '' : 's'}${u.last_seen ? ` · seen ${new Date(u.last_seen).toLocaleDateString('en-IN')}` : ''}`}
            onPress={editable ? () => setEditing({ ...u }) : undefined}
            right={editable ? <Text color="accent">Edit</Text> : undefined}
          />
        ))}
      </Card>

      <Button title={showMatrix ? 'Hide permission matrix' : 'Show permission matrix'} tone="secondary" onPress={() => setShowMatrix((v) => !v)} />
      {showMatrix ? (
        <Card style={{ gap: 0 }}>
          <Row gap={4} style={{ paddingVertical: 6 }}>
            <Text variant="label" color="textMuted" style={{ flex: 2 }}>Permission</Text>
            {ROLES.map((r) => (
              <Text key={r} variant="label" color="textMuted" style={{ width: 44, textAlign: 'center' }}>{r.slice(0, 4)}</Text>
            ))}
          </Row>
          {allPerms.map((p) => (
            <Row key={p} gap={4} style={{ paddingVertical: 4 }}>
              <Text variant="small" mono style={{ flex: 2 }}>{p}</Text>
              {ROLES.map((r) => {
                const on = (perms ?? []).some((x) => x.role === r && x.permission === p);
                return (
                  <Text key={r} variant="small" style={{ width: 44, textAlign: 'center' }} color={on ? 'ok' : 'textFaint'} onPress={editable && r !== 'admin' ? () => togglePermission(r, p, on) : undefined}>
                    {on ? '✓' : '·'}
                  </Text>
                );
              })}
            </Row>
          ))}
          <Text variant="small" color="textFaint" style={{ marginTop: 8 }}>
            Tap a cell to toggle. Admin permissions are fixed. Changes apply server-side too: row level security reads this same table.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
