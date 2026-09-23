import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { isValidGstin, stateCodeFromGstin } from '@domain';

import { INDIAN_STATES } from '@/lib/states';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, nextCode, updateRow } from '@/lib/writes';
import { Button, Input, Row, Screen, Text } from '@/ui';
import { FormSection, NumberField, SelectField, SwitchRow, confirm, notify } from '@/ui/forms';

type Supplier = {
  id: string; code: string; name: string; company_name: string | null; contact_person: string | null; mobile: string | null; alt_phone: string | null; email: string | null;
  gstin: string | null; pan: string | null; address_line1: string | null; address_line2: string | null; city: string | null; state_code: string | null; state_name: string | null;
  pincode: string | null; payment_terms_days: number; opening_balance: number; opening_balance_date: string | null; notes: string | null; is_active: number;
};

export default function SupplierEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const { data: rows } = useQuery<Supplier>('SELECT * FROM suppliers WHERE id = ?', [id ?? '']);
  const existing = rows?.[0];
  const { data: company } = useQuery<{ state_code: string; state_name: string }>('SELECT state_code, state_name FROM company_settings LIMIT 1');

  const [form, setForm] = useState<Partial<Supplier>>({ payment_terms_days: 30, opening_balance: 0, is_active: 1 });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (existing && !dirty) setForm(existing); }, [existing, dirty]);
  useEffect(() => {
    if (isNew && company?.[0] && !form.state_code) setForm((f) => ({ ...f, state_code: company[0].state_code, state_name: company[0].state_name }));
  }, [isNew, company, form.state_code]);
  const set = <K extends keyof Supplier>(k: K, v: Supplier[K]) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  function onGstin(v: string) {
    const g = v.toUpperCase().trim();
    set('gstin', g);
    const sc = stateCodeFromGstin(g);
    if (sc) { const st = INDIAN_STATES.find((s) => s.code === sc); if (st) setForm((f) => ({ ...f, state_code: st.code, state_name: st.name })); }
    if (g.length === 15) setForm((f) => ({ ...f, pan: g.slice(2, 12) }));
  }

  async function save() {
    if (!form.name?.trim()) { notify('Supplier name is required.'); return; }
    if (form.gstin && !isValidGstin(form.gstin)) { notify('GSTIN does not look valid.'); return; }

    // Same trap as customers: one number, two suppliers, two half-ledgers.
    const digits = form.mobile?.replace(/\D/g, '') ?? '';
    if (digits && !id) {
      const clash = await db.getAll<{ name: string; code: string }>(
        'SELECT name, code FROM suppliers WHERE mobile = ? AND is_active = 1 LIMIT 3', [digits]);
      if (clash.length) {
        const who = clash.map((c) => `${c.name} (${c.code})`).join(', ');
        if (!(await confirm('Ye number pehle se hai', `${digits} par already hai: ${who}.

Phir bhi naya supplier banayein?`))) return;
      }
    }

    setSaving(true);
    try {
      let code = form.code?.trim();
      if (!code) { const max = await db.getOptional<{ m: string }>("SELECT MAX(code) AS m FROM suppliers WHERE code LIKE 'S%'"); code = nextCode('S', max?.m); }
      const payload = {
        code, name: form.name.trim(), company_name: form.company_name?.trim() || null, contact_person: form.contact_person || null, mobile: form.mobile?.replace(/\D/g, '') || null,
        alt_phone: form.alt_phone || null, email: form.email || null, gstin: form.gstin || null, pan: form.pan || null, address_line1: form.address_line1 || null, address_line2: form.address_line2 || null,
        city: form.city || null, state_code: form.state_code || null, state_name: form.state_name || null, pincode: form.pincode || null, payment_terms_days: form.payment_terms_days ?? 0,
        opening_balance: form.opening_balance ?? 0, opening_balance_date: form.opening_balance_date || null, notes: form.notes || null, is_active: !!form.is_active,
        search_text: [form.name, form.company_name, code, form.mobile, form.gstin, form.city].filter(Boolean).join(' ').toLowerCase(),
      };
      let sid = id ?? '';
      await db.writeTransaction(async (tx) => {
        if (isNew) {
          sid = await insertRow(tx, 'suppliers', payload, actor);
          const amt = form.opening_balance ?? 0;
          if (amt !== 0) await insertRow(tx, 'ledger_entries', { party_type: 'supplier', party_id: sid, entry_date: form.opening_balance_date || new Date().toISOString().slice(0, 10), doc_type: 'opening', debit: amt < 0 ? -amt : 0, credit: amt > 0 ? amt : 0, narration: 'Opening balance' }, actor);
        } else await updateRow(tx, 'suppliers', sid, payload);
      });
      setDirty(false);
      router.replace(`/supplier/${sid}`);
    } catch (e) { notify(`Could not save: ${(e as Error).message}`); } finally { setSaving(false); }
  }

  if (!can('party.edit')) return <Screen><Text>You do not have permission to edit suppliers.</Text></Screen>;
  if (!isNew && !existing) return <Screen><Text>Loading…</Text></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New supplier' : existing?.name }} />
      <Screen>
        <Text variant="display">{isNew ? 'New supplier' : existing?.name}</Text>
        <FormSection title="Identity">
          <Input label="Name" value={form.name ?? ''} onChangeText={(v) => set('name', v)} placeholder="Bright Auto Imports" />
          <Input label="Company name" value={form.company_name ?? ''} onChangeText={(v) => set('company_name', v)} />
          <Input label="Contact person" value={form.contact_person ?? ''} onChangeText={(v) => set('contact_person', v)} />
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="Mobile" value={form.mobile ?? ''} onChangeText={(v) => set('mobile', v)} keyboardType="phone-pad" />
            <Input containerStyle={{ flex: 1 }} label="Alt phone" value={form.alt_phone ?? ''} onChangeText={(v) => set('alt_phone', v)} keyboardType="phone-pad" />
          </Row>
          <Input label="Email" value={form.email ?? ''} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />
        </FormSection>
        <FormSection title="GST & address">
          <Input label="GSTIN" value={form.gstin ?? ''} onChangeText={onGstin} autoCapitalize="characters" error={form.gstin && !isValidGstin(form.gstin) ? 'Not a valid GSTIN format' : null} />
          <Input label="PAN" value={form.pan ?? ''} onChangeText={(v) => set('pan', v.toUpperCase())} autoCapitalize="characters" />
          <Input label="Address line 1" value={form.address_line1 ?? ''} onChangeText={(v) => set('address_line1', v)} />
          <Input label="Address line 2" value={form.address_line2 ?? ''} onChangeText={(v) => set('address_line2', v)} />
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="City" value={form.city ?? ''} onChangeText={(v) => set('city', v)} />
            <Input containerStyle={{ flex: 1 }} label="PIN code" value={form.pincode ?? ''} onChangeText={(v) => set('pincode', v)} keyboardType="number-pad" />
          </Row>
          <SelectField label="State" value={form.state_code} options={INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} onChange={(v) => { set('state_code', v); set('state_name', INDIAN_STATES.find((s) => s.code === v)?.name ?? null); }} />
        </FormSection>
        <FormSection title="Terms">
          <NumberField label="Payment terms (days)" value={form.payment_terms_days ?? 0} onChange={(v) => set('payment_terms_days', v ?? 0)} decimals={0} />
          {isNew ? (
            <Row gap={12}>
              <View style={{ flex: 1 }}><NumberField label="Opening balance (₹)" value={form.opening_balance ?? 0} onChange={(v) => set('opening_balance', v ?? 0)} hint="Positive = you owe them." /></View>
              <Input containerStyle={{ flex: 1 }} label="As of (YYYY-MM-DD)" value={form.opening_balance_date ?? ''} onChangeText={(v) => set('opening_balance_date', v)} />
            </Row>
          ) : null}
          <Input label="Notes" value={form.notes ?? ''} onChangeText={(v) => set('notes', v)} multiline />
          {!isNew ? <SwitchRow label="Active" value={!!form.is_active} onChange={(v) => set('is_active', v ? 1 : 0)} /> : null}
        </FormSection>
        <Button title={isNew ? 'Create supplier' : dirty ? 'Save changes' : 'Saved'} onPress={save} loading={saving} disabled={!isNew && !dirty} />
      </Screen>
    </>
  );
}
