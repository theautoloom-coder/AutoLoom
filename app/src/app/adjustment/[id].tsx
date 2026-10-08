/**
 * One stock correction: a count, or pieces broken or gone (owner, 8 Oct 2026:
 * "current stock mein kuch upar niche karna hai to user request bhej sake,
 * main approve kar saku").
 *
 * A staff member's correction waits here until an owner or admin approves it
 * — only then does the stock move — or refuses it with a reason the staff
 * member sees. While it waits, whoever sent it can take it back. An approved
 * one can still be undone by the owner: reversal rows, the original kept.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { postAdjustment, reverseMovements } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { deleteRow, updateRow } from '@/lib/writes';
import { Badge, Button, Card, Divider, Empty, Input, KV, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type A = {
  id: string; doc_no: string | null; doc_date: string; reason: string; status: string; notes: string | null; location_id: string | null;
  location_name: string | null; posted_at: string | null; approved_name: string | null; submitted_at: string | null; submitted_by: string | null;
  created_by: string | null; submitter: string | null; cancel_reason: string | null; cancelled_name: string | null;
};
type L = {
  id: string; qty_delta: number; unit_cost: number; reason_code: string | null; note: string | null; description: string; sku: string;
  variant_id: string; product_id: string; system_qty: number | null; counted_qty: number | null; now_qty: number;
};

const REASON: Record<string, string> = {
  counting_error: 'Ginti galat thi', damage: 'Kharab', missing: 'Nahi mila', found: 'Mil gaya',
  wrong_entry: 'Galat entry', other: 'Aur kuch', audit: 'Ginti',
};
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function AdjustmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const approver = can('stock.adjust');
  const showCost = can('catalog.view_cost');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState('');

  const { data: rows } = useQuery<A>(
    `SELECT a.*, l.name AS location_name, ap.full_name AS approved_name, sb.full_name AS submitter, cb.full_name AS cancelled_name
       FROM stock_adjustments a
       LEFT JOIN locations l ON l.id = a.location_id
       LEFT JOIN profiles ap ON ap.id = a.approved_by
       LEFT JOIN profiles sb ON sb.id = a.submitted_by
       LEFT JOIN profiles cb ON cb.id = a.cancelled_by
      WHERE a.id = ?`, [id]);
  const a = rows?.[0];
  const { data: lines } = useQuery<L>(
    `SELECT l.*, p.name || ' · ' || pv.variant_name AS description, pv.sku, pv.product_id,
            COALESCE((SELECT SUM(s.qty) FROM stock_on_hand s WHERE s.variant_id = l.variant_id AND s.location_id = a.location_id), 0) AS now_qty
       FROM stock_adjustment_lines l
       JOIN stock_adjustments a ON a.id = l.adjustment_id
       JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id
      WHERE l.adjustment_id = ? ORDER BY l.created_at`, [id]);

  if (!a) return <Screen><Empty art="search" title="Ye request is phone par nahi mili" /></Screen>;
  const waiting = a.status === 'draft' && !!a.submitted_at;
  const mine = a.created_by === actor.userId || a.submitted_by === actor.userId;
  const value = (lines ?? []).reduce((s, l) => s + l.qty_delta * (l.unit_cost || 0), 0);
  const up = (lines ?? []).reduce((s, l) => s + Math.max(l.qty_delta, 0), 0);
  const down = (lines ?? []).reduce((s, l) => s + Math.max(-l.qty_delta, 0), 0);

  async function approve() {
    if (!a) return;
    if (!(await confirm('Stock theek kar dein?', `${(lines ?? []).length} item ka stock badlega${up ? ` · +${up}` : ''}${down ? ` · −${down}` : ''}.`))) return;
    setBusy(true);
    try {
      let no = '';
      await db.writeTransaction(async (tx) => { no = await postAdjustment(tx, a.id, actor); });
      notify(`${no} — stock theek ho gaya.`, 'ok');
    } catch (e) { notify(`Nahi hua: ${(e as Error).message}`, 'danger'); } finally { setBusy(false); }
  }

  async function refuse() {
    if (!a) return;
    if (!why.trim()) { notify('Mana karne ki wajah likho.', 'danger'); return; }
    await updateRow(db, 'stock_adjustments', a.id, {
      status: 'cancelled', cancel_reason: why.trim(), cancelled_at: new Date().toISOString(), cancelled_by: actor.userId,
    });
    notify('Mana kar diya — stock waisa hi hai.', 'ok');
    router.back();
  }

  async function withdraw() {
    if (!a) return;
    if (!(await confirm('Request wapas lein?', 'Owner ke paas se hat jayegi. Stock par koi asar nahi.'))) return;
    await db.writeTransaction(async (tx) => {
      for (const l of lines ?? []) await deleteRow(tx, 'stock_adjustment_lines', l.id);
      await deleteRow(tx, 'stock_adjustments', a.id);
    });
    notify('Request wapas le li.', 'ok');
    router.back();
  }

  async function undo() {
    if (!a || !(await confirm('Ye sudhaar ulta karein?', 'Har line ka ulta movement likha jayega — stock pehle jaisa. Asli entry log mein rahegi.'))) return;
    setBusy(true);
    try {
      await db.writeTransaction(async (tx) => {
        await reverseMovements(tx, 'stock_adjustment', a.id, actor);
        await updateRow(tx, 'stock_adjustments', a.id, { status: 'cancelled', cancel_reason: 'Ulta kiya', cancelled_at: new Date().toISOString(), cancelled_by: actor.userId });
      });
      notify('Ulta ho gaya.', 'ok');
    } catch (e) { notify((e as Error).message, 'danger'); } finally { setBusy(false); }
  }

  const badge = a.status === 'posted' ? <Badge tone="ok">Approve — stock badla</Badge>
    : a.status === 'cancelled' ? <Badge tone="danger">{a.doc_no ? 'Ulta kiya' : 'Mana kiya'}</Badge>
    : waiting ? <Badge tone="warn">Owner ke review mein</Badge> : <Badge>Adhoori</Badge>;

  return (
    <>
      <Stack.Screen options={{ title: a.doc_no ?? 'Stock theek karna' }} />
      <Screen>
        <Row gap={space.xs} wrap>{badge}</Row>
        <Text variant="display">Stock theek karna</Text>
        <Text color="textMuted">
          {[a.submitter ? `${a.submitter} ne bheja` : null, a.submitted_at ? when(a.submitted_at) : a.doc_date].filter(Boolean).join(' · ')}
        </Text>

        {a.status === 'cancelled' && !a.doc_no ? (
          <Card tone="alt"><Text color="danger">{a.cancelled_name ?? 'Owner'} ne mana kiya: {a.cancel_reason ?? '—'}</Text></Card>
        ) : null}
        {waiting && approver ? (
          <Card spine="warn">
            <Text variant="heading">Dekh ke approve karo</Text>
            <Text variant="small" color="textMuted">Har line par app ka stock, asal ginti aur farak hai. Approve karte hi stock badlega.</Text>
          </Card>
        ) : null}
        {waiting && !approver && mine ? (
          <Card spine="warn">
            <Text variant="heading">Owner ke review mein hai</Text>
            <Text variant="small" color="textMuted">Approve hone tak stock nahi badlega. Galti dikhe to “Wapas lo” karke nayi request bhejo.</Text>
          </Card>
        ) : null}

        <SectionTitle right={<Text variant="small" color="textFaint">{[up ? `+${up}` : null, down ? `−${down}` : null].filter(Boolean).join('  ')}</Text>}>
          Item · {(lines ?? []).length}
        </SectionTitle>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(lines ?? []).map((l, i) => (
            <React.Fragment key={l.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={l.description}
                subtitle={[
                  REASON[l.reason_code ?? ''] ?? l.note ?? null,
                  l.system_qty != null && l.counted_qty != null ? `app mein ${l.system_qty} → asal ${l.counted_qty}` : null,
                  a.status === 'draft' ? `abhi ${l.now_qty}` : null,
                ].filter(Boolean).join(' · ')}
                onPress={() => router.push(`/product/${l.product_id}?variant=${l.variant_id}`)}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="number" mono color={l.qty_delta < 0 ? 'danger' : 'ok'}>{l.qty_delta > 0 ? '+' : ''}{l.qty_delta}</Text>
                  </View>
                }
              />
            </React.Fragment>
          ))}
        </Card>

        <Card style={{ gap: 0 }}>
          {a.doc_no ? <KV k="Number" v={a.doc_no} mono /> : null}
          <KV k="Tareekh" v={a.doc_date} />
          {a.location_name ? <KV k="Kahan" v={a.location_name} /> : null}
          {a.approved_name ? <KV k="Kisne approve kiya" v={a.approved_name} /> : null}
          {a.notes ? <KV k="Note" v={a.notes} /> : null}
          {showCost && value ? <KV k="Keemat ka farak" v={formatINR(value)} mono /> : null}
        </Card>

        {waiting && approver ? (
          <>
            <Button title="Approve karo — stock theek karo" size="lg" full onPress={approve} loading={busy} />
            <Card style={{ gap: space.sm }}>
              <Input label="Mana karne ki wajah" value={why} onChangeText={setWhy} placeholder="Dobara gino, ye sahi nahi lag raha" />
              <Button title="Mana karo" tone="danger" onPress={refuse} />
            </Card>
          </>
        ) : null}
        {a.status === 'draft' && mine && !approver ? <Button title="Wapas lo" tone="danger" onPress={withdraw} /> : null}
        {a.status === 'posted' && approver ? <Button title="Ye sudhaar ulta karo" tone="danger" onPress={undo} loading={busy} /> : null}
      </Screen>
    </>
  );
}
