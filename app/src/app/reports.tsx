/**
 * Report — PDF.
 *
 * Pick a report, pick the days, get a PDF to keep, print or send on WhatsApp.
 * The partners asked for exactly this (owner, 6 Oct 2026): total sales over
 * time with the detail behind them, each party's khata, the stock, the
 * partners' own money, and the munafa.
 */
import { useQuery } from '@powersync/react';
import { Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { isDateString, toDateString } from '@domain';

import {
  kharchaReport, ledgerReport, munafaReport, partnerReport, saleReport, shareReport, stockReport,
} from '@/lib/reports';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { Button, Card, Chip, Empty, IconBadge, Input, Row, Screen, SectionTitle, Text, useTheme, type IconName } from '@/ui';
import { SelectField, notify } from '@/ui/forms';
import { radius, space } from '@/ui/theme';

type Kind = 'sale' | 'khata' | 'stock' | 'partner' | 'munafa' | 'kharcha';

const shift = (d: Date, days: number) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

function presets() {
  const now = new Date();
  const lastMonthEnd = shift(monthStart(now), -1);
  // The Indian financial year starts on 1 April.
  const fyStart = new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1);
  return [
    { key: 'aaj', label: 'Aaj', from: toDateString(now), to: toDateString(now) },
    { key: 'kal', label: 'Kal', from: toDateString(shift(now, -1)), to: toDateString(shift(now, -1)) },
    { key: '7', label: '7 din', from: toDateString(shift(now, -6)), to: toDateString(now) },
    { key: 'mahina', label: 'Is mahine', from: toDateString(monthStart(now)), to: toDateString(now) },
    { key: 'pichhla', label: 'Pichhla mahina', from: toDateString(monthStart(lastMonthEnd)), to: toDateString(lastMonthEnd) },
    { key: 'saal', label: 'Is saal (Apr se)', from: toDateString(fyStart), to: toDateString(now) },
  ];
}

