/**
 * Reminders — "kisse paise lene hain" (screen P4 of the light pass).
 *
 * The day-end screen. One keyline card holds the total owed; every row is a
 * decision — share the QR, mark it paid, or send the message. A row that has
 * been sent swaps its red action for a green "Bhej diya" and stays where it
 * is, so the staff member never loses their place in the list.
 *
 * wa.me can only prefill text, so the QR goes separately through the share
 * sheet (see lib/qr.ts) — that is why it is its own button, not a toggle.
 */
import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatINR, toDateString } from '@domain';

import { paymentQrDataUrl, shareImageDataUrl } from '@/lib/qr';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { useShopSettings } from '@/lib/use-settings';
import { openWhatsApp, reminderMessage, slipMessage, upiLink } from '@/lib/whatsapp';
import { Card, Icon, Row, Screen, Text, useTheme } from '@/ui';
import { notify } from '@/ui/forms';
import { Enter, useCountUp } from '@/ui/motion';
import { radius, space, type as typeScale } from '@/ui/theme';

type Pending = { id: string; name: string; mobile: string | null; balance: number; oldest_due: string | null; bills_today: number };
type Bill = { id: string; doc_no: string; doc_date: string; grand_total: number; paid_total: number; customer_id: string; customer_name: string; mobile: string | null; balance: number };

const FILTERS = [
  { key: 'all', label: 'Sab' },
  { key: 'today', label: 'Aaj bill hua' },
  { key: 'overdue', label: 'Overdue' },
] as const;

function daysOld(date: string | null): number | null {
  if (!date) return null;
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  return d > 0 ? d : null;
}

