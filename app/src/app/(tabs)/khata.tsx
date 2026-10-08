import { useQuery } from '@powersync/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatINR } from '@domain';

import { SEARCH_CUSTOMERS, tokenize } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { customerTypeLabel } from '@/lib/words';
import { Avatar, Badge, Button, Card, Chip, Empty, Input, ListRow, Row, Screen, Text, useTheme } from '@/ui';
import { Skeleton, SkeletonList } from '@/ui/skeleton';
import { radius, space } from '@/ui/theme';

/**
 * Khata: every party the business deals with, and where each one stands.
 *
 * A wholesaler lives in two ledgers — the shops and people it sells to, and
 * the suppliers it buys from — so they share one tab with a switch rather
 * than hiding under "Aur". The cash customer is not here: nobody owes on it.
 */
type Party = {
  id: string; name: string; firm: string | null; mobile: string | null; city: string | null;
  customer_type?: string; balance: number; search_text?: string;
};
const TYPES = ['dealer', 'wholesale', 'workshop', 'retail', 'other'];

export default function KhataScreen() {
  const router = useRouter();
  const { can } = useSession();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'customer' | 'supplier'>(params.tab === 'supplier' ? 'supplier' : 'customer');
  const [q, setQ] = useState('');
  const [type, setType] = useState<string | null>(null);
  const tokens = useMemo(() => tokenize(q), [q]);

  // A supplier's balance is what the shop paid for its maal — a buy rate in
  // all but name — so it goes with the right to see cost.
  const seeSupplierMoney = can('catalog.view_cost') || can('payment.pay_supplier');
  const seeCustomerMoney = can('reports.view') || can('payment.receive');

  const sq = SEARCH_CUSTOMERS(tokens.length ? tokens : [' '], 500);
  const { data: hits, isLoading: hitsLoading } = useQuery<Party & { business_name: string | null }>(sq.sql, sq.params);
  const { data: customers, isLoading: customersLoading } = useQuery<Party>(`
    SELECT c.id, c.name, c.business_name AS firm, c.mobile, c.city, c.customer_type,
           COALESCE(pb.balance, 0) AS balance
      FROM customers c
      LEFT JOIN party_balance_live pb ON pb.party_type = 'customer' AND pb.party_id = c.id
     WHERE c.is_active = 1 AND COALESCE(c.is_cash, 0) = 0
     ORDER BY c.name`);
  const { data: suppliers, isLoading: suppliersLoading } = useQuery<Party>(`
    SELECT s.id, s.name, s.company_name AS firm, s.mobile, s.city, s.search_text,
           COALESCE(pb.balance, 0) AS balance
      FROM suppliers s
      LEFT JOIN party_balance_live pb ON pb.party_type = 'supplier' AND pb.party_id = s.id
     WHERE s.is_active = 1
     ORDER BY s.name`);

  const isCustomer = tab === 'customer';
  const loading = isCustomer ? (tokens.length ? hitsLoading : customersLoading) : suppliersLoading;

  const ledgerIds = useMemo(() => new Set((customers ?? []).map((c) => c.id)), [customers]);
  const rows: Party[] = isCustomer
    ? (tokens.length
        ? (hits ?? []).filter((h) => ledgerIds.has(h.id)).map((h) => ({ ...h, firm: h.business_name }))
        : customers ?? []
      ).filter((r) => !type || r.customer_type === type)
    : (suppliers ?? []).filter((s) => !q || (s.search_text ?? '').includes(q.toLowerCase()));

  const lena = (customers ?? []).reduce((a, r) => a + Math.max(r.balance, 0), 0);
  const dena = (suppliers ?? []).reduce((a, r) => a + Math.max(r.balance, 0), 0);
  const showMoney = isCustomer ? seeCustomerMoney : seeSupplierMoney;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Khata</Text>
        {can('party.edit') ? (
          <Row gap={space.xs}>
            <Button title="Saari list" tone="ghost" size="sm" onPress={() => router.push(`/parties?tab=${tab}` as never)} />
            <Button
              title={isCustomer ? 'Naya grahak' : 'Naya supplier'}
              onPress={() => router.push(isCustomer ? '/customer/edit' : '/supplier/edit')}
            />
          </Row>
        ) : null}
      </Row>

      {/* Two ledgers, one switch. The totals sit on the switch itself so the
          two numbers a wholesaler checks first are visible without a tap. */}
      <Row gap={space.sm}>
        <SwitchCard
          title="Grahak"
          hint={seeCustomerMoney ? `Lena hai ${formatINR(lena)}` : `${(customers ?? []).length} khate`}
          tone="warn"
          selected={isCustomer}
          loading={customersLoading}
          onPress={() => { setTab('customer'); setQ(''); }}
        />
        <SwitchCard
          title="Supplier"
          hint={seeSupplierMoney ? `Dena hai ${formatINR(dena)}` : `${(suppliers ?? []).length} supplier`}
          tone="info"
          selected={!isCustomer}
          loading={suppliersLoading}
          onPress={() => { setTab('supplier'); setQ(''); setType(null); }}
        />
      </Row>

      <Input value={q} onChangeText={setQ} placeholder="Naam, firm, mobile ya shehar" autoCapitalize="none" />

      {isCustomer ? (
        <Row gap={space.xs} wrap>
          {loading ? (
            <Skeleton width={64} height={34} radius={radius.pill} />
          ) : (
            <Chip label={`Sab · ${(customers ?? []).length}`} selected={!type} onPress={() => setType(null)} />
          )}
          {TYPES.map((tp) => (
            <Chip key={tp} label={customerTypeLabel(tp)} selected={type === tp} onPress={() => setType(type === tp ? null : tp)} />
          ))}
        </Row>
      ) : null}

      {loading ? (
        <SkeletonList rows={6} size={38} round />
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {rows.map((p) => (
            <ListRow
              key={p.id}
              left={<Avatar name={p.name} size={38} tone={isCustomer ? 'accent' : 'neutral'} />}
              title={p.name}
              subtitle={[p.firm && p.firm !== p.name ? p.firm : null, p.mobile, p.city].filter(Boolean).join(' · ')}
              onPress={() => router.push(isCustomer ? `/customer/${p.id}` : `/supplier/${p.id}`)}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  {isCustomer && p.customer_type ? (
                    <Badge tone={p.customer_type === 'retail' ? 'neutral' : 'info'}>{customerTypeLabel(p.customer_type)}</Badge>
                  ) : null}
                  {showMoney ? (
                    p.balance
                      ? <Text variant="small" mono color={p.balance > 0 ? 'warn' : 'ok'}>{formatINR(p.balance)}</Text>
                      : <Text variant="small" color="textFaint">chukta</Text>
                  ) : null}
                </View>
              }
            />
          ))}
          {rows.length === 0 ? (
            q.trim()
              ? <Empty art="search" title={`“${q.trim()}” nahi mila`} hint="Naam, mobile ya shehar ka thoda hissa likh ke dekho." />
              : <Empty art="parchi"
                  title={isCustomer ? 'Abhi koi grahak nahi' : 'Abhi koi supplier nahi'}
                  hint={isCustomer
                    ? 'Upar “Naya grahak” dabao — dukaan ya bande ka naam aur mobile kaafi hai.'
                    : 'Upar “Naya supplier” dabao — naam aur mobile kaafi hai.'} />
          ) : null}
        </Card>
      )}
    </Screen>
  );
}

function SwitchCard({ title, hint, tone, selected, loading, onPress }: {
  title: string; hint: string; tone: 'warn' | 'info'; selected: boolean; loading: boolean; onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flex: 1, gap: 2, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5,
        borderColor: selected ? t.accent : t.border,
        backgroundColor: selected ? t.accentSoft : t.surface,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Text variant="heading">{title}</Text>
      {loading ? <Skeleton width={90} height={11} /> : <Text variant="small" color={selected ? tone : 'textMuted'} mono>{hint}</Text>}
    </Pressable>
  );
}
