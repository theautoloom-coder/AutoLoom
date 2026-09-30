/**
 * Bill — aaj din bhar kya-kya hua.
 *
 * The file is still parchi.tsx because the route is /parchi and renaming a
 * route breaks every deep link already sent over WhatsApp. On screen it is
 * "Bill", which is the word the shop used for it long before we did.
 *
 * This screen used to be the `audit_logs` table with the column names
 * translated: "Bill badla", "Item ka rate banaya", one row per keystroke that
 * synced. It answered "who touched what", which is a question an owner asks
 * about twice a year, and it buried the question they ask about twenty times a
 * day — what happened in the shop today.
 *
 * So it is now the day itself, newest first, with the clock on every line.
 * Bill, naya stock, kharcha, payment, kharab maal — the five things that
 * actually move, out of the five tables they live in, because the shop does
 * not think in tables. Tap a line and you land on the document it came from.
 *
 * Home's "Aaj kya hua" is the first forty rows of this same list, so the
 * labels, icons and accents below are copied from there character for
 * character: an entry must never be called one thing on Ghar and another here.
 * What this screen adds is the rest of it — the date filters, the whole range,
 * a day header once the range spans more than a day, and a summary of what the
 * range came to.
 *
 * No animation on purpose. This list is read many times a day; something that
 * fades in every time is a thing you wait for.
 */
import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR, toDateString } from '@domain';

import {
  Card, Chip, Divider, Empty, IconBadge, Input, ListRow, Row, Screen, SectionTitle, Text,
  type IconName,
} from '@/ui';
import { clockOf, KIND } from '@/ui/kinds';
import { Skeleton, SkeletonList } from '@/ui/skeleton';
import { space } from '@/ui/theme';

type Entry = {
  kind: string;
  id: string;
  /** created_at — the clock on the row. */
  at: string;
  /** doc_date / expense_date / payment_date — the day it belongs to. */
  on_date: string;
  who: string;
  amount: number | null;
  qty: number | null;
  doc_no: string | null;
  item: string | null;
  items: number;
};
/**
 * Aaj kya hua, over a range — the same five sources and the same `kind` values
 * as `TODAY_FEED`, taking a start and an end date instead of one day.
 *
 * It lives here rather than in `queries.ts` because it is this screen's shape:
 * the extra columns (`on_date`, `item`, `items`, `doc_no`) exist to give a row
 * a day header and a subtitle, which Ghar's short list does not need.
 *
 * Filtering and grouping both use the *document* date, not `date(created_at)`.
 * A bill entered tonight for yesterday belongs to yesterday, which is the whole
 * reason the document carries its own date. `created_at` is only the clock.
 *
 * Plain SQL throughout — no SQLite-only functions — so the same statement can
 * be run against Postgres to check it. The derived table is aliased because
 * Postgres insists on it and SQLite does not mind.
 */
const RANGE_FEED = `
  SELECT * FROM (
    SELECT 'sale' AS kind, i.id AS id, i.created_at AS at, i.doc_date AS on_date,
           COALESCE(c.name, 'Cash') AS who, i.grand_total AS amount,
           -COALESCE((SELECT SUM(il.qty) FROM sales_invoice_lines il WHERE il.invoice_id = i.id), 0) AS qty,
           i.doc_no AS doc_no,
           (SELECT il.description FROM sales_invoice_lines il WHERE il.invoice_id = i.id ORDER BY il.line_no LIMIT 1) AS item,
           (SELECT COUNT(*) FROM sales_invoice_lines il WHERE il.invoice_id = i.id) AS items
      FROM sales_invoices i LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.doc_type = 'invoice' AND i.status = 'posted'
       AND i.doc_date >= ?1 AND i.doc_date <= ?2
    UNION ALL
    SELECT 'purchase', p.id, p.created_at, p.doc_date,
           COALESCE(s.name, 'Maal aaya'), p.grand_total,
           COALESCE((SELECT SUM(pl.qty) FROM purchase_lines pl WHERE pl.purchase_id = p.id), 0),
           p.doc_no,
           (SELECT pl.description FROM purchase_lines pl WHERE pl.purchase_id = p.id ORDER BY pl.line_no LIMIT 1),
           (SELECT COUNT(*) FROM purchase_lines pl WHERE pl.purchase_id = p.id)
      FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE p.doc_type = 'purchase' AND p.status = 'posted'
       AND p.doc_date >= ?1 AND p.doc_date <= ?2
    UNION ALL
    SELECT 'expense', e.id, e.created_at, e.expense_date,
           COALESCE(e.category, 'Kharcha'), e.amount, NULL, NULL,
           COALESCE(e.note, e.paid_to), 0
      FROM expenses e WHERE e.expense_date >= ?1 AND e.expense_date <= ?2
    UNION ALL
    SELECT 'payment', pm.id, pm.created_at, pm.payment_date,
           CASE WHEN pm.direction = 'in' THEN 'Paisa aaya' ELSE 'Paisa diya' END,
           pm.amount, NULL, pm.doc_no,
           COALESCE((SELECT c2.name FROM customers c2 WHERE c2.id = pm.party_id),
                    (SELECT s2.name FROM suppliers s2 WHERE s2.id = pm.party_id)), 0
      FROM payments pm
     WHERE pm.status = 'posted' AND pm.payment_date >= ?1 AND pm.payment_date <= ?2
    UNION ALL
    SELECT CASE WHEN a.reason = 'damage' THEN 'damage' ELSE 'adjust' END,
           a.id, a.created_at, a.doc_date,
           COALESCE(a.notes, a.reason), NULL,
           COALESCE((SELECT SUM(al.qty_delta) FROM stock_adjustment_lines al WHERE al.adjustment_id = a.id), 0),
           a.doc_no,
           (SELECT p2.name || ' ' || pv2.variant_name FROM stock_adjustment_lines al
              JOIN product_variants pv2 ON pv2.id = al.variant_id
              JOIN products p2 ON p2.id = pv2.product_id
             WHERE al.adjustment_id = a.id ORDER BY al.created_at LIMIT 1),
           (SELECT COUNT(*) FROM stock_adjustment_lines al WHERE al.adjustment_id = a.id)
      FROM stock_adjustments a
     WHERE a.status = 'posted' AND a.doc_date >= ?1 AND a.doc_date <= ?2
  ) feed
  ORDER BY on_date DESC, at DESC
  LIMIT 400`;