export default function RemindersScreen() {
  const router = useRouter();
  const t = useTheme();
  const { db } = useSystem();
  const shop = useShopSettings();
  const { can } = useSession();
  const today = toDateString();
  const [filter, setFilter] = useState<'all' | 'today' | 'overdue'>('all');
  const [sent, setSent] = useState<Set<string>>(new Set());

  const { data: pending } = useQuery<Pending>(`
    SELECT c.id, c.name, c.mobile, COALESCE(pb.balance,0) AS balance,
           (SELECT MIN(due_date) FROM sales_invoices i WHERE i.customer_id=c.id AND i.doc_type='invoice' AND i.status='posted' AND i.grand_total>i.paid_total) AS oldest_due,
           (SELECT COUNT(*) FROM sales_invoices i WHERE i.customer_id=c.id AND i.doc_type='invoice' AND i.status='posted' AND i.doc_date=?1) AS bills_today
    FROM customers c LEFT JOIN party_balance_live pb ON pb.party_type='customer' AND pb.party_id=c.id
    WHERE COALESCE(pb.balance,0) > 0 AND c.is_active=1 ORDER BY balance DESC`, [today]);
  const { data: bills } = useQuery<Bill>(`
    SELECT i.id, i.doc_no, i.doc_date, i.grand_total, i.paid_total, c.id AS customer_id, c.name AS customer_name, c.mobile, COALESCE(pb.balance,0) AS balance
    FROM sales_invoices i JOIN customers c ON c.id=i.customer_id LEFT JOIN party_balance_live pb ON pb.party_type='customer' AND pb.party_id=c.id
    WHERE i.doc_type='invoice' AND i.status='posted' AND i.doc_date=?1 ORDER BY i.doc_no DESC`, [today]);

  const visible = (pending ?? []).filter((p) =>
    filter === 'all' ? true : filter === 'today' ? p.bills_today > 0 : !!p.oldest_due && p.oldest_due < today);
  const total = visible.reduce((a, p) => a + p.balance, 0);
  const overdueCount = (pending ?? []).filter((p) => !!p.oldest_due && p.oldest_due < today).length;
  const shown = useCountUp(total);

  async function remind(p: Pending) {
    if (!p.mobile) { notify(`${p.name} ka mobile number nahi hai.`); return; }
    if (await openWhatsApp(p.mobile, reminderMessage(shop.wa, { name: p.name, pending: p.balance }))) {
      setSent((s) => new Set(s).add(p.id));
    }
  }

  async function sendSlip(b: Bill) {
    if (!b.mobile) { notify(`${b.customer_name} ka mobile number nahi hai.`); return; }
    const lines = await db.getAll<{ description: string; qty: number; rate: number }>(
      'SELECT description, qty, rate FROM sales_invoice_lines WHERE invoice_id = ? ORDER BY line_no', [b.id]);
    await openWhatsApp(b.mobile, slipMessage(shop.wa, { name: b.customer_name, billNo: b.doc_no, date: b.doc_date, total: b.grand_total, pending: b.balance, items: lines }));
    setSent((s) => new Set(s).add(b.id));
  }

  async function shareQr(name: string, amount: number) {
    if (!shop.wa.upiId) { notify('Pehle More → Settings mein UPI ID daalo.'); return; }
    const url = paymentQrDataUrl({ upiId: shop.wa.upiId, payee: shop.wa.upiPayeeName, amount, note: name.slice(0, 20) });
    await shareImageDataUrl(url, { dialogTitle: `Payment QR · ${name}`, fileName: 'payment-qr.gif' });
  }

  const sampleName = visible[0]?.name ?? 'Customer';
  const sampleMessage = reminderMessage(shop.wa, { name: sampleName, pending: visible[0]?.balance ?? 0 });

  return (
    <Screen>
      <View>
        <Text variant="label" color="textFaint">
          {new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </Text>
        <Text variant="display" style={{ marginTop: 3 }}>Kisse paise lene hain</Text>
      </View>

      <Enter>
        <Card keyline>
          <Row style={{ justifyContent: 'space-between' }} align="flex-start">
            <View style={{ flex: 1 }}>
              <Text variant="label" color="textMuted">Total pending</Text>
              <Text style={[typeScale.hero, { fontSize: 34, lineHeight: 38, color: t.warn }]}>{formatINR(Math.round(shown))}</Text>
              <Text variant="small" color="textFaint">
                {visible.length} customer{overdueCount ? ` · ${overdueCount} overdue` : ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={async () => { for (const p of visible.slice(0, 1)) await remind(p); }}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              style={({ pressed }) => [styles.redPill, { backgroundColor: t.accent, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
              <Text style={{ color: t.accentText, fontWeight: '700' }}>Sabko bhejo</Text>
            </Pressable>
          </Row>
        </Card>
      </Enter>

      <Row gap={space.xs} wrap>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              onPress={() => setFilter(f.key)}
              style={({ pressed }) => [
                styles.filter,
                { backgroundColor: on ? t.keyline : t.surface, borderColor: on ? t.keyline : t.border, opacity: pressed ? 0.8 : 1 },
              ]}>
              <Text variant="small" style={{ color: on ? t.surface : t.text, fontWeight: '600' }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </Row>

      <Enter index={1}>
        <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {visible.length ? visible.map((p, i) => {
            const old = daysOld(p.oldest_due);
            const isSent = sent.has(p.id);
            return (
              <View key={p.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: t.border }]}>
                {/* Name and money share the left column so the name never has
                    to fight three buttons for width on a 390px phone. */}
                <Pressable style={{ flex: 1, gap: 3 }} onPress={() => router.push(`/customer/${p.id}`)}>
                  <Text variant="rowTitle" numberOfLines={1}>{p.name}</Text>
                  <Row gap={space.sm}>
                    <Text variant="mono" color="warn" style={{ fontWeight: '600', fontSize: 15 }}>{formatINR(p.balance)}</Text>
                    {old ? <Text variant="label" color="textFaint">{old} din</Text> : null}
                  </Row>
                  <Text variant="mono" color="textFaint" numberOfLines={1}>
                    {p.mobile ?? 'no mobile'}{p.bills_today ? ` · ${p.bills_today} bill aaj` : ''}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => shareQr(p.name, p.balance)}
                  accessibilityRole="button"
                  accessibilityLabel="Payment QR share karo"
                  hitSlop={6}
                  style={({ pressed }) => [styles.iconBtn, { borderColor: t.borderStrong, opacity: pressed ? 0.6 : 1 }]}>
                  <Icon name="qr-code-outline" size={17} tone="text" />
                </Pressable>

                {can('payment.receive') ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/payment/edit?direction=in&party=${p.id}&amount=${p.balance}`)}
                    style={({ pressed }) => [styles.outline, { borderColor: t.borderStrong, opacity: pressed ? 0.6 : 1 }]}>
                    <Text variant="small" style={{ fontWeight: '600' }}>Paid</Text>
                  </Pressable>
                ) : null}

                {isSent ? (
                  <View style={[styles.outline, { borderColor: t.ok, flexDirection: 'row', gap: 5, alignItems: 'center' }]}>
                    <Icon name="checkmark" size={13} color={t.ok} />
                    <Text variant="small" style={{ color: t.ok, fontWeight: '600' }}>Bhej diya</Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => remind(p)}
                    android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                    style={({ pressed }) => [styles.redPill, { backgroundColor: t.accent, paddingHorizontal: 15, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                    <Text variant="small" style={{ color: t.accentText, fontWeight: '700' }}>Remind</Text>
                  </Pressable>
                )}
              </View>
            );
          }) : (
            <View style={{ paddingVertical: space.xxl, alignItems: 'center' }}>
              <Text variant="small" color="textFaint">Is filter mein koi nahi</Text>
            </View>
          )}
        </Card>
      </Enter>

      {bills && bills.length ? (
        <Enter index={2}>
          <View style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between', paddingHorizontal: 2 }}>
              <Row gap={space.sm}>
                <Text variant="label" color="textMuted">Aaj ke slip</Text>
                <Text variant="label" color="textFaint">{bills.length}</Text>
              </Row>
            </Row>
            <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
              {bills.map((b, i) => (
                <View key={b.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: t.border }]}>
                  <Pressable style={{ flex: 1, gap: 2 }} onPress={() => router.push(`/invoice/${b.id}`)}>
                    <Text variant="rowTitle" numberOfLines={1}>{b.customer_name}</Text>
                    <Text variant="mono" color="textFaint">{b.doc_no}</Text>
                  </Pressable>
                  <Text variant="mono" style={{ fontWeight: '600', fontSize: 14 }}>{formatINR(b.grand_total)}</Text>
                  {b.grand_total > b.paid_total ? (
                    <Pressable accessibilityRole="button" onPress={() => shareQr(b.customer_name, b.grand_total - b.paid_total)} hitSlop={6}
                      accessibilityLabel="Payment QR share karo"
                      style={({ pressed }) => [styles.iconBtn, { borderColor: t.borderStrong, opacity: pressed ? 0.6 : 1 }]}>
                      <Icon name="qr-code-outline" size={17} tone="text" />
                    </Pressable>
                  ) : null}
                  {sent.has(b.id) ? (
                    <View style={[styles.outline, { borderColor: t.ok, flexDirection: 'row', gap: 5, alignItems: 'center' }]}>
                      <Icon name="checkmark" size={13} color={t.ok} />
                      <Text variant="small" style={{ color: t.ok, fontWeight: '600' }}>Bhej diya</Text>
                    </View>
                  ) : (
                    <Pressable accessibilityRole="button" onPress={() => sendSlip(b)}
                      style={({ pressed }) => [styles.redPill, { backgroundColor: t.accent, paddingHorizontal: 15, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                      <Text variant="small" style={{ color: t.accentText, fontWeight: '700' }}>Slip</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </Card>
          </View>
        </Enter>
      ) : null}

      {/* What actually goes out, so nobody has to guess. */}
      <Enter index={3}>
        <View style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: 2 }}>
            <Text variant="label" color="textMuted">Message jo jayega</Text>
            <Pressable onPress={() => router.push('/admin/settings')} hitSlop={10}>
              <Text variant="small" color="accent" style={{ fontWeight: '600' }}>Badlo</Text>
            </Pressable>
          </Row>
          <Card>
            <View style={[styles.bubble, { backgroundColor: t.okSoft, borderColor: '#D6E9D8' }]}>
              <Text variant="small">{sampleMessage}</Text>
            </View>
            {shop.wa.upiId ? (
              <Text variant="mono" style={{ color: t.info, textDecorationLine: 'underline' }} numberOfLines={1}>
                {upiLink(shop.wa.upiId, shop.wa.upiPayeeName, visible[0]?.balance ?? null)}
              </Text>
            ) : (
              <Text variant="small" color="warn">UPI ID nahi hai — Settings mein daalo, tab pay link jayega.</Text>
            )}
          </Card>
        </View>
      </Enter>
    </Screen>
  );
}

const styles = StyleSheet.create({
  redPill: { borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 13 },
  iconBtn: { width: 36, height: 36, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  filter: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: space.md },
  bubble: { borderWidth: 1, borderRadius: 12, borderBottomLeftRadius: 4, padding: space.md },
});
