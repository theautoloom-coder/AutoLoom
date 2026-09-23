import { useQuery } from '@powersync/react';
import React, { useState } from 'react';

import { createStaff } from '@/lib/staff';

import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Input, ListRow, Row, Screen, Text } from '@/ui';
import { FormSection, MultiSelectField, SelectField, SwitchRow, notify } from '@/ui/forms';

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
  const { data: heldRoles } = useQuery<{ profile_id: string; role: string }>('SELECT profile_id, role FROM profile_roles');

  /** Every role a person holds, primary included. */
  const rolesOf = (id: string, primary?: Role): Role[] => {
    const set = new Set((heldRoles ?? []).filter((r) => r.profile_id === id).map((r) => r.role as Role));
    if (primary) set.add(primary);
    return [...set];
  };

  /** Would this set of roles still be able to administer users? */
  const keepsAdmin = (rs: Role[]) =>
    (perms ?? []).some((p) => p.permission === 'admin.users' && rs.includes(p.role as Role));
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editRoles, setEditRoles] = useState<Role[]>([]);
  const [showMatrix, setShowMatrix] = useState(false);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const emptyDraft = { full_name: '', email: '', password: '', mobile: '', role: 'sales' as Role, roles: ['sales'] as Role[], default_location_id: null as string | null };
  const [draft, setDraft] = useState(emptyDraft);

  async function addStaff() {
    if (draft.roles.length === 0) { notify('Kam se kam ek role choose karo.'); return; }
    setCreating(true);
    // The Edge Function takes one role — the primary — because that is what
    // profiles.role is. The rest are added here afterwards; the server trigger
    // guarantees the primary is in the set either way.
    const primary = draft.roles[0];
    const err = await createStaff({ ...draft, role: primary });
    setCreating(false);
    if (err) { notify(err); return; }
    const made = await db.getOptional<{ id: string }>(
      'SELECT id FROM profiles WHERE full_name = ? ORDER BY created_at DESC LIMIT 1', [draft.full_name.trim()]);
    if (made?.id) {
      try { await setRoles(made.id, draft.roles); }
      catch (e) { notify(`Staff ban gaya, par baaki roles nahi lage: ${String((e as Error).message ?? e)}`); }
    }
    notify(`${draft.full_name} ban gaya. Login: ${draft.email}`);
    setDraft(emptyDraft);
    setAdding(false);
  }

  /** Make the stored set match exactly, without disturbing what already matches. */
  async function setRoles(profileId: string, next: Role[]) {
    const have = new Set(rolesOf(profileId));
    for (const r of next) {
      // insertRow, not a raw INSERT: it generates the `id` PowerSync keys every
      // uploaded row by. A row written without one stays on the device and the
      // change silently never reaches the server.
      if (!have.has(r)) await insertRow(db, 'profile_roles', { profile_id: profileId, role: r });
    }
    for (const r of have) {
      if (!next.includes(r)) {
        await db.execute('DELETE FROM profile_roles WHERE profile_id = ? AND role = ?', [profileId, r]);
      }
    }
  }

  async function save() {
    if (!editing) return;
    if (editRoles.length === 0) { notify('Kam se kam ek role rakhna padega.'); return; }
    // Locking yourself out is the one mistake this screen can make that nobody
    // else can undo. The old check looked for the literal role 'admin', which
    // stopped being right the moment the owner also got admin.users.
    if (editing.id === me?.id && !keepsAdmin(editRoles)) {
      notify('Apne aap se user-admin ka haq nahi hata sakte — phir koi staff nahi bana payega.');
      return;
    }
    // Say something when it fails. Without this the write threw, the form sat
    // there unchanged, and there was no message, no pending change and no
    // rejected upload to explain why nothing had happened.
    try {
      await updateRow(db, 'profiles', editing.id, {
        full_name: editing.full_name.trim(), mobile: editing.mobile || null,
        role: editRoles[0], default_location_id: editing.default_location_id, is_active: !!editing.is_active,
      });
      await setRoles(editing.id, editRoles);
      setEditing(null);
    } catch (e) {
      notify(`Save nahi hua: ${String((e as Error).message ?? e)}`);
    }
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
          <MultiSelectField
            label="Role"
            hint="Ek se zyada chun sakte ho — jaise counter par bhi baithta hai aur maal bhi receive karta hai."
            values={draft.roles}
            options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], sublabel: ROLE_DESCRIPTIONS[r] }))}
            onChange={(v) => setDraft({ ...draft, roles: v as Role[], role: ((v[0] as Role) ?? 'sales') })}
          />
          <SelectField label="Default location" value={draft.default_location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => setDraft({ ...draft, default_location_id: v })} allowClear />
          <Button title="Staff banao" size="lg" loading={creating} onPress={addStaff} />
        </FormSection>
      ) : null}

      {editing ? (
        <FormSection title={editing.full_name}>
          <Input label="Full name" value={editing.full_name} onChangeText={(v) => setEditing({ ...editing, full_name: v })} />
          <Input label="Mobile" value={editing.mobile ?? ''} onChangeText={(v) => setEditing({ ...editing, mobile: v })} keyboardType="phone-pad" />
          <MultiSelectField
            label="Role"
            hint="Ek se zyada chun sakte ho. Pehla wala list mein dikhega."
            values={editRoles}
            options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], sublabel: ROLE_DESCRIPTIONS[r] }))}
            onChange={(v) => setEditRoles(v as Role[])}
          />
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
                {/* Every role, not just the primary — otherwise the list says
                    "Sales" for someone who also receives stock, and nobody can
                    tell who can do what without opening each person. */}
                {rolesOf(u.id, u.role).map((r) => (
                  <Badge key={r} tone={r === u.role ? 'accent' : 'neutral'}>{ROLE_LABELS[r]}</Badge>
                ))}
                {!u.is_active ? <Badge tone="danger">inactive</Badge> : null}
              </Row>
            }
            subtitle={`${(locations ?? []).find((l) => l.id === u.default_location_id)?.name ?? 'no default location'} · ${u.devices} device${u.devices === 1 ? '' : 's'}${u.last_seen ? ` · seen ${new Date(u.last_seen).toLocaleDateString('en-IN')}` : ''}`}
            onPress={editable ? () => { setEditing({ ...u }); setEditRoles(rolesOf(u.id, u.role)); setAdding(false); } : undefined}
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
