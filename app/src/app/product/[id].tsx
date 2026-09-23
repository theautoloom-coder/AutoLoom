/**
 * Product detail: the salesperson's single source of truth for one item.
 *
 * Specs (product-level + per-variant axes), every variant with stock per
 * location and prices, compatible vehicles, purchase history and sales
 * history, and, when a customer is chosen, that customer's price and the
 * rate they last paid.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { fitmentLabel, formatINR, margin, resolvePrice, stockStatus } from '@domain';

import {
  CUSTOMER_LAST_RATE,
  CUSTOMER_PRICE_CONTEXT,
  PRODUCT,
  PRODUCT_FITMENTS,
  PRODUCT_SPECS,
  PRODUCT_VARIANTS,
  SEARCH_CUSTOMERS,
  VARIANT_PURCHASE_HISTORY,
  VARIANT_SALES_HISTORY,
  VARIANT_STOCK_BY_LOCATION,
  tokenize,
} from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow } from '@/lib/writes';
import { NumberField, notify } from '@/ui/forms';
import { Badge, Button, Card, Chip, Divider, Empty, Input, KV, ListRow, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';
import { space } from '@/ui/theme';

type Product = {
  id: string; name: string; description: string | null; hsn_code: string | null; is_universal_fit: number;
  brand_name: string | null; family_name: string | null; family_code: string | null; category_name: string | null; subcategory_name: string | null;
  unit_code: string | null; tax_rate_pct: number | null;
};
type Variant = {
  id: string; variant_name: string; sku: string; barcode: string | null; mrp: number | null; retail_price: number; dealer_price: number | null;
  wholesale_price: number | null; min_selling_price: number | null; min_stock: number; reorder_level: number; reorder_qty: number;
  last_purchase_cost: number; avg_cost: number; qty: number;
};
type SpecRow = {
  spec_definition_id: string; code: string; name: string; data_type: string; unit: string | null; is_variant_axis: number; sort_order: number;
  variant_id: string | null; display_value: string;
};
type Fitment = { id: string; variant_id: string | null; position: string | null; year_from: number | null; year_to: number | null; model_id: string; model_name: string; make_name: string; generation_name: string | null; gen_from: number | null; gen_to: number | null };
type LocStock = { location_id: string; code: string; name: string; type: string; qty: number };
type PurchaseHist = { id: string; doc_date: string; doc_no: string; supplier_name: string; qty: number; rate: number; landed_unit_cost: number };
type SalesHist = { id: string; doc_date: string; doc_no: string; customer_name: string; qty: number; rate: number; price_source: string | null };
type CustomerHit = { id: string; name: string; business_name: string | null; mobile: string | null; customer_type: string };

export default function ProductScreen() {
  const params = useLocalSearchParams<{ id: string; variant?: string; by?: string }>();
  const router = useRouter();
  const t = useTheme();
  const { can, actor, profile } = useSession();
  const { db } = useSystem();
  const [specialPrice, setSpecialPrice] = useState<number | null>(null);

  // /product/<sku>?by=sku lands here from stock lists.
  const { data: bySku } = useQuery<{ id: string; product_id: string }>(
    'SELECT id, product_id FROM product_variants WHERE sku = ?',
    [params.by === 'sku' ? decodeURIComponent(params.id) : '']
  );
  const productId = params.by === 'sku' ? (bySku?.[0]?.product_id ?? '') : params.id;
  const initialVariant = params.by === 'sku' ? bySku?.[0]?.id : params.variant;

  const { data: products } = useQuery<Product>(PRODUCT.sql, [productId]);
  const product = products?.[0];
  const { data: variants } = useQuery<Variant>(PRODUCT_VARIANTS.sql, [productId]);
  const { data: specs } = useQuery<SpecRow>(PRODUCT_SPECS.sql, [productId]);
  const { data: fitments } = useQuery<Fitment>(PRODUCT_FITMENTS.sql, [productId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const variantId = selectedId ?? initialVariant ?? variants?.[0]?.id ?? null;
  const variant = variants?.find((v) => v.id === variantId) ?? variants?.[0] ?? null;

  const { data: locStock } = useQuery<LocStock>(VARIANT_STOCK_BY_LOCATION.sql, [variant?.id ?? '']);
  const { data: purchases } = useQuery<PurchaseHist>(VARIANT_PURCHASE_HISTORY.sql, [variant?.id ?? '']);
  const { data: sales } = useQuery<SalesHist>(VARIANT_SALES_HISTORY.sql, [variant?.id ?? '']);

  // Customer context for pricing
  const [customerQuery, setCustomerQuery] = useState('');
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const cq = SEARCH_CUSTOMERS(tokenize(customerQuery).length ? tokenize(customerQuery) : [' '], 5);
  const { data: customerHits } = useQuery<CustomerHit>(cq.sql, cq.params);
  const { data: ctxRows } = useQuery<{ customer_price: number | null; price_list_item_price: number | null; price_list_column: string | null }>(
    CUSTOMER_PRICE_CONTEXT.sql,
    [customer?.id ?? '', variant?.id ?? '']
  );
  const { data: lastRateRows } = useQuery<{ rate: number; doc_date: string; doc_no: string }>(CUSTOMER_LAST_RATE.sql, [customer?.id ?? '', variant?.id ?? '']);
  const ctx = ctxRows?.[0];
  const lastRate = lastRateRows?.[0];

  const resolved = useMemo(() => {
    if (!variant) return null;
    return resolvePrice(variant, {
      customerPrice: ctx?.customer_price,
      priceListItemPrice: ctx?.price_list_item_price,
      priceListColumn: (ctx?.price_list_column as 'retail_price' | 'dealer_price' | 'wholesale_price' | null) ?? null,
    });
  }, [variant, ctx]);

  const productSpecs = (specs ?? []).filter((s) => s.variant_id === null);
  const axisDefs = useMemo(() => {
    const seen = new Map<string, SpecRow>();
    for (const s of specs ?? []) if (s.variant_id !== null && !seen.has(s.spec_definition_id)) seen.set(s.spec_definition_id, s);
    return [...seen.values()].sort((a, b) => a.sort_order - b.sort_order);
  }, [specs]);
  const specFor = (vId: string, defId: string) => (specs ?? []).find((s) => s.variant_id === vId && s.spec_definition_id === defId)?.display_value ?? '—';

  const productFitments = (fitments ?? []).filter((f) => f.variant_id === null);
  const variantFitments = (fitments ?? []).filter((f) => f.variant_id === variant?.id);
  const effectiveFitments = variantFitments.length ? variantFitments : productFitments;

  const showCost = can('catalog.view_cost');
  const showPrice = can('sale.create') || showCost;
  const totalQty = (locStock ?? []).reduce((a, l) => a + l.qty, 0);

  if (!product) {
    return (
      <Screen>
        <Empty title="Ye item is phone par nahi mila" hint="Shayad abhi sync nahi hua." />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: product.name }} />
      <Screen>
        <View>
          <Row gap={space.xs} wrap>
            {product.family_name ? <Badge tone="accent">{product.family_name}</Badge> : null}
            {product.brand_name ? <Badge>{product.brand_name}</Badge> : null}
            {product.is_universal_fit ? <Badge tone="info">Sab gaadi mein lagta hai</Badge> : null}
          </Row>
          <Row style={{ justifyContent: 'space-between' }} align="flex-start">
            <Text variant="display" style={{ marginTop: space.xs, flex: 1 }}>
              {product.name}
            </Text>
            {can('catalog.edit') ? <Button title="Badlo" tone="secondary" size="sm" onPress={() => router.push(`/admin/product/${product.id}`)} /> : null}
          </Row>
          {product.description ? (
            <Text variant="small" color="textMuted">
              {product.description}
            </Text>
          ) : null}
        </View>

        {/* Variants */}
        <SectionTitle>Type · {variants?.length ?? 0}</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
          {(variants ?? []).map((v) => (
            <Chip key={v.id} label={`${v.variant_name} · ${v.qty}`} selected={v.id === variant?.id} onPress={() => setSelectedId(v.id)} />
          ))}
        </ScrollView>

        {variant ? (
          <Card>
            <Row style={{ justifyContent: 'space-between' }} align="flex-start">
              <View style={{ flex: 1 }}>
                <Text variant="title">{variant.variant_name}</Text>
                <Text variant="small" color="textMuted" mono>
                  {variant.sku}
                  {variant.barcode ? ` · ${variant.barcode}` : ''}
                </Text>
              </View>
              {(() => {
                const s = stockStatus(totalQty, variant.min_stock, variant.reorder_level);
                return <Badge tone={s === 'out' ? 'danger' : s === 'low' ? 'warn' : 'ok'}>{s === 'out' ? 'Out of stock' : s === 'low' ? 'Reorder' : 'In stock'}</Badge>;
              })()}
            </Row>

            <Divider />
            <Text variant="label" color="textMuted">
              Stock by location
            </Text>
            {(locStock ?? []).map((l) => (
              <KV key={l.location_id} k={l.name} v={`${l.qty} ${product.unit_code ?? ''}`.trim()} mono />
            ))}
            <KV k="Total" v={`${totalQty} ${product.unit_code ?? ''}`.trim()} mono />
            <Row gap={space.sm}>
              {/* Standing on the item's own page is the moment you know its
                  stock is wrong. Before this the fix was four screens away. */}
              {can('stock.adjust') ? (
                <Button title="Maal aaya" size="sm" onPress={() => router.push(`/stock/add?variant=${variant.id}` as never)} />
              ) : null}
              <Button title="Aana-jaana ka hisaab" tone="ghost" size="sm" onPress={() => router.push(`/stock/ledger/${variant.id}`)} />
            </Row>
            {variant.min_stock || variant.reorder_level ? (
              <Text variant="small" color="textFaint">
                Kam se kam {variant.min_stock} · {variant.reorder_level} par mangwao · sujhaav {variant.reorder_qty}
              </Text>
            ) : null}

            {showPrice ? (
              <>
                <Divider />
                <Text variant="label" color="textMuted">
                  Prices
                </Text>
                {variant.mrp ? <KV k="MRP" v={formatINR(variant.mrp)} mono /> : null}
                <KV k="Retail rate" v={formatINR(variant.retail_price)} mono />
                {variant.dealer_price ? <KV k="Dealer rate" v={formatINR(variant.dealer_price)} mono /> : null}
                {variant.wholesale_price ? <KV k="Thok rate" v={formatINR(variant.wholesale_price)} mono /> : null}
                {variant.min_selling_price ? <KV k="Isse kam nahi bechna" v={formatINR(variant.min_selling_price)} mono /> : null}
              </>
            ) : null}

            {showCost ? (
              <>
                <Divider />
                <Text variant="label" color="textMuted">
                  Cost & margin
                </Text>
                <KV k="Pichhla kharid rate" v={formatINR(variant.last_purchase_cost)} mono />
                <KV k="Average kharid rate" v={formatINR(variant.avg_cost)} mono />
                {(() => {
                  const m = margin(variant.dealer_price ?? variant.retail_price, variant.avg_cost);
                  return <KV k="Dealer rate par margin" v={`${formatINR(m.amount)} · ${m.pct}%`} mono />;
                })()}
              </>
            ) : null}
          </Card>
        ) : null}

        {/* Customer pricing */}
        {showPrice && variant ? (
          <>
            <SectionTitle>Kisi grahak ka rate</SectionTitle>
            <Card>
              {customer ? (
                <Row style={{ justifyContent: 'space-between' }}>
                  <View>
                    <Text variant="heading">{customer.name}</Text>
                    <Text variant="small" color="textMuted">
                      {customer.business_name ?? customer.customer_type}
                    </Text>
                  </View>
                  <Pressable onPress={() => setCustomer(null)}>
                    <Text variant="small" style={{ color: t.accent }}>
                      Change
                    </Text>
                  </Pressable>
                </Row>
              ) : (
                <>
                  <Input value={customerQuery} onChangeText={setCustomerQuery} placeholder="Grahak ka naam ya mobile" autoCapitalize="none" />
                  {tokenize(customerQuery).length > 0
                    ? (customerHits ?? []).map((c) => (
                        <ListRow
                          key={c.id}
                          title={c.name}
                          subtitle={[c.business_name, c.mobile].filter(Boolean).join(' · ')}
                          onPress={() => {
                            setCustomer(c);
                            setCustomerQuery('');
                          }}
                        />
                      ))
                    : null}
                </>
              )}
              {customer && resolved ? (
                <>
                  <Divider />
                  <Row style={{ justifyContent: 'space-between' }} align="flex-start">
                    <View>
                      <Text variant="label" color="textMuted">
                        Approved price
                      </Text>
                      <Text variant="small" color="textFaint">
                        {resolved.label}
                      </Text>
                    </View>
                    <Text variant="number" mono>
                      {formatINR(resolved.price)}
                    </Text>
                  </Row>
                  {can('catalog.edit_price') ? (
                    <Row gap={8} align="flex-end">
                      <View style={{ flex: 1 }}><NumberField label="Is grahak ke liye special rate" value={specialPrice} onChange={setSpecialPrice} placeholder={String(resolved.price)} /></View>
                      <Button title="Save karo" size="sm" tone="secondary" disabled={!specialPrice} onPress={async () => {
                        if (!specialPrice || !variant) return;
                        await insertRow(db, 'customer_prices', { customer_id: customer.id, variant_id: variant.id, price: specialPrice, effective_from: new Date().toISOString().slice(0, 10), approved_by: profile?.id ?? null }, actor);
                        setSpecialPrice(null);
                        notify(`Special price ₹${specialPrice} saved for ${customer.name}.`);
                      }} />
                    </Row>
                  ) : null}
                  <Row style={{ justifyContent: 'space-between' }} align="flex-start">
                    <View>
                      <Text variant="label" color="textMuted">
                        Last paid
                      </Text>
                      <Text variant="small" color="textFaint">
                        {lastRate ? `${lastRate.doc_no} · ${lastRate.doc_date}` : 'never bought this SKU'}
                      </Text>
                    </View>
                    <Text variant="number" mono color={lastRate && lastRate.rate < resolved.price ? 'warn' : 'text'}>
                      {lastRate ? formatINR(lastRate.rate) : '—'}
                    </Text>
                  </Row>
                </>
              ) : null}
            </Card>
          </>
        ) : null}

        {/* Specifications */}
        <SectionTitle>Spec</SectionTitle>
        <Card style={{ gap: 0 }}>
          {productSpecs.length === 0 && axisDefs.length === 0 ? <Empty title="Koi spec nahi likha" /> : null}
          {variant
            ? axisDefs.map((d) => <KV key={d.spec_definition_id} k={d.name} v={specFor(variant.id, d.spec_definition_id)} />)
            : null}
          {axisDefs.length > 0 && productSpecs.length > 0 ? <Divider /> : null}
          {productSpecs.map((s) => (
            <KV key={s.spec_definition_id} k={s.name} v={s.display_value} />
          ))}
          <Divider />
          {product.hsn_code ? <KV k="HSN" v={product.hsn_code} mono /> : null}
          {product.tax_rate_pct != null ? <KV k="GST" v={`${product.tax_rate_pct}%`} mono /> : null}
          {product.category_name ? <KV k="Category" v={[product.category_name, product.subcategory_name].filter(Boolean).join(' › ')} /> : null}
        </Card>

        {/* Compare variants */}
        {variants && variants.length > 1 && axisDefs.length > 0 ? (
          <>
            <SectionTitle>Alag-alag type mila ke dekho</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Card style={{ gap: 0, minWidth: 320 }}>
                <Row gap={space.md} style={{ paddingVertical: 6 }}>
                  <Text variant="label" color="textMuted" style={{ width: 140 }}>
                    Variant
                  </Text>
                  {axisDefs.map((d) => (
                    <Text key={d.spec_definition_id} variant="label" color="textMuted" style={{ width: 90 }}>
                      {d.name}
                    </Text>
                  ))}
                  <Text variant="label" color="textMuted" style={{ width: 70, textAlign: 'right' }}>
                    Stock
                  </Text>
                  {showPrice ? (
                    <Text variant="label" color="textMuted" style={{ width: 90, textAlign: 'right' }}>
                      Dealer
                    </Text>
                  ) : null}
                </Row>
                <Divider />
                {variants.map((v) => (
                  <Pressable key={v.id} onPress={() => setSelectedId(v.id)}>
                    <Row gap={space.md} style={{ paddingVertical: 8, backgroundColor: v.id === variant?.id ? t.surfaceAlt : 'transparent' }}>
                      <Text variant="small" style={{ width: 140, fontWeight: '600' }}>
                        {v.variant_name}
                      </Text>
                      {axisDefs.map((d) => (
                        <Text key={d.spec_definition_id} variant="small" style={{ width: 90 }}>
                          {specFor(v.id, d.spec_definition_id)}
                        </Text>
                      ))}
                      <Text variant="small" mono style={{ width: 70, textAlign: 'right' }} color={v.qty <= 0 ? 'danger' : 'text'}>
                        {v.qty}
                      </Text>
                      {showPrice ? (
                        <Text variant="small" mono style={{ width: 90, textAlign: 'right' }}>
                          {formatINR(v.dealer_price ?? v.retail_price)}
                        </Text>
                      ) : null}
                    </Row>
                  </Pressable>
                ))}
              </Card>
            </ScrollView>
          </>
        ) : null}

        {/* Fitment */}
        <SectionTitle>Kis gaadi mein lagta hai</SectionTitle>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {product.is_universal_fit && effectiveFitments.length === 0 ? (
            <Empty title="Sab gaadi mein lagta hai" hint="Ye spec se bikta hai (socket, size), gaadi se nahi." />
          ) : effectiveFitments.length === 0 ? (
            <Empty title="Koi gaadi nahi jodi" />
          ) : (
            effectiveFitments.map((f) => (
              <ListRow
                key={f.id}
                title={`${f.make_name} ${fitmentLabel({ modelName: f.model_name, yearFrom: f.year_from ?? f.gen_from, yearTo: f.year_to ?? f.gen_to })}`}
                subtitle={[f.generation_name, f.position?.replace('_', ' ')].filter(Boolean).join(' · ')}
                onPress={() => router.push(`/vehicle/${f.model_id}`)}
               
              />
            ))
          )}
        </Card>

        {/* History */}
        {showCost ? (
          <>
            <SectionTitle>Kharid ka hisaab · {variant?.variant_name}</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {purchases && purchases.length > 0 ? (
                purchases.map((p) => (
                  <ListRow key={p.id} title={p.supplier_name} subtitle={`${p.doc_no} · ${p.doc_date}`} right={<Text mono>{p.qty} @ {formatINR(p.rate)}</Text>} />
                ))
              ) : (
                <Empty title="Koi purchase nahi mila" hint="Shuruaati stock import se aaya tha." />
              )}
            </Card>
          </>
        ) : null}

        {showPrice ? (
          <>
            <SectionTitle>Bikri ka hisaab · {variant?.variant_name}</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {sales && sales.length > 0 ? (
                sales.map((s) => (
                  <ListRow key={s.id} title={s.customer_name} subtitle={`${s.doc_no} · ${s.doc_date}`} right={<Text mono>{s.qty} @ {formatINR(s.rate)}</Text>} />
                ))
              ) : (
                <Empty title="Abhi tak nahi bika" />
              )}
            </Card>
          </>
        ) : null}
      </Screen>
    </>
  );
}
