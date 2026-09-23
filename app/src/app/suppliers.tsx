import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { useSession } from '@/lib/session';
import { Avatar, Button, Card, Empty, Input, ListRow, Row, Screen, Text } from '@/ui';

type Row_ = { id: string; code: string; name: string; company_name: string | null; mobile: string | null; city: string | null; balance: number; search_text: string };

export default function SuppliersScreen() {
  const router = useRouter();
  const { can } = useSession();
  const [q, setQ] = useState('');
  const { data: all } = useQuery<Row_>(`
    SELECT s.id, s.code, s.name, s.company_name, s.mobile, s.city, s.search_text, COALESCE(pb.balance, 0) AS balance
    FROM suppliers s LEFT JOIN party_balance_live pb ON pb.party_type = 'supplier' AND pb.party_id = s.id
    WHERE s.is_active = 1 ORDER BY s.name`);
  const visible = (all ?? []).filter((s) => !q || s.search_text.includes(q.toLowerCase()));
  const payable = visible.reduce((a, s) => a + Math.max(s.balance, 0), 0);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Supplier</Text>
        {can('party.edit') ? <Button title="Naya supplier" onPress={() => router.push('/supplier/edit')} /> : null}
      </Row>
      <Input value={q} onChangeText={setQ} placeholder="Naam, firm, mobile, GSTIN, shehar" autoCapitalize="none" />
      {can('reports.view') || can('payment.pay_supplier') ? (
        <Text variant="small" color="textMuted">
          {visible.length} supplier ko kul dena: <Text variant="small" mono>{formatINR(payable)}</Text>
        </Text>
      ) : null}
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {visible.map((s) => (
          <ListRow
            key={s.id}
            left={<Avatar name={s.name} size={38} tone="neutral" />}
            title={s.name}
            subtitle={[s.company_name && s.company_name !== s.name ? s.company_name : null, s.mobile, s.city].filter(Boolean).join(' · ')}
            onPress={() => router.push(`/supplier/${s.id}`)}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                {s.balance ? <Text mono color={s.balance > 0 ? 'warn' : 'ok'}>{formatINR(s.balance)}</Text> : <Text variant="small" color="textFaint">chukta</Text>}
              </View>
            }
          />
        ))}
        {visible.length === 0 ? <Empty title="Koi supplier nahi mila" /> : null}
      </Card>
    </Screen>
  );
}
