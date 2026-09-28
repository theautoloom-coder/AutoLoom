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
import { Card, Empty, Grid, IconBadge, ListRow, Row, Screen, SectionTitle, StatTile, Text } from '@/ui';
import { useCountUp } from '@/ui/motion';
import { space } from '@/ui/theme';

type Feed = { kind: string; id: string; at: string; who: string; amount: number | null; qty: number | null };

/** What each kind of entry is called, and what it looks like. */
const KIND: Record<string, { label: string; icon: string; accent: string; sign: '+' | '−' | '' }> = {
  sale: { label: 'Maal gaya', icon: 'arrow-up-circle-outline', accent: 'blue', sign: '' },
  purchase: { label: 'Maal aaya', icon: 'arrow-down-circle-outline', accent: 'green', sign: '' },
  expense: { label: 'Kharcha', icon: 'wallet-outline', accent: 'amber', sign: '−' },
  payment: { label: 'Payment', icon: 'cash-outline', accent: 'teal', sign: '' },
  damage: { label: 'Kharab maal', icon: 'alert-circle-outline', accent: 'rose', sign: '' },
  adjust: { label: 'Stock sudhar', icon: 'swap-vertical-outline', accent: 'violet', sign: '' },
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Subah bakhair';
  if (h < 17) return 'Namaste';
  return 'Shubh sandhya';
}

function clockOf(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function HomeScreen() {
  const router = useRouter();
  const { can, profile } = useSession();
  const today = toDateString();

  const { data: kpiRows } = useQuery<Record<string, number>>(DASHBOARD_TODAY.sql, [today]);
  const k = kpiRows?.[0];
  const { data: feed } = useQuery<Feed>(TODAY_FEED.sql, [today]);

  const showMoney = can('reports.view') || can('catalog.view_cost');

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
      </View>

      <Grid min={150}>
        <StatTile label="Aaj ki sale" value={formatINR(takings)} sub={`${k?.invoices_today ?? 0} bill`} icon="trending-up-outline" accent="blue" onPress={() => router.push('/parchi')} />
        <StatTile label="Aaj ka kharcha" value={formatINR(spent)} sub="business ka" icon="wallet-outline" accent="amber" onPress={() => router.push('/expenses')} />
        {showMoney ? (
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
        {showMoney ? (
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

      <SectionTitle right={(feed ?? []).length ? <Text variant="small" color="textFaint">{(feed ?? []).length}</Text> : undefined}>
        Aaj kya hua
      </SectionTitle>

      {(feed ?? []).length === 0 ? (
        <Empty title="Aaj abhi tak kuch nahi hua" hint="Neeche “+” dabao — maal aaya, maal gaya, ya kharcha." />
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
                  f.amount != null ? (
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
