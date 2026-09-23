/**
 * Reorder suggestions: recent sales velocity → days of cover → suggested
 * purchase quantity, with the last supplier and rate.
 */
import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, View } from 'react-native';

import { formatINR, movementClass, suggestedReorderQty, toCsv, toDateString } from '@domain';

import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Empty, ListRow, Row, Screen, Text } from '@/ui';
import { notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type R = { id: string; sku: string; variant_name: string; product_name: string; product_id: string; family_name: string | null; qty: number; min_stock: number; reorder_level: number; reorder_qty: number; sold: number; last_sold: string | null; supplier_name: string | null; last_rate: number | null; avg_cost: number };

export default function ReorderScreen() {
  const router = useRouter();
  const { can } = useSession();
  const [days, setDays] = useState(30);
  const [cover, setCover] = useState(30);
  const [family, setFamily] = useState<string | null>(null);
  const since = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - days); return toDateString(d); }, [days]);
  const { data: settings } = useQuery<{ id: string; value: string }>("SELECT id, value FROM app_settings WHERE id IN ('dead_stock_days')");
  const deadDays = Number(JSON.parse(settings?.find((s) => s.id === 'dead_stock_days')?.value ?? '90'));

  const { data: rows } = useQuery<R>(`
    SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name, p.id AS product_id, f.name AS family_name, pv.min_stock, pv.reorder_level, pv.reorder_qty, pv.avg_cost,
           COALESCE((SELECT SUM(qty) FROM stock_on_hand s JOIN locations l ON l.id = s.location_id WHERE s.variant_id = pv.id AND l.type <> 'damaged'), 0) AS qty,
           COALESCE((SELECT SUM(l.qty) FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.invoice_id AND i.status = 'posted' AND i.doc_type = 'invoice' AND i.doc_date >= ?1 WHERE l.variant_id = pv.id), 0) AS sold,
           (SELECT MAX(i.doc_date) FROM sales_invoice_lines l JOIN sales_invoices i ON i.id = l.invoice_id AND i.status = 'posted' WHERE l.variant_id = pv.id) AS last_sold,
           (SELECT s.name FROM supplier_products sp JOIN suppliers s ON s.id = sp.supplier_id WHERE sp.variant_id = pv.id ORDER BY sp.last_date DESC LIMIT 1) AS supplier_name,
           (SELECT sp.last_rate FROM supplier_products sp WHERE sp.variant_id = pv.id ORDER BY sp.last_date DESC LIMIT 1) AS last_rate
    FROM product_variants pv JOIN products p ON p.id = pv.product_id LEFT JOIN product_families f ON f.id = p.family_id
    WHERE pv.is_active = 1 AND p.is_active = 1 AND (f.code IS NULL OR f.code <> 'SRVC')`, [since]);

  const computed = useMemo(() => (rows ?? []).map((r) => {
    const suggest = suggestedReorderQty({ soldQty: r.sold, overDays: days, currentQty: r.qty, coverDays: cover, reorderQty: r.qty <= Math.max(r.min_stock, r.reorder_level) ? r.reorder_qty : 0 });
    const daysSince = r.last_sold ? Math.floor((Date.now() - new Date(r.last_sold).getTime()) / 86400000) : null;
    const cls = movementClass({ soldQty: r.sold, overDays: days, currentQty: r.qty, deadDays, daysSinceLastSale: daysSince });
    return { ...r, suggest, cls, perDay: r.sold / days };
  }).filter((r) => r.suggest > 0 || r.qty <= Math.max(r.min_stock, r.reorder_level)).sort((a, b) => b.suggest * (b.last_rate ?? b.avg_cost) - a.suggest * (a.last_rate ?? a.avg_cost)), [rows, days, cover, deadDays]);

  const families = [...new Set(computed.map((r) => r.family_name).filter(Boolean) as string[])].sort();
  const visible = computed.filter((r) => !family || r.family_name === family);
  const value = visible.reduce((a, r) => a + r.suggest * (r.last_rate ?? r.avg_cost), 0);

  function exportCsv() {
    if (Platform.OS !== 'web') { notify('CSV export is available in the web app.'); return; }
    const csv = toCsv(visible.map((r) => ({ sku: r.sku, product: r.product_name, variant: r.variant_name, on_hand: r.qty, sold_in_period: r.sold, suggested_qty: r.suggest, supplier: r.supplier_name ?? '', last_rate: r.last_rate ?? '' })));
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `autogrid-reorder-${toDateString()}.csv`; a.click();
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Reorder</Text>
        <Button title="CSV" tone="secondary" size="sm" onPress={exportCsv} disabled={!visible.length} />
      </Row>
      <Text variant="small" color="textMuted">Suggested quantity = sales per day over the window × days of cover − on hand, never below the SKU's own reorder quantity when it is under its minimum.</Text>
      <Row gap={space.xs} wrap>
        <Text variant="label" color="textMuted">Window</Text>
        {[30, 60, 90].map((d) => <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />)}
        <Text variant="label" color="textMuted" style={{ marginLeft: 8 }}>Cover</Text>
        {[15, 30, 45].map((d) => <Chip key={d} label={`${d} days`} selected={cover === d} onPress={() => setCover(d)} />)}
      </Row>
      {families.length > 1 ? <Row gap={space.xs} wrap><Chip label="All" selected={!family} onPress={() => setFamily(null)} />{families.map((f) => <Chip key={f} label={f} selected={family === f} onPress={() => setFamily(family === f ? null : f)} />)}</Row> : null}
      <Card tone="alt">
        <Row gap={space.lg} wrap>
          <View><Text variant="label" color="textMuted">SKUs to order</Text><Text variant="number">{visible.length}</Text></View>
          {can('catalog.view_cost') ? <View><Text variant="label" color="textMuted">Approx. purchase value</Text><Text variant="number">{formatINR(value)}</Text></View> : null}
        </Row>
      </Card>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {visible.map((r) => (
          <ListRow key={r.id} title={`${r.product_name} · ${r.variant_name}`}
            subtitle={`${r.sku} · on hand ${r.qty} · sold ${r.sold} in ${days}d (${r.perDay.toFixed(1)}/day)${r.supplier_name ? ` · ${r.supplier_name}${r.last_rate && can('catalog.view_cost') ? ` @ ${formatINR(r.last_rate)}` : ''}` : ''}`}
            onPress={() => router.push(`/product/${r.product_id}?variant=${r.id}`)}
            right={<View style={{ alignItems: 'flex-end' }}><Text variant="number" mono color="accent">{r.suggest}</Text><Badge tone={r.cls === 'fast' ? 'ok' : r.cls === 'dead' ? 'danger' : 'neutral'}>{r.cls}</Badge></View>} />
        ))}
        {visible.length === 0 ? <Empty title="Nothing to reorder" hint="Everything has enough cover for the chosen window." /> : null}
      </Card>
    </Screen>
  );
}
