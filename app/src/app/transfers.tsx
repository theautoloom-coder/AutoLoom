import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/session';
import { Badge, Button, Card, Empty, ListRow, Row, Screen, Text } from '@/ui';

type T = { id: string; doc_no: string | null; doc_date: string; status: string; from_name: string; to_name: string; lines: number; units: number };

export default function TransfersScreen() {
  const router = useRouter();
  const { can } = useSession();
  const { data: rows } = useQuery<T>(`
    SELECT t.id, t.doc_no, t.doc_date, t.status, f.name AS from_name, o.name AS to_name,
           (SELECT COUNT(*) FROM stock_transfer_lines l WHERE l.transfer_id = t.id) AS lines,
           COALESCE((SELECT SUM(qty) FROM stock_transfer_lines l WHERE l.transfer_id = t.id), 0) AS units
    FROM stock_transfers t JOIN locations f ON f.id = t.from_location_id JOIN locations o ON o.id = t.to_location_id
    ORDER BY CASE t.status WHEN 'draft' THEN 0 WHEN 'dispatched' THEN 1 ELSE 2 END, t.doc_date DESC, t.created_at DESC LIMIT 200`);
  const tone = (s: string) => (s === 'received' ? 'ok' : s === 'dispatched' ? 'warn' : s === 'cancelled' ? 'danger' : 'neutral');

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Transfers</Text>
        {can('stock.transfer') ? <Button title="New transfer" onPress={() => router.push('/transfer/edit')} /> : null}
      </Row>
      <Text variant="small" color="textMuted">Stock leaves the source when dispatched and arrives at the destination when received, so goods in a van show as in transit.</Text>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {(rows ?? []).map((t) => (
          <ListRow key={t.id} title={`${t.from_name} → ${t.to_name}`} subtitle={`${t.doc_no ?? 'Draft'} · ${t.doc_date} · ${t.lines} lines · ${Math.round(t.units)} units`}
            onPress={() => router.push(t.status === 'draft' ? `/transfer/edit?id=${t.id}` : `/transfer/${t.id}`)}
            right={<View style={{ alignItems: 'flex-end' }}><Badge tone={tone(t.status)}>{t.status === 'dispatched' ? 'in transit' : t.status}</Badge></View>} />
        ))}
        {(rows ?? []).length === 0 ? <Empty title="No transfers yet" /> : null}
      </Card>
    </Screen>
  );
}
