/**
 * Home — "aaj ka hisaab" (screen P1 of the September light pass).
 *
 * Light ground, white paper, hairline borders. Exactly one keyline card on
 * the screen — 1.5px ink border with a hard 3px offset shadow — and it holds
 * the figure the owner opened the app for. Red is reserved for actions, so
 * late money is amber and settled money is green; a red number would compete
 * with the button next to it.
 *
 * Motion stays restrained per the handoff: the takings figure counts up once,
 * panels enter staggered, nothing loops.
 */
import { useQuery, useStatus } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatINR, formatINRShort, toDateString } from '@domain';

import { DASHBOARD_TODAY, FAST_MOVING, LOW_STOCK, STOCK_VALUE_BY_LOCATION } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useShopSettings } from '@/lib/use-settings';
import { openWhatsApp, reminderMessage } from '@/lib/whatsapp';
import { Badge, Button, Card, Grid, Row, Screen, Text, useIsWide, useTheme } from '@/ui';
import { notify } from '@/ui/forms';
import { Enter, useCountUp } from '@/ui/motion';
import { radius, space, type as typeScale } from '@/ui/theme';

function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return toDateString(d); }

type Pending = { id: string; name: string; mobile: string | null; balance: number; today_bills: number };
type Low = { id: string; sku: string; variant_name: string; product_name: string; qty: number; min_stock: number; reorder_level: number };

