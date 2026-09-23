import { useQuery } from '@powersync/react';
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { isValidGstin, stateCodeFromGstin } from '@domain';

import { paymentQrDataUrl, shareImageDataUrl } from '@/lib/qr';
import { INDIAN_STATES } from '@/lib/states';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { DEFAULT_TEMPLATES, openWhatsApp, reminderMessage } from '@/lib/whatsapp';
import { useShopSettings } from '@/lib/use-settings';
import { insertRow, updateRow } from '@/lib/writes';
import { Button, Card, Input, Row, Screen, SectionTitle, Text } from '@/ui';
import { FormSection, NumberField, SelectField, SwitchRow, notify } from '@/ui/forms';
import { radius, space } from '@/ui/theme';

type Company = {
  id: string; legal_name: string; trade_name: string | null; gstin: string | null; pan: string | null; state_code: string; state_name: string; address_line1: string | null; address_line2: string | null;
  city: string | null; pincode: string | null; phone: string | null; email: string | null; bank_name: string | null; bank_account_no: string | null; bank_ifsc: string | null; upi_id: string | null;
  upi_payee_name: string | null; whatsapp_number: string | null; invoice_footer: string | null; invoice_terms: string | null; fy_start_month: number; round_to_rupee: number;
};
type Setting = { id: string; value: string };

const BEHAVIOUR: Array<{ id: string; label: string; kind: 'number' | 'bool'; hint: string }> = [
  { id: 'gst_enabled', label: 'GST on bills', kind: 'bool', hint: 'Off = plain bill / slip with no tax. On = GST is added per item and printed with HSN.' },
  { id: 'allow_negative_stock', label: 'Allow billing when stock shows zero', kind: 'bool', hint: 'Keep on: a phone that was offline may not know the latest stock.' },
  { id: 'default_credit_days', label: 'Default credit days for new dealers', kind: 'number', hint: '' },
  { id: 'dead_stock_days', label: 'Dead stock after (days)', kind: 'number', hint: 'No sale for this long with stock on hand.' },
];

const TEMPLATES: Array<{ id: string; label: string; hint: string; def: string }> = [
  { id: 'wa_template_slip', label: 'Bill / slip message', hint: 'Placeholders: {name} {shop} {items} {bill_no} {total} {pending} {upi_line} {date}', def: DEFAULT_TEMPLATES.slip },
  { id: 'wa_template_reminder', label: 'Day-end payment reminder', hint: 'Placeholders: {name} {shop} {pending} {upi_line} {date}', def: DEFAULT_TEMPLATES.reminder },
  { id: 'wa_template_paid', label: 'Payment aane par jo message jaaye', hint: 'Placeholders: {name} {shop} {amount} {mode} {pending}', def: DEFAULT_TEMPLATES.paid },
];

