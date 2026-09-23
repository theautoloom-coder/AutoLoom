import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';

import { SEARCH_VARIANTS, tokenize } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Empty, Input, ListRow, Row, Screen, Text } from '@/ui';
import { space } from '@/ui/theme';

type Prod = { id: string; name: string; is_active: number; is_universal_fit: number; brand_name: string | null; family_name: string | null; family_id: string; variants: number; fitments: number; qty: number };
type VariantHit = { id: string; sku: string; variant_name: string; product_id: string; product_name: string; qty: number };

export default function ProductsAdmin() {
  const router = useRouter();
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [family, setFamily] = useState<string | null>(null);

  const { data: families } = useQuery<{ id: string; name: string; n: number }>('SELECT f.id, f.name, (SELECT COUNT(*) FROM products p WHERE p.family_id = f.id) AS n FROM product_families f WHERE f.is_active = 1 ORDER BY f.sort_order');
  const { data: products } = useQuery<Prod>(`
    SELECT p.id, p.name, p.is_active, p.is_universal_fit, p.family_id, b.name AS brand_name, f.name AS family_name,
           (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = 1) AS variants,
           (SELECT COUNT(*) FROM product_fitments pf WHERE pf.product_id = p.id) AS fitments,
           COALESCE((SELECT SUM(sl.qty) FROM stock_on_hand sl JOIN product_variants pv ON pv.id = sl.variant_id WHERE pv.product_id = p.id), 0) AS qty
    FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN product_families f ON f.id = p.family_id
    WHERE (?1 = '' OR p.family_id = ?1)
    ORDER BY p.is_active DESC, f.sort_order, p.name`, [family ?? '']);

  const tokens = useMemo(() => tokenize(q), [q]);
  const sq = SEARCH_VARIANTS(tokens.length ? tokens : [' '], 30);
  const { data: hits } = useQuery<VariantHit>(sq.sql, sq.params);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Saara maal</Text>
        {can('catalog.edit') ? <Button title="+ Naya item" onPress={() => router.push('/admin/item')} /> : null}
      </Row>
      <Input value={q} onChangeText={setQ} placeholder="Search by name, SKU, barcode or spec" autoCapitalize="none" autoCorrect={false} />

      {tokens.length > 0 ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(hits ?? []).map((h) => (
            <ListRow key={h.id} title={`${h.product_name} · ${h.variant_name}`} subtitle={h.sku} onPress={() => router.push(`/admin/item?id=${h.product_id}`)} right={<Text mono>{h.qty}</Text>} />
          ))}
          {(hits ?? []).length === 0 ? <Empty title="No matching SKU" /> : null}
        </Card>
      ) : (
        <>
          <Row gap={space.xs} wrap>
            <Chip label="All" selected={!family} onPress={() => setFamily(null)} />
            {(families ?? []).filter((f) => f.n > 0).map((f) => (
              <Chip key={f.id} label={`${f.name} · ${f.n}`} selected={family === f.id} onPress={() => setFamily(family === f.id ? null : f.id)} />
            ))}
          </Row>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {(products ?? []).map((p) => (
              <ListRow
                key={p.id}
                title={
                  <Row gap={6} wrap>
                    <Text variant="heading" color={p.is_active ? 'text' : 'textFaint'}>
                      {p.name}
                    </Text>
                    {!p.is_active ? <Badge tone="danger">inactive</Badge> : null}
                    {p.is_universal_fit ? <Badge tone="info">universal</Badge> : null}
                  </Row>
                }
                subtitle={`${p.family_name ?? ''}${p.brand_name ? ` · ${p.brand_name}` : ''} · ${p.variants} SKU${p.variants === 1 ? '' : 's'} · ${p.fitments} fitment${p.fitments === 1 ? '' : 's'}`}
                onPress={() => router.push(`/admin/item?id=${p.id}`)}
                right={<Text mono>{Math.round(p.qty)} pcs</Text>}
              />
            ))}
            {(products ?? []).length === 0 ? <Empty title="No products yet" hint="Create the first one with New product." /> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}
