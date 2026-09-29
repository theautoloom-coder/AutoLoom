/**
 * Hisab — ek saaf profit-and-loss.
 *
 * Six lines and one big figure. The owner opens this to settle one argument:
 * "itna maal becha, phir paisa kahan gaya?" Every other report in this app
 * answers a question nobody asked at the counter, so they are not here.
 *
 * The arithmetic is deliberately the SAME as Home's "Aaj ka munafa"
 * (DASHBOARD_TODAY in src/lib/queries.ts), just over a chosen date range
 * instead of one day. If these two screens ever disagree, one of them has been
 * edited without the other — they are meant to be the same four numbers.
 *
 * ONE KNOWN DIFFERENCE, which is Home's to fix, not this screen's:
 * DASHBOARD_TODAY's `spent_today` has no `is_personal` filter, so on a day a
 * partner takes money out for himself, Home's "Aaj ka kharcha" and "Aaj ka
 * munafa" will be off by that withdrawal and this screen will not. The filter
 * belongs in src/lib/queries.ts too.
 *
 *     Sale            bills ka grand total
 *   − Maal Ki Cost    jo maal gaya, uski stamped cost
 *   = Gross Profit
 *   − Business Kharcha
 *   − Kharab / Loss
 *   = MUNAFA
 *
 * The three things that are NOT on this screen are the whole point of it:
 * purchases, party payments, and a partner's personal withdrawal. Each is
 * commented at the line where somebody would expect to find it.
 */
import { useQuery } from '@powersync/react';
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { formatINR, toDateString } from '@domain';

