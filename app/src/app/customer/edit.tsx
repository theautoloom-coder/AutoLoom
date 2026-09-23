import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { isValidGstin, stateCodeFromGstin, normaliseRegistration } from '@domain';

import { INDIAN_STATES } from '@/lib/states';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow, nextCode, updateRow } from '@/lib/writes';
import { Button, Card, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, NumberField, SelectField, SwitchRow, confirm, notify } from '@/ui/forms';

type Customer = {
  id: string; code: string; name: string; business_name: string | null; owner_name: string | null; mobile: string | null; alt_phone: string | null; email: string | null;
  gstin: string | null; pan: string | null; address_line1: string | null; address_line2: string | null; city: string | null; state_code: string | null; state_name: string | null;
  pincode: string | null; customer_type: string; price_list_id: string | null; credit_limit: number; credit_days: number; opening_balance: number; opening_balance_date: string | null;
  notes: string | null; is_active: number;
};
type Vehicle = { id: string; registration_no: string; model_id: string | null; generation_id: string | null; color: string | null; model_name: string | null; make_name: string | null };

const TYPES = [
  { value: 'dealer', label: 'Dealer', sublabel: 'Accessory shop buying at dealer price' },
  { value: 'wholesale', label: 'Wholesale', sublabel: 'Distributor buying in bulk' },
  { value: 'workshop', label: 'Workshop', sublabel: 'Fitment / modification shop' },
  { value: 'retail', label: 'Retail', sublabel: 'End customer' },
  { value: 'other', label: 'Other' },
];

