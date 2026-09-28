/**
 * Stock — godown mein kitna maal hai.
 *
 * This used to be a menu: a search box, four numbers, and then a list of nine
 * other screens you could go to. The one thing a person opens "Stock" to see —
 * the maal itself — was the last thing on it, and only if you typed something
 * first.
 *
 * Now it is the list. Search narrows it, three chips filter it, and every row
 * answers the questions actually asked at a counter: what is it, how many are
 * left, what did it cost, what do we sell it for. The screens that used to
 * clutter this one are in "Aur", which is where you go when you are not doing
 * the daily thing.
 */
import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR, formatINRShort } from '@domain';

import { SEARCH_VARIANTS, STOCK_VALUE_BY_LOCATION, tokenize } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Badge, Card, Chip, Empty, Input, ListRow, Row, Screen, SectionTitle, StatTile, Text, type IconName } from '@/ui';
import { ItemPhoto } from '@/ui/photo';
import { space } from '@/ui/theme';

const LOCATION_LOOK: Record<string, { icon: IconName; accent: string }> = {
  warehouse: { icon: 'business-outline', accent: 'blue' },
  shop: { icon: 'storefront-outline', accent: 'green' },
  workshop: { icon: 'construct-outline', accent: 'violet' },
  damaged: { icon: 'alert-circle-outline', accent: 'amber' },
};

type Row = {
  id: string;
  sku: string;
  variant_name: string;
  product_id: string;
  product_name: string;
  qty: number;
  min_stock: number;
  reorder_level: number;
  avg_cost: number;
  last_purchase_cost: number;
  retail_price: number;
  photo_path: string | null;
};
type LocRow = { id: string; code: string; name: string; type: string; value: number; units: number };

type Filter = 'sab' | 'low' | 'khatam';

export default function StockScreen() {
  const router = useRouter();
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('sab');

  const tokens = useMemo(() => tokenize(q), [q]);
  // A blank search lists everything: the maal is the point of this screen, so
  // it is shown before anybody types.
  const sq = SEARCH_VARIANTS(tokens.length ? tokens : [' '], 300);
  const { data: rows } = useQuery<Row>(sq.sql, sq.params);
  const { data: locations } = useQuery<LocRow>(STOCK_VALUE_BY_LOCATION.sql);
  const { data: negative } = useQuery<{ id: string; sku: string; product_name: string; variant_name: string; location: string; qty: number; photo_path: string | null }>(
    `SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name, l.name AS location, s.qty,
            (SELECT pi.storage_path FROM product_images pi WHERE pi.variant_id = pv.id ORDER BY pi.sort_order LIMIT 1) AS photo_path
       FROM stock_on_hand s
       JOIN locations l ON l.id = s.location_id
       JOIN product_variants pv ON pv.id = s.variant_id
       JOIN products p ON p.id = pv.product_id
      WHERE s.qty < 0 ORDER BY s.qty`);

  const showCost = can('catalog.view_cost');

  const all = rows ?? [];
  const counts = {
    sab: all.length,
    low: all.filter((r) => r.qty > 0 && r.qty <= Math.max(r.min_stock, r.reorder_level)).length,
    khatam: all.filter((r) => r.qty <= 0).length,
  };
  const shown = all.filter((r) =>
    filter === 'low' ? r.qty > 0 && r.qty <= Math.max(r.min_stock, r.reorder_level)
    : filter === 'khatam' ? r.qty <= 0
    : true
  );

  return (
    <Screen>
      <View>
        <Text variant="display">Stock</Text>
        <Text variant="small" color="textMuted">
          Godown mein kitna maal hai.
        </Text>
      </View>

      <Input value={q} onChangeText={setQ} placeholder="SKU, barcode ya naam dhoondo" autoCapitalize="none" autoCorrect={false} />

      <Row gap={space.xs} wrap>
        <Chip label={`Sab ${counts.sab}`} selected={filter === 'sab'} onPress={() => setFilter('sab')} />
        <Chip label={`Kam hai ${counts.low}`} selected={filter === 'low'} onPress={() => setFilter('low')} />
        <Chip label={`Khatam ${counts.khatam}`} selected={filter === 'khatam'} onPress={() => setFilter('khatam')} />
      </Row>

      {/* Sold from a place it never arrived at. Left alone it quietly becomes
          the truth, so it sits above the list until somebody settles it. */}
      {(negative ?? []).length > 0 ? (
        <>
          <SectionTitle right={<Badge tone="danger">{(negative ?? []).length}</Badge>}>Gadbad — stock minus mein hai</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {(negative ?? []).map((n) => (
              <ListRow
                key={`${n.id}-${n.location}`}
                left={<ItemPhoto path={n.photo_path} name={n.product_name} size={40} />}
                title={`${n.product_name} · ${n.variant_name}`}
                subtitle={`${n.location} — becha gaya par yahan aaya nahi`}
                onPress={() => router.push(`/stock/ledger/${n.id}`)}
                right={<Text mono color="danger">{n.qty}</Text>}
              />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Maal kahan pada hai</SectionTitle>
      <Row gap={space.md} wrap align="stretch">
        {(locations ?? []).map((l) => (
          <View key={l.id} style={{ flex: 1, minWidth: 150 }}>
            <StatTile
              label={l.name}
              value={String(Math.round(l.units))}
              sub={`pcs${showCost ? ` · ${formatINRShort(l.value)}` : ''}`}
              icon={(LOCATION_LOOK[l.type] ?? { icon: 'cube-outline' as IconName }).icon}
              accent={(LOCATION_LOOK[l.type] ?? { accent: 'teal' }).accent}
              tone={l.units < 0 ? 'danger' : undefined}
            />
          </View>
        ))}
      </Row>

      <SectionTitle right={<Text variant="small" color="textFaint">{shown.length}</Text>}>
        {filter === 'low' ? 'Kam hai' : filter === 'khatam' ? 'Khatam ho gaya' : 'Saara maal'}
      </SectionTitle>

      {shown.length === 0 ? (
        <Empty
          title={q ? 'Kuch nahi mila' : filter === 'sab' ? 'Abhi koi maal add nahi hua' : 'Yahan kuch nahi'}
          hint={q ? 'Naam, SKU ya barcode se dhoondo.' : filter === 'sab' ? 'Neeche “+” dabao aur “Maal Aaya” se shuru karo.' : undefined}
        />
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {shown.map((r) => {
            const out = r.qty <= 0;
            const low = !out && r.qty <= Math.max(r.min_stock, r.reorder_level);
            return (
              <ListRow
                key={r.id}
                left={<ItemPhoto path={r.photo_path} name={r.product_name} size={44} />}
                title={`${r.product_name} · ${r.variant_name}`}
                subtitle={
                  <Row gap={space.sm} wrap>
                    <Text variant="small" color="textFaint" mono>{r.sku}</Text>
                    {showCost ? (
                      <Text variant="small" color="textMuted">
                        Kharid {formatINR(r.avg_cost || r.last_purchase_cost)}
                      </Text>
                    ) : null}
                    <Text variant="small" color="textMuted">Bechna {formatINR(r.retail_price)}</Text>
                  </Row>
                }
                onPress={() => router.push(`/product/${r.product_id}?variant=${r.id}`)}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text mono color={out ? 'danger' : low ? 'warn' : 'ok'}>{r.qty}</Text>
                    <Text variant="small" color="textFaint">pcs</Text>
                  </View>
                }
              />
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
