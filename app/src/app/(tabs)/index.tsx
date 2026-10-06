/**
 * Ghar — aaj ka business, ek nazar mein.
 *
 * Five numbers and a day. The owner opens this to answer five questions and
 * then close it: kitna bika, kitna kharch hua, kitna bacha, kitna maal hai,
 * kahan khatam ho raha hai. Everything else was clutter between them.
 *
 * Under that, "Aaj kya hua" — the day as it happened, newest first, in one
 * list out of five tables, because a shop does not think in tables. This is
 * also the only honest answer to "is the app working?": if the morning's
 * entries are there, it is.
 *
 * The takings count up. One moving number on the screen the owner opens first
 * is a moment; a screen where everything moves is a nuisance.
 */
import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { formatINR, formatINRShort, toDateString } from '@domain';

import { DASHBOARD_TODAY, TODAY_FEED } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Button, Card, Empty, Grid, IconBadge, ListRow, Row, Screen, SectionTitle, StatTile, Text } from '@/ui';
import { clockOf, KIND } from '@/ui/kinds';
import { useCountUp } from '@/ui/motion';
import { SkeletonList, SkeletonTile } from '@/ui/skeleton';
import { space } from '@/ui/theme';

type Feed = { kind: string; id: string; at: string; who: string; amount: number | null; qty: number | null };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Subah bakhair';
  if (h < 17) return 'Namaste';
  return 'Shubh sandhya';
}