import { useSession } from '@/lib/session';
import { Card, Chip, Divider, Empty, Input, ListRow, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';
import { Sheet } from '@/ui/sheet';
import { Skeleton } from '@/ui/skeleton';
import { space } from '@/ui/theme';

// -----------------------------------------------------------------------------
// The six figures, in one statement
// -----------------------------------------------------------------------------

/**
 * NOTE ON `expenses.is_personal`
 *
 * A partner taking money out of the drawer for himself is NOT a business
 * expense — counting it would make the shop look like it lost money on a day
 * somebody paid their own house rent. Those rows are marked `is_personal = 1`
 * and are filtered out of Business Kharcha, in the total and in the
 * drill-down, with `COALESCE(is_personal, 0) = 0` so an older row that predates
 * the column still counts as a business expense.
 *
 * The withdrawal is not lost — it is just not a cost of running the shop. It
 * belongs against the partner's account, not against munafa.
 */

const SUMMARY = `
  SELECT
    -- SALE. Posted invoices only. A draft is not money and a cancelled bill
    -- never happened. Credit notes (doc_type='credit_note') are their own
    -- document and are excluded here exactly as Home excludes them.
    (SELECT COALESCE(SUM(grand_total), 0) FROM sales_invoices
      WHERE doc_type = 'invoice' AND status = 'posted' AND doc_date BETWEEN ?1 AND ?2) AS sale,
    (SELECT COUNT(*) FROM sales_invoices
      WHERE doc_type = 'invoice' AND status = 'posted' AND doc_date BETWEEN ?1 AND ?2) AS bills,

    -- MAAL KI COST. What the maal that went out had cost US. Taken from the
    -- movement's own unit_cost, which posting stamped with the moving average
    -- at the moment of sale — so it is the cost of THOSE pieces, not today's
    -- rate. Sale movements are negative, hence the sign flip.
    --
    -- This is also the only place maal becomes an expense. A purchase is NOT
    -- counted anywhere on this screen: buying stock swaps cash for maal, it
    -- does not lose you anything. It turns into cost here, when it is sold.
    (SELECT COALESCE(SUM(-qty * unit_cost), 0) FROM stock_movements
      WHERE movement_type = 'sale' AND date(occurred_at) BETWEEN ?1 AND ?2) AS cogs,

    -- BUSINESS KHARCHA. Rent, bijli, diesel, chai — money that left and
    -- brought back nothing you can sell.
    -- NOT counted here: paying a supplier, because that is settling the bill
    -- for maal whose cost is already in Maal Ki Cost. Counting both would
    -- charge the same maal twice.
    -- NOT counted here either: a partner's personal withdrawal. Those rows
    -- carry is_personal = 1 and are dropped. COALESCE keeps older rows, which
    -- predate the column and are all business, on the business side.
    (SELECT COALESCE(SUM(amount), 0) FROM expenses
      WHERE expense_date BETWEEN ?1 AND ?2 AND COALESCE(is_personal, 0) = 0) AS kharcha,
    (SELECT COUNT(*) FROM expenses
      WHERE expense_date BETWEEN ?1 AND ?2 AND COALESCE(is_personal, 0) = 0) AS kharcha_rows,

    -- KHARAB / LOSS. Maal that broke, leaked or went missing. Same stamped
    -- cost, same sign flip. It never reached a customer, so it is not in Maal
    -- Ki Cost — it is its own loss.
    (SELECT COALESCE(SUM(-qty * unit_cost), 0) FROM stock_movements
      WHERE movement_type = 'damage' AND date(occurred_at) BETWEEN ?1 AND ?2) AS damage,
    (SELECT COUNT(*) FROM stock_movements
      WHERE movement_type = 'damage' AND date(occurred_at) BETWEEN ?1 AND ?2) AS damage_rows`;

// -----------------------------------------------------------------------------
// Drill-downs — "ye figure kahan se aaya"
// -----------------------------------------------------------------------------

/**
 * Every drill-down returns the same four columns so one `useQuery` can serve
 * all of them (a hook per figure would be five hooks that mostly do nothing).
 * `a2` / `a3` carry the extra numbers a particular list needs.
 */
type DetailRow = {
  id: string;
  title: string;
  sub: string | null;
  amount: number;
  a2: number | null;
  a3: number | null;
};

type FigureKey = 'sale' | 'cogs' | 'gross' | 'kharcha' | 'damage' | 'munafa';
type ListKey = Exclude<FigureKey, 'munafa'>;

const NO_ROWS = `SELECT '' AS id, '' AS title, NULL AS sub, 0 AS amount, NULL AS a2, NULL AS a3 WHERE 0`;

const DETAIL: Record<ListKey, { title: string; hint: string; sub: (r: DetailRow) => string; sql: string }> = {
  sale: {
    title: 'Sale',
    hint: 'Jo bill bane — har ek ka total.',
    sub: (r) => r.sub ?? '',
    sql: `
      SELECT i.id, i.doc_no AS title,
             i.doc_date || ' · ' || COALESCE(c.name, '—') AS sub,
             i.grand_total AS amount, NULL AS a2, NULL AS a3
        FROM sales_invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.doc_type = 'invoice' AND i.status = 'posted' AND i.doc_date BETWEEN ?1 AND ?2
       ORDER BY i.doc_date DESC, i.doc_no DESC
       LIMIT 200`,
  },

  cogs: {
    title: 'Maal Ki Cost',
    hint: 'Jo maal bika, wo humein kitne ka pada tha.',
    sub: (r) => `${Math.round(r.a2 ?? 0)} pcs gaya`,
    sql: `
      SELECT pv.id AS id,
             p.name || CASE WHEN COALESCE(pv.variant_name, '') <> '' THEN ' · ' || pv.variant_name ELSE '' END AS title,
             NULL AS sub,
             SUM(-m.qty * m.unit_cost) AS amount,
             SUM(-m.qty) AS a2, NULL AS a3
        FROM stock_movements m
        JOIN product_variants pv ON pv.id = m.variant_id
        JOIN products p ON p.id = pv.product_id
       WHERE m.movement_type = 'sale' AND date(m.occurred_at) BETWEEN ?1 AND ?2
       GROUP BY pv.id, p.name, pv.variant_name
       ORDER BY amount DESC
       LIMIT 200`,
  },

  gross: {
    title: 'Gross Profit',
    hint: 'Har bill par kitna bacha — bikri minus us maal ki cost.',
    sub: (r) => `${r.sub ?? ''} — bikri ${formatINR(r.a2 ?? 0)}, cost ${formatINR(r.a3 ?? 0)}`,
    // The per-bill cost here is matched by the movement's ref_id, not by date,
    // so a bill posted on the last day of the range with its stock movement
    // stamped the next morning can make this list total a few rupees away from
    // the headline. The headline is the figure of record; this list is only
    // "kis bill par kitna bacha".
    sql: `
      SELECT i.id, i.doc_no AS title,
             i.doc_date || ' · ' || COALESCE(c.name, '—') AS sub,
             i.grand_total - COALESCE((SELECT SUM(-m.qty * m.unit_cost) FROM stock_movements m
                                        WHERE m.movement_type = 'sale' AND m.ref_id = i.id), 0) AS amount,
             i.grand_total AS a2,
             COALESCE((SELECT SUM(-m.qty * m.unit_cost) FROM stock_movements m
                        WHERE m.movement_type = 'sale' AND m.ref_id = i.id), 0) AS a3
        FROM sales_invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.doc_type = 'invoice' AND i.status = 'posted' AND i.doc_date BETWEEN ?1 AND ?2
       ORDER BY amount DESC
       LIMIT 200`,
  },

  kharcha: {
    title: 'Business Kharcha',
    hint: 'Dukaan ka kharcha. Supplier ka paisa aur partner ka apna nikala paisa isme nahi hai.',
    sub: (r) => r.sub ?? '',
    sql: `
      SELECT e.id, COALESCE(e.category, 'Kharcha') AS title,
             e.expense_date || CASE WHEN COALESCE(e.paid_to, '') <> '' THEN ' · ' || e.paid_to ELSE '' END
               || CASE WHEN COALESCE(e.note, '') <> '' THEN ' · ' || e.note ELSE '' END AS sub,
             e.amount AS amount, NULL AS a2, NULL AS a3
        FROM expenses e
       -- Partner ka apna nikala paisa yahan nahi — wo dukaan ka kharcha nahi hai.
       WHERE e.expense_date BETWEEN ?1 AND ?2 AND COALESCE(e.is_personal, 0) = 0
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT 200`,
  },

  damage: {
    title: 'Kharab / Loss',
    hint: 'Toota, kharab ya gum hua maal — uski cost.',
    sub: (r) => `${r.sub ?? ''} · ${Math.round(r.a2 ?? 0)} pcs`,
    sql: `
      SELECT m.id,
             p.name || CASE WHEN COALESCE(pv.variant_name, '') <> '' THEN ' · ' || pv.variant_name ELSE '' END AS title,
             date(m.occurred_at) || CASE WHEN COALESCE(m.note, '') <> '' THEN ' · ' || m.note ELSE '' END AS sub,
             -m.qty * m.unit_cost AS amount,
             -m.qty AS a2, NULL AS a3
        FROM stock_movements m
        JOIN product_variants pv ON pv.id = m.variant_id
        JOIN products p ON p.id = pv.product_id
       WHERE m.movement_type = 'damage' AND date(m.occurred_at) BETWEEN ?1 AND ?2
       ORDER BY m.occurred_at DESC
       LIMIT 200`,
  },
};

// -----------------------------------------------------------------------------
// Dates
// -----------------------------------------------------------------------------

type Preset = 'aaj' | '7din' | 'mahina' | 'custom';

const PRESETS: [Preset, string][] = [
  ['aaj', 'Aaj'],
  ['7din', '7 Din'],
  ['mahina', 'Is Mahine'],
  ['custom', 'Custom'],
];

function presetRange(p: Preset): [string, string] {
  const now = new Date();
  const today = toDateString(now);
  if (p === '7din') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6); // aaj sameth saat din
    return [toDateString(d), today];
  }
  if (p === 'mahina') return [toDateString(new Date(now.getFullYear(), now.getMonth(), 1)), today];
  return [today, today];
}

