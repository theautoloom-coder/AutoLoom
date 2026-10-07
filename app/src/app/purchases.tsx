import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { useSession } from '@/lib/session';
import { dayLabel } from '@/lib/words';
import { Badge, Button, Card, Chip, Empty, ListRow, Row, Screen, Text } from '@/ui';
import { space } from '@/ui/theme';

type P = { id: string; doc_type: string; doc_no: string | null; doc_date: string; supplier_invoice_no: string | null; grand_total: number; paid_total: number; status: string; supplier_name: string; location_name: string; lines: number };

export default function PurchasesScreen() {
  const router = useRouter();
  const { can } = useSession();
  const [filter, setFilter] = useState<'all' | 'draft' | 'unpaid' | 'returns'>('all');
  // A supplier bill's amount is what the maal cost: partners only. Staff see
  // what came, from whom, and whether it is still waiting for approval.
  const showCost = can('catalog.view_cost');
  const { data: rows } = useQuery<P & { submitted_at: string | null }>(`
    SELECT p.id, p.doc_type, p.doc_no, p.doc_date, p.supplier_invoice_no, p.grand_total, p.paid_total, p.status, p.submitted_at, s.name AS supplier_name, l.name AS location_name,
           (SELECT COUNT(*) FROM purchase_lines pl WHERE pl.purchase_id = p.id) AS lines
    FROM purchases p JOIN suppliers s ON s.id = p.supplier_id JOIN locations l ON l.id = p.location_id
    ORDER BY p.status = 'draft' DESC, p.doc_date DESC, p.created_at DESC LIMIT 200`);
  const visible = (rows ?? []).filter((p) =>
    filter === 'all' ? true : filter === 'draft' ? p.status === 'draft' : filter === 'unpaid' ? p.status === 'posted' && p.doc_type === 'purchase' && p.paid_total < p.grand_total : p.doc_type === 'debit_note'
  );

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Supplier se aaya maal</Text>
        {can('purchase.create') ? <Button title="Maal aaya" onPress={() => router.push('/stock/add')} /> : null}
      </Row>
      <Row gap={space.xs} wrap>
        {(showCost ? (['all', 'draft', 'unpaid', 'returns'] as const) : (['all', 'draft', 'returns'] as const)).map((f) => <Chip key={f} label={({ all: 'Sab', draft: 'Adhoore', unpaid: 'Dena baaki', returns: 'Wapsi' } as const)[f]} selected={filter === f} onPress={() => setFilter(f)} />)}
      </Row>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {visible.map((p) => (
          <ListRow
            key={p.id}
            title={
              <Row gap={6}>
                <Text variant="heading">{p.doc_no ?? 'Adhoori entry'}</Text>
                {p.doc_type === 'debit_note' ? <Badge tone="info">wapsi</Badge> : null}
              </Row>
            }
            subtitle={`${p.supplier_name} · ${dayLabel(p.doc_date)}${p.supplier_invoice_no ? ` · unka bill ${p.supplier_invoice_no}` : ''} · ${p.lines} item · ${p.location_name}`}
            onPress={() => router.push(p.status === 'draft' ? `/purchase/edit?id=${p.id}` : `/purchase/${p.id}`)}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                {showCost ? <Text mono>{formatINR(p.grand_total)}</Text> : null}
                {p.status === 'draft' && p.submitted_at ? (
                  <Badge tone="warn">approval baaki</Badge>
                ) : showCost ? (
                  <Badge tone={p.status === 'cancelled' ? 'danger' : p.status === 'draft' ? 'neutral' : p.paid_total >= p.grand_total ? 'ok' : 'warn'}>
                    {p.status === 'cancelled' ? (p.doc_no ? 'cancel' : 'mana kiya') : p.status === 'draft' ? 'adhoora' : p.paid_total >= p.grand_total ? 'chuka diya' : 'dena baaki'}
                  </Badge>
                ) : (
                  <Badge tone={p.status === 'cancelled' ? 'danger' : p.status === 'draft' ? 'neutral' : 'ok'}>
                    {p.status === 'cancelled' ? (p.doc_no ? 'cancel' : 'mana kiya') : p.status === 'draft' ? 'adhoora' : 'stock mein'}
                  </Badge>
                )}
              </View>
            }
          />
        ))}
        {visible.length === 0 ? <Empty title="Abhi koi bill nahi" hint="“Maal aaya” dabao → supplier chuno → maal scan ya naam likho → chadha do." /> : null}
      </Card>
    </Screen>
  );
}
