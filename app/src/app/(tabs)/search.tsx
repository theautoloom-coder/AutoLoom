import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR, normaliseRegistration, parseVehicleSearch } from '@domain';

import { SEARCH_CUSTOMERS, SEARCH_INVOICES, SEARCH_REGISTRATIONS, SEARCH_VARIANTS, SEARCH_VEHICLES, tokenize } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Badge, Card, Empty, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { space } from '@/ui/theme';

type VariantHit = {
  id: string; sku: string; barcode: string | null; variant_name: string; retail_price: number; dealer_price: number | null;
  product_id: string; product_name: string; brand_name: string | null; family_name: string | null; is_universal_fit: number; qty: number;
  min_stock: number; reorder_level: number;
};
type VehicleHit = { id: string; name: string; make_name: string; body_type: string | null; fitment_count: number };
type CustomerHit = { id: string; code: string; name: string; business_name: string | null; mobile: string | null; city: string | null; customer_type: string; balance: number; credit_limit: number };
type InvoiceHit = { id: string; doc_type: string; doc_no: string; doc_date: string; grand_total: number; paid_total: number; status: string; customer_name: string };
type RegHit = { id: string; registration_no: string; customer_id: string; customer_name: string; model_name: string | null; make_name: string | null; generation_name: string | null };

function looksLikeRegistration(s: string): boolean {
  return /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}$/.test(normaliseRegistration(s));
}
function looksLikeDocNo(s: string): boolean {
  return /\/|^(INV|CN|PUR|DN|RCP)[-\s]?\d/i.test(s);
}

