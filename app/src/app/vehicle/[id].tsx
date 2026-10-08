/**
 * Gaadi — is car mein kya lagta hai.
 *
 * A customer does not say "SKU ITM-4471". He says "Creta 2019 ka mat". This
 * screen is that sentence turned into a list, and it is the one fitment
 * feature that earns its keep at a counter.
 *
 * The version that used to live here also matched bulbs by socket, grouped by
 * family, and carried four filter rows. It answered questions nobody at this
 * shop asks, so it was cut with the rest of the catalogue machinery — and the
 * two screens that linked to it were left pointing at nothing. Typed routes
 * found them. This is the simple version the owner asked for: the car, the
 * maal that fits it, stock, rate.
 *
 * The year matters because a 2019 Creta and a 2024 Creta take different parts.
 * When Search passes one, the generation is resolved from it and the header
 * says which one, so nobody has to trust it silently.
 *
 * "Model aur bulb" answers the question asked most at this counter — "Nexon
 * mein kaunsa bulb lagta hai?" The socket per model-year was seeded with the
 * car list and synced to every phone, and no screen ever showed it. Tapping a
 * model-year also narrows the maal below to that one.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR, generationForYear } from '@domain';

import { PHOTO_OF, SELLABLE_QTY, SPECS_OF, VEHICLE_GENERATIONS, VEHICLE_MODEL, VEHICLE_PRODUCTS } from '@/lib/queries';
import { Badge, Card, Chip, Empty, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { ItemPhoto } from '@/ui/photo';
import { space } from '@/ui/theme';

type Model = { id: string; name: string; code: string; body_type: string | null; make_name: string };
type Gen = { id: string; model_id: string; name: string; year_from: number; year_to: number | null; is_facelift: number };
type Hit = {
  id: string;
  sku: string;
  variant_name: string;
  retail_price: number;
  product_id: string;
  product_name: string;
  family_name: string | null;
  position: string | null;
  qty: number;
  photo_path: string | null;
};

export default function VehicleScreen() {
  const { id, year: yearParam } = useLocalSearchParams<{ id: string; year?: string }>();
  const router = useRouter();

  const [inStockOnly, setInStockOnly] = useState(false);

  const { data: models } = useQuery<Model>(VEHICLE_MODEL.sql, [id]);
  const { data: gens } = useQuery<Gen>(VEHICLE_GENERATIONS.sql, [id]);

  const { data: sockets } = useQuery<{ generation_id: string; position_label: string | null; socket: string }>(
    `SELECT m.generation_id, m.position_label, o.value AS socket
       FROM vehicle_spec_map m
       JOIN vehicle_generations g ON g.id = m.generation_id
       JOIN spec_options o ON o.id = m.option_id
      WHERE g.model_id = ?
      ORDER BY m.position_label`, [id]);
  const [picked, setPicked] = useState<string | null>(null);

  const year = yearParam ? Number(yearParam) : null;
  const fromYear = useMemo(() => (year && gens ? generationForYear(gens, year) : null), [gens, year]);
  const gen = picked ? (gens ?? []).find((g) => g.id === picked) ?? null : fromYear;

  const { data: fits } = useQuery<Hit>(VEHICLE_PRODUCTS.sql, [id, gen?.id ?? '', gen ? 0 : (year ?? 0)]);

  // Bulbs are sold by socket, not by car: an H7 bulb fits every car whose low
  // beam is H7, whether or not anybody linked it to this car. Matched on the
  // socket's own text, because each bulb family keeps its own option rows.
  const { data: bySocket } = useQuery<Hit & { socket: string; specs: string | null }>(`
    SELECT DISTINCT pv.id, pv.sku, pv.variant_name, pv.retail_price, p.id AS product_id, p.name AS product_name,
           f.name AS family_name, NULL AS position, sv.display_value AS socket,
           ${SPECS_OF('p', 'pv')} AS specs,
           ${SELLABLE_QTY('pv')} AS qty,
           ${PHOTO_OF('p', 'pv')} AS photo_path
      FROM spec_values sv
      JOIN spec_definitions sd ON sd.id = sv.spec_definition_id AND sd.code = 'socket'
      JOIN products p ON p.id = sv.product_id AND p.is_active = 1
      JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = 1 AND (sv.variant_id IS NULL OR sv.variant_id = pv.id)
      LEFT JOIN product_families f ON f.id = p.family_id
     WHERE upper(sv.display_value) IN (
       SELECT upper(o.value) FROM vehicle_spec_map m
         JOIN vehicle_generations g ON g.id = m.generation_id
         JOIN spec_options o ON o.id = m.option_id
        WHERE g.model_id = ?1 AND (?2 = '' OR g.id = ?2))
     ORDER BY sv.display_value, p.name`, [id, gen?.id ?? '']);

  const model = models?.[0];
  const linkedIds = new Set((fits ?? []).map((r) => r.id));
  const socketHits = (bySocket ?? []).filter((r) => !linkedIds.has(r.id));
  const all = fits ?? [];
  const shown = inStockOnly ? all.filter((r) => r.qty > 0) : all;
  const inStock = all.filter((r) => r.qty > 0).length;

  const title = model ? `${model.make_name} ${model.name}` : 'Gaadi';

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen>
        <View>
          <Text variant="display">{title}</Text>
          <Text variant="small" color="textMuted">
            {year ? `${year} model — ` : ''}
            {gen ? `${gen.name} · ` : ''}
            Is gaadi mein jo maal lagta hai.
          </Text>
        </View>

        {(gens ?? []).length > 0 ? (
          <>
            <SectionTitle>Model aur bulb</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(gens ?? []).map((g) => {
                const mine = (sockets ?? []).filter((x) => x.generation_id === g.id);
                return (
                  <ListRow
                    key={g.id}
                    title={g.name}
                    subtitle={mine.length
                      ? mine.map((x) => `${x.position_label ?? 'Bulb'} ${x.socket}`).join(' · ')
                      : `${g.year_from} se ${g.year_to ?? 'ab tak'}`}
                    onPress={() => setPicked(picked === g.id ? null : g.id)}
                    right={gen?.id === g.id ? <Badge tone="accent">chuna</Badge> : undefined}
                  />
                );
              })}
            </Card>
          </>
        ) : null}

        {all.length > 0 ? (
          <Row gap={space.xs} wrap>
            <Chip label={`Sab ${all.length}`} selected={!inStockOnly} onPress={() => setInStockOnly(false)} />
            <Chip label={`Stock mein ${inStock}`} selected={inStockOnly} onPress={() => setInStockOnly(true)} />
          </Row>
        ) : null}

        <SectionTitle right={<Text variant="small" color="textFaint">{shown.length}</Text>}>Lagne wala maal</SectionTitle>

        {shown.length === 0 ? (
          <Empty
            art="search"
            title={all.length === 0 ? 'Is gaadi ke liye kuch nahi joda' : 'Stock mein kuch nahi'}
            hint={
              all.length === 0
                ? 'Item ke page par "Kaunsi gaadi" se is gaadi ko jodo.'
                : 'Sab dekhne ke liye upar “Sab” dabao.'
            }
          />
        ) : (
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {shown.map((r) => (
              <ListRow
                key={r.id}
                left={<ItemPhoto path={r.photo_path} name={r.product_name} size={44} />}
                title={`${r.product_name} · ${r.variant_name}`}
                subtitle={
                  <Row gap={space.sm} wrap>
                    <Text variant="small" color="textFaint" mono>{r.sku}</Text>
                    {r.position ? (
                      <Text variant="small" color="textMuted">{r.position.replace('_', ' ')}</Text>
                    ) : null}
                    <Text variant="small" color="textMuted">Bechna {formatINR(r.retail_price)}</Text>
                  </Row>
                }
                onPress={() => router.push(`/product/${r.product_id}?variant=${r.id}`)}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text mono color={r.qty <= 0 ? 'danger' : 'ok'}>{r.qty}</Text>
                    <Text variant="small" color="textFaint">pcs</Text>
                  </View>
                }
              />
            ))}
          </Card>
        )}
        {socketHits.length > 0 ? (
          <>
            <SectionTitle right={<Text variant="small" color="textFaint">{socketHits.length}</Text>}>Socket se lagne wale bulb</SectionTitle>
            <Text variant="small" color="textMuted">Is gaadi ke socket ({[...new Set(socketHits.map((r) => r.socket))].join(', ')}) wale bulb — gaadi se jode nahi gaye, par lag jaate hain.</Text>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {socketHits.map((r) => (
                <ListRow
                  key={`s-${r.id}`}
                  left={<ItemPhoto path={r.photo_path} name={r.product_name} size={44} />}
                  title={`${r.product_name} · ${r.variant_name}`}
                  subtitle={[r.specs, r.sku, `Bechna ${formatINR(r.retail_price)}`].filter(Boolean).join(' · ')}
                  onPress={() => router.push(`/product/${r.product_id}?variant=${r.id}`)}
                  right={<Text mono color={r.qty <= 0 ? 'danger' : 'ok'}>{r.qty}</Text>}
                />
              ))}
            </Card>
          </>
        ) : null}
      </Screen>
    </>
  );
}