export default function ReportsScreen() {
  const t = useTheme();
  const { db } = useSystem();
  const { can } = useSession();
  const ranges = useMemo(presets, []);

  const KINDS: { key: Kind; title: string; hint: string; icon: IconName; accent: string; allowed: boolean; dated: boolean }[] = [
    { key: 'sale', title: 'Sale', hint: 'Har din ke bill, grahak aur item ke hisaab se', icon: 'trending-up-outline', accent: 'blue', allowed: can('reports.view'), dated: true },
    { key: 'khata', title: 'Party ka khata', hint: 'Grahak ya supplier ka poora hisaab, baaki ke saath', icon: 'people-outline', accent: 'teal', allowed: can('reports.view'), dated: true },
    { key: 'stock', title: 'Stock', hint: 'Godown aur kharab maal — aaj tak', icon: 'cube-outline', accent: 'violet', allowed: can('reports.view'), dated: false },
    { key: 'munafa', title: 'Munafa', hint: 'Sale, maal ki cost, kharcha, nuksan', icon: 'stats-chart-outline', accent: 'green', allowed: can('reports.view_margin'), dated: true },
    { key: 'partner', title: 'Partner ka paisa', hint: 'Kisne kitna lagaya, kitna nikala', icon: 'briefcase-outline', accent: 'rose', allowed: can('partner.capital'), dated: true },
    { key: 'kharcha', title: 'Kharcha', hint: 'Har din ka kharcha, kis cheez par', icon: 'wallet-outline', accent: 'amber', allowed: can('reports.view'), dated: true },
  ];
  const allowed = KINDS.filter((k) => k.allowed);

  const [kind, setKind] = useState<Kind>('sale');
  const [rangeKey, setRangeKey] = useState('mahina');
  const [from, setFrom] = useState(ranges.find((r) => r.key === 'mahina')!.from);
  const [to, setTo] = useState(ranges.find((r) => r.key === 'mahina')!.to);
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer');
  const [partyId, setPartyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: parties } = useQuery<{ id: string; name: string }>(
    partyType === 'customer'
      ? 'SELECT id, name FROM customers WHERE is_active = 1 AND COALESCE(is_cash, 0) = 0 ORDER BY name'
      : 'SELECT id, name FROM suppliers WHERE is_active = 1 ORDER BY name');

  const chosen = KINDS.find((k) => k.key === kind)!;

  async function make() {
    if (chosen.dated && (!isDateString(from) || !isDateString(to))) { notify('Tareekh YYYY-MM-DD mein likho.', 'danger'); return; }
    if (chosen.dated && from > to) { notify('“Se” wali tareekh “Tak” se pehle honi chahiye.', 'danger'); return; }
    if (kind === 'khata' && !partyId) { notify(partyType === 'customer' ? 'Grahak chuno.' : 'Supplier chuno.', 'danger'); return; }
    setBusy(true);
    try {
      const html =
        kind === 'sale' ? await saleReport(db, from, to)
        : kind === 'khata' ? await ledgerReport(db, partyType, partyId!, from, to)
        : kind === 'stock' ? await stockReport(db, can('catalog.view_cost'))
        : kind === 'partner' ? await partnerReport(db, from, to)
        : kind === 'munafa' ? await munafaReport(db, from, to)
        : await kharchaReport(db, from, to);
      const party = parties?.find((p) => p.id === partyId)?.name;
      const name = [chosen.title, kind === 'khata' ? party : null, chosen.dated ? `${from} se ${to}` : toDateString(new Date())]
        .filter(Boolean).join(' ');
      await shareReport(html, name);
    } catch (e) {
      notify(`PDF nahi bana: ${String((e as Error).message ?? e)}`, 'danger');
    } finally {
      setBusy(false);
    }
  }

  if (allowed.length === 0) {
    return <Screen><Empty title="Report sirf partner dekh sakte hain" /></Screen>;
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Report' }} />
      <Screen>
        <View>
          <Text variant="display">Report — PDF</Text>
          <Text variant="small" color="textMuted">Report chuno, din chuno, PDF banao — print karo ya WhatsApp par bhejo.</Text>
        </View>

        <SectionTitle>Kaunsi report</SectionTitle>
        <View style={{ gap: space.sm }}>
          {allowed.map((k) => {
            const on = k.key === kind;
            return (
              <Pressable
                key={k.key}
                onPress={() => setKind(k.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md,
                  borderRadius: radius.lg, borderWidth: 1.5, borderColor: on ? t.accent : t.border,
                  backgroundColor: on ? t.accentSoft : t.surface, opacity: pressed ? 0.85 : 1,
                })}>
                <IconBadge name={k.icon} accent={k.accent} />
                <View style={{ flex: 1 }}>
                  <Text variant="heading">{k.title}</Text>
                  <Text variant="small" color="textMuted">{k.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {kind === 'khata' ? (
          <Card style={{ gap: space.sm }}>
            <Row gap={space.xs}>
              <Chip label="Grahak" selected={partyType === 'customer'} onPress={() => { setPartyType('customer'); setPartyId(null); }} />
              <Chip label="Supplier" selected={partyType === 'supplier'} onPress={() => { setPartyType('supplier'); setPartyId(null); }} />
            </Row>
            <SelectField
              label={partyType === 'customer' ? 'Grahak' : 'Supplier'}
              value={partyId}
              options={(parties ?? []).map((p) => ({ value: p.id, label: p.name }))}
              onChange={setPartyId}
            />
          </Card>
        ) : null}

        {chosen.dated ? (
          <>
            <SectionTitle>Kab ka</SectionTitle>
            <Row gap={space.xs} wrap>
              {ranges.map((r) => (
                <Chip key={r.key} label={r.label} selected={rangeKey === r.key}
                  onPress={() => { setRangeKey(r.key); setFrom(r.from); setTo(r.to); }} />
              ))}
            </Row>
            <Row gap={space.sm}>
              <Input containerStyle={{ flex: 1 }} label="Se" value={from} onChangeText={(v) => { setFrom(v); setRangeKey(''); }} placeholder="YYYY-MM-DD" autoCorrect={false} autoCapitalize="none" />
              <Input containerStyle={{ flex: 1 }} label="Tak" value={to} onChangeText={(v) => { setTo(v); setRangeKey(''); }} placeholder="YYYY-MM-DD" autoCorrect={false} autoCapitalize="none" />
            </Row>
          </>
        ) : null}

        <Button title={`${chosen.title} ki PDF banao`} size="lg" full loading={busy} onPress={make} />
        <Text variant="small" color="textFaint">
          Phone par PDF ban ke share khulega — WhatsApp, print ya save. Computer par print khulega, wahan “Save as PDF” chuno.
        </Text>
      </Screen>
    </>
  );
}