export default function HomeScreen() {
  const router = useRouter();
  const { can, profile } = useSession();
  const today = toDateString();

  // The two halves of this screen are two queries, so they wait separately.
  // Blocking the numbers on the feed would hold back the thing the owner
  // opened the app for because a list of the day's entries was still being
  // stitched out of five tables.
  const { data: kpiRows, isLoading: kpiLoading } = useQuery<Record<string, number>>(DASHBOARD_TODAY.sql, [today]);
  const k = kpiRows?.[0];
  const { data: feed, isLoading: feedLoading } = useQuery<Feed>(TODAY_FEED.sql, [today]);

  // Munafa and what the stock cost are the owner's numbers (owner's call,
  // 6 Oct 2026). reports.view used to open them, and the Hisaab role holds
  // that — so the counter hand saw the day's profit on the first screen.
  const showProfit = can('reports.view_margin');
  const showCost = can('catalog.view_cost');
  const seeTotals = can('reports.view');
  const approver = can('purchase.approve');
  const { data: waitingRows } = useQuery<{ n: number }>(
    `SELECT COUNT(*) AS n FROM purchases WHERE status = 'draft' AND submitted_at IS NOT NULL`);
  const waiting = waitingRows?.[0]?.n ?? 0;
  // Same count the Grid below renders, so the grey tiles and the real ones
  // occupy the same rows and nothing reflows underneath them.
  const tileCount = 3 + (showProfit ? 1 : 0) + (showCost ? 1 : 0);

  const sale = k?.sales_today ?? 0;
  const spent = k?.spent_today ?? 0;
  const cogs = k?.cogs_today ?? 0;
  const damage = k?.damage_today ?? 0;
  // Sab kharcha aur maal ki cost nikalne ke baad kitna bacha.
  const profit = sale - cogs - spent - damage;
  const takings = useCountUp(sale);

  return (
    <Screen>
      <View>
        <Text variant="display">{greeting()}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</Text>
        <Text variant="small" color="textMuted">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text variant="small" color="textMuted">
          Aaj dukan ka kya haal hai — ek nazar mein.
        </Text>
      </View>

      {/* The two jobs that happen twenty times a day, named and on the first
          screen. Everything used to live behind an unlabelled red circle, and
          the shop's own owner opened the app, looked for how to add stock, and
          could not find it. A main action you have to discover is not a main
          action. The other three are still one tap away under "Nayi entry". */}
      <Row gap={space.sm}>
        {can('sale.create') ? (
          <Button
            title="Bill Banao"
            size="lg"
            onPress={() => router.push('/invoice/edit')}
            style={{ flex: 1 }}
          />
        ) : null}
        {can('purchase.create') || can('stock.adjust') ? (
          <Button
            title="Stock Chadhao"
            tone="secondary"
            size="lg"
            onPress={() => router.push('/stock/add')}
            style={{ flex: 1 }}
          />
        ) : null}
      </Row>

      {kpiLoading ? (
        <Grid min={150}>
          {Array.from({ length: tileCount }, (_, i) => (
            <SkeletonTile key={i} />
          ))}
        </Grid>
      ) : (
        <Grid min={150}>
          {/* The day's total sale is the partners' number (owner, 6 Oct 2026);
              staff see how many bills went out, which is what they act on. */}
          {seeTotals ? (
            <StatTile label="Aaj ki sale" value={formatINR(takings)} sub={`${k?.invoices_today ?? 0} bill`} icon="trending-up-outline" accent="blue" onPress={() => router.push('/hisab')} />
          ) : (
            <StatTile label="Aaj ke bill" value={String(k?.invoices_today ?? 0)} sub="bill bane" icon="receipt-outline" accent="blue" onPress={() => router.push('/parchi')} />
          )}
          {seeTotals ? (
            <StatTile label="Aaj ka kharcha" value={formatINR(spent)} sub="business ka" icon="wallet-outline" accent="amber" onPress={() => router.push('/expenses')} />
          ) : null}
          {approver && waiting > 0 ? (
            <StatTile label="Approval baaki" value={String(waiting)} sub="staff ka maal — rate bharo" icon="checkmark-done-outline" accent="rose" tone="danger" onPress={() => router.push('/requests')} />
          ) : null}
          {showProfit ? (
            <StatTile
              label="Aaj ka munafa"
              value={formatINR(profit)}
              sub="cost aur kharcha nikaal ke"
              icon="cash-outline"
              accent="green"
              tone={profit < 0 ? 'danger' : undefined}
              onPress={() => router.push('/hisab')}
            />
          ) : null}
          {showCost ? (
            <StatTile label="Total stock" value={formatINRShort(k?.stock_value ?? 0)} sub="godown ki keemat" icon="cube-outline" accent="violet" onPress={() => router.push('/stock')} />
          ) : null}
          <StatTile
            label="Khatam hone wala"
            value={String(k?.low_stock_count ?? 0)}
            sub="item"
            icon="alert-circle-outline"
            accent="rose"
            tone={(k?.low_stock_count ?? 0) > 0 ? 'warn' : undefined}
            onPress={() => router.push('/stock')}
          />
        </Grid>
      )}

      <SectionTitle right={(feed ?? []).length ? <Text variant="small" color="textFaint">{(feed ?? []).length}</Text> : undefined}>
        Aaj kya hua
      </SectionTitle>

      {feedLoading ? (
        // Three, not ten: this list is the last forty entries of the day and
        // on most mornings it is short. Ten grey rows would promise a busy day
        // and then collapse to two.
        <SkeletonList rows={3} size={38} />
      ) : (feed ?? []).length === 0 ? (
        <Empty art="parchi" title="Aaj abhi tak kuch nahi hua" hint="Neeche “Nayi entry” dabao — Bill Banao, Stock Chadhao ya Kharcha Likho." />
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(feed ?? []).map((f) => {
            const look = KIND[f.kind] ?? KIND.adjust;
            return (
              <ListRow
                key={`${f.kind}-${f.id}`}
                left={<IconBadge name={look.icon as never} accent={look.accent} />}
                title={look.label}
                subtitle={
                  <Row gap={space.xs} wrap>
                    <Text variant="small" color="textFaint" mono>{clockOf(f.at)}</Text>
                    <Text variant="small" color="textMuted">{f.who}</Text>
                  </Row>
                }
                right={
                  // A purchase's amount is what the maal cost; owner only.
                  f.amount != null && (f.kind !== 'purchase' || showCost) ? (
                    <Text mono color={look.sign === '−' ? 'warn' : 'text'}>
                      {look.sign}
                      {formatINR(f.amount)}
                    </Text>
                  ) : f.qty != null ? (
                    <Text mono color={f.qty < 0 ? 'danger' : 'ok'}>
                      {f.qty > 0 ? '+' : ''}
                      {f.qty}
                    </Text>
                  ) : null
                }
              />
            );
          })}
        </Card>
      )}

    </Screen>
  );
}
