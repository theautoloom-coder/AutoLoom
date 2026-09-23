import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';

import { slug } from '@domain';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow } from '@/lib/writes';
import { Badge, Button, Card, Input, ListRow, Row, Screen, Text } from '@/ui';
import { notify } from '@/ui/forms';

type Fam = { id: string; code: string; name: string; sku_prefix: string; is_fitment_required: number; is_active: number; specs: number; products: number };

export default function FamiliesScreen() {
  const router = useRouter();
  const { db } = useSystem();
  const { can } = useSession();
  const [name, setName] = useState('');
  const { data: fams } = useQuery<Fam>(`
    SELECT f.*, (SELECT COUNT(*) FROM spec_definitions sd WHERE sd.family_id = f.id AND sd.is_active = 1) AS specs,
           (SELECT COUNT(*) FROM products p WHERE p.family_id = f.id AND p.is_active = 1) AS products
    FROM product_families f ORDER BY f.is_active DESC, f.sort_order, f.name`);

  async function create() {
    const n = name.trim();
    if (!n) return;
    const code = slug(n, 6);
    if ((fams ?? []).some((f) => f.code === code)) {
      notify(`A family with code ${code} already exists. Give it a more distinct name.`);
      return;
    }
    const { rows } = await db.execute("SELECT id FROM tax_rates WHERE name = 'GST 18%' LIMIT 1");
    const { rows: unitRows } = await db.execute("SELECT id FROM units WHERE code = 'pcs' LIMIT 1");
    const id = await insertRow(db, 'product_families', {
      code,
      name: n,
      sku_prefix: code,
      sku_template: '{FAMILY}-{BRAND}-{AXES}',
      default_tax_rate_id: rows?._array?.[0]?.id ?? null,
      default_unit_id: unitRows?._array?.[0]?.id ?? null,
      is_fitment_required: false,
      sort_order: (fams?.length ?? 0) + 1,
      is_active: true,
    });
    setName('');
    router.push(`/admin/family/${id}`);
  }

  return (
    <Screen>
      <Text variant="display">Product families</Text>
      <Text variant="small" color="textMuted">
        A family owns the specification template, SKU prefix and default GST. Adding one here needs no code change.
      </Text>
      {can('catalog.edit') ? (
        <Row gap={8} align="flex-end">
          <Input containerStyle={{ flex: 1 }} value={name} onChangeText={setName} placeholder="New family, e.g. Roof Racks" onSubmitEditing={create} />
          <Button title="Add" onPress={create} disabled={!name.trim()} />
        </Row>
      ) : null}
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {(fams ?? []).map((f) => (
          <ListRow
            key={f.id}
            title={
              <Row gap={8}>
                <Text variant="heading">{f.name}</Text>
                {!f.is_active ? <Badge tone="danger">inactive</Badge> : null}
                {f.is_fitment_required ? <Badge tone="info">vehicle specific</Badge> : null}
              </Row>
            }
            subtitle={`${f.code} · ${f.specs} spec fields · ${f.products} products`}
            onPress={() => router.push(`/admin/family/${f.id}`)}
           
          />
        ))}
      </Card>
    </Screen>
  );
}
