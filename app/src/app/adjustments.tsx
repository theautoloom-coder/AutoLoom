import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/session';
import { Badge, Button, Card, Empty, ListRow, Row, Screen, Text } from '@/ui';

type A = { id: string; doc_no: string | null; doc_date: string; reason: string; status: string; location_name: string; lines: number; delta: number; notes: string | null };

export default function AdjustmentsScreen() {
  const router = useRouter();
  const { can } = useSession();
  const { data: rows } = useQuery<A>(`
    SELECT a.id, a.doc_no, a.doc_date, a.reason, a.status, a.notes, l.name AS location_name,
           (SELECT COUNT(*) FROM stock_adjustment_lines x WHERE x.adjustment_id = a.id) AS lines,
           COALESCE((SELECT SUM(qty_delta) FROM stock_adjustment_lines x WHERE x.adjustment_id = a.id), 0) AS delta
    FROM stock_adjustments a JOIN locations l ON l.id = a.location_id
    ORDER BY a.status = 'draft' DESC, a.doc_date DESC, a.created_at DESC LIMIT 200`);
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Adjustments</Text>
        {can('stock.count') || can('stock.adjust') ? <Button title="New adjustment" onPress={() => router.push('/adjustment/edit')} /> : null}
      </Row>
      <Text variant="small" color="textMuted">Damage, missing, found, wrong entry. Anyone who counts can draft one; posting needs the stock.adjust permission and is logged.</Text>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {(rows ?? []).map((a) => (
          <ListRow key={a.id} title={`${a.reason.replace('_', ' ')} · ${a.location_name}`} subtitle={`${a.doc_no ?? 'Draft'} · ${a.doc_date} · ${a.lines} lines${a.notes ? ` · ${a.notes}` : ''}`}
            onPress={() => router.push(a.status === 'draft' ? `/adjustment/edit?id=${a.id}` : `/adjustment/${a.id}`)}
            right={<View style={{ alignItems: 'flex-end' }}><Text mono color={a.delta < 0 ? 'danger' : 'ok'}>{a.delta > 0 ? '+' : ''}{a.delta}</Text><Badge tone={a.status === 'posted' ? 'ok' : a.status === 'cancelled' ? 'danger' : 'neutral'}>{a.status}</Badge></View>} />
        ))}
        {(rows ?? []).length === 0 ? <Empty title="No adjustments" /> : null}
      </Card>
    </Screen>
  );
}
