import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Empty, ListRow, Row, Screen, Text } from '@/ui';
import { space } from '@/ui/theme';

type P = { id: string; doc_type: string; doc_no: string | null; doc_date: string; supplier_invoice_no: string | null; grand_total: number; paid_total: number; status: string; supplier_name: string; location_name: string; lines: number };

export default function PurchasesScreen() {
  const router = useRouter();
  const { can } = useSession();
  const [filter, setFilter] = useState<'all' | 'draft' | 'unpaid' | 'returns'>('all');
  const { data: rows } = useQuery<P>(`
    SELECT p.id, p.doc_type, p.doc_no, p.doc_date, p.supplier_invoice_no, p.grand_total, p.paid_total, p.status, s.name AS supplier_name, l.name AS location_name,
           (SELECT COUNT(*) FROM purchase_lines pl WHERE pl.purchase_id = p.id) AS lines
    FROM purchases p JOIN suppliers s ON s.id = p.supplier_id JOIN locations l ON l.id = p.location_id
    ORDER BY p.status = 'draft' DESC, p.doc_date DESC, p.created_at DESC LIMIT 200`);
  const visible = (rows ?? []).filter((p) =>
    filter === 'all' ? true : filter === 'draft' ? p.status === 'draft' : filter === 'unpaid' ? p.status === 'posted' && p.doc_type === 'purchase' && p.paid_total < p.grand_total : p.doc_type === 'debit_note'
  );

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Purchase</Text>
        {can('purchase.create') ? <Button title="Purchase bill" onPress={() => router.push('/purchase/edit')} /> : null}
      </Row>
      <Row gap={space.xs} wrap>
        {(['all', 'draft', 'unpaid', 'returns'] as const).map((f) => <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />)}
      </Row>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {visible.map((p) => (
          <ListRow
            key={p.id}
            title={
              <Row gap={6}>
                <Text variant="heading">{p.doc_no ?? 'Draft'}</Text>
                {p.doc_type === 'debit_note' ? <Badge tone="info">return</Badge> : null}
              </Row>
            }
            subtitle={`${p.supplier_name} · ${p.doc_date}${p.supplier_invoice_no ? ` · bill ${p.supplier_invoice_no}` : ''} · ${p.lines} line${p.lines === 1 ? '' : 's'} · ${p.location_name}`}
            onPress={() => router.push(p.status === 'draft' ? `/purchase/edit?id=${p.id}` : `/purchase/${p.id}`)}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                <Text mono>{formatINR(p.grand_total)}</Text>
                <Badge tone={p.status === 'cancelled' ? 'danger' : p.status === 'draft' ? 'neutral' : p.paid_total >= p.grand_total ? 'ok' : 'warn'}>
                  {p.status === 'cancelled' ? 'cancelled' : p.status === 'draft' ? 'draft' : p.paid_total >= p.grand_total ? 'paid' : 'due'}
                </Badge>
              </View>
            }
          />
        ))}
        {visible.length === 0 ? <Empty title="Koi purchase nahi" hint="Purchase bill banao → supplier chuno → maal scan ya search karo → post kar do." /> : null}
      </Card>
    </Screen>
  );
}