export default function CustomerEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();

  const { data: rows } = useQuery<Customer>('SELECT * FROM customers WHERE id = ?', [id ?? '']);
  const existing = rows?.[0];
  const { data: priceLists } = useQuery<{ id: string; name: string; is_default: number }>('SELECT id, name, is_default FROM price_lists WHERE is_active = 1 ORDER BY name');
  const { data: company } = useQuery<{ state_code: string; state_name: string }>('SELECT state_code, state_name FROM company_settings LIMIT 1');
  const { data: settings } = useQuery<{ value: string }>("SELECT value FROM app_settings WHERE id = 'default_credit_days'");
  const { data: vehicles } = useQuery<Vehicle>(
    `SELECT cv.id, cv.registration_no, cv.model_id, cv.generation_id, cv.color, vm.name AS model_name, mk.name AS make_name
     FROM customer_vehicles cv LEFT JOIN vehicle_models vm ON vm.id = cv.model_id LEFT JOIN vehicle_makes mk ON mk.id = vm.make_id WHERE cv.customer_id = ? ORDER BY cv.registration_no`,
    [id ?? '']
  );
  const { data: models } = useQuery<{ id: string; name: string; make_name: string }>('SELECT vm.id, vm.name, mk.name AS make_name FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id WHERE vm.is_active = 1 ORDER BY mk.sort_order, vm.name');

  const [form, setForm] = useState<Partial<Customer>>({ customer_type: 'dealer', credit_limit: 0, credit_days: 0, opening_balance: 0, is_active: 1 });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reg, setReg] = useState('');
  const [regModel, setRegModel] = useState<string | null>(null);

  useEffect(() => {
    if (existing && !dirty) setForm(existing);
  }, [existing, dirty]);
  useEffect(() => {
    if (isNew && company?.[0] && !form.state_code) {
      setForm((f) => ({ ...f, state_code: company[0].state_code, state_name: company[0].state_name }));
    }
    if (isNew && priceLists && !form.price_list_id) {
      const d = priceLists.find((p) => p.is_default) ?? priceLists[0];
      if (d) setForm((f) => ({ ...f, price_list_id: d.id }));
    }
    if (isNew && settings?.[0] && form.credit_days === 0 && form.customer_type !== 'retail') {
      const n = Number(JSON.parse(settings[0].value));
      if (n) setForm((f) => ({ ...f, credit_days: n }));
    }
  }, [isNew, company, priceLists, settings, form.state_code, form.price_list_id, form.credit_days, form.customer_type]);

  const set = <K extends keyof Customer>(k: K, v: Customer[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  function onGstin(v: string) {
    const g = v.toUpperCase().trim();
    set('gstin', g);
    const sc = stateCodeFromGstin(g);
    if (sc) {
      const st = INDIAN_STATES.find((s) => s.code === sc);
      if (st) setForm((f) => ({ ...f, state_code: st.code, state_name: st.name }));
    }
    if (g.length === 15) setForm((f) => ({ ...f, pan: g.slice(2, 12) }));
  }

  async function save() {
    if (!form.name?.trim()) {
      notify('Customer name is required.');
      return;
    }
    if (form.gstin && !isValidGstin(form.gstin)) {
      notify('GSTIN does not look valid. It should be 15 characters like 09ABCDE1234F1Z5.');
      return;
    }
    if (form.mobile && !/^\d{10}$/.test(form.mobile.replace(/\D/g, ''))) {
      notify('Mobile should be 10 digits.');
      return;
    }

    // One phone number, one khata. "Ramesh", "Ramesh Auto" and "Ramesh bhai"
    // as three customers on one number is the commonest way a shop ledger goes
    // wrong, and it is silent — nobody notices until the balances stop
    // matching. Warn, but let it through: a father and son on one number is a
    // real thing, and the person entering it knows which case this is.
    const digits = form.mobile?.replace(/\D/g, '') ?? '';
    if (digits && !id) {
      const clash = await db.getAll<{ id: string; name: string; code: string }>(
        'SELECT id, name, code FROM customers WHERE mobile = ? AND is_active = 1 LIMIT 3', [digits]);
      if (clash.length) {
        const who = clash.map((c) => `${c.name} (${c.code})`).join(', ');
        const go = await confirm(
          'Ye number pehle se hai',
          `${digits} par already hai: ${who}.

Phir bhi naya customer banayein? Do khaate ho jayenge.`,
        );
        if (!go) return;
      }
    }

    setSaving(true);
    try {
      let code = form.code?.trim();
      if (!code) {
        const max = await db.getOptional<{ m: string }>("SELECT MAX(code) AS m FROM customers WHERE code LIKE 'C%'");
        code = nextCode('C', max?.m);
      }
      const payload = {
        code, name: form.name.trim(), business_name: form.business_name?.trim() || null, owner_name: form.owner_name?.trim() || null,
        mobile: form.mobile?.replace(/\D/g, '') || null, alt_phone: form.alt_phone || null, email: form.email?.trim() || null,
        gstin: form.gstin || null, pan: form.pan || null, address_line1: form.address_line1 || null, address_line2: form.address_line2 || null,
        city: form.city || null, state_code: form.state_code || null, state_name: form.state_name || null, pincode: form.pincode || null,
        customer_type: form.customer_type ?? 'retail', price_list_id: form.price_list_id ?? null, credit_limit: form.credit_limit ?? 0, credit_days: form.credit_days ?? 0,
        opening_balance: form.opening_balance ?? 0, opening_balance_date: form.opening_balance_date || null, notes: form.notes || null, is_active: !!form.is_active,
        search_text: [form.name, form.business_name, code, form.mobile, form.alt_phone, form.gstin, form.city].filter(Boolean).join(' ').toLowerCase(),
      };
      let cid = id ?? '';
      await db.writeTransaction(async (tx) => {
        if (isNew) {
          cid = await insertRow(tx, 'customers', payload, actor);
          if ((form.opening_balance ?? 0) !== 0) {
            const amt = form.opening_balance ?? 0;
            await insertRow(tx, 'ledger_entries', {
              party_type: 'customer', party_id: cid, entry_date: form.opening_balance_date || new Date().toISOString().slice(0, 10), doc_type: 'opening',
              debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0, narration: 'Opening balance',
            }, actor);
          }
        } else {
          await updateRow(tx, 'customers', cid, payload);
        }
      });
      setDirty(false);
      router.replace(`/customer/${cid}`);
    } catch (e) {
      notify(`Could not save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function addVehicle() {
    if (!id) return;
    const r = normaliseRegistration(reg);
    if (r.length < 6) {
      notify('Enter the registration number, e.g. UP16AB1234.');
      return;
    }
    await insertRow(db, 'customer_vehicles', { customer_id: id, registration_no: r, model_id: regModel, generation_id: null }, actor);
    setReg('');
  }

  async function removeVehicle(v: Vehicle) {
    if (await confirm('Remove vehicle?', `${v.registration_no} will be removed from this customer.`)) await db.execute('DELETE FROM customer_vehicles WHERE id = ?', [v.id]);
  }

  if (!can('party.edit')) return <Screen><Text>You do not have permission to edit customers.</Text></Screen>;
  if (!isNew && !existing) return <Screen><Text>Loading…</Text></Screen>;

  const canEditCredit = can('party.edit_credit_limit');

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New customer' : existing?.name }} />
      <Screen>
        <Text variant="display">{isNew ? 'New customer' : existing?.name}</Text>

        <FormSection title="Identity">
          <SelectField label="Type" value={form.customer_type} options={TYPES} onChange={(v) => set('customer_type', v ?? 'retail')} />
          <Input label="Name" value={form.name ?? ''} onChangeText={(v) => set('name', v)} placeholder="XYZ Accessories" />
          <Input label="Business name (on invoice)" value={form.business_name ?? ''} onChangeText={(v) => set('business_name', v)} />
          <Input label="Owner / contact" value={form.owner_name ?? ''} onChangeText={(v) => set('owner_name', v)} />
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="Mobile" value={form.mobile ?? ''} onChangeText={(v) => set('mobile', v)} keyboardType="phone-pad" />
            <Input containerStyle={{ flex: 1 }} label="Alt phone" value={form.alt_phone ?? ''} onChangeText={(v) => set('alt_phone', v)} keyboardType="phone-pad" />
          </Row>
          <Input label="Email" value={form.email ?? ''} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />
          {!isNew ? <Input label="Code" value={form.code ?? ''} onChangeText={(v) => set('code', v)} hint="Auto-assigned; change only if you use your own codes." /> : null}
        </FormSection>

        <FormSection title="GST & address" hint="The state decides CGST+SGST versus IGST on every invoice.">
          <Input label="GSTIN" value={form.gstin ?? ''} onChangeText={onGstin} autoCapitalize="characters" error={form.gstin && !isValidGstin(form.gstin) ? 'Not a valid GSTIN format' : null} hint="Fills the state and PAN automatically." />
          <Input label="PAN" value={form.pan ?? ''} onChangeText={(v) => set('pan', v.toUpperCase())} autoCapitalize="characters" />
          <Input label="Address line 1" value={form.address_line1 ?? ''} onChangeText={(v) => set('address_line1', v)} />
          <Input label="Address line 2" value={form.address_line2 ?? ''} onChangeText={(v) => set('address_line2', v)} />
          <Row gap={12}>
            <Input containerStyle={{ flex: 1 }} label="City" value={form.city ?? ''} onChangeText={(v) => set('city', v)} />
            <Input containerStyle={{ flex: 1 }} label="PIN code" value={form.pincode ?? ''} onChangeText={(v) => set('pincode', v)} keyboardType="number-pad" />
          </Row>
          <SelectField label="State" value={form.state_code} options={INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} onChange={(v) => { const st = INDIAN_STATES.find((s) => s.code === v); set('state_code', v); set('state_name', st?.name ?? null); }} />
        </FormSection>

        <FormSection title="Pricing & credit">
          <SelectField label="Price list" value={form.price_list_id} options={(priceLists ?? []).map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => set('price_list_id', v)} hint="Per-SKU negotiated prices are set on the product page." />
          <Row gap={12}>
            <View style={{ flex: 1 }}>
              <NumberField label="Credit limit (₹)" value={form.credit_limit ?? 0} onChange={(v) => canEditCredit && set('credit_limit', v ?? 0)} hint={canEditCredit ? '0 = no limit' : 'Only owner/admin can change'} />
            </View>
            <View style={{ flex: 1 }}>
              <NumberField label="Credit days" value={form.credit_days ?? 0} onChange={(v) => canEditCredit && set('credit_days', v ?? 0)} decimals={0} />
            </View>
          </Row>
          {isNew ? (
            <Row gap={12}>
              <View style={{ flex: 1 }}>
                <NumberField label="Opening balance (₹)" value={form.opening_balance ?? 0} onChange={(v) => set('opening_balance', v ?? 0)} hint="Positive = they owe you. Written as a ledger entry." />
              </View>
              <Input containerStyle={{ flex: 1 }} label="As of (YYYY-MM-DD)" value={form.opening_balance_date ?? ''} onChangeText={(v) => set('opening_balance_date', v)} placeholder="2026-04-01" />
            </Row>
          ) : null}
          <Input label="Notes" value={form.notes ?? ''} onChangeText={(v) => set('notes', v)} multiline />
          {!isNew ? <SwitchRow label="Active" value={!!form.is_active} onChange={(v) => set('is_active', v ? 1 : 0)} /> : null}
        </FormSection>

        <Button title={isNew ? 'Create customer' : dirty ? 'Save changes' : 'Saved'} onPress={save} loading={saving} disabled={!isNew && !dirty} />

        {!isNew ? (
          <>
            <SectionTitle>Vehicles</SectionTitle>
            <Card style={{ gap: 0 }}>
              {(vehicles ?? []).map((v) => (
                <ListRow key={v.id} title={v.registration_no} subtitle={[v.make_name, v.model_name, v.color].filter(Boolean).join(' · ') || 'model not set'} right={<Button title="×" tone="ghost" size="sm" onPress={() => removeVehicle(v)} />} />
              ))}
              <Row gap={8} align="flex-end" style={{ paddingTop: 8 }}>
                <Input containerStyle={{ flex: 1 }} label="Registration" value={reg} onChangeText={(v) => setReg(v.toUpperCase())} placeholder="UP16AB1234" autoCapitalize="characters" />
                <View style={{ flex: 1.4 }}>
                  <SelectField label="Model" value={regModel} options={(models ?? []).map((m) => ({ value: m.id, label: `${m.make_name} ${m.name}` }))} onChange={setRegModel} allowClear />
                </View>
                <Button title="Add" tone="secondary" onPress={addVehicle} />
              </Row>
            </Card>
          </>
        ) : null}
      </Screen>
    </>
  );
}