export default function SearchScreen() {
  const router = useRouter();
  const { can } = useSession();
  const [q, setQ] = useState('');

  const tokens = useMemo(() => tokenize(q), [q]);
  const active = tokens.length > 0;
  const parsed = useMemo(() => parseVehicleSearch(q), [q]);
  const vehicleTokens = useMemo(() => tokenize(parsed.text), [parsed.text]);

  const vq = SEARCH_VARIANTS(active ? tokens : [' ']);
  const { data: variants } = useQuery<VariantHit>(vq.sql, vq.params);

  const vehq = SEARCH_VEHICLES(vehicleTokens.length ? vehicleTokens : [' ']);
  const { data: vehicles } = useQuery<VehicleHit>(vehq.sql, vehq.params);

  const cq = SEARCH_CUSTOMERS(active ? tokens : [' ']);
  const { data: customers } = useQuery<CustomerHit>(cq.sql, cq.params);

  const iq = SEARCH_INVOICES(active && looksLikeDocNo(q) ? q.trim() : ' ');
  const { data: invoices } = useQuery<InvoiceHit>(iq.sql, iq.params);

  const rq = SEARCH_REGISTRATIONS(active && looksLikeRegistration(q) ? normaliseRegistration(q) : ' ');
  const { data: regs } = useQuery<RegHit>(rq.sql, rq.params);

  const nothing = active && !variants?.length && !vehicles?.length && !customers?.length && !invoices?.length && !regs?.length;
  const showPrice = can('sale.create') || can('catalog.view_cost');

  return (
    <Screen>
      <Text variant="display">Dhoondo</Text>
      <Input
        value={q}
        onChangeText={setQ}
        placeholder="H4 LED · Creta 2024 · XYZ Auto · UP16AB1234 · NOI/A/26-27/0042"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        autoFocus
        style={{ fontSize: 17 }}
      />

      {!active ? (
        <Card tone="alt">
          <Text variant="heading">Ek hi jagah sab kuch</Text>
          <Text variant="small" color="textMuted">
            Type a socket (H4, 9005), a product, a vehicle with year (Creta 2024), a customer or mobile number, a vehicle registration, or an invoice number.
          </Text>
        </Card>
      ) : null}

      {vehicles && vehicles.length > 0 ? (
        <>
          <SectionTitle>Gaadiyan{parsed.year ? ` · ${parsed.year}` : ''}</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {vehicles.map((v) => (
              <ListRow
                key={v.id}
                title={`${v.make_name} ${v.name}`}
                subtitle={`${v.fitment_count} fitment${v.fitment_count === 1 ? '' : 's'}${v.body_type ? ` · ${v.body_type}` : ''}`}
                onPress={() => router.push(`/vehicle/${v.id}${parsed.year ? `?year=${parsed.year}` : ''}`)}
                right={<Text color="accent">Is gaadi mein lagne wala maal</Text>}
              />
            ))}
          </Card>
        </>
      ) : null}

      {regs && regs.length > 0 ? (
        <>
          <SectionTitle>Gaadi number</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {regs.map((r) => (
              <ListRow
                key={r.id}
                title={r.registration_no}
                subtitle={`${r.customer_name}${r.model_name ? ` · ${r.make_name} ${r.model_name}` : ''}${r.generation_name ? ` ${r.generation_name}` : ''}`}
                onPress={() => router.push(`/customer/${r.customer_id}`)}
              />
            ))}
          </Card>
        </>
      ) : null}

      {variants && variants.length > 0 ? (
        <>
          <SectionTitle>Saara maal</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {variants.map((v) => (
              <ListRow
                key={v.id}
                title={`${v.product_name} · ${v.variant_name}`}
                subtitle={
                  <Row gap={space.xs} wrap>
                    <Text variant="small" color="textMuted" mono>
                      {v.sku}
                    </Text>
                    {v.family_name ? <Badge>{v.family_name}</Badge> : null}
                    {v.brand_name ? <Text variant="small" color="textFaint">{v.brand_name}</Text> : null}
                  </Row>
                }
                onPress={() => router.push(`/product/${v.product_id}?variant=${v.id}`)}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text mono color={v.qty <= 0 ? 'danger' : v.qty <= Math.max(v.min_stock, v.reorder_level) ? 'warn' : 'ok'}>
                      {v.qty} in stock
                    </Text>
                    {showPrice ? (
                      <Text variant="small" color="textMuted" mono>
                        {formatINR(v.dealer_price ?? v.retail_price)}
                      </Text>
                    ) : null}
                  </View>
                }
              />
            ))}
          </Card>
        </>
      ) : null}

      {customers && customers.length > 0 ? (
        <>
          <SectionTitle>Grahak</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {customers.map((c) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={[c.business_name, c.mobile, c.city].filter(Boolean).join(' · ')}
                onPress={() => router.push(`/customer/${c.id}`)}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Badge tone={c.customer_type === 'retail' ? 'neutral' : 'info'}>{c.customer_type}</Badge>
                    {c.balance ? (
                      <Text variant="small" mono color={c.balance > 0 ? 'warn' : 'ok'}>
                        {formatINR(c.balance)} due
                      </Text>
                    ) : null}
                  </View>
                }
              />
            ))}
          </Card>
        </>
      ) : null}

      {invoices && invoices.length > 0 ? (
        <>
          <SectionTitle>Bill</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {invoices.map((i) => (
              <ListRow
                key={i.id}
                title={i.doc_no}
                subtitle={`${i.customer_name} · ${i.doc_date}`}
                onPress={() => router.push(`/invoice/${i.id}`)}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text mono>{formatINR(i.grand_total)}</Text>
                    <Badge tone={i.status === 'cancelled' ? 'danger' : i.paid_total >= i.grand_total ? 'ok' : 'warn'}>{i.status === 'cancelled' ? 'cancelled' : i.paid_total >= i.grand_total ? 'paid' : 'due'}</Badge>
                  </View>
                }
              />
            ))}
          </Card>
        </>
      ) : null}

      {nothing ? <Empty title={`Nothing matches “${q.trim()}”`} hint="H4 jaisa socket, Creta jaisa model, ya grahak ka mobile number likho." /> : null}
    </Screen>
  );
}
