/**
 * Supplier aur grahak ki list — kept apart from the khata (owner, 8 Oct 2026:
 * "supplier ki list bhi alag se manage kar paye sidha, ledger accounts ki bhi
 * for retailers ya customers").
 *
 * The Khata tab is for money: who owes what. This is for the accounts
 * themselves: every supplier and every customer — dukaan, dealer, retail —
 * including the ones switched off, with their contact, type and terms, and
 * one tap to change, switch off or switch back on. A party that is switched
 * off keeps its whole khata; it just stops being offered on new entries.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { customerTypeLabel } from '@/lib/words';
import { updateRow } from '@/lib/writes';
import { Avatar, Badge, Button, Card, Chip, Empty, Input, ListRow, Row, Screen, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type Party = { id: string; code: string; name: string; firm: string | null; mobile: string | null; city: string | null; kind: string | null; is_active: number; is_cash?: number };
const TYPES = ['dealer', 'wholesale', 'retail', 'workshop', 'other'];

export default function Parties() {
  const router = useRouter();
  const { db } = useSystem();
  const { can } = useSession();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'customer' | 'supplier'>(params.tab === 'supplier' ? 'supplier' : 'customer');
  const [q, setQ] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [showOff, setShowOff] = useState(false);

  const { data: customers } = useQuery<Party>(
    `SELECT id, code, name, business_name AS firm, mobile, city, customer_type AS kind, is_active, COALESCE(is_cash, 0) AS is_cash
       FROM customers ORDER BY is_active DESC, name`);
  const { data: suppliers } = useQuery<Party>(
    `SELECT id, code, name, company_name AS firm, mobile, city, NULL AS kind, is_active FROM suppliers ORDER BY is_active DESC, name`);

  const isCustomer = tab === 'customer';
  const rows = useMemo(() => {
    const all = (isCustomer ? customers : suppliers) ?? [];
    const needle = q.trim().toLowerCase();
    return all
      .filter((p) => !p.is_cash)
      .filter((p) => showOff || p.is_active)
      .filter((p) => !type || p.kind === type)
      .filter((p) => !needle || [p.name, p.firm, p.mobile, p.city, p.code].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [isCustomer, customers, suppliers, q, type, showOff]);
  const off = ((isCustomer ? customers : suppliers) ?? []).filter((p) => !p.is_active).length;

  async function toggle(p: Party) {
    const table = isCustomer ? 'customers' : 'suppliers';
    if (p.is_active && !(await confirm(`${p.name} band karein?`, 'Naye bill aur entry mein ye naam nahi aayega. Purana khata waise ka waisa rahega — kabhi bhi chalu kar sakte ho.'))) return;
    await updateRow(db, table, p.id, { is_active: !p.is_active });
    notify(p.is_active ? `${p.name} band.` : `${p.name} phir chalu.`, 'ok');
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Supplier aur grahak' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="display">Party list</Text>
          {can('party.edit') ? (
            <Button title={isCustomer ? '+ Grahak' : '+ Supplier'} onPress={() => router.push(isCustomer ? '/customer/edit' : '/supplier/edit')} />
          ) : null}
        </Row>
        <Text variant="small" color="textMuted">Saare khate — naam, number, type. Badlo, band karo ya phir chalu karo. Paisa kitna baaki hai wo Khata tab mein.</Text>

        <Row gap={space.xs}>
          <Chip label={`Grahak · ${(customers ?? []).filter((p) => !p.is_cash && p.is_active).length}`} selected={isCustomer} onPress={() => { setTab('customer'); setType(null); }} />
          <Chip label={`Supplier · ${(suppliers ?? []).filter((p) => p.is_active).length}`} selected={!isCustomer} onPress={() => { setTab('supplier'); setType(null); }} />
        </Row>
        <Input value={q} onChangeText={setQ} placeholder="Naam, firm, mobile, shehar ya code" autoCapitalize="none" />
        <Row gap={space.xs} wrap>
          {isCustomer ? TYPES.map((t) => (
            <Chip key={t} label={customerTypeLabel(t)} selected={type === t} onPress={() => setType(type === t ? null : t)} />
          )) : null}
          {off > 0 ? <Chip label={`Band wale bhi · ${off}`} selected={showOff} onPress={() => setShowOff(!showOff)} /> : null}
        </Row>

        {rows.length === 0 ? (
          <Empty art="parchi" title={q.trim() ? 'Kuch nahi mila' : isCustomer ? 'Abhi koi grahak nahi' : 'Abhi koi supplier nahi'} />
        ) : (
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {rows.map((p) => (
              <View key={p.id}>
                <ListRow
                  left={<Avatar name={p.name} size={38} tone={isCustomer ? 'accent' : 'neutral'} />}
                  title={p.name}
                  subtitle={[p.firm && p.firm !== p.name ? p.firm : null, p.mobile, p.city, p.code].filter(Boolean).join(' · ')}
                  onPress={() => router.push(isCustomer ? `/customer/${p.id}` : `/supplier/${p.id}`)}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      {p.kind ? <Badge tone={p.kind === 'retail' ? 'neutral' : 'info'}>{customerTypeLabel(p.kind)}</Badge> : null}
                      {!p.is_active ? <Badge tone="danger">band</Badge> : null}
                    </View>
                  }
                />
                {can('party.edit') ? (
                  <Row gap={space.sm} style={{ paddingLeft: 52, paddingBottom: space.xs }}>
                    <Button title="Badlo" tone="ghost" size="sm" onPress={() => router.push(isCustomer ? `/customer/edit?id=${p.id}` : `/supplier/edit?id=${p.id}`)} />
                    {can('catalog.edit') ? (
                      <Button title={p.is_active ? 'Band karo' : 'Chalu karo'} tone="ghost" size="sm" onPress={() => toggle(p)} />
                    ) : null}
                  </Row>
                ) : null}
              </View>
            ))}
          </Card>
        )}
      </Screen>
    </>
  );
}
