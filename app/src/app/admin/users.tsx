import { useQuery } from '@powersync/react';
import React, { useState } from 'react';

import { createStaff, resetStaffPassword } from '@/lib/staff';

import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Divider, Input, ListRow, Row, Screen, Text } from '@/ui';
import { FormSection, SelectField, SwitchRow, notify } from '@/ui/forms';

type Profile = { id: string; full_name: string; mobile: string | null; role: string; default_location_id: string | null; is_active: number; devices: number; last_seen: string | null };

export default function UsersScreen() {
  const { db } = useSystem();
  const { can, profile: me } = useSession();
  const editable = can('admin.users');
  const { data: users } = useQuery<Profile>(`
    SELECT p.*, (SELECT COUNT(*) FROM devices d WHERE d.user_id = p.id AND d.is_active = 1) AS devices,
           (SELECT MAX(last_seen_at) FROM devices d WHERE d.user_id = p.id) AS last_seen
    FROM profiles p ORDER BY p.is_active DESC, p.full_name`);
  const { data: perms } = useQuery<{ role: string; permission: string }>('SELECT role, permission FROM role_permissions ORDER BY permission');
  const { data: heldRoles } = useQuery<{ profile_id: string; role: string }>('SELECT profile_id, role FROM profile_roles');

  /** Every live role a person holds, primary included. Retired roles
   *  (Counter, Godown…) still sit in old rows but grant nothing. */
  const rolesOf = (id: string, primary?: string): Role[] => {
    const set = new Set((heldRoles ?? []).filter((r) => r.profile_id === id).map((r) => r.role));
    if (primary) set.add(primary);
    return [...set].filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  };

  /** Would this set of roles still be able to administer users? */
  const keepsAdmin = (rs: Role[]) =>
    (perms ?? []).some((p) => p.permission === 'admin.users' && rs.includes(p.role as Role));
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editRoles, setEditRoles] = useState<Role[]>([]);
  const [showMatrix, setShowMatrix] = useState(false);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [resetting, setResetting] = useState(false);
  const emptyDraft = { full_name: '', email: '', password: '', mobile: '', role: 'staff' as Role, roles: ['staff'] as Role[], default_location_id: null as string | null };
  const [draft, setDraft] = useState(emptyDraft);

  async function addStaff() {
    if (draft.roles.length === 0) { notify('Role chuno.'); return; }
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
      catch (e) { notify(`Staff ban gaya, par baaki roles nahi lage: ${String((e as Error).message ?? e)}`, 'ok'); }
    }
    notify(`${draft.full_name} ban gaya. Login: ${draft.email}`, 'ok');
    setDraft(emptyDraft);
    setAdding(false);
  }

  /** Make the stored set match exactly, without disturbing what already matches. */
  async function setRoles(profileId: string, next: Role[]) {
    const have = new Set((heldRoles ?? []).filter((r) => r.profile_id === profileId).map((r) => r.role));
    for (const r of next) {
      // insertRow, not a raw INSERT: it generates the `id` PowerSync keys every
      // uploaded row by. A row written without one stays on the device and the
      // change silently never reaches the server.
      if (!have.has(r)) await insertRow(db, 'profile_roles', { profile_id: profileId, role: r });
    }
    for (const r of have) {
      if (!(next as string[]).includes(r)) {
        await db.execute('DELETE FROM profile_roles WHERE profile_id = ? AND role = ?', [profileId, r]);
      }
    }
  }

  async function resetPassword() {
    if (!editing) return;
    setResetting(true);
    const err = await resetStaffPassword(editing.id, newPw);
    setResetting(false);
    if (err) { notify(err); return; }
    // Deliberately shown, not hidden: the owner has to read it out to the
    // person standing in front of them. They have no inbox to receive it.
    notify(`${editing.full_name} ka naya password: ${newPw} — unhe bata do.`);
    setNewPw('');
  }

  async function save() {
    if (!editing) return;
    if (editRoles.length === 0) { notify('Role chuno.'); return; }
    // Locking yourself out is the one mistake this screen can make that nobody
    // else can undo. The old check looked for the literal role 'admin', which
    // stopped being right the moment the owner also got admin.users.
    if (editing.id === me?.id && !keepsAdmin(editRoles)) {
      notify('Apne aap se user-admin ka haq nahi hata sakte — phir koi staff nahi bana payega.', 'danger');
      return;
    }
    // Say something when it fails. Without this the write threw, the form sat
    // there unchanged, and there was no message, no pending change and no
    // rejected upload to explain why nothing had happened.
    try {
      await updateRow(db, 'profiles', editing.id, {
        full_name: editing.full_name.trim(), mobile: editing.mobile || null,
        role: editRoles[0], is_active: !!editing.is_active,
      });
      await setRoles(editing.id, editRoles);
      setEditing(null);
    } catch (e) {
      notify(`Save nahi hua: ${String((e as Error).message ?? e)}`, 'danger');
    }
  }

  async function togglePermission(role: string, permission: string, on: boolean) {
    if (on) await db.execute('DELETE FROM role_permissions WHERE role = ? AND permission = ?', [role, permission]);
    else await db.execute('INSERT INTO role_permissions (id, role, permission, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), role, permission, new Date().toISOString(), new Date().toISOString()]);
  }

  const allPerms = [...new Set((perms ?? []).map((p) => p.permission))].sort();

  if (!editable) {
    return <Screen><Text variant="display">Staff</Text><Text color="textMuted">Ye sirf partner aur admin dekh sakte hain.</Text></Screen>;
  }

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
          <SelectField
            label="Role"
            value={draft.role}
            options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], sublabel: ROLE_DESCRIPTIONS[r] }))}
            onChange={(v) => v && setDraft({ ...draft, roles: [v as Role], role: v as Role })}
          />
          <Button title="Staff banao" size="lg" loading={creating} onPress={addStaff} />
        </FormSection>
      ) : null}

      {editing ? (
        <FormSection title={editing.full_name}>
          <Input label="Poora naam" value={editing.full_name} onChangeText={(v) => setEditing({ ...editing, full_name: v })} />
          <Input label="Mobile" value={editing.mobile ?? ''} onChangeText={(v) => setEditing({ ...editing, mobile: v })} keyboardType="phone-pad" />
          <SelectField
            label="Role"
            value={editRoles[0] ?? null}
            options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], sublabel: ROLE_DESCRIPTIONS[r] }))}
            onChange={(v) => v && setEditRoles([v as Role])}
          />
          <SwitchRow label="Active" hint="Inactive aadmi kisi bhi phone par kuch na dekh sakta hai, na likh sakta hai." value={!!editing.is_active} onChange={(v) => setEditing({ ...editing, is_active: v ? 1 : 0 })} />

          {/* Password bhool jaana roz hota hai, aur staff ke email ka koi inbox
              nahi hota — reset link kahin nahi jaata. Isliye owner naya
              password khud set karta hai aur unhe bata deta hai. */}
          <Divider />
          <Text variant="label" color="textMuted">Password bhool gaye?</Text>
          <Row gap={8} align="flex-end">
            <Input
              containerStyle={{ flex: 1 }}
              label="Naya password"
              value={newPw}
              onChangeText={setNewPw}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Kam se kam 8 character"
              hint="Set karke unhe bata do — email par kuch nahi jayega."
            />
            <Button title="Badlo" tone="secondary" onPress={resetPassword} loading={resetting} disabled={newPw.length < 8} />
          </Row>
          <Divider />

          <Row gap={8}>
            <Button title="Save karo" onPress={save} />
            <Button title="Rehne do" tone="ghost" onPress={() => setEditing(null)} />
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
                {rolesOf(u.id, u.role).map((r) => (
                  <Badge key={r} tone={r === u.role ? 'accent' : 'neutral'}>{ROLE_LABELS[r]}</Badge>
                ))}
                {!u.is_active ? <Badge tone="danger">inactive</Badge> : null}
              </Row>
            }
            subtitle={`${u.devices} phone${u.devices === 1 ? '' : 's'}${u.last_seen ? ` · aakhri baar ${new Date(u.last_seen).toLocaleDateString('en-IN')}` : ''}`}
            onPress={editable ? () => { setEditing({ ...u }); setEditRoles(rolesOf(u.id, u.role).slice(0, 1)); setAdding(false); } : undefined}
            right={editable ? <Text color="accent">Badlo</Text> : undefined}
          />
        ))}
      </Card>

      <Button title={showMatrix ? 'Kaun kya kar sakta hai — chhupao' : 'Kaun kya kar sakta hai — dekho'} tone="secondary" onPress={() => setShowMatrix((v) => !v)} />
      {showMatrix ? (
        <Card style={{ gap: 0 }}>
          <Row gap={4} style={{ paddingVertical: 6 }}>
            <Text variant="label" color="textMuted" style={{ flex: 2 }}>Permission</Text>
            {ROLES.map((r) => (
              <Text key={r} variant="label" color="textMuted" style={{ width: 56, textAlign: 'center' }}>{ROLE_LABELS[r]}</Text>
            ))}
          </Row>
          {allPerms.map((p) => (
            <Row key={p} gap={4} style={{ paddingVertical: 4 }}>
              <Text variant="small" mono style={{ flex: 2 }}>{p}</Text>
              {ROLES.map((r) => {
                const on = (perms ?? []).some((x) => x.role === r && x.permission === p);
                return (
                  <Text key={r} variant="small" style={{ width: 56, textAlign: 'center' }} color={on ? 'ok' : 'textFaint'} onPress={editable && r !== 'admin' ? () => togglePermission(r, p, on) : undefined}>
                    {on ? '✓' : '·'}
                  </Text>
                );
              })}
            </Row>
          ))}
          <Text variant="small" color="textFaint" style={{ marginTop: 8 }}>
            Kisi khaane par tap karke on/off karo. Admin ki permission fixed hai. Badlav server par bhi lagta hai — security isi list ko padhti hai.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
