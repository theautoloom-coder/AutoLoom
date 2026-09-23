import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR, movementLabel, type MovementType } from '@domain';

import { useSession } from '@/lib/session';
import { Badge, Card, Chip, Divider, Empty, Row, Screen, Text } from '@/ui';
import { space } from '@/ui/theme';

type V = { id: string; sku: string; variant_name: string; product_name: string; product_id: string };
type M = { id: string; qty: number; movement_type: MovementType; ref_type: string | null; ref_id: string | null; unit_cost: number; occurred_at: string; note: string | null; location_name: string; location_id: string; reversal_of_id: string | null; doc_no: string | null; by_name: string | null };

export default function StockLedger() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const [loc, setLoc] = useState<string | null>(null);
  const { data: vrows } = useQuery<V>('SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name, p.id AS product_id FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?', [id]);
  const v = vrows?.[0];
  const { data: locations } = useQuery<{ id: string; name: string }>('SELECT id, name FROM locations WHERE is_active = 1 ORDER BY sort_order');
  const { data: moves } = useQuery<M>(
    `SELECT m.*, l.name AS location_name, pr.full_name AS by_name,
            COALESCE((SELECT doc_no FROM purchases WHERE id = m.ref_id), (SELECT doc_no FROM sales_invoices WHERE id = m.ref_id), (SELECT doc_no FROM stock_transfers WHERE id = m.ref_id), (SELECT doc_no FROM stock_adjustments WHERE id = m.ref_id)) AS doc_no
     FROM stock_movements m JOIN locations l ON l.id = m.location_id LEFT JOIN profiles pr ON pr.id = m.created_by
     WHERE m.variant_id = ?1 AND (?2 = '' OR m.location_id = ?2) ORDER BY m.occurred_at DESC, m.created_at DESC LIMIT 500`, [id, loc ?? '']);

  // running balance computed oldest → newest
  let running = 0;
  const withBalance = [...(moves ?? [])].reverse().map((m) => { running += m.qty; return { ...m, balance: running }; }).reverse();

  function open(m: M) {
    if (!m.ref_id) return;
    if (m.ref_type === 'purchase') router.push(`/purchase/${m.ref_id}`);
    else if (m.ref_type === 'sales_invoice') router.push(`/invoice/${m.ref_id}`);
    else if (m.ref_type === 'stock_transfer') router.push(`/transfer/${m.ref_id}`);
    else if (m.ref_type === 'stock_adjustment') router.push(`/adjustment/${m.ref_id}`);
  }

  if (!v) return <Screen><Empty title="SKU not found" /></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: v.sku }} />
      <Screen>
        <Text variant="display">{v.product_name} · {v.variant_name}</Text>
        <Text color="textMuted" mono>{v.sku}</Text>
        <Row gap={space.xs} wrap>
          <Chip label="All locations" selected={!loc} onPress={() => setLoc(null)} />
          {(locations ?? []).map((l) => <Chip key={l.id} label={l.name} selected={loc === l.id} onPress={() => setLoc(l.id)} />)}
        </Row>
        <Card style={{ gap: 0 }}>
          <Row gap={space.sm} style={{ paddingVertical: 6 }}>
            <Text variant="label" color="textMuted" style={{ flex: 2 }}>Movement</Text>
            <Text variant="label" color="textMuted" style={{ width: 70, textAlign: 'right' }}>Qty</Text>
            <Text variant="label" color="textMuted" style={{ width: 70, textAlign: 'right' }}>Balance</Text>
          </Row>
          <Divider />
          {withBalance.length === 0 ? <Empty title="No movements" /> : null}
          {withBalance.map((m) => (
            <React.Fragment key={m.id}>
              <Row gap={space.sm} style={{ paddingVertical: 8 }} align="flex-start">
                <View style={{ flex: 2 }}>
                  <Row gap={6} wrap>
                    <Text variant="small" style={{ fontWeight: '600' }} onPress={() => open(m)} color={m.ref_id ? 'accent' : 'text'}>{movementLabel(m.movement_type)}{m.doc_no ? ` ${m.doc_no}` : ''}</Text>
                    {m.reversal_of_id ? <Badge tone="danger">reversal</Badge> : null}
                  </Row>
                  <Text variant="small" color="textFaint">{new Date(m.occurred_at).toLocaleString('en-IN')} · {m.location_name}{m.by_name ? ` · ${m.by_name}` : ''}{m.note ? ` · ${m.note}` : ''}{can('catalog.view_cost') && m.unit_cost ? ` · @ ${formatINR(m.unit_cost)}` : ''}</Text>
                </View>
                <Text variant="small" mono style={{ width: 70, textAlign: 'right' }} color={m.qty < 0 ? 'danger' : 'ok'}>{m.qty > 0 ? '+' : ''}{m.qty}</Text>
                <Text variant="small" mono style={{ width: 70, textAlign: 'right', fontWeight: '600' }}>{loc ? m.balance : ''}</Text>
              </Row>
              <Divider />
            </React.Fragment>
          ))}
        </Card>
        {!loc ? <Text variant="small" color="textFaint">Pick a location to see the running balance.</Text> : null}
      </Screen>
    </>
  );
}
