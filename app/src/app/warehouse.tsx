/**
 * Warehouse — maal kahan pada hai.
 *
 * One question, asked out loud in every godown: where is it. Not a warehouse
 * management system — no bins to configure, no putaway rules, no pick paths.
 * A list of the places this shop keeps maal, what is in each, and what it is
 * worth, with the items underneath.
 *
 * Stock is derived from movements, so a place holding nothing still appears:
 * "Workshop mein kuch nahi hai" is an answer, and a missing tile is not.
 */
import { useQuery } from '@powersync/react';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR, formatINRShort } from '@domain';

import { STOCK_VALUE_BY_LOCATION } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Card, Empty, Row, Screen, SectionTitle, StatTile, Text, ListRow, type IconName } from '@/ui';
import { ItemPhoto } from '@/ui/photo';
import { space } from '@/ui/theme';

const LOOK: Record<string, { icon: IconName; accent: string }> = {
  warehouse: { icon: 'business-outline', accent: 'blue' },
  shop: { icon: 'storefront-outline', accent: 'green' },
  workshop: { icon: 'construct-outline', accent: 'violet' },
  damaged: { icon: 'alert-circle-outline', accent: 'amber' },
};

type Loc = { id: string; code: string; name: string; type: string; value: number; units: number };
type Item = {
  variant_id: string;
  sku: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  qty: number;
  value: number;
  photo_path: string | null;
};

export default function Warehouse() {
  const router = useRouter();
  const { can } = useSession();
  const [openLoc, setOpenLoc] = useState<string | null>(null);

  const { data: locations } = useQuery<Loc>(STOCK_VALUE_BY_LOCATION.sql);
  const { data: items } = useQuery<Item>(
    `SELECT sl.variant_id, pv.sku, pv.product_id, p.name AS product_name, pv.variant_name,
            sl.qty, sl.qty * pv.avg_cost AS value,
            (SELECT pi.storage_path FROM product_images pi WHERE pi.variant_id = pv.id ORDER BY pi.sort_order LIMIT 1) AS photo_path
       FROM stock_on_hand sl
       JOIN product_variants pv ON pv.id = sl.variant_id
       JOIN products p ON p.id = pv.product_id
      WHERE sl.location_id = ? AND sl.qty <> 0
      ORDER BY sl.qty * pv.avg_cost DESC`,
    [openLoc ?? '']
  );

  const showMoney = can('catalog.view_cost') || can('reports.view');
  const here = items ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Warehouse' }} />
      <Screen>
        <View>
          <Text variant="display">Warehouse</Text>
          <Text variant="small" color="textMuted">
            Maal kahan pada hai — jagah par tap karo.
          </Text>
        </View>

        <Row gap={space.md} wrap align="stretch">
          {(locations ?? []).map((l) => {
            const look = LOOK[l.type] ?? { icon: 'cube-outline' as IconName, accent: 'teal' };
            return (
              <View key={l.id} style={{ flex: 1, minWidth: 150 }}>
                <StatTile
                  label={l.name}
                  value={String(Math.round(l.units))}
                  sub={`pcs${showMoney ? ` · ${formatINRShort(l.value)}` : ''}`}
                  icon={look.icon}
                  accent={look.accent}
                  tone={l.units < 0 ? 'danger' : openLoc === l.id ? 'accent' : undefined}
                  onPress={() => setOpenLoc(openLoc === l.id ? null : l.id)}
                />
              </View>
            );
          })}
        </Row>

        {openLoc ? (
          <>
            <SectionTitle right={<Text variant="small" color="textFaint">{here.length}</Text>}>
              {(locations ?? []).find((l) => l.id === openLoc)?.name ?? 'Yahan kya hai'}
            </SectionTitle>
            {here.length === 0 ? (
              <Empty art="sahi" title="Yahan abhi kuch nahi hai" hint="Is jagah par koi maal nahi pada." />
            ) : (
              <Card style={{ gap: 0, paddingVertical: 4 }}>
                {here.map((it) => (
                  <ListRow
                    key={it.variant_id}
                    left={<ItemPhoto path={it.photo_path} name={it.product_name} size={44} />}
                    title={`${it.product_name} · ${it.variant_name}`}
                    subtitle={it.sku}
                    onPress={() => router.push(`/product/${it.product_id}?variant=${it.variant_id}`)}
                    right={
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text mono color={it.qty < 0 ? 'danger' : 'text'}>{it.qty}</Text>
                        {showMoney ? (
                          <Text variant="small" color="textFaint">{formatINR(it.value)}</Text>
                        ) : null}
                      </View>
                    }
                  />
                ))}
              </Card>
            )}
          </>
        ) : (
          <Empty title="Kisi jagah par tap karo" hint="Wahan ka saara maal neeche dikh jayega." />
        )}
      </Screen>
    </>
  );
}