export default function HomeScreen() {
  const router = useRouter();
  const status = useStatus();
  const t = useTheme();
  const { profile, can } = useSession();
  const shop = useShopSettings();
  const today = toDateString();
  const since30 = useMemo(() => daysAgo(30), []);

  const { data: kpiRows } = useQuery<Record<string, number>>(DASHBOARD_TODAY.sql, [today]);
  const kpi = kpiRows?.[0];
  const { data: locations } = useQuery<{ id: string; name: string; value: number }>(STOCK_VALUE_BY_LOCATION.sql);
  const { data: low } = useQuery<Low>(LOW_STOCK(5).sql);
  const { data: pending } = useQuery<Pending>(`
    SELECT c.id, c.name, c.mobile, COALESCE(pb.balance,0) AS balance,
           (SELECT COUNT(*) FROM sales_invoices i WHERE i.customer_id=c.id AND i.doc_type='invoice' AND i.status='posted' AND i.doc_date=?1) AS today_bills
    FROM customers c LEFT JOIN party_balance_live pb ON pb.party_type='customer' AND pb.party_id=c.id
    WHERE COALESCE(pb.balance,0) > 0 AND c.is_active=1 ORDER BY today_bills DESC, balance DESC LIMIT 5`, [today]);
  const fastQ = FAST_MOVING(since30, 4);
  const { data: fast } = useQuery<{ id: string; sku: string; variant_name: string; product_name: string; sold: number }>(fastQ.sql, fastQ.params);

  const showMoney = can('reports.view') || can('catalog.view_cost');
  const totalStock = (locations ?? []).reduce((a, l) => a + l.value, 0);
  const uploading = status.dataFlowStatus.uploading;
  const takings = useCountUp(kpi?.sales_today ?? 0);
  const overdue = kpi?.overdue_amount ?? 0;

  const wide = useIsWide();
  // Today's spend sits next to today's takings: a shopkeeper reads the two
  // together or neither is worth much.
  const { data: expRows } = useQuery<{ spent: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS spent FROM expenses WHERE expense_date = ?',
    [toDateString()]);
  const spentToday = expRows?.[0]?.spent ?? 0;

  const { data: setupRows } = useQuery<{ products: number; customers: number; bills: number }>(
    `SELECT (SELECT COUNT(*) FROM products WHERE is_active = 1) AS products,
            (SELECT COUNT(*) FROM customers WHERE is_active = 1) AS customers,
            (SELECT COUNT(*) FROM sales_invoices) AS bills`);
  const setup = setupRows?.[0];
  // A shop with nothing in it does not need six zeros and two "sab clear hai"
  // panels — it needs to be told what to do first.
  const fresh = (setup?.products ?? 0) === 0 && (setup?.bills ?? 0) === 0;

  async function remind(p: Pending) {
    if (!p.mobile) { notify(`${p.name} ka mobile number nahi hai.`); return; }
    await openWhatsApp(p.mobile, reminderMessage(shop.wa, { name: p.name, pending: p.balance }));
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }} align="flex-start">
        <View>
          <Text variant="label" color="textFaint">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text variant="display" style={{ marginTop: 3 }}>Namaste, {profile?.full_name?.split(' ')[0] ?? 'ji'}</Text>
        </View>
        <Pressable onPress={() => router.push('/sync')} hitSlop={12} accessibilityRole="button">
          <Badge tone={!status.connected ? 'warn' : uploading ? 'info' : 'ok'} dot>
            {!status.connected ? 'Offline' : uploading ? 'Syncing' : 'Synced'}
          </Badge>
        </Pressable>
      </Row>

      {fresh ? (
        <Enter>
          <View style={{ width: '100%', maxWidth: 720, alignSelf: wide ? 'center' : 'stretch' }}>
          <SetupCard
            products={setup?.products ?? 0}
            customers={setup?.customers ?? 0}
            canCatalog={can('catalog.edit')}
            canParty={can('party.edit')}
            canSell={can('sale.create')}
            onItem={() => router.push('/admin/item')}
            onImport={() => router.push('/admin/import')}
            onCustomer={() => router.push('/customer/edit')}
            onBill={() => router.push('/invoice/edit')}
          />
          </View>
        </Enter>
      ) : (
        <>
      {/* The one keyline card. */}
        <Enter>
          <Card keyline style={{ gap: space.md }}>
            <Text variant="label" color="textMuted">Aaj ka maal gaya</Text>
            <Text style={[typeScale.hero, { color: t.text }]}>{formatINR(Math.round(takings))}</Text>
            <Row gap={space.sm} align="stretch">
              <Tile value={String(kpi?.invoices_today ?? 0)} label="bill" />
              <Tile value={formatINR(kpi?.collected_today ?? 0)} label="aayi" />
              {can('purchase.create') ? <Tile value={formatINR(kpi?.purchases_today ?? 0)} label="kharida" /> : null}
            {can('expense.record') ? <Tile value={formatINR(spentToday)} label="kharcha" /> : null}
            </Row>
          </Card>
        </Enter>

        <Enter index={1}>
          <Row gap={space.sm}>
            {can('sale.create') ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/invoice/edit')} android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                style={({ pressed }) => [
                styles.primary,
                wide && { flex: 0, minWidth: 260, paddingHorizontal: 32 },
                { backgroundColor: t.accent, transform: [{ scale: pressed ? 0.97 : 1 }] },
              ]}>
                <Text style={{ color: t.accentText, fontWeight: '700' }}>Naya bill</Text>
              </Pressable>
            ) : null}
            {can('payment.receive') ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/payment/edit?direction=in')}
                style={({ pressed }) => [styles.secondary, { backgroundColor: t.surface, borderColor: t.borderStrong, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                <Text style={{ fontWeight: '600' }}>Payment aayi</Text>
              </Pressable>
            ) : null}
          </Row>
        </Enter>

        {showMoney ? (
          <Enter index={2}>
            <Row gap={space.sm} align="stretch">
              <Figure
                label="Customer pending"
                value={formatINRShort(kpi?.receivables ?? 0)}
                sub={overdue ? `${formatINRShort(overdue)} overdue` : 'kuch overdue nahi'}
                tone={overdue ? 'warn' : undefined}
                onPress={() => router.push('/reminders')}
              />
              <Figure
                label="Stock value"
                value={formatINRShort(totalStock)}
                sub={`cost par · ${(locations ?? []).length} location`}
                onPress={() => router.push('/stock')}
              />
            </Row>
          </Enter>
        ) : null}

        {/* Two short lists. Stacked they run a metre down a counter
            monitor with white space beside them; side by side they are one
            glance. On a phone the Grid falls back to one column. */}
        <Grid min={420}>
          <Enter index={3}>
            <Panel title="Pending khata" count={(pending ?? []).length} action={{ label: 'Sabko bhejo', onPress: () => router.push('/reminders') }}>
              {pending && pending.length ? pending.map((p, i) => (
                <PanelRow
                  key={p.id}
                  first={i === 0}
                  title={p.name}
                  sub={p.today_bills ? `${p.today_bills} bill aaj` : 'purana balance'}
                  value={formatINR(p.balance)}
                  valueColor="warn"
                  onPress={() => router.push(`/customer/${p.id}`)}
                  cta={{ label: 'Remind', onPress: () => remind(p) }}
                />
              )) : <Blank text="Sab clear hai" />}
            </Panel>
          </Enter>

          <Enter index={4}>
            <Panel title="Stock kam hai" count={(low ?? []).length} action={{ label: 'Sab dekho', onPress: () => router.push('/stock') }}>
              {low && low.length ? low.map((v, i) => (
                <PanelRow
                  key={v.id}
                  first={i === 0}
                  title={`${v.product_name} · ${v.variant_name}`}
                  sub={v.sku}
                  subMono
                  value={`${v.qty} / ${Math.max(v.min_stock, v.reorder_level)}`}
                  valueColor={v.qty <= 0 ? 'danger' : 'warn'}
                  onPress={() => router.push(`/product/${encodeURIComponent(v.sku)}?by=sku`)}
                />
              )) : <Blank text="Sab minimum se upar" />}
            </Panel>
          </Enter>
        </Grid>

        </>
      )}

      {fast && fast.length ? (
        <Enter index={5}>
          <Panel title="Tez bikne wala" count={fast.length}>
            {fast.map((v, i) => (
              <PanelRow key={v.id} first={i === 0} title={`${v.product_name} · ${v.variant_name}`} sub={v.sku} subMono value={`${v.sold} bike`} />
            ))}
          </Panel>
        </Enter>
      ) : null}
    </Screen>
  );
}

