/**
 * A khata, line by line — a grahak's and a supplier's alike.
 *
 * Each line opens the bill, entry or payment it came from, and says what can
 * be done to it right there (owner, 15 Oct 2026: "grahak wale ledger mein jaake
 * kuch bhi edit nahi kar pa raha"). The lines used to be text: a wrong bill
 * seen in the khata had no way to it from the khata.
 *
 * Two columns, not four. Debit, credit and balance at fixed widths left the
 * entry about 50dp on a phone, where "Paisa aaya" broke as "Pai / sa". One
 * signed amount and the running total under it carry the same facts.
 */
import React from 'react';
import { Pressable, View } from 'react-native';

import { Divider, Empty, Row, Text, useTheme } from './index';
import { space } from './theme';

export type LedgerLine = {
  key: string;
  title: string;
  sub: string;
  /** "+ ₹1,200" or "− ₹500", already signed. */
  amount: string;
  /** The amount raises what is owed (shown warm) rather than lowers it. */
  up: boolean;
  running: string;
  onPress?: () => void;
  badge?: React.ReactNode;
  action?: React.ReactNode;
};

export function LedgerList({ lines }: { lines: LedgerLine[] }) {
  const t = useTheme();
  if (!lines.length) return <Empty title="Khata khaali hai" />;
  return (
    <>
      {lines.map((l) => (
        <React.Fragment key={l.key}>
          <Pressable
            onPress={l.onPress}
            disabled={!l.onPress}
            accessibilityRole={l.onPress ? 'button' : undefined}
            style={({ pressed }) => ({ paddingVertical: 8, backgroundColor: pressed ? t.surfaceAlt : 'transparent' })}>
            <Row gap={space.sm} align="flex-start">
              <View style={{ flex: 1, gap: 2 }}>
                <Row gap={space.xs} wrap>
                  <Text variant="small" style={{ fontWeight: '600' }}>{l.title}</Text>
                  {l.badge}
                </Row>
                <Text variant="small" color="textFaint">{l.sub}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="small" mono style={{ fontWeight: '600' }} color={l.up ? 'warn' : 'ok'}>{l.amount}</Text>
                <Text variant="small" mono color="textFaint">{l.running}</Text>
              </View>
              {l.onPress ? <Text color="textFaint" style={{ fontSize: 18, marginLeft: 2 }}>›</Text> : null}
            </Row>
          </Pressable>
          {/* Under the line, not inside it: a button inside the pressable line
              had its press taken by the line on the web, which opened the bill
              instead of the change. */}
          {l.action ? <Row gap={space.xs} wrap style={{ paddingBottom: 8 }}>{l.action}</Row> : null}
          <Divider />
        </React.Fragment>
      ))}
    </>
  );
}
