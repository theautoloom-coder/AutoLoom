import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { SEARCH_CUSTOMERS, tokenize } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Avatar, Badge, Button, Card, Chip, Empty, Input, ListRow, Row, Screen, Text } from '@/ui';
import { space } from '@/ui/theme';

type Row_ = { id: string; code: string; name: string; business_name: string | null; mobile: string | null; city: string | null; customer_type: string; balance: number; credit_limit: number };
const TYPES = ['dealer', 'wholesale', 'workshop', 'retail', 'other'];

export default function CustomersScreen() {
  const router = useRouter();
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [type, setType] = useState<string | null>(null);
  const tokens = useMemo(() => tokenize(q), [q]);
  const sq = SEARCH_CUSTOMERS(tokens.length ? tokens : [' '], 500);
  const { data: hits } = useQuery<Row_>(sq.sql, sq.params);
  const { data: all } = useQuery<Row_>(`
    SELECT c.id, c.code, c.name, c.business_name, c.mobile, c.city, c.customer_type, c.credit_limit, COALESCE(pb.balance, 0) AS balance
    FROM customers c LEFT JOIN party_balance_live pb ON pb.party_type = 'customer' AND pb.party_id = c.id
    WHERE c.is_active = 1 ORDER BY c.name`);
  const rows = (tokens.length ? hits : all) ?? [];
  const visible = rows.filter((r) => !type || r.customer_type === type);
  const totalDue = visible.reduce((a, r) => a + Math.max(r.balance, 0), 0);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Grahak</Text>
        {can('party.edit') ? <Button title="Naya grahak" onPress={() => router.push('/customer/edit')} /> : null}
      </Row>
      <Input value={q} onChangeText={setQ} placeholder="Naam, firm, mobile, GSTIN, shehar" autoCapitalize="none" />
      <Row gap={space.xs} wrap>
        <Chip label={`All · ${rows.length}`} selected={!type} onPress={() => setType(null)} />
        {TYPES.map((tp) => (
          <Chip key={tp} label={tp} selected={type === tp} onPress={() => setType(type === tp ? null : tp)} />
        ))}
      </Row>
      {can('reports.view') || can('payment.receive') ? (
        <Text variant="small" color="textMuted">
          {visible.length} grahak se kul baaki: <Text variant="small" mono>{formatINR(totalDue)}</Text>
        </Text>
      ) : null}
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {visible.map((c) => (
          <ListRow
            key={c.id}
            left={<Avatar name={c.name} size={38} />}
            title={c.name}
            subtitle={[c.business_name && c.business_name !== c.name ? c.business_name : null, c.mobile, c.city].filter(Boolean).join(' · ')}
            onPress={() => router.push(`/customer/${c.id}`)}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                <Badge tone={c.customer_type === 'retail' ? 'neutral' : 'info'}>{c.customer_type}</Badge>
                {c.balance ? <Text variant="small" mono color={c.balance > 0 ? 'warn' : 'ok'}>{formatINR(c.balance)}</Text> : null}
              </View>
            }
          />
        ))}
        {visible.length === 0 ? <Empty title="Koi grahak nahi mila" /> : null}
      </Card>
    </Screen>
  );
}
