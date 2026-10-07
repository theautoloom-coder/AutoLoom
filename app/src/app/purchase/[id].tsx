import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR, statusLabel } from '@domain';

import { cancelPurchase } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { dayLabel } from '@/lib/words';
import { updateRow } from '@/lib/writes';
import { Badge, Button, Card, Divider, Empty, KV, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type P = {
  id: string; doc_type: string; doc_no: string | null; doc_date: string; supplier_id: string; supplier_invoice_no: string | null;
  location_name: string; location_type: string; other_charges: number; grand_total: number; paid_total: number; status: string;
  notes: string | null; cancel_reason: string | null; against_no: string | null; against_type: string | null; against_purchase_id: string | null;
  sname: string; settled_at: string | null; settle_note: string | null; submitter: string | null; approver: string | null;
};
type L = { id: string; description: string; qty: number; unit_code: string | null; rate: number; line_total: number; variant_id: string; sku: string; product_id: string };
type Pay = { id: string; doc_no: string; payment_date: string; amount: number; mode: string };
type Linked = { id: string; doc_no: string | null; doc_date: string; doc_type: string; grand_total: number; status: string; qty: number };

/**
 * One entry of maal from or to a supplier.
 *
 * A supplier return (debit note) stays open until the supplier settles it
 * (owner, 6 Oct 2026): replacement maal against it, or the amount simply left
 * off their khata — adjusted against other maal — or some of each.
 */
export default function PurchaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const showCost = can('catalog.view_cost');
  const approver = can('purchase.approve');
  const [busy, setBusy] = useState(false);

  const { data: rows } = useQuery<P>(`
    SELECT p.*, l.name AS location_name, l.type AS location_type, s.name AS sname,
           o.doc_no AS against_no, o.doc_type AS against_type,
           sb.full_name AS submitter, ab.full_name AS approver
      FROM purchases p
      JOIN locations l ON l.id = p.location_id
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN purchases o ON o.id = p.against_purchase_id
      LEFT JOIN profiles sb ON sb.id = p.submitted_by
      LEFT JOIN profiles ab ON ab.id = p.approved_by
     WHERE p.id = ?`, [id]);
  const p = rows?.[0];
  const { data: lines } = useQuery<L>('SELECT pl.*, pv.sku, pv.product_id FROM purchase_lines pl JOIN product_variants pv ON pv.id = pl.variant_id WHERE pl.purchase_id = ? ORDER BY pl.line_no', [id]);
  const { data: payments } = useQuery<Pay>(`SELECT py.id, py.doc_no, py.payment_date, pa.amount, py.mode FROM payment_allocations pa JOIN payments py ON py.id = pa.payment_id WHERE pa.doc_id = ? AND py.status = 'posted' ORDER BY py.payment_date`, [id]);
  // Returns against a receipt, or replacements against a return.
  const { data: linked } = useQuery<Linked>(`
    SELECT x.id, x.doc_no, x.doc_date, x.doc_type, x.grand_total, x.status,
           (SELECT COALESCE(SUM(qty), 0) FROM purchase_lines WHERE purchase_id = x.id) AS qty
      FROM purchases x WHERE x.against_purchase_id = ? ORDER BY x.doc_date`, [id]);
  // What of a return is still to come back: pieces sent, less pieces replaced.
  const { data: openRows } = useQuery<{ qty: number; value: number }>(`
    SELECT COALESCE(SUM(MAX(l.qty - COALESCE(back.qty, 0), 0)), 0) AS qty,
           COALESCE(SUM(MAX(l.qty - COALESCE(back.qty, 0), 0) * l.rate), 0) AS value
      FROM purchase_lines l
      LEFT JOIN (
        SELECT rl.variant_id, SUM(rl.qty) AS qty
          FROM purchase_lines rl JOIN purchases r ON r.id = rl.purchase_id
         WHERE r.against_purchase_id = ?1 AND r.doc_type = 'purchase' AND r.status = 'posted'
         GROUP BY rl.variant_id
      ) back ON back.variant_id = l.variant_id
     WHERE l.purchase_id = ?1`, [id]);
  const open = openRows?.[0] ?? { qty: 0, value: 0 };
  // What of a receipt can still go back: once all of it has, the button goes.
  const { data: leftRows } = useQuery<{ left: number }>(`
    SELECT COALESCE(SUM(MAX(l.qty - COALESCE((SELECT SUM(x.qty) FROM purchase_lines x JOIN purchases px ON px.id = x.purchase_id
                                              WHERE x.against_line_id = l.id AND px.status = 'posted'), 0), 0)), 0) AS left
      FROM purchase_lines l WHERE l.purchase_id = ?`, [id]);
  const returnable = leftRows?.[0]?.left ?? 0;

  async function cancel() {
    if (!p) return;
    const reason = typeof globalThis.prompt === 'function' ? globalThis.prompt('Cancel kyun kar rahe ho?') : 'Cancel';
    if (!reason) return;
    if (!(await confirm('Ise cancel karein?', 'Stock aur supplier ka khata dono pehle jaise ho jayenge. Number wahi rahega.'))) return;
    setBusy(true);
    try {
      await db.writeTransaction(async (tx) => cancelPurchase(tx, p.id, reason, actor));
      notify('Cancel ho gaya.', 'ok');
    } catch (e) { notify((e as Error).message, 'danger'); } finally { setBusy(false); }
  }

  /** Whatever has not come back as replacement stays off the supplier's khata. */
  async function settleWithMoney() {
    if (!p) return;
    const ok = await confirm(
      'Baaki paisa mein adjust karein?',
      `${open.qty} pcs ka replacement nahi aayega. ${formatINR(open.value)} supplier ke khaate se kam hi rahega — agle maal mein adjust. Wapsi band ho jayegi.`,
    );
    if (!ok) return;
    await updateRow(db, 'purchases', p.id, {
      settled_at: new Date().toISOString(), settled_by: actor.userId,
      settle_note: open.qty > 0 ? `${open.qty} pcs ka ${formatINR(open.value)} khaate mein adjust` : 'Settle',
    });
    notify('Wapsi settle ho gayi.', 'ok');
  }

  if (!p) return <Screen><Empty art="search" title="Ye entry is phone par nahi mili" /></Screen>;
  const isReturn = p.doc_type === 'debit_note';
  const isReplacement = !isReturn && p.against_type === 'debit_note';
  const due = p.grand_total - p.paid_total;
  const pcs = (lines ?? []).reduce((a, l) => a + l.qty, 0);

  return (
    <>
      <Stack.Screen options={{ title: p.doc_no ?? 'Entry' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }} align="flex-start">
          <View style={{ flex: 1 }}>
            <Row gap={6} wrap>
              <Badge tone={p.status === 'cancelled' ? 'danger' : p.status === 'posted' ? 'ok' : 'neutral'}>{statusLabel(p.status)}</Badge>
              {isReturn ? <Badge tone="info">{p.against_no ? `${p.against_no} ki wapsi` : 'kharab maal ki wapsi'}</Badge> : null}
              {isReplacement ? <Badge tone="info">{`${p.against_no} ka replacement`}</Badge> : null}
              {isReturn && p.status === 'posted' ? (
                p.settled_at ? <Badge tone="ok">settle ho gayi</Badge> : <Badge tone="warn">settle baaki</Badge>
              ) : null}
            </Row>
            <Text variant="display" style={{ marginTop: space.xs }}>{p.doc_no ?? 'Adhoori entry'}</Text>
            <Text color="textMuted">{p.sname} · {dayLabel(p.doc_date)} · {pcs} pcs</Text>
            {p.submitter ? <Text variant="small" color="textFaint">{p.submitter} ne likha{p.approver ? ` · ${p.approver} ne approve kiya` : ''}</Text> : null}
          </View>
        </Row>
        {p.status === 'cancelled' ? (
          <Card tone="alt">
            <Text color="danger">{p.doc_no ? 'Cancel hua' : 'Owner ne mana kiya'}: {p.cancel_reason}</Text>
          </Card>
        ) : null}

        {showCost ? (
          <Card tone="navy">
            <Row gap={space.lg} wrap>
              <View style={{ flex: 1, minWidth: 120 }}>
                <Text variant="label" color="navyText" style={{ opacity: 0.7 }}>{isReturn ? 'Wapsi ki keemat' : 'Kul'}</Text>
                <Text variant="number" color="navyText">{formatINR(p.grand_total)}</Text>
              </View>
              {!isReturn ? (
                <>
                  <View style={{ flex: 1, minWidth: 120 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Diya</Text><Text variant="number" color="navyText">{formatINR(p.paid_total)}</Text></View>
                  <View style={{ flex: 1, minWidth: 120 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Dena baaki</Text><Text variant="number" color="navyText">{formatINR(due)}</Text></View>
                </>
              ) : null}
            </Row>
          </Card>
        ) : null}

        {/* The supplier's side of a return: replacement, money, or both. */}
        {isReturn && p.status === 'posted' ? (
          <Card spine={p.settled_at ? 'ok' : 'warn'} style={{ gap: space.sm }}>
            <Text variant="heading">{p.settled_at ? 'Settle ho gayi' : 'Supplier se kya aana hai'}</Text>
            {p.settled_at ? (
              <Text variant="small" color="textMuted">{p.settle_note ?? 'Settle'}</Text>
            ) : (
              <Text variant="small" color="textMuted">
                {open.qty} pcs ka replacement baaki{showCost ? ` · ${formatINR(open.value)}` : ''}. Replacement aaye to “Replacement aaya” dabao.
                Supplier paisa kaat de to “Paisa mein adjust karo” — itna unke khaate se kam hi rahega.
              </Text>
            )}
            {!p.settled_at ? (
              <Row gap={space.sm} wrap>
                {can('purchase.create') ? <Button title="Replacement aaya" onPress={() => router.push(`/purchase/edit?replace=${p.id}`)} /> : null}
                {approver ? <Button title="Paisa mein adjust karo" tone="secondary" onPress={settleWithMoney} /> : null}
              </Row>
            ) : null}
          </Card>
        ) : null}

        {p.status === 'posted' ? (
          <Row gap={space.sm} wrap>
            {!isReturn && can('payment.pay_supplier') && due > 0 ? <Button title="Supplier ko paisa do" onPress={() => router.push(`/payment/edit?direction=out&party=${p.supplier_id}&doc=${p.id}`)} /> : null}
            {!isReturn && !isReplacement && approver && returnable > 0 ? <Button title="Supplier ko maal wapas" tone="secondary" onPress={() => router.push(`/purchase/edit?against=${p.id}`)} /> : null}
            {can('purchase.cancel') ? <Button title="Entry cancel karo" tone="danger" onPress={cancel} loading={busy} /> : null}
          </Row>
        ) : null}

        <SectionTitle>Maal</SectionTitle>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(lines ?? []).map((l) => (
            <ListRow
              key={l.id}
              title={l.description}
              subtitle={`${l.sku} · ${l.qty} ${l.unit_code ?? 'pcs'}${showCost ? ` @ ${formatINR(l.rate)}` : ''}`}
              onPress={() => router.push(`/product/${l.product_id}?variant=${l.variant_id}`)}
              right={showCost ? <Text mono>{formatINR(l.line_total)}</Text> : <Text mono>{l.qty}</Text>}
            />
          ))}
        </Card>

        <Card style={{ gap: 0 }}>
          <KV k={isReturn ? 'Kahan se gaya' : 'Kahan aaya'} v={p.location_name} />
          {p.supplier_invoice_no ? <KV k="Supplier ka bill" v={p.supplier_invoice_no} /> : null}
          {showCost && p.other_charges ? <KV k="Bhada" v={formatINR(p.other_charges)} mono /> : null}
          {p.notes ? <KV k="Note" v={p.notes} /> : null}
        </Card>

        {showCost && (payments ?? []).length ? (
          <>
            <SectionTitle>Payment</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(payments ?? []).map((py) => <ListRow key={py.id} title={py.doc_no} subtitle={`${py.payment_date} · ${py.mode}`} right={<Text mono>{formatINR(py.amount)}</Text>} />)}
            </Card>
          </>
        ) : null}
        {(linked ?? []).length ? (
          <>
            <SectionTitle>{isReturn ? 'Is wapsi ke badle aaya' : 'Is entry ki wapsi'}</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {(linked ?? []).map((r) => (
                <ListRow
                  key={r.id}
                  title={r.doc_no ?? (r.status === 'draft' ? 'Approval baaki' : 'Adhoori')}
                  subtitle={`${dayLabel(r.doc_date)} · ${r.qty} pcs`}
                  onPress={() => router.push(r.status === 'draft' ? `/purchase/edit?id=${r.id}` : `/purchase/${r.id}`)}
                  right={showCost ? <Text mono>{formatINR(r.grand_total)}</Text> : undefined}
                />
              ))}
            </Card>
          </>
        ) : null}
      </Screen>
    </>
  );
}
