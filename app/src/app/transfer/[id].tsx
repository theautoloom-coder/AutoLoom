import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { cancelTransfer, receiveTransfer } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { Badge, Button, Card, Empty, KV, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type T = { id: string; doc_no: string | null; doc_date: string; status: string; notes: string | null; from_name: string; to_name: string; dispatched_at: string | null; received_at: string | null };
type L = { id: string; qty: number; description: string; sku: string; unit_cost: number };

export default function TransferDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const [busy, setBusy] = useState(false);
  const { data: rows } = useQuery<T>('SELECT t.*, f.name AS from_name, o.name AS to_name FROM stock_transfers t JOIN locations f ON f.id = t.from_location_id JOIN locations o ON o.id = t.to_location_id WHERE t.id = ?', [id]);
  const t = rows?.[0];
  const { data: lines } = useQuery<L>(`SELECT l.id, l.qty, l.unit_cost, p.name || ' ' || pv.variant_name AS description, pv.sku FROM stock_transfer_lines l JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id WHERE l.transfer_id = ? ORDER BY l.created_at`, [id]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); notify(label); } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  if (!t) return <Screen><Empty title="Ye transfer is phone par nahi mila" /></Screen>;
  const tone = t.status === 'received' ? 'ok' : t.status === 'dispatched' ? 'warn' : t.status === 'cancelled' ? 'danger' : 'neutral';

  return (
    <>
      <Stack.Screen options={{ title: t.doc_no ?? 'Transfer' }} />
      <Screen>
        <Badge tone={tone}>{t.status === 'dispatched' ? 'in transit' : t.status}</Badge>
        <Text variant="display">{t.from_name} → {t.to_name}</Text>
        <Card style={{ gap: 0 }}>
          <KV k="Number" v={t.doc_no ?? '—'} mono />
          <KV k="Date" v={t.doc_date} />
          {t.dispatched_at ? <KV k="Bhej diya" v={new Date(t.dispatched_at).toLocaleString('en-IN')} /> : null}
          {t.received_at ? <KV k="Aa gaya" v={new Date(t.received_at).toLocaleString('en-IN')} /> : null}
          {t.notes ? <KV k="Note" v={t.notes} /> : null}
        </Card>
        {t.status === 'dispatched' && can('stock.transfer') ? (
          <Row gap={space.sm}>
            <Button title={`Receive at ${t.to_name}`} size="lg" style={{ flex: 1 }} loading={busy} onPress={async () => { if (await confirm('Transfer le lein?', 'Stock arrives at the destination now.')) run('Received.', () => db.writeTransaction((tx) => receiveTransfer(tx, t.id, actor))); }} />
            <Button title="Rehne do" tone="danger" onPress={async () => { if (await confirm('Transfer cancel karein?', 'Stock returns to the source.')) run('Cancel ho gaya.', () => db.writeTransaction((tx) => cancelTransfer(tx, t.id, actor))); }} />
          </Row>
        ) : null}
        <SectionTitle>Maal</SectionTitle>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(lines ?? []).map((l) => <ListRow key={l.id} title={l.description} subtitle={l.sku} right={<View style={{ alignItems: 'flex-end' }}><Text mono>{l.qty}</Text></View>} />)}
        </Card>
      </Screen>
    </>
  );
}