type RangeKey = 'aaj' | 'kal' | 'week' | 'mahina' | 'custom';

/** Move an ISO date by whole days. Garbage in — the same garbage back, not a NaN date. */
function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** "Aaj", "Kal", then the date spelled out. Nobody reads 2026-09-28. */
function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Aaj';
  if (iso === shiftDays(today, -1)) return 'Kal';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
}

/**
 * A figure on the summary card that has not arrived yet. The grey bar is
 * shorter than the line it stands in but the box around it is exactly a
 * `heading`'s 21px, so the card is the same height loaded or not.
 */
function Bar({ width }: { width: number }) {
  return (
    <View style={{ height: 21, justifyContent: 'center' }}>
      <Skeleton width={width} height={13} />
    </View>
  );
}

export default function ParchiScreen() {
  const router = useRouter();
  const today = toDateString();
  const [range, setRange] = useState<RangeKey>('aaj');
  const [custom, setCustom] = useState(today);

  const { from, to } = useMemo(() => {
    switch (range) {
      case 'kal': {
        const y = shiftDays(today, -1);
        return { from: y, to: y };
      }
      // Seven days including today, so "7 din" is a week of trading and not
      // eight days because of an off-by-one.
      case 'week': return { from: shiftDays(today, -6), to: today };
      case 'mahina': return { from: `${today.slice(0, 8)}01`, to: today };
      case 'custom': return { from: custom, to: custom };
      default: return { from: today, to: today };
    }
  }, [range, custom, today]);

  // Every hook is above every return in this file. A useQuery below a
  // conditional return blanks the screen at runtime and tsc says nothing.
  //
  // `isLoading`, not `rows.length === 0`. PowerSync answers with an empty
  // array while the first read is still running, so the screen cannot tell
  // "nothing yet" from "nothing happened today" — and it was choosing the
  // second every time it opened. `isLoading` only covers that first answer;
  // changing the chips afterwards keeps the previous range on screen instead
  // of blanking, which is right: the numbers stay readable while they update.
  const { data: rows, isLoading } = useQuery<Entry>(RANGE_FEED, [from, to]);

  const list = rows ?? [];
  const multiDay = from !== to;

  // The list already arrives sorted by day, so grouping is one pass and the
  // groups come out newest-first without a second sort.
  const groups = useMemo(() => {
    const out: { day: string; entries: Entry[] }[] = [];
    for (const e of rows ?? []) {
      const last = out[out.length - 1];
      if (last && last.day === e.on_date) last.entries.push(e);
      else out.push({ day: e.on_date, entries: [e] });
    }
    return out;
  }, [rows]);

  const saleTotal = list.reduce((s, e) => (e.kind === 'sale' ? s + Number(e.amount ?? 0) : s), 0);
  const kharchaTotal = list.reduce((s, e) => (e.kind === 'expense' ? s + Number(e.amount ?? 0) : s), 0);

  const rangeLabel =
    range === 'aaj' ? 'Aaj'
    : range === 'kal' ? 'Kal'
    : range === 'week' ? 'Pichhle 7 din'
    : range === 'mahina' ? 'Is mahine'
    : dayLabel(from, today);

  return (
    <Screen>
      <View>
        <Text variant="display">Bill</Text>
        <Text variant="small" color="textMuted">
          Din bhar ke bill aur baaki har entry — kis waqt kya hua.
        </Text>
      </View>

      <Row gap={space.xs} wrap>
        <Chip label="Aaj" selected={range === 'aaj'} onPress={() => setRange('aaj')} />
        <Chip label="Kal" selected={range === 'kal'} onPress={() => setRange('kal')} />
        <Chip label="7 Din" selected={range === 'week'} onPress={() => setRange('week')} />
        <Chip label="Is Mahine" selected={range === 'mahina'} onPress={() => setRange('mahina')} />
        <Chip label="Tareekh" selected={range === 'custom'} onPress={() => setRange('custom')} />
      </Row>

      {/* Typed, not picked from a calendar — same as the date box on Kharcha.
          The arrows are there because "us din se ek din pehle" is the way a
          person actually goes looking for something. */}
      {range === 'custom' ? (
        <Row gap={space.xs} align="flex-end">
          <Chip label="‹ Pichla" onPress={() => setCustom(shiftDays(custom, -1))} />
          <Input
            containerStyle={{ flex: 1 }}
            value={custom}
            onChangeText={setCustom}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Chip label="Agla ›" onPress={() => setCustom(shiftDays(custom, 1))} />
        </Row>
      ) : null}

      <Card>
        <Text variant="label" color="textMuted">
          {rangeLabel}
          {multiDay ? ` · ${dayLabel(from, today)} se ${dayLabel(to, today)}` : ''}
        </Text>
        <Row gap={space.md} align="flex-start" style={{ justifyContent: 'space-between' }}>
          <View>
            <Text variant="small" color="textMuted">Entry</Text>
            {/* Three zeroes on an unanswered query are not a summary, they are
                a wrong one — and this card sits directly above the list that
                is about to contradict it. */}
            {isLoading ? <Bar width={34} /> : <Text variant="heading" mono>{list.length}</Text>}
          </View>
          <View>
            <Text variant="small" color="textMuted">Sale</Text>
            {isLoading ? <Bar width={82} /> : <Text variant="heading" mono>{formatINR(saleTotal)}</Text>}
          </View>
          <View>
            <Text variant="small" color="textMuted">Kharcha</Text>
            {isLoading ? (
              <Bar width={70} />
            ) : (
              <Text variant="heading" mono color={kharchaTotal > 0 ? 'warn' : 'text'}>
                {formatINR(kharchaTotal)}
              </Text>
            )}
          </View>
        </Row>
      </Card>

      {isLoading ? (
        <SkeletonList rows={5} size={34} />
      ) : list.length === 0 ? (
        <Empty
          title={
            range === 'aaj'
              ? 'Aaj abhi tak koi entry nahi hui.'
              : 'Is din koi entry nahi hui.'
          }
          hint="Neeche “+” dabao — Bill Banao, Stock Chadhao ya Kharcha Likho."
        />
      ) : (
        groups.map((g) => (
          <View key={g.day}>
            {/* One day, one header — but only when the range is more than a
                single day, otherwise the header just repeats the chip. */}
            {multiDay ? (
              <SectionTitle right={<Text variant="small" color="textFaint">{g.entries.length}</Text>}>
                {dayLabel(g.day, today)}
              </SectionTitle>
            ) : null}

            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {g.entries.map((e, i) => {
                const look = KIND[e.kind] ?? KIND.adjust;
                const qty = e.qty == null ? null : Number(e.qty);
                return (
                  <React.Fragment key={`${e.kind}-${e.id}`}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      left={
                        <Row gap={space.sm}>
                          {/* The clock sits first and in mono so the times line
                              up into a column you can run your eye down. */}
                          <Text variant="small" color="textFaint" mono style={{ width: 58 }}>
                            {clockOf(e.at)}
                          </Text>
                          <IconBadge name={look.icon} accent={look.accent} size={34} />
                        </Row>
                      }
                      title={look.label}
                      subtitle={
                        <Row gap={space.xs} wrap>
                          <Text variant="small" color="textMuted">{e.who}</Text>
                          {e.item ? (
                            <Text variant="small" color="textFaint" numberOfLines={1}>
                              {e.item}
                              {e.items > 1 ? ` +${e.items - 1} aur` : ''}
                            </Text>
                          ) : null}
                        </Row>
                      }
                      // Only the kinds that have a screen of their own are
                      // tappable. A kharcha and a payment have no document to
                      // open, so they stay flat rather than leading somewhere
                      // that is not about them.
                      onPress={
                        e.kind === 'sale' ? () => router.push(`/invoice/${e.id}`)
                        : e.kind === 'purchase' ? () => router.push(`/purchase/${e.id}`)
                        : e.kind === 'damage' || e.kind === 'adjust' ? () => router.push(`/adjustment/${e.id}`)
                        : undefined
                      }
                      right={
                        <View style={{ alignItems: 'flex-end' }}>
                          {e.amount != null ? (
                            <Text mono color={look.sign === '−' ? 'warn' : 'text'}>
                              {look.sign}
                              {formatINR(e.amount)}
                            </Text>
                          ) : null}
                          {qty != null && qty !== 0 ? (
                            <Text variant="small" mono color={qty < 0 ? 'danger' : 'ok'}>
                              {qty > 0 ? '+' : ''}
                              {qty} pcs
                            </Text>
                          ) : null}
                        </View>
                      }
                    />
                  </React.Fragment>
                );
              })}
            </Card>
          </View>
        ))
      )}
    </Screen>
  );
}