// -----------------------------------------------------------------------------

function Tile({ value, label }: { value: string; label: string }) {
  const t = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: t.bg }]}>
      <Text variant="mono" style={{ fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{value}</Text>
      <Text variant="label" color="textFaint">{label}</Text>
    </View>
  );
}

function Figure({ label, value, sub, tone, onPress }: { label: string; value: string; sub?: string; tone?: 'warn'; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.75 : 1 }]}>
      <Card spine={tone} style={{ gap: 3, minHeight: 96 }}>
        <Text variant="label" color="textMuted">{label}</Text>
        <Text variant="number" color={tone === 'warn' ? 'warn' : 'text'}>{value}</Text>
        {sub ? <Text variant="small" color="textFaint">{sub}</Text> : null}
      </Card>
    </Pressable>
  );
}

function Panel({ title, count, action, children }: { title: string; count?: number; action?: { label: string; onPress: () => void }; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 2 }}>
        <Row gap={space.sm}>
          <Text variant="label" color="textMuted">{title}</Text>
          {count != null ? <Text variant="label" color="textFaint">{count}</Text> : null}
        </Row>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={10}>
            <Text variant="small" color="accent" style={{ fontWeight: '600' }}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Row>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>{children}</Card>
    </View>
  );
}

function PanelRow({
  title, sub, subMono, value, valueColor = 'text', first, onPress, cta,
}: {
  title: string; sub?: string; subMono?: boolean; value?: string;
  valueColor?: 'text' | 'warn' | 'danger' | 'ok'; first?: boolean;
  onPress?: () => void; cta?: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  // The row and its trailing action are siblings, never nested: a button
  // inside a button is invalid HTML on web and leaves a screen reader unable
  // to reach the inner control.
  return (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: t.border }]}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        onPress={onPress}
        disabled={!onPress}
        android_ripple={onPress ? { color: t.bg } : undefined}
        style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }, pressed && { opacity: 0.65 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="rowTitle" numberOfLines={1}>{title}</Text>
          {sub ? <Text variant={subMono ? 'mono' : 'small'} color="textFaint" numberOfLines={1}>{sub}</Text> : null}
        </View>
        {value ? <Text variant="mono" color={valueColor} style={{ fontWeight: '600', fontSize: 14 }}>{value}</Text> : null}
      </Pressable>
      {cta ? (
        <Pressable accessibilityRole="button" onPress={cta.onPress} hitSlop={8}
          style={({ pressed }) => [styles.cta, { borderColor: t.borderStrong, opacity: pressed ? 0.6 : 1 }]}>
          <Text variant="small" style={{ fontWeight: '600' }}>{cta.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Blank({ text }: { text: string }) {
  return (
    <View style={{ paddingVertical: space.xl, alignItems: 'center' }}>
      <Text variant="small" color="textFaint">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  primary: { flex: 1, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  secondary: { borderRadius: radius.pill, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 13, paddingHorizontal: space.lg },
  cta: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14 },
});

// -----------------------------------------------------------------------------

/**
 * What a shop with nothing in it sees instead of the day's figures.
 *
 * Six zeros and two "sab clear hai" panels is technically accurate and tells a
 * new owner nothing. This is the same screen answering the only question they
 * have on day one: what do I do first. It disappears for good the moment the
 * first bill exists, so it costs a working shop nothing.
 *
 * Steps are ordered by dependency, not importance — a bill needs an item, so
 * the item comes first and the bill step stays quiet until it is reachable.
 */
function SetupCard({
  products, customers, canCatalog, canParty, canSell, onItem, onImport, onCustomer, onBill,
}: {
  products: number;
  customers: number;
  canCatalog: boolean;
  canParty: boolean;
  canSell: boolean;
  onItem: () => void;
  onImport: () => void;
  onCustomer: () => void;
  onBill: () => void;
}) {
  const t = useTheme();
  const steps = [
    {
      done: products > 0,
      ready: true,
      title: 'Maal daalo',
      sub: products > 0 ? `${products} item ho gaye` : 'Ek category, ek item, rate — 2 minute',
      action: canCatalog ? { label: 'Naya item', onPress: onItem } : null,
      alt: canCatalog && products === 0 ? { label: 'CSV se', onPress: onImport } : null,
    },
    {
      done: customers > 0,
      ready: true,
      title: 'Customer jodo',
      sub: customers > 0 ? `${customers} customer` : 'Khata usi ke naam par chalega',
      action: canParty ? { label: 'Naya customer', onPress: onCustomer } : null,
      alt: null,
    },
    {
      done: false,
      ready: products > 0,
      title: 'Pehla bill banao',
      sub: products > 0 ? 'Ab ban sakta hai' : 'Pehle maal daalna padega',
      action: canSell ? { label: 'Naya bill', onPress: onBill } : null,
      alt: null,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done && s.ready);

  return (
    <Card keyline style={{ gap: space.md }}>
      <View>
        <Text variant="label" color="textMuted">Shuruaat</Text>
        <Text variant="display" style={{ marginTop: 3 }}>Dukaan taiyaar karo</Text>
        <Text variant="small" color="textMuted" style={{ marginTop: 4 }}>
          Teen kadam. Uske baad yahi screen aapka roz ka hisaab dikhayegi.
        </Text>
      </View>

      {/* A plain bar rather than a percentage: three steps do not need maths. */}
      <Row gap={6}>
        {steps.map((s, i) => (
          <View
            key={i}
            style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: s.done ? t.ok : t.border }}
          />
        ))}
      </Row>

      <View style={{ gap: space.sm }}>
        {steps.map((s, i) => (
          <Row key={i} gap={space.md} align="center">
            <View
              style={{
                width: 26, height: 26, borderRadius: 13,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: s.done ? t.ok : s.ready ? t.accentSoft : t.surfaceAlt,
              }}>
              <Text
                variant="small"
                style={{ fontWeight: '700', color: s.done ? '#fff' : s.ready ? t.accentStrong : t.textFaint }}>
                {s.done ? '✓' : String(i + 1)}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text variant="rowTitle" color={s.ready || s.done ? undefined : 'textFaint'}>{s.title}</Text>
              <Text variant="small" color="textMuted">{s.sub}</Text>
            </View>

            {s.done ? null : (
              <Row gap={6}>
                {s.alt ? <Button title={s.alt.label} tone="ghost" onPress={s.alt.onPress} /> : null}
                {s.action ? (
                  <Button
                    title={s.action.label}
                    tone={i === next ? 'primary' : 'secondary'}
                    onPress={s.action.onPress}
                    disabled={!s.ready}
                  />
                ) : null}
              </Row>
            )}
          </Row>
        ))}
      </View>

      <Text variant="small" color="textFaint">
        {done === 0 ? 'Abhi kuch nahi hua' : `${done} / 3 ho gaya`}
      </Text>
    </Card>
  );
}
