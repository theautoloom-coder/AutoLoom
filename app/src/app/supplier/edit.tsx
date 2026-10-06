import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

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

  // Refs above the early returns, with the other hooks. Unlike the customer
  // form this one opens on a text field rather than a picker, so a new supplier
  // gets the cursor put in the name for it.
  const nameRef = useRef<TextInput>(null);
  const firmRef = useRef<TextInput>(null);
  const contactRef = useRef<TextInput>(null);
  const mobileRef = useRef<TextInput>(null);
  const altRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const gstinRef = useRef<TextInput>(null);
  const panRef = useRef<TextInput>(null);
  const addr1Ref = useRef<TextInput>(null);
  const addr2Ref = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const pinRef = useRef<TextInput>(null);

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
    if (!form.name?.trim()) { notify('Supplier ka naam likho.'); return; }
    if (form.gstin && !isValidGstin(form.gstin)) { notify('GSTIN theek nahi lag raha. 15 character hone chahiye, jaise 09ABCDE1234F1Z5.'); return; }

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
      // An edit goes back to the page it came from; replacing would stack a
      // second copy of that page and make the next "Peeche" look dead.
      if (!isNew && router.canGoBack()) router.back();
      else router.replace(`/supplier/${sid}`);
    } catch (e) { notify(`Save nahi hua: ${(e as Error).message}. Dobara koshish karo.`); } finally { setSaving(false); }
  }

  if (!can('party.edit')) return <Screen><Text>Aapko supplier badalne ki permission nahi hai.</Text></Screen>;
  if (!isNew && !existing) return <Screen><Text>Khul raha hai…</Text></Screen>;

  const canSave = !!form.name?.trim() && (isNew || dirty);

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'Naya supplier' : existing?.name }} />
      <Screen>
        <Text variant="display">{isNew ? 'Naya supplier' : existing?.name}</Text>
        <FormSection title="Pehchaan">
          <Input
            ref={nameRef}
            label="Naam"
            value={form.name ?? ''}
            onChangeText={(v) => set('name', v)}
            placeholder="Bright Auto Imports"
            autoFocus={isNew}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => firmRef.current?.focus()}
            submitBehavior="submit"
          />
          <Input
            ref={firmRef}
            label="Firm ka naam"
            value={form.company_name ?? ''}
            onChangeText={(v) => set('company_name', v)}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => contactRef.current?.focus()}
            submitBehavior="submit"
          />
          <Input
            ref={contactRef}
            label="Jisse baat hoti hai"
            value={form.contact_person ?? ''}
            onChangeText={(v) => set('contact_person', v)}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => mobileRef.current?.focus()}
            submitBehavior="submit"
          />
          <Row gap={12}>
            <Input
              ref={mobileRef}
              containerStyle={{ flex: 1 }}
              label="Mobile"
              value={form.mobile ?? ''}
              onChangeText={(v) => set('mobile', v)}
              // On the field, not only in a 2-second toast: by the time Save is
              // pressed this field is scrolled far out of sight.
              error={form.mobile && !/^\d{10}$/.test(form.mobile.replace(/\D/g, '')) ? '10 ank ka mobile likho' : null}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="next"
              onSubmitEditing={() => altRef.current?.focus()}
              submitBehavior="submit"
            />
            <Input
              ref={altRef}
              containerStyle={{ flex: 1 }}
              label="Doosra number"
              value={form.alt_phone ?? ''}
              onChangeText={(v) => set('alt_phone', v)}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              submitBehavior="submit"
            />
          </Row>
          <Input
            ref={emailRef}
            label="Email"
            value={form.email ?? ''}
            onChangeText={(v) => set('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => gstinRef.current?.focus()}
            submitBehavior="submit"
          />
        </FormSection>
        <FormSection title="GST aur pata">
          {/* Autocorrect on a GSTIN or a PAN is silent and permanent. */}
          <Input
            ref={gstinRef}
            label="GSTIN"
            value={form.gstin ?? ''}
            onChangeText={onGstin}
            autoCapitalize="characters"
            autoCorrect={false}
            error={form.gstin && !isValidGstin(form.gstin) ? 'GSTIN poora nahi lag raha — 15 character hone chahiye, jaise 09ABCDE1234F1Z5.' : null}
            returnKeyType="next"
            onSubmitEditing={() => panRef.current?.focus()}
            submitBehavior="submit"
          />
          <Input
            ref={panRef}
            label="PAN"
            value={form.pan ?? ''}
            onChangeText={(v) => set('pan', v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => addr1Ref.current?.focus()}
            submitBehavior="submit"
          />
          <Input
            ref={addr1Ref}
            label="Pata line 1"
            value={form.address_line1 ?? ''}
            onChangeText={(v) => set('address_line1', v)}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => addr2Ref.current?.focus()}
            submitBehavior="submit"
          />
          <Input
            ref={addr2Ref}
            label="Pata line 2"
            value={form.address_line2 ?? ''}
            onChangeText={(v) => set('address_line2', v)}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => cityRef.current?.focus()}
            submitBehavior="submit"
          />
          <Row gap={12}>
            <Input
              ref={cityRef}
              containerStyle={{ flex: 1 }}
              label="Shehar"
              value={form.city ?? ''}
              onChangeText={(v) => set('city', v)}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => pinRef.current?.focus()}
              submitBehavior="submit"
            />
            <Input
              ref={pinRef}
              containerStyle={{ flex: 1 }}
              label="PIN code"
              value={form.pincode ?? ''}
              onChangeText={(v) => set('pincode', v)}
              keyboardType="number-pad"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => { if (canSave && !saving) save(); }}
            />
          </Row>
          <SelectField label="Kaunsa state" value={form.state_code} options={INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} onChange={(v) => { set('state_code', v); set('state_name', INDIAN_STATES.find((s) => s.code === v)?.name ?? null); }} />
        </FormSection>
        <FormSection title="Shartein">
          <NumberField label="Kitne din mein paisa dena hai" value={form.payment_terms_days ?? 0} onChange={(v) => set('payment_terms_days', v ?? 0)} decimals={0} />
          {isNew ? (
            <Row gap={12}>
              <View style={{ flex: 1 }}><NumberField label="Purana balance (₹)" value={form.opening_balance ?? 0} onChange={(v) => set('opening_balance', v ?? 0)} hint="Plus matlab aapko unhe dena hai." /></View>
              {/* Deliberately NOT defaulted to today: this is the date the old
                  register was closed off at, not the date of typing, and it is
                  only written when the balance is non-zero. */}
              <Input
                containerStyle={{ flex: 1 }}
                label="Kis din tak ka (YYYY-MM-DD)"
                value={form.opening_balance_date ?? ''}
                onChangeText={(v) => set('opening_balance_date', v)}
                placeholder="2026-04-01"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
            </Row>
          ) : null}
          <Input label="Note" value={form.notes ?? ''} onChangeText={(v) => set('notes', v)} placeholder="Kuch yaad rakhne wali baat" multiline />
          {!isNew ? <SwitchRow label="Chalu hai" hint="Band kar doge to naye purchase mein ye naam nahi aayega. Purana khata waise ka waisa rahega." value={!!form.is_active} onChange={(v) => set('is_active', v ? 1 : 0)} /> : null}
        </FormSection>
        {/* Waits for the one thing save() insists on, instead of being live
            and then refusing with a toast. */}
        <Button title={isNew ? 'Supplier bana do' : dirty ? 'Save karo' : 'Save ho gaya'} onPress={save} loading={saving} disabled={!canSave} />
      </Screen>
    </>
  );
}
