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

import { PHOTO_OF, SEARCH_VARIANTS, STOCK_VALUE_BY_LOCATION, tokenize } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Badge, Card, Chip, Empty, Grid, Input, ListRow, Row, Screen, SectionTitle, StatTile, Text } from '@/ui';
import { ItemPhoto } from '@/ui/photo';
import { Skeleton, SkeletonList, SkeletonTile } from '@/ui/skeleton';
import { radius, space } from '@/ui/theme';

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
  /** "H4 · 60/55W" — the specs that tell two bulbs apart. */
  specs: string | null;
  /** "Creta 2019–2023, Venue" — which cars it goes on. */
  fits: string | null;
  family_name: string | null;
};
type LocRow = { id: string; code: string; name: string; type: string; value: number; units: number };

type Filter = 'sab' | 'low' | 'khatam' | 'rate';

export default function StockScreen() {
  const router = useRouter();
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('sab');

  const tokens = useMemo(() => tokenize(q), [q]);
  // A blank search lists everything: the maal is the point of this screen, so
  // it is shown before anybody types.
  const sq = SEARCH_VARIANTS(tokens.length ? tokens : [' '], 300);
  // `isLoading` is the only honest signal here. PowerSync hands back
  // `data: []` while the first read is still in flight, so an empty array
  // means "nothing yet" and "nothing at all" at the same time — and the
  // screen was picking the second reading every time it opened.
  const { data: rows, isLoading: rowsLoading } = useQuery<Row>(sq.sql, sq.params);
  const { data: locations, isLoading: locationsLoading } = useQuery<LocRow>(STOCK_VALUE_BY_LOCATION.sql);
  const { data: waiting } = useQuery<{ n: number }>(
    `SELECT COUNT(*) AS n FROM purchases WHERE status = 'draft' AND submitted_at IS NOT NULL`);
  const waitingCount = waiting?.[0]?.n ?? 0;
  const { data: negative } = useQuery<{ id: string; sku: string; product_name: string; variant_name: string; location: string; qty: number; photo_path: string | null }>(
    `SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name, l.name AS location, s.qty,
            ${PHOTO_OF('p', 'pv')} AS photo_path
       FROM stock_on_hand s
       JOIN locations l ON l.id = s.location_id
       JOIN product_variants pv ON pv.id = s.variant_id
       JOIN products p ON p.id = pv.product_id
      WHERE s.qty < 0 ORDER BY s.qty`);

  const showCost = can('catalog.view_cost');
  const godown = (locations ?? []).find((l) => l.type !== 'damaged');
  const kharab = (locations ?? []).find((l) => l.type === 'damaged');

  const all = rows ?? [];
  const counts = {
    sab: all.length,
    low: all.filter((r) => r.qty > 0 && r.qty <= Math.max(r.min_stock, r.reorder_level)).length,
    khatam: all.filter((r) => r.qty <= 0).length,
    // Maal in the shop with no buy rate yet — put in by staff, who do not
    // price. Until the owner fills it in, each sale of it reads as all profit.
    rate: all.filter((r) => r.qty > 0 && !r.avg_cost && !r.last_purchase_cost).length,
  };
  const shown = all.filter((r) =>
    filter === 'low' ? r.qty > 0 && r.qty <= Math.max(r.min_stock, r.reorder_level)
    : filter === 'khatam' ? r.qty <= 0
    : filter === 'rate' ? r.qty > 0 && !r.avg_cost && !r.last_purchase_cost
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

      {/* The chips carry counts, and a count of zero on an unfinished query is
          not a count — it is a wrong answer in a confident font. Grey pills
          until the numbers are real. The search box above stays live
          throughout: you can start typing the SKU before the list lands. */}
      {rowsLoading ? (
        <Row gap={space.xs} wrap>
          {[78, 104, 96].map((w) => (
            <Skeleton key={w} width={w} height={34} radius={radius.pill} />
          ))}
        </Row>
      ) : (
        <Row gap={space.xs} wrap>
          <Chip label={`Sab ${counts.sab}`} selected={filter === 'sab'} onPress={() => setFilter('sab')} />
          <Chip label={`Kam hai ${counts.low}`} selected={filter === 'low'} onPress={() => setFilter('low')} />
          <Chip label={`Khatam ${counts.khatam}`} selected={filter === 'khatam'} onPress={() => setFilter('khatam')} />
          {showCost && counts.rate > 0 ? (
            <Chip label={`Rate baaki ${counts.rate}`} selected={filter === 'rate'} onPress={() => setFilter('rate')} />
          ) : null}
        </Row>
      )}

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

      {/* One godown, and the kharab corner beside it — maal that is broken
          or came back, waiting to go to the supplier. Grid, not a wrapping Row
          of flex: 1 children: on Android that pattern stacks tiles on top of
          the next heading. */}
      {locationsLoading ? (
        <Grid min={150}>
          {[0, 1].map((i) => <SkeletonTile key={i} />)}
        </Grid>
      ) : (
        <Grid min={150}>
          {godown ? (
            <StatTile
              label="Godown"
              value={String(Math.round(godown.units))}
              sub={`pcs${showCost ? ` · ${formatINRShort(godown.value)}` : ''}`}
              icon="business-outline"
              accent="blue"
              tone={godown.units < 0 ? 'danger' : undefined}
            />
          ) : null}
          <StatTile
            label="Kharab maal"
            value={String(Math.round(kharab?.units ?? 0))}
            sub="pcs · supplier ko jaana hai"
            icon="alert-circle-outline"
            accent="amber"
            onPress={() => router.push('/kharab' as never)}
          />
          {can('purchase.approve') && waitingCount > 0 ? (
            <StatTile
              label="Approval baaki"
              value={String(waitingCount)}
              sub="staff ki entry — rate bharo"
              icon="checkmark-done-outline"
              accent="rose"
              tone="danger"
              onPress={() => router.push('/requests')}
            />
          ) : null}
        </Grid>
      )}

      <SectionTitle right={rowsLoading ? undefined : <Text variant="small" color="textFaint">{shown.length}</Text>}>
        {filter === 'low' ? 'Kam hai' : filter === 'khatam' ? 'Khatam ho gaya' : filter === 'rate' ? 'Kharid rate bharna baaki' : 'Saara maal'}
      </SectionTitle>

      {rowsLoading ? (
        <SkeletonList rows={6} />
      ) : shown.length === 0 ? (
        <Empty art="maal"
          title={q ? 'Kuch nahi mila' : filter === 'sab' ? 'Abhi koi maal add nahi hua' : 'Yahan kuch nahi'}
          hint={q ? 'Naam, SKU ya barcode se dhoondo.' : filter === 'sab' ? 'Neeche “Nayi entry” dabao aur “Stock Chadhao” se shuru karo.' : undefined}
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
                    {r.specs ? <Text variant="small" color="text">{r.specs}</Text> : null}
                    {r.fits ? <Text variant="small" color="info">{r.fits}</Text> : null}
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
