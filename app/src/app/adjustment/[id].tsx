import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR, statusLabel } from '@domain';

import { reverseMovements } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { updateRow } from '@/lib/writes';
import { Badge, Button, Card, Empty, KV, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';

type A = { id: string; doc_no: string | null; doc_date: string; reason: string; status: string; notes: string | null; location_name: string; posted_at: string | null; approved_name: string | null };
type L = { id: string; qty_delta: number; unit_cost: number; reason_code: string | null; note: string | null; description: string; sku: string; variant_id: string; product_id: string };

export default function AdjustmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const [busy, setBusy] = useState(false);
  const { data: rows } = useQuery<A>('SELECT a.*, l.name AS location_name, pr.full_name AS approved_name FROM stock_adjustments a JOIN locations l ON l.id = a.location_id LEFT JOIN profiles pr ON pr.id = a.approved_by WHERE a.id = ?', [id]);
  const a = rows?.[0];
  const { data: lines } = useQuery<L>(`SELECT l.*, p.name || ' ' || pv.variant_name AS description, pv.sku, pv.product_id FROM stock_adjustment_lines l JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id WHERE l.adjustment_id = ? ORDER BY l.created_at`, [id]);

  async function cancel() {
    if (!a || !(await confirm('Ye adjustment wapas lein?', 'A reversing movement is written for every line. The original stays in the log.'))) return;
    setBusy(true);
    try {
      await db.writeTransaction(async (tx) => { await reverseMovements(tx, 'stock_adjustment', a.id, actor); await updateRow(tx, 'stock_adjustments', a.id, { status: 'cancelled' }); });
      notify('Wapas le liya.');
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  if (!a) return <Screen><Empty title="Ye adjustment is phone par nahi mila" /></Screen>;
  const value = (lines ?? []).reduce((s, l) => s + l.qty_delta * l.unit_cost, 0);

  return (
    <>
      <Stack.Screen options={{ title: a.doc_no ?? 'Adjustment' }} />
      <Screen>
        <Badge tone={a.status === 'posted' ? 'ok' : a.status === 'cancelled' ? 'danger' : 'neutral'}>{statusLabel(a.status)}</Badge>
        <Text variant="display">{a.reason.replace('_', ' ')} · {a.location_name}</Text>
        <Card style={{ gap: 0 }}>
          <KV k="Number" v={a.doc_no ?? '—'} mono />
          <KV k="Date" v={a.doc_date} />
          {a.approved_name ? <KV k="Kisne post kiya" v={a.approved_name} /> : null}
          {a.notes ? <KV k="Note" v={a.notes} /> : null}
          {can('catalog.view_cost') ? <KV k="Keemat ka farak" v={formatINR(value)} mono /> : null}
        </Card>
        {a.status === 'posted' && can('stock.adjust') ? <Button title="Adjustment wapas lo" tone="danger" onPress={cancel} loading={busy} /> : null}
        <SectionTitle>Item</SectionTitle>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(lines ?? []).map((l) => (
            <ListRow key={l.id} title={l.description} subtitle={`${l.sku}${l.note ? ` · ${l.note}` : ''}`} onPress={() => router.push(`/product/${l.product_id}?variant=${l.variant_id}`)}
              right={<View style={{ alignItems: 'flex-end' }}><Text mono color={l.qty_delta < 0 ? 'danger' : 'ok'}>{l.qty_delta > 0 ? '+' : ''}{l.qty_delta}</Text></View>} />
          ))}
        </Card>
      </Screen>
    </>
  );
}