/** "17 Sep" — short enough to sit under the chips without wrapping. */
function pretty(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// -----------------------------------------------------------------------------
// Screen
// -----------------------------------------------------------------------------

/** One line of the statement. Tappable — every figure owes an explanation. */
function Line({
  label,
  hint,
  value,
  onPress,
  tone,
  minus,
  loading,
}: {
  label: string;
  hint: string;
  value: number;
  onPress: () => void;
  tone?: 'rule' | 'plain';
  /** Draw it as money going out, so the subtraction is visible, not implied. */
  minus?: boolean;
  /** Figure not in yet. The label and the hint are already true, so they stay;
   *  only the number is withheld. A statement of six confident zeroes reads as
   *  a month with no trade in it, which is a worse lie than a grey bar. */
  loading?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      // No figure yet, so none is announced — a screen reader saying "Sale
      // zero rupees" is the same wrong answer as printing it.
      accessibilityLabel={loading ? label : `${label} ${formatINR(value)}`}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingVertical: 11,
          backgroundColor: pressed ? t.surfaceAlt : 'transparent',
        },
      ]}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant={tone === 'rule' ? 'heading' : 'rowTitle'}>{label}</Text>
        <Text variant="small" color="textFaint">
          {hint}
        </Text>
      </View>
      {loading ? (
        <View style={{ height: 26, justifyContent: 'center' }}>
          <Skeleton width={tone === 'rule' ? 104 : 88} height={18} />
        </View>
      ) : (
        <Text variant="number" mono color={minus ? 'textMuted' : 'text'}>
          {minus ? '− ' : ''}
          {formatINR(value)}
        </Text>
      )}
      <Text style={{ color: t.textFaint, fontSize: 18, marginLeft: 2 }}>›</Text>
    </Pressable>
  );
}

