/**
 * Vehicle -> compatible products. The main sales workflow.
 *
 * "Creta 2024" resolves to a model + generation; the screen lists every
 * fitment-matched SKU grouped by family, then products that match by bulb
 * socket for that car, then universal products collapsed at the bottom.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatINR, generationForYear, stockStatus } from '@domain';

import { VARIANTS_BY_OPTIONS, VEHICLE_GENERATIONS, VEHICLE_MODEL, VEHICLE_PRODUCTS, VEHICLE_SOCKETS } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Badge, Card, Chip, Empty, ListRow, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';
import { space } from '@/ui/theme';

type Model = { id: string; name: string; code: string; body_type: string | null; make_name: string };
type Gen = { id: string; model_id: string; name: string; year_from: number; year_to: number | null; is_facelift: number };
type Hit = {
  id: string; sku: string; variant_name: string; retail_price: number; dealer_price: number | null; wholesale_price: number | null; mrp: number | null;
  min_stock: number; reorder_level: number; product_id: string; product_name: string; is_universal_fit: number;
  brand_name: string | null; family_name: string | null; family_sort: number; position?: string | null; socket?: string; qty: number;
};
type Socket = { position_label: string; socket: string; option_id: string };

function groupByFamily(rows: Hit[]): Array<[string, Hit[]]> {
  const map = new Map<string, Hit[]>();
  for (const r of rows) {
    const k = r.family_name ?? 'Other';
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()];
}

export default function VehicleScreen() {
  const { id, year: yearParam } = useLocalSearchParams<{ id: string; year?: string }>();
  const router = useRouter();
  const t = useTheme();
  const { can } = useSession();

  const { data: models } = useQuery<Model>(VEHICLE_MODEL.sql, [id]);
  const model = models?.[0];
  const { data: gens } = useQuery<Gen>(VEHICLE_GENERATIONS.sql, [id]);

  const year = yearParam ? Number(yearParam) : null;
  const autoGen = useMemo(() => (year && gens ? generationForYear(gens, year) : null), [gens, year]);
  const [genOverride, setGenOverride] = useState<string | null | undefined>(undefined);
  const genId = genOverride === undefined ? (autoGen?.id ?? null) : genOverride;
  const gen = gens?.find((g) => g.id === genId) ?? null;

  const [inStockOnly, setInStockOnly] = useState(false);
  const [family, setFamily] = useState<string | null>(null);
  const [showUniversal, setShowUniversal] = useState(false);

  const { data: products } = useQuery<Hit>(VEHICLE_PRODUCTS.sql, [id, genId ?? '', genId ? 0 : (year ?? 0)]);
  const { data: sockets } = useQuery<Socket>(VEHICLE_SOCKETS.sql, [genId ?? '']);
  const socketIds = useMemo(() => (sockets ?? []).map((s) => s.option_id), [sockets]);
  const sq = VARIANTS_BY_OPTIONS(socketIds.length ? socketIds : ['']);
  const { data: bySocket } = useQuery<Hit>(sq.sql, sq.params);

  const { data: universal } = useQuery<Hit>(`
    SELECT pv.id, pv.sku, pv.variant_name, pv.retail_price, pv.dealer_price, pv.wholesale_price, pv.mrp, pv.min_stock, pv.reorder_level,
           p.id AS product_id, p.name AS product_name, p.is_universal_fit, b.name AS brand_name, f.name AS family_name, f.sort_order AS family_sort,
           COALESCE((SELECT SUM(qty) FROM stock_on_hand sl WHERE sl.variant_id = pv.id), 0) AS qty
    FROM products p JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = 1
    LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN product_families f ON f.id = p.family_id
    WHERE p.is_universal_fit = 1 AND p.is_active = 1 ORDER BY f.sort_order, p.name, pv.variant_name`);

  const specificIds = new Set((products ?? []).map((p) => p.id));
  const socketHits = (bySocket ?? []).filter((h) => !specificIds.has(h.id));
  const socketIdsSet = new Set(socketHits.map((h) => h.id));
  const universalHits = (universal ?? []).filter((h) => !specificIds.has(h.id) && !socketIdsSet.has(h.id));

  const filter = (rows: Hit[]) => rows.filter((r) => (!inStockOnly || r.qty > 0) && (!family || r.family_name === family));
  const families = useMemo(
    () => [...new Set([...(products ?? []), ...socketHits].map((r) => r.family_name).filter(Boolean) as string[])],
    [products, socketHits]
  );

  const showPrice = can('sale.create') || can('catalog.view_cost');
  const title = model ? `${model.make_name} ${model.name}` : 'Vehicle';

  const renderHit = (h: Hit) => {
    const s = stockStatus(h.qty, h.min_stock, h.reorder_level);
    return (
      <ListRow
        key={h.id}
        title={`${h.product_name} · ${h.variant_name}`}
        subtitle={
          <Row gap={space.xs} wrap>
            <Text variant="small" color="textMuted" mono>
              {h.sku}
            </Text>
            {h.brand_name ? <Text variant="small" color="textFaint">{h.brand_name}</Text> : null}
            {h.position ? <Badge>{h.position.replace('_', ' ')}</Badge> : null}
            {h.socket ? <Badge tone="info">{h.socket}</Badge> : null}
          </Row>
        }
        onPress={() => router.push(`/product/${h.product_id}?variant=${h.id}`)}
        right={
          <View style={{ alignItems: 'flex-end' }}>
            <Text mono color={s === 'out' ? 'danger' : s === 'low' ? 'warn' : 'ok'}>
              {h.qty} in stock
            </Text>
            {showPrice ? (
              <Text variant="small" color="textMuted" mono>
                {formatINR(h.dealer_price ?? h.retail_price)}
              </Text>
            ) : null}
          </View>
        }
      />
    );
  };

  const specificGroups = groupByFamily(filter(products ?? []));
  const socketGroups = groupByFamily(filter(socketHits));
  const universalGroups = groupByFamily(filter(universalHits));

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen>
        <View>
          <Text variant="label" color="textMuted">
            {model?.body_type ?? 'vehicle'}
          </Text>
          <Text variant="display">{title}</Text>
        </View>

        {gens && gens.length > 0 ? (
          <Row gap={space.xs} wrap>
            <Chip label="All years" selected={genId === null} onPress={() => setGenOverride(null)} />
            {gens.map((g) => (
              <Chip
                key={g.id}
                label={`${g.name}${g.is_facelift ? ' ✦' : ''}`}
                selected={genId === g.id}
                onPress={() => setGenOverride(g.id)}
              />
            ))}
          </Row>
        ) : null}

        {sockets && sockets.length > 0 ? (
          <Card tone="alt" style={{ gap: space.xs }}>
            <Text variant="label" color="textMuted">
              Bulb sockets · {gen?.name}
            </Text>
            <Row gap={space.md} wrap>
              {sockets.map((s) => (
                <Text key={s.position_label} variant="small">
                  {s.position_label}: <Text variant="small" style={{ fontWeight: '700' }}>{s.socket}</Text>
                </Text>
              ))}
            </Row>
          </Card>
        ) : null}

        <Row gap={space.xs} wrap>
          <Chip label="In stock only" selected={inStockOnly} onPress={() => setInStockOnly((v) => !v)} />
          {families.length > 1
            ? families.map((f) => <Chip key={f} label={f} selected={family === f} onPress={() => setFamily(family === f ? null : f)} />)
            : null}
        </Row>

        {specificGroups.length === 0 && socketGroups.length === 0 ? (
          <Empty
            title={`No model-specific products for ${model?.name ?? 'this vehicle'}${gen ? ` ${gen.name}` : ''}`}
            hint="Add fitments to products in Admin, or check the universal products below."
          />
        ) : null}

        {specificGroups.map(([fam, rows]) => (
          <React.Fragment key={`s-${fam}`}>
            <SectionTitle right={<Badge tone="accent">Fits this model</Badge>}>{fam}</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>{rows.map(renderHit)}</Card>
          </React.Fragment>
        ))}

        {socketGroups.map(([fam, rows]) => (
          <React.Fragment key={`k-${fam}`}>
            <SectionTitle right={<Badge tone="info">Fits by socket</Badge>}>{fam}</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>{rows.map(renderHit)}</Card>
          </React.Fragment>
        ))}

        <Pressable onPress={() => setShowUniversal((v) => !v)} style={{ paddingVertical: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label" color="textMuted">
              Universal products · {universalHits.length}
            </Text>
            <Text variant="small" style={{ color: t.accent }}>
              {showUniversal ? 'Hide' : 'Show'}
            </Text>
          </Row>
        </Pressable>
        {showUniversal
          ? universalGroups.map(([fam, rows]) => (
              <React.Fragment key={`u-${fam}`}>
                <SectionTitle>{fam}</SectionTitle>
                <Card style={{ gap: 0, paddingVertical: 4 }}>{rows.map(renderHit)}</Card>
              </React.Fragment>
            ))
          : null}
      </Screen>
    </>
  );
}