export default function SettingsScreen() {
  const { db } = useSystem();
  const { can } = useSession();
  const shop = useShopSettings();
  const editable = can('admin.settings');
  const { data: rows } = useQuery<Company>('SELECT * FROM company_settings LIMIT 1');
  const company = rows?.[0];
  const { data: settings } = useQuery<Setting>('SELECT id, value FROM app_settings');

  const [form, setForm] = useState<Partial<Company>>({});
  const [dirty, setDirty] = useState(false);
  const [tpl, setTpl] = useState<Record<string, string>>({});
  useEffect(() => { if (company && !dirty) setForm(company); }, [company, dirty]);
  const set = <K extends keyof Company>(k: K, v: Company[K]) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const readSetting = (id: string) => { const r = settings?.find((x) => x.id === id); if (!r) return null; try { return JSON.parse(r.value); } catch { return r.value; } };

  async function save() {
    if (!form.legal_name?.trim() || !form.state_code) { notify('Dukan ka naam aur state zaroori hai.'); return; }
    if (form.gstin && !isValidGstin(form.gstin)) { notify('GSTIN ka format theek nahi hai.'); return; }
    const payload = {
      legal_name: form.legal_name.trim(), trade_name: form.trade_name || null, gstin: form.gstin || null, pan: form.pan || null, state_code: form.state_code, state_name: form.state_name ?? '',
      address_line1: form.address_line1 || null, address_line2: form.address_line2 || null, city: form.city || null, pincode: form.pincode || null, phone: form.phone || null, email: form.email || null,
      bank_name: form.bank_name || null, bank_account_no: form.bank_account_no || null, bank_ifsc: form.bank_ifsc || null, upi_id: form.upi_id?.trim() || null, upi_payee_name: form.upi_payee_name || null,
      whatsapp_number: form.whatsapp_number?.replace(/\D/g, '') || null, invoice_footer: form.invoice_footer || null, invoice_terms: form.invoice_terms || null, fy_start_month: form.fy_start_month ?? 4, round_to_rupee: !!form.round_to_rupee,
    };
    if (company) await updateRow(db, 'company_settings', company.id, payload);
    else await insertRow(db, 'company_settings', payload);
    setDirty(false);
    notify('Save ho gaya.');
  }

  async function saveSetting(id: string, value: unknown) {
    const exists = settings?.some((s) => s.id === id);
    if (exists) await db.execute('UPDATE app_settings SET value = ?, updated_at = ? WHERE id = ?', [JSON.stringify(value), new Date().toISOString(), id]);
    else await db.execute('INSERT INTO app_settings (id, value, updated_at) VALUES (?, ?, ?)', [id, JSON.stringify(value), new Date().toISOString()]);
  }

  async function testWhatsApp() {
    const to = form.whatsapp_number || company?.whatsapp_number;
    if (!to) { notify('Pehle WhatsApp Business number daalo.'); return; }
    const ok = await openWhatsApp(to, reminderMessage({ ...shop.wa, whatsappNumber: to, upiId: form.upi_id ?? shop.wa.upiId, upiPayeeName: form.upi_payee_name ?? shop.wa.upiPayeeName }, { name: 'Test', pending: 1250 }));
    if (!ok) notify('Ye number theek nahi lag raha.');
  }

  const upiId = form.upi_id ?? company?.upi_id ?? null;
  const qrPreview = upiId ? paymentQrDataUrl({ upiId, payee: form.upi_payee_name ?? company?.upi_payee_name ?? null }) : null;

  async function shareShopQr() {
    if (!qrPreview) { notify('Pehle UPI ID daalo.'); return; }
    await shareImageDataUrl(qrPreview, { dialogTitle: 'AutoLoom payment QR', fileName: 'shop-payment-qr.gif' });
  }

  return (
    <Screen>
      <Text variant="display">Dukan settings</Text>

      <FormSection title="WhatsApp & UPI" hint="Parchi aur yaad dilane wale message WhatsApp mein pehle se tayyar khulte hain — staff bas bhej deta hai. Message usi WhatsApp se jaata hai jo us phone par logged in hai (counter wale phone par aapka Business number).">
        <Input label="WhatsApp Business number" value={form.whatsapp_number ?? ''} onChangeText={(v) => set('whatsapp_number', v)} keyboardType="phone-pad" placeholder="98110 01100" editable={editable} hint="Parchi par chhapega taaki grahak jawab de sake." />
        <Row gap={12}>
          <Input containerStyle={{ flex: 1.3 }} label="UPI ID" value={form.upi_id ?? ''} onChangeText={(v) => set('upi_id', v)} autoCapitalize="none" placeholder="autoloom@upi" editable={editable} />
          <Input containerStyle={{ flex: 1 }} label="Paisa kiske naam aayega" value={form.upi_payee_name ?? ''} onChangeText={(v) => set('upi_payee_name', v)} placeholder="AutoLoom" editable={editable} />
        </Row>
        <Text variant="small" color="textFaint">Yaad dilane wale message mein UPI ID aur ek link jaata hai jisme baaki paisa pehle se bhara hota hai.</Text>
        <Row gap={8}>
          {editable ? <Button title={dirty ? 'Save' : 'Saved'} onPress={save} disabled={!dirty} /> : null}
          <Button title="Apne number par test message bhejo" tone="secondary" onPress={testWhatsApp} />
        </Row>
        {qrPreview ? (
          <Row gap={space.md} align="flex-start" style={{ marginTop: 4 }}>
            <Image source={{ uri: qrPreview }} style={{ width: 96, height: 96, borderRadius: radius.md }} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="small" color="textMuted">Your payment QR — the same one reminders can share as an image attachment (WhatsApp text can&apos;t carry an image, so it&apos;s a separate tap on the Reminders screen). Print this and stick it at the counter too.</Text>
              <Button title="Ye QR bhejo ya print karo" size="sm" tone="secondary" onPress={shareShopQr} />
            </View>
          </Row>
        ) : null}
      </FormSection>

      <SectionTitle>Message ke template</SectionTitle>
      <Card>
        {TEMPLATES.map((t) => {
          const current = tpl[t.id] ?? (readSetting(t.id) as string | null) ?? t.def;
          return (
            <View key={t.id} style={{ gap: 6 }}>
              <Input label={t.label} value={current} onChangeText={(v) => setTpl((x) => ({ ...x, [t.id]: v }))} multiline numberOfLines={5} hint={t.hint} editable={editable} style={{ minHeight: 110 }} />
              {editable ? <Row gap={8}><Button title="Template save karo" size="sm" tone="secondary" onPress={() => saveSetting(t.id, current).then(() => notify('Template save ho gaya.'))} /><Button title="Wapas default par le jao" size="sm" tone="ghost" onPress={() => setTpl((x) => ({ ...x, [t.id]: t.def }))} /></Row> : null}
            </View>
          );
        })}
      </Card>

      <SectionTitle>Kaise chale</SectionTitle>
      <Card>
        {BEHAVIOUR.map((s) => {
          const raw = readSetting(s.id);
          if (s.kind === 'bool') return <SwitchRow key={s.id} label={s.label} hint={s.hint} value={raw === true} onChange={(v) => editable && saveSetting(s.id, v)} />;
          return <NumberField key={s.id} label={s.label} hint={s.hint} value={raw == null ? null : Number(raw)} onChange={(v) => editable && v != null && saveSetting(s.id, v)} decimals={0} />;
        })}
      </Card>

      <FormSection title="Dukan ki pehchaan" hint="Har bill par chhapega.">
        <Input label="Dukan ka naam" value={form.legal_name ?? ''} onChangeText={(v) => set('legal_name', v)} editable={editable} />
        <Input label="Brand / trade naam" value={form.trade_name ?? ''} onChangeText={(v) => set('trade_name', v)} editable={editable} placeholder="AutoLoom" />
        <Row gap={12}>
          <Input containerStyle={{ flex: 1 }} label="Phone" value={form.phone ?? ''} onChangeText={(v) => set('phone', v)} editable={editable} />
          <Input containerStyle={{ flex: 1 }} label="Email" value={form.email ?? ''} onChangeText={(v) => set('email', v)} editable={editable} autoCapitalize="none" />
        </Row>
        <Input label="Pata line 1" value={form.address_line1 ?? ''} onChangeText={(v) => set('address_line1', v)} editable={editable} />
        <Input label="Pata line 2" value={form.address_line2 ?? ''} onChangeText={(v) => set('address_line2', v)} editable={editable} />
        <Row gap={12}>
          <Input containerStyle={{ flex: 1 }} label="Shehar" value={form.city ?? ''} onChangeText={(v) => set('city', v)} editable={editable} />
          <Input containerStyle={{ flex: 1 }} label="PIN" value={form.pincode ?? ''} onChangeText={(v) => set('pincode', v)} editable={editable} />
        </Row>
        <SelectField label="State" value={form.state_code} options={INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} onChange={(v) => { set('state_code', v ?? ''); set('state_name', INDIAN_STATES.find((s) => s.code === v)?.name ?? ''); }} />
        <Input label="Bill ke neeche ki line" value={form.invoice_footer ?? ''} onChangeText={(v) => set('invoice_footer', v)} editable={editable} placeholder="Har gaadi ka maal" />
        <Input label="Terms (printed on bill)" value={form.invoice_terms ?? ''} onChangeText={(v) => set('invoice_terms', v)} editable={editable} multiline />
      </FormSection>

      <FormSection title="GST ki detail (tabhi jab bill par GST on ho)">
        <Input label="GSTIN" value={form.gstin ?? ''} onChangeText={(v) => { const g = v.toUpperCase(); set('gstin', g); const sc = stateCodeFromGstin(g); const st = INDIAN_STATES.find((s) => s.code === sc); if (st) { set('state_code', st.code); set('state_name', st.name); } if (g.length === 15) set('pan', g.slice(2, 12)); }} autoCapitalize="characters" editable={editable} error={form.gstin && !isValidGstin(form.gstin) ? 'Not a valid format' : null} />
        <Input label="PAN" value={form.pan ?? ''} onChangeText={(v) => set('pan', v.toUpperCase())} editable={editable} />
        <Input label="Bank" value={form.bank_name ?? ''} onChangeText={(v) => set('bank_name', v)} editable={editable} />
        <Row gap={12}>
          <Input containerStyle={{ flex: 1 }} label="Account number" value={form.bank_account_no ?? ''} onChangeText={(v) => set('bank_account_no', v)} editable={editable} />
          <Input containerStyle={{ flex: 1 }} label="IFSC" value={form.bank_ifsc ?? ''} onChangeText={(v) => set('bank_ifsc', v.toUpperCase())} editable={editable} />
        </Row>
        <SwitchRow label="Round bill total to the rupee" value={!!form.round_to_rupee} onChange={(v) => set('round_to_rupee', v ? 1 : 0)} />
      </FormSection>
      {editable ? <Button title={dirty ? 'Save changes' : 'Saved'} onPress={save} disabled={!dirty} /> : null}
    </Screen>
  );
}
