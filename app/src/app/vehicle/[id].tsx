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
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR, generationForYear } from '@domain';

import { VEHICLE_GENERATIONS, VEHICLE_MODEL, VEHICLE_PRODUCTS } from '@/lib/queries';
import { Card, Chip, Empty, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
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

  const year = yearParam ? Number(yearParam) : null;
  const gen = useMemo(() => (year && gens ? generationForYear(gens, year) : null), [gens, year]);

  const { data: fits } = useQuery<Hit>(VEHICLE_PRODUCTS.sql, [id, gen?.id ?? '', gen ? 0 : (year ?? 0)]);

  const model = models?.[0];
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
      </Screen>
    </>
  );
}
