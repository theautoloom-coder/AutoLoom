import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINRShort, stockStatus } from '@domain';

import { LOW_STOCK, SEARCH_VARIANTS, STOCK_VALUE_BY_LOCATION, tokenize } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Empty, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { space } from '@/ui/theme';

type LowRow = { id: string; sku: string; variant_name: string; product_name: string; family_name: string | null; qty: number; min_stock: number; reorder_level: number; reorder_qty: number };
type LocRow = { id: string; code: string; name: string; type: string; value: number; units: number };
type VariantHit = { id: string; sku: string; variant_name: string; product_id: string; product_name: string; family_name: string | null; qty: number; min_stock: number; reorder_level: number };

export default function StockScreen() {
  const router = useRouter();
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [family, setFamily] = useState<string | null>(null);

  const tokens = useMemo(() => tokenize(q), [q]);
  const sq = SEARCH_VARIANTS(tokens.length ? tokens : [' '], 60);
  const { data: hits } = useQuery<VariantHit>(sq.sql, sq.params);

  const { data: low } = useQuery<LowRow>(LOW_STOCK(200).sql);
  const { data: locations } = useQuery<LocRow>(STOCK_VALUE_BY_LOCATION.sql);
  const { data: faulty } = useQuery<{ id: string; sku: string; variant_name: string; product_name: string; qty: number }>(
    `SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name, s.qty FROM stock_on_hand s JOIN locations l ON l.id = s.location_id AND l.type = 'damaged'
     JOIN product_variants pv ON pv.id = s.variant_id JOIN products p ON p.id = pv.product_id WHERE s.qty > 0 ORDER BY s.qty DESC`);

  const families = useMemo(() => [...new Set((low ?? []).map((r) => r.family_name).filter(Boolean) as string[])].sort(), [low]);
  const lowFiltered = (low ?? []).filter((r) => !family || r.family_name === family);
  const showMoney = can('catalog.view_cost');

  return (
    <Screen>
      <Text variant="display">Stock</Text>

      <Input value={q} onChangeText={setQ} placeholder="SKU, barcode ya naam dhoondo" autoCapitalize="none" autoCorrect={false} />

      {/* The two things that actually happen every day, above everything the
          shop touches once a month. Before this the only way to put stock in
          was a full purchase bill, which is why nobody could find it. */}
      {tokens.length === 0 && (can('stock.adjust') || can('catalog.edit')) ? (
        <Row gap={space.sm}>
          {can('stock.adjust') ? (
            <Button title="Maal aaya" size="lg" style={{ flex: 1 }} onPress={() => router.push('/stock/add')} />
          ) : null}
          {can('catalog.edit') ? (
            <Button title="Naya item" tone="secondary" size="lg" style={{ flex: 1 }} onPress={() => router.push('/admin/item')} />
          ) : null}
        </Row>
      ) : null}

      {tokens.length > 0 ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {hits && hits.length > 0 ? (
            hits.map((v) => {
              const s = stockStatus(v.qty, v.min_stock, v.reorder_level);
              return (
                <ListRow
                  key={v.id}
                  title={`${v.product_name} · ${v.variant_name}`}
                  subtitle={v.sku}
                  onPress={() => router.push(`/product/${v.product_id}?variant=${v.id}`)}
                  right={
                    <Text mono color={s === 'out' ? 'danger' : s === 'low' ? 'warn' : 'ok'}>
                      {v.qty}
                    </Text>
                  }
                />
              );
            })
          ) : (
            <Empty title="Kuch nahi mila" />
          )}
        </Card>
      ) : (
        <>
          <SectionTitle>Kahan kitna</SectionTitle>
          <Row gap={space.md} wrap align="stretch">
            {(locations ?? []).map((l) => (
              <Card key={l.id} style={{ flex: 1, minWidth: 140 }}>
                <Text variant="label" color="textMuted">
                  {l.name}
                </Text>
                <Text variant="number">{Math.round(l.units)}</Text>
                <Text variant="small" color="textFaint">
                  units{showMoney ? ` · ${formatINRShort(l.value)}` : ''}
                </Text>
              </Card>
            ))}
          </Row>

          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {can('purchase.create') ? <ListRow title="Purchase bill" subtitle="Supplier ka bill — rate, udhaar, sab" onPress={() => router.push('/purchase/edit')} /> : null}
            {can('purchase.create') ? <ListRow title="Purchase" subtitle="Bill, return, kitna baaki hai" onPress={() => router.push('/purchases')} /> : null}
            {can('stock.transfer') ? <ListRow title="Transfer" subtitle="Godown ↔ dukan ↔ workshop" onPress={() => router.push('/transfers')} /> : null}
            {can('stock.count') || can('stock.adjust') ? <ListRow title="Adjustment" subtitle="Damage, kam nikla, extra mila" onPress={() => router.push('/adjustments')} /> : null}
            {can('stock.count') ? <ListRow title="Stock ginti" subtitle="Poora stock mila ke dekho" onPress={() => router.push('/audits')} /> : null}
            {can('payment.pay_supplier') ? <ListRow title="Payment" subtitle="Aaya hua paisa, supplier ko diya" onPress={() => router.push('/payments')} /> : null}
            {can('purchase.create') || can('reports.view') ? <ListRow title="Kya mangwana hai" subtitle="Bikri dekh kar batata hai kya mangwana hai" onPress={() => router.push('/reorder')} /> : null}
            {can('jobcard.edit') ? <ListRow title="Job card" subtitle="Gaadi ka kaam — parts + labour" onPress={() => router.push('/job-cards')} /> : null}
          </Card>

          <SectionTitle right={<Badge tone={(faulty ?? []).length ? 'danger' : 'ok'}>{(faulty ?? []).reduce((a, f) => a + f.qty, 0)} pcs</Badge>}>Kharab / damaged maal</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {(faulty ?? []).map((f) => (
              <ListRow key={f.id} title={`${f.product_name} · ${f.variant_name}`} subtitle={f.sku} onPress={() => router.push(`/stock/ledger/${f.id}`)} right={<Text mono color="danger">{f.qty}</Text>} />
            ))}
            {(faulty ?? []).length === 0 ? <Empty title="Koi kharab maal nahi" hint="Kharab nishaan laga hua wapas maal yahan aata hai aur bechne wale stock mein dobara nahi jaata." /> : null}
          </Card>

          <SectionTitle right={<Badge tone={lowFiltered.length ? 'warn' : 'ok'}>{lowFiltered.length} items</Badge>}>Khatam hone wala hai</SectionTitle>
          {families.length > 1 ? (
            <Row gap={space.xs} wrap>
              <Chip label="Sab" selected={!family} onPress={() => setFamily(null)} />
              {families.map((f) => (
                <Chip key={f} label={f} selected={family === f} onPress={() => setFamily(family === f ? null : f)} />
              ))}
            </Row>
          ) : null}
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {lowFiltered.length > 0 ? (
              lowFiltered.map((v) => (
                <ListRow
                  key={v.id}
                  title={`${v.product_name} · ${v.variant_name}`}
                  subtitle={`${v.sku}${v.reorder_qty ? ` · suggest ${v.reorder_qty}` : ''}`}
                  onPress={() => router.push(`/product/${encodeURIComponent(v.sku)}?by=sku`)}
                  right={
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text mono color={v.qty <= 0 ? 'danger' : 'warn'}>
                        {v.qty} / {Math.max(v.min_stock, v.reorder_level)}
                      </Text>
                      <Text variant="small" color="textFaint">
                        hai / kam se kam
                      </Text>
                    </View>
                  }
                />
              ))
            ) : (
              <Empty title="Sab theek hai — kuch khatam nahi ho raha" />
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