export default function HisabScreen() {
  const { can } = useSession();
  const t = useTheme();

  const [preset, setPreset] = useState<Preset>('mahina');
  const [custom, setCustom] = useState<[string, string]>(presetRange('mahina'));
  const [open, setOpen] = useState<FigureKey | null>(null);

  const [from, to] = preset === 'custom' ? custom : presetRange(preset);

  // Hooks rule: every useQuery lives above every early return, including the
  // permission guard below. A hook after a conditional return blanks the whole
  // screen at runtime and tsc will not catch it.
  //
  // `isLoading` covers only the first answer. Changing the range afterwards
  // keeps the previous figures on screen while the new ones are worked out,
  // which is the right behaviour — a statement that blanks every time you
  // touch a chip is a statement you cannot compare two months in.
  const { data: rows, isLoading } = useQuery<Record<string, number>>(SUMMARY, [from, to]);
  const listKey: ListKey | null = open && open !== 'munafa' ? open : null;
  const { data: detail } = useQuery<DetailRow>(
    listKey ? DETAIL[listKey].sql : NO_ROWS,
    listKey ? [from, to] : []
  );

  const s = rows?.[0];
  const sale = s?.sale ?? 0;
  const cogs = s?.cogs ?? 0;
  const kharcha = s?.kharcha ?? 0;
  const damage = s?.damage ?? 0;
  const gross = sale - cogs;
  // Sab kharcha aur maal ki cost nikalne ke baad kitna bacha. Same line as Home.
  const munafa = gross - kharcha - damage;

  if (!can('reports.view')) {
    return (
      <Screen>
        <View>
          <Text variant="display">Hisab</Text>
        </View>
        <Empty title="Ye sirf owner dekh sakta hai" hint="Munafa ka hisaab maalik ke liye hai. Apne kaam ke liye Ghar ya Stock kholo." />
      </Screen>
    );
  }

  const listRows = detail ?? [];
  const listTotal = listRows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const headline =
    open === 'sale' ? sale
    : open === 'cogs' ? cogs
    : open === 'gross' ? gross
    : open === 'kharcha' ? kharcha
    : open === 'damage' ? damage
    : munafa;

  return (
    <Screen>
      <View>
        <Text variant="display">Hisab</Text>
        <Text variant="small" color="textMuted">
          Kitna bika, kitna kharcha hua, aur kitna bacha.
        </Text>
      </View>

      <Row gap={space.xs} wrap>
        {PRESETS.map(([k, label]) => (
          <Chip
            key={k}
            label={label}
            selected={preset === k}
            onPress={() => {
              // Switching into Custom seeds the boxes with what is on screen,
              // so the figures never jump to a blank range mid-thought.
              if (k === 'custom') setCustom([from, to]);
              setPreset(k);
            }}
          />
        ))}
      </Row>

      {preset === 'custom' ? (
        <Row gap={space.md}>
          <Input containerStyle={{ flex: 1 }} label="Se" value={custom[0]} onChangeText={(v) => setCustom([v, custom[1]])} placeholder="2026-09-01" autoCapitalize="none" />
          <Input containerStyle={{ flex: 1 }} label="Tak" value={custom[1]} onChangeText={(v) => setCustom([custom[0], v])} placeholder="2026-09-30" autoCapitalize="none" />
        </Row>
      ) : null}

      <Text variant="small" color="textFaint">
        {from === to ? pretty(from) : `${pretty(from)} se ${pretty(to)} tak`}
        {s?.bills ? ` · ${Math.round(s.bills)} bill` : ''}
      </Text>

      <Card keyline style={{ padding: 0, gap: 0, paddingVertical: space.sm }}>
        <Line label="Sale" hint="Pakke bill ka total" value={sale} loading={isLoading} onPress={() => setOpen('sale')} />
        <Line label="Maal Ki Cost" hint="Jo maal bika, uski cost" value={cogs} minus loading={isLoading} onPress={() => setOpen('cogs')} />

        <Divider style={{ marginVertical: 4 }} />
        <Line label="Gross Profit" hint="Sale minus maal ki cost" value={gross} tone="rule" loading={isLoading} onPress={() => setOpen('gross')} />
        <Divider style={{ marginVertical: 4 }} />

        <Line label="Business Kharcha" hint="Rent, bijli, diesel, chai" value={kharcha} minus loading={isLoading} onPress={() => setOpen('kharcha')} />
        <Line label="Kharab / Loss" hint="Toota-phoota maal ki cost" value={damage} minus loading={isLoading} onPress={() => setOpen('damage')} />

        <Divider style={{ marginTop: 4 }} />

        {/* The reason the screen exists — so it gets the one hero figure. */}
        <Pressable
          onPress={() => setOpen('munafa')}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={isLoading ? 'Munafa' : `Munafa ${formatINR(munafa)}`}
          style={({ pressed }) => [
            { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: 2, backgroundColor: pressed ? t.surfaceAlt : 'transparent' },
          ]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label" color="textMuted">
              Munafa
            </Text>
            <Text variant="small" color="textFaint">
              kya gina, kya nahi ›
            </Text>
          </Row>
          {/* The one figure the screen exists for. Until it is known it is a
              bar, not a zero: "₹0" here is read as a month that made nothing,
              and it is the first thing the eye lands on. */}
          {isLoading ? (
            <View style={{ height: 47, justifyContent: 'center' }}>
              <Skeleton width={186} height={32} />
            </View>
          ) : (
            <Text variant="hero" mono color={munafa < 0 ? 'danger' : 'text'}>
              {formatINR(munafa)}
            </Text>
          )}
          {isLoading ? (
            <View style={{ height: 18 }} />
          ) : (
            <Text variant="small" color="textMuted">
              {munafa < 0 ? 'Is period mein nuksan hua.' : 'Maal ki cost aur saara kharcha nikaal ke.'}
            </Text>
          )}
        </Pressable>
      </Card>

      <Text variant="small" color="textFaint">
        Maal kharidna kharcha nahi hai — wo cost tab banta hai jab maal bikta hai. Kisi bhi figure par tap karo, peeche ki entries khul jayengi.
      </Text>

      {/* --------------------------------------------------------------- */}

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === 'munafa' ? 'Munafa kaise nikla' : open ? DETAIL[open].title : undefined}
        hint={open === 'munafa' ? 'Har figure kyun gina gaya, aur kya jaan-boojh ke nahi gina.' : open ? DETAIL[open].hint : undefined}>
        {open === 'munafa' ? (
          <View style={{ gap: space.sm }}>
            <Card tone="alt" style={{ gap: 6 }}>
              <KVLine k="Sale" v={sale} />
              <KVLine k="− Maal Ki Cost" v={cogs} />
              <Divider />
              <KVLine k="= Gross Profit" v={gross} />
              <KVLine k="− Business Kharcha" v={kharcha} />
              <KVLine k="− Kharab / Loss" v={damage} />
              <Divider />
              <KVLine k="= MUNAFA" v={munafa} strong />
            </Card>

            <SectionTitle>Ye jaan-boojh ke nahi gina</SectionTitle>
            <Card tone="alt" style={{ gap: space.sm }}>
              <Note
                k="Maal kharidna"
                v="Purchase kharcha nahi hai — cash gaya, maal aaya. Wahi maal jab bikta hai tab “Maal Ki Cost” ban jata hai. Dono ginenge to ek hi maal do baar kata jayega."
              />
              <Note
                k="Supplier ko diya paisa"
                v="Wo purani udhaar chukana hai, naya kharcha nahi. Us maal ki cost pehle hi gin chuke hain."
              />
              <Note
                k="Grahak se aaya paisa"
                v="Bikri us din gini gayi jis din bill bana. Paisa baad mein aaye to wo sirf paisa ghoomna hai, munafa nahi."
              />
              <Note
                k="Partner ka apna nikala paisa"
                v="Ghar ka kharcha dukaan ka kharcha nahi hai. Jo entry “personal” mark hai wo Business Kharcha mein nahi aati — wo partner ke khate mein jaati hai."
              />
            </Card>
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="label" color="textMuted">
                Kul
              </Text>
              <Text variant="number" mono>
                {formatINR(headline)}
              </Text>
            </Row>

            {listRows.length === 0 ? (
              <Empty art="parchi" title="Is period mein koi entry nahi" />
            ) : (
              <>
                <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator>
                  {listRows.map((r, i) => (
                    <ListRow
                      key={`${r.id}-${i}`}
                      title={r.title}
                      subtitle={listKey ? DETAIL[listKey].sub(r) : undefined}
                      chevron={false}
                      right={
                        <Text variant="mono" mono color={r.amount < 0 ? 'danger' : 'text'}>
                          {formatINR(r.amount)}
                        </Text>
                      }
                    />
                  ))}
                </ScrollView>
                {listRows.length >= 200 ? (
                  <Text variant="small" color="textFaint">
                    Pehli 200 entry dikh rahi hain. Chhota range chuno.
                  </Text>
                ) : Math.abs(listTotal - headline) > 1 ? (
                  // Only the Gross Profit list can land here: it matches each
                  // bill to its own movements rather than to the date window.
                  <Text variant="small" color="textFaint">
                    Upar wala figure hi asli hai — neeche har bill apni cost ke saath dikh raha hai, aur kuch cost dusre din stamp hui thi.
                  </Text>
                ) : null}
              </>
            )}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

/** One line of the munafa arithmetic, money right-aligned. */
function KVLine({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text variant={strong ? 'heading' : 'body'} color={strong ? 'text' : 'textMuted'}>
        {k}
      </Text>
      <Text variant={strong ? 'number' : 'mono'} mono color={strong && v < 0 ? 'danger' : 'text'}>
        {formatINR(v)}
      </Text>
    </Row>
  );
}

/** "Ye kyun nahi gina" — heading and one plain-language reason. */
function Note({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="rowTitle">{k}</Text>
      <Text variant="small" color="textMuted">
        {v}
      </Text>
    </View>
  );
}
