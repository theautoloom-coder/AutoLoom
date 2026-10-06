/**
 * KHARAB MAAL — the corner where broken and returned maal waits.
 *
 * The owner's rule (6 Oct 2026): damaged maal goes back to the supplier, and
 * the supplier settles it with a replacement, a money adjustment against other
 * maal, or both. So this screen is a queue, not a graveyard:
 *
 *   · what is sitting here now, and the button that sends it back
 *   · returns already with a supplier and not yet settled
 *   · for the owner, two ways out that are not the supplier: it turned out
 *     fine (back to the godown) or it is beyond use (written off as loss)
 */
import { useQuery } from '@powersync/react';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR, toDateString } from '@domain';

import { dispatchTransfer, postAdjustment } from '@/lib/posting';
import { SPECS_OF } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { dayLabel } from '@/lib/words';
import { insertRow } from '@/lib/writes';
import { Badge, Button, Card, Empty, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { ItemPhoto } from '@/ui/photo';
import { space } from '@/ui/theme';

type Item = {
  variant_id: string; product_id: string; product_name: string; variant_name: string; sku: string;
  qty: number; avg_cost: number; specs: string | null; photo_path: string | null;
};
type Open = { id: string; doc_no: string; doc_date: string; supplier: string; sent: number; back: number; value: number };

export default function KharabScreen() {
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const showCost = can('catalog.view_cost');
  const approver = can('purchase.approve');
  const [busy, setBusy] = useState<string | null>(null);

  const { data: loc } = useQuery<{ id: string }>(
    "SELECT id FROM locations WHERE type = 'damaged' AND is_active = 1 ORDER BY sort_order LIMIT 1");
  const kharabId = loc?.[0]?.id ?? '';

  const { data: items, isLoading } = useQuery<Item>(`
    SELECT s.variant_id, p.id AS product_id, p.name AS product_name, pv.variant_name, pv.sku, s.qty,
           COALESCE(NULLIF(pv.avg_cost, 0), pv.last_purchase_cost, 0) AS avg_cost,
           ${SPECS_OF('p', 'pv')} AS specs,
           (SELECT pi.storage_path FROM product_images pi WHERE pi.variant_id = pv.id ORDER BY pi.sort_order LIMIT 1) AS photo_path
      FROM stock_on_hand s
      JOIN product_variants pv ON pv.id = s.variant_id
      JOIN products p ON p.id = pv.product_id
     WHERE s.location_id = ? AND s.qty > 0
     ORDER BY p.name`, [kharabId]);

  // Returns with a supplier that are not settled yet.
  const { data: open } = useQuery<Open>(`
    SELECT d.id, d.doc_no, d.doc_date, s.name AS supplier,
           (SELECT COALESCE(SUM(qty), 0) FROM purchase_lines WHERE purchase_id = d.id) AS sent,
           (SELECT COALESCE(SUM(rl.qty), 0) FROM purchase_lines rl JOIN purchases r ON r.id = rl.purchase_id
             WHERE r.against_purchase_id = d.id AND r.doc_type = 'purchase' AND r.status = 'posted') AS back,
           d.grand_total AS value
      FROM purchases d JOIN suppliers s ON s.id = d.supplier_id
     WHERE d.doc_type = 'debit_note' AND d.status = 'posted' AND d.settled_at IS NULL
     ORDER BY d.doc_date`);

  const totalPcs = (items ?? []).reduce((a, i) => a + i.qty, 0);
  const totalValue = (items ?? []).reduce((a, i) => a + i.qty * i.avg_cost, 0);

  /** It was fine after all: back to the godown, sellable again. */
  async function backToGodown(i: Item) {
    if (!locationId || !kharabId) return;
    if (!(await confirm('Godown mein wapas?', `${i.product_name} · ${i.qty} pcs theek nikle — wapas bechne wale stock mein.`))) return;
    setBusy(i.variant_id);
    try {
      await db.writeTransaction(async (tx) => {
        const tid = await insertRow(tx, 'stock_transfers', {
          doc_date: toDateString(), from_location_id: kharabId, to_location_id: locationId, status: 'draft', notes: 'Kharab se theek nikla',
        }, actor);
        await insertRow(tx, 'stock_transfer_lines', { transfer_id: tid, variant_id: i.variant_id, qty: i.qty, unit_cost: i.avg_cost });
        await dispatchTransfer(tx, tid, actor);
      });
      notify(`${i.qty} pcs godown mein wapas.`, 'ok');
    } catch (e) { notify(String((e as Error).message ?? e), 'danger'); } finally { setBusy(null); }
  }

  /** Beyond use and the supplier will not take it: book it as a loss. */
  async function writeOff(i: Item) {
    if (!kharabId) return;
    const msg = showCost
      ? `${i.product_name} · ${i.qty} pcs — ${formatINR(i.qty * i.avg_cost)} ka nuksan hisab mein judega.`
      : `${i.product_name} · ${i.qty} pcs stock se hamesha ke liye nikal jayenge.`;
    if (!(await confirm('Fenk dein?', msg))) return;
    setBusy(i.variant_id);
    try {
      await db.writeTransaction(async (tx) => {
        const aid = await insertRow(tx, 'stock_adjustments', {
          doc_date: toDateString(), location_id: kharabId, reason: 'damage', notes: 'Kharab maal fenk diya', status: 'draft',
        }, actor);
        await insertRow(tx, 'stock_adjustment_lines', {
          adjustment_id: aid, variant_id: i.variant_id, qty_delta: -i.qty, unit_cost: i.avg_cost, reason_code: 'damage', note: 'Fenk diya',
        });
        await postAdjustment(tx, aid, actor);
      });
      notify(`${i.qty} pcs nuksan mein likh diya.`, 'ok');
    } catch (e) { notify(String((e as Error).message ?? e), 'danger'); } finally { setBusy(null); }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Kharab maal' }} />
      <Screen>
        <View>
          <Text variant="display">Kharab maal</Text>
          <Text variant="small" color="textMuted">
            Toota, kharab nikla ya grahak ne kharab lautaya — sab yahan rukta hai, phir supplier ko wapas jaata hai. Ye bechne wale stock mein nahi ginta.
          </Text>
        </View>

        <Card keyline>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Text variant="label" color="textMuted">Abhi kharab mein</Text>
              <Text variant="number">{totalPcs} pcs</Text>
            </View>
            {showCost ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="label" color="textMuted">Keemat</Text>
                <Text variant="number" mono>{formatINR(totalValue)}</Text>
              </View>
            ) : null}
          </Row>
          {approver && totalPcs > 0 ? (
            <Button title="Supplier ko wapas bhejo" size="lg" full onPress={() => router.push('/purchase/edit?kharab=1')} />
          ) : null}
          {can('stock.damage') || can('stock.adjust') ? (
            <Button title="+ Kharab likho" tone="secondary" onPress={() => router.push('/kharab-maal')} />
          ) : null}
        </Card>

        <SectionTitle right={<Text variant="small" color="textFaint">{(items ?? []).length}</Text>}>Kharab mein pada hai</SectionTitle>
        {isLoading ? null : (items ?? []).length === 0 ? (
          <Empty art="maal" title="Kuch kharab nahi pada" hint="Maal toote ya kharab nikle to “+” → Kharab Likho." />
        ) : (
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {(items ?? []).map((i) => (
              <View key={i.variant_id} style={{ paddingVertical: space.xs }}>
                <ListRow
                  left={<ItemPhoto path={i.photo_path} name={i.product_name} size={40} />}
                  title={`${i.product_name} · ${i.variant_name}`}
                  subtitle={[i.specs, i.sku, showCost ? formatINR(i.qty * i.avg_cost) : null].filter(Boolean).join(' · ')}
                  onPress={() => router.push(`/product/${i.product_id}?variant=${i.variant_id}`)}
                  right={<Text mono color="danger">{i.qty}</Text>}
                />
                {approver ? (
                  <Row gap={space.sm} style={{ paddingLeft: 52 }}>
                    <Button title="Theek nikla — godown" tone="ghost" size="sm" loading={busy === i.variant_id} onPress={() => backToGodown(i)} />
                    <Button title="Fenk do" tone="ghost" size="sm" onPress={() => writeOff(i)} />
                  </Row>
                ) : null}
              </View>
            ))}
          </Card>
        )}

        <SectionTitle right={(open ?? []).length ? <Badge tone="warn">{String((open ?? []).length)}</Badge> : undefined}>
          Supplier ke paas — settle baaki
        </SectionTitle>
        {(open ?? []).length === 0 ? (
          <Empty title="Koi wapsi baaki nahi" hint="Supplier ko bheja hua maal yahan dikhega jab tak replacement ya paisa na aa jaye." />
        ) : (
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {(open ?? []).map((o) => (
              <ListRow
                key={o.id}
                title={`${o.supplier} · ${o.doc_no}`}
                subtitle={`${dayLabel(o.doc_date)} · ${o.sent} pcs gaye · ${o.back} replacement aaye`}
                onPress={() => router.push(`/purchase/${o.id}`)}
                right={showCost ? <Text mono>{formatINR(o.value)}</Text> : <Badge tone="warn">baaki</Badge>}
              />
            ))}
          </Card>
        )}
      </Screen>
    </>
  );
}
