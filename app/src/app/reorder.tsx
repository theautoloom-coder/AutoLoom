/**
 * Kya mangwana hai — the shopping list, worked out from what actually sold.
 *
 * Recent sales velocity → days of cover → suggested purchase quantity, with
 * the last supplier and rate. The screen is named for the question and not for
 * "reorder", because nobody at the counter has ever said reorder.
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

/**
 * The badge on each row. `movementClass` answers in English because it is a
 * domain type; the shop needs to read it, so the words are translated here and
 * not in the domain, where a rename would touch the tests and the migrations.
 */
const MOVE: Record<string, string> = {
  fast: 'Tezi se bik raha',
  medium: 'Theek chal raha',
  slow: 'Dheere bik raha',
  dead: 'Ruka pada hai',
};

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
    if (Platform.OS !== 'web') { notify('CSV export web par milta hai.'); return; }
    const csv = toCsv(visible.map((r) => ({ sku: r.sku, product: r.product_name, variant: r.variant_name, on_hand: r.qty, sold_in_period: r.sold, suggested_qty: r.suggest, supplier: r.supplier_name ?? '', last_rate: r.last_rate ?? '' })));
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `autogrid-reorder-${toDateString()}.csv`; a.click();
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Kya mangwana hai</Text>
        {/* The CSV carries each supplier's last rate — a buy rate, partners only. */}
        {can('catalog.view_cost') ? <Button title="CSV" tone="secondary" size="sm" onPress={exportCsv} disabled={!visible.length} /> : null}
      </Row>
      <Text variant="small" color="textMuted">Jo tezi se bik raha hai aur khatam hone wala hai. Roz ki bikri dekh ke bataya hai ki kitna mangwana chahiye.</Text>
      {/* Two questions, two blocks, each label above its own chips. They used
          to share one wrapping row, and on a phone it broke into
          "BIKRI DEKHEIN [30] [60] / [90] CHALANA HAI [15] / [30] [45]" — two
          selected "30 din" on different lines and no way to tell which
          question either one answered. */}
      <View style={{ gap: space.xs }}>
        <Text variant="label" color="textMuted">Kitne din ki bikri dekhein</Text>
        <Row gap={space.xs} wrap>
          {[30, 60, 90].map((d) => <Chip key={d} label={`${d} din`} selected={days === d} onPress={() => setDays(d)} />)}
        </Row>
      </View>
      <View style={{ gap: space.xs }}>
        <Text variant="label" color="textMuted">Kitne din ka maal chahiye</Text>
        <Row gap={space.xs} wrap>
          {[15, 30, 45].map((d) => <Chip key={d} label={`${d} din`} selected={cover === d} onPress={() => setCover(d)} />)}
        </Row>
      </View>
      {families.length > 1 ? <Row gap={space.xs} wrap><Chip label="Sab" selected={!family} onPress={() => setFamily(null)} />{families.map((f) => <Chip key={f} label={f} selected={family === f} onPress={() => setFamily(family === f ? null : f)} />)}</Row> : null}
      <Card tone="alt">
        <Row gap={space.lg} wrap>
          <View><Text variant="label" color="textMuted">Kitne item mangwane hain</Text><Text variant="number">{visible.length}</Text></View>
          {can('catalog.view_cost') ? <View><Text variant="label" color="textMuted">Takreeban kitne ka maal</Text><Text variant="number">{formatINR(value)}</Text></View> : null}
        </Row>
      </Card>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {visible.map((r) => (
          <ListRow key={r.id} title={`${r.product_name} · ${r.variant_name}`}
            subtitle={`${r.sku} · abhi ${r.qty} pcs · ${days} din mein ${r.sold} bike (roz ${r.perDay.toFixed(1)})${r.supplier_name ? ` · ${r.supplier_name}${r.last_rate && can('catalog.view_cost') ? ` @ ${formatINR(r.last_rate)}` : ''}` : ''}`}
            onPress={() => router.push(`/product/${r.product_id}?variant=${r.id}`)}
            right={<View style={{ alignItems: 'flex-end' }}><Text variant="number" mono color="accent">{r.suggest}</Text><Badge tone={r.cls === 'fast' ? 'ok' : r.cls === 'dead' ? 'danger' : 'neutral'}>{MOVE[r.cls] ?? r.cls}</Badge></View>} />
        ))}
        {visible.length === 0 ? <Empty title="Kuch mangwane ki zaroorat nahi" hint="Chune hue din tak sab kuch kaafi hai." /> : null}
      </Card>
    </Screen>
  );
}
