/**
 * A date, picked — not typed.
 *
 * Dates used to be a text box wanting "YYYY-MM-DD", which nobody at a counter
 * types right, and a wrong one was refused by the server long after the screen
 * said it saved. This is three chips for the days that matter (Aaj, Kal,
 * Parso) and a month calendar for anything older. Future days are off: maal
 * that has not come yet has not come (owner, 8 Oct 2026: "stock chadhayega to
 * uski date bhi chada paye tarike se").
 *
 * The value stays a 'YYYY-MM-DD' string in the shop's own day, the same shape
 * every date column and toDateString() use.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { toDateString } from '@domain';

import { Chip, Row, Text, useTheme } from './index';
import { radius, space } from './theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Ra', 'So', 'Ma', 'Bu', 'Gu', 'Sh', 'Sh'];

const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const shift = (s: string, days: number) => { const d = parse(s); d.setDate(d.getDate() + days); return toDateString(d); };

/** "Aaj · 8 Oct 2026", "Kal · 7 Oct 2026", "3 Oct 2026". */
export function dateWords(value: string, today = toDateString()): string {
  const d = parse(value);
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (value === today) return `Aaj · ${label}`;
  if (value === shift(today, -1)) return `Kal · ${label}`;
  if (value === shift(today, -2)) return `Parso · ${label}`;
  return label;
}

export function DateField({ label = 'Tareekh', value, onChange, allowFuture = false, hint }: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  allowFuture?: boolean;
  hint?: string;
}) {
  const t = useTheme();
  const today = toDateString();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => { const d = parse(value || today); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array(first.getDay()).fill(null);
    for (let d = 1; d <= days; d++) out.push(toDateString(new Date(month.getFullYear(), month.getMonth(), d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const quick = [
    { k: today, label: 'Aaj' },
    { k: shift(today, -1), label: 'Kal' },
    { k: shift(today, -2), label: 'Parso' },
  ];
  const isQuick = quick.some((q) => q.k === value);

  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" color="textMuted">{label}</Text>
      <Row gap={space.xs} wrap>
        {quick.map((q) => <Chip key={q.label} label={q.label} selected={value === q.k} onPress={() => { onChange(q.k); setOpen(false); }} />)}
        <Chip label={!isQuick && value ? dateWords(value, today) : 'Aur tareekh…'} selected={!isQuick && !!value} onPress={() => setOpen(!open)} />
      </Row>
      <Text variant="small" color="textFaint">{value ? dateWords(value, today) : 'Tareekh chuno'}{hint ? ` · ${hint}` : ''}</Text>
      {open ? (
        <View style={{ borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, padding: space.sm, gap: space.xs, backgroundColor: t.surface }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Pichhla mahina" hitSlop={10}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <Text variant="heading">‹</Text>
            </Pressable>
            <Text variant="heading">{MONTHS[month.getMonth()]} {month.getFullYear()}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Agla mahina" hitSlop={10}
              disabled={!allowFuture && new Date(month.getFullYear(), month.getMonth() + 1, 1) > parse(today)}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <Text variant="heading" color={!allowFuture && new Date(month.getFullYear(), month.getMonth() + 1, 1) > parse(today) ? 'textFaint' : 'text'}>›</Text>
            </Pressable>
          </Row>
          <Row>
            {DAYS.map((d, i) => <Text key={i} variant="small" color="textFaint" style={{ flex: 1, textAlign: 'center' }}>{d}</Text>)}
          </Row>
          {Array.from({ length: cells.length / 7 }, (_, w) => (
            <Row key={w}>
              {cells.slice(w * 7, w * 7 + 7).map((c, i) => {
                const off = !c || (!allowFuture && c > today);
                const on = c === value;
                return (
                  <Pressable key={i} disabled={off} onPress={() => { if (c) { onChange(c); setOpen(false); } }}
                    accessibilityRole="button" accessibilityLabel={c ?? ''}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md, backgroundColor: on ? t.accent : 'transparent' }}>
                    <Text style={{ color: on ? '#FFFFFF' : off ? t.textFaint : t.text, fontWeight: c === today ? '700' : '400' }}>
                      {c ? Number(c.slice(8)) : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          ))}
        </View>
      ) : null}
    </View>
  );
}
