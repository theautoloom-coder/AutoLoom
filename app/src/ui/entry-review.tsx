/**
 * One staff stock entry, opened in place in the approval list (owner, 10 Oct
 * 2026: "request par click karke neeche yahin details open ho jaayein").
 *
 * The lines with their qty and buy rate, editable right here — the last rate
 * one tap away — and approve, send back or refuse. The full screen is one tap
 * further for anything else (supplier, date, bill photo).
 */
import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { approveEntry, refuseEntry } from '@/lib/approvals';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { updateRow } from '@/lib/writes';

import { Button, Divider, Input, Row, Text } from './index';
import { NumberField, confirm, notify } from './forms';
import { space } from './theme';

type Line = { id: string; description: string; qty: number; rate: number; variant_id: string; retail_price: number; last_cost: number };

export function EntryReview({ id, onDone }: { id: string; onDone?: () => void }) {
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const showCost = can('catalog.view_cost');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: lines } = useQuery<Line>(
    `SELECT l.id, l.description, l.qty, l.rate, l.variant_id, pv.retail_price,
            COALESCE(NULLIF(pv.last_purchase_cost, 0), pv.avg_cost, 0) AS last_cost
       FROM purchase_lines l JOIN product_variants pv ON pv.id = l.variant_id
      WHERE l.purchase_id = ? ORDER BY l.line_no`, [id]);
  const { data: heads } = useQuery<{ notes: string | null; supplier_invoice_no: string | null; bill_photo_path: string | null }>(
    'SELECT notes, supplier_invoice_no, bill_photo_path FROM purchases WHERE id = ?', [id]);
  const head = heads?.[0];

  const total = (lines ?? []).reduce((a, l) => a + l.qty * (l.rate || 0), 0);
  const unpriced = (lines ?? []).filter((l) => !l.rate).length;
  const withKnown = (lines ?? []).filter((l) => !l.rate && l.last_cost > 0);

  async function approve() {
    if (showCost && unpriced > 0 && !(await confirm(
      'Bina rate approve karein?',
      `${unpriced} line ka kharid rate nahi bhara — wo ₹0 par chadhegi aur supplier ke khaate mein unka paisa nahi judega. Baad mein entry kholke “Entry sudhaaro” se bhar sakte ho.`,
    ))) return;
    setBusy(true);
    try {
      let no = '';
      await db.writeTransaction(async (tx) => { no = await approveEntry(tx, id, actor); });
      notify(`${no} approve — stock chadh gaya.`, 'ok');
      onDone?.();
    } catch (e) {
      notify(`Nahi hua: ${(e as Error).message}`, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function sendBack() {
    if (!why.trim()) { notify('Wajah likho — kya theek karna hai.', 'danger'); return; }
    await updateRow(db, 'purchases', id, { submitted_at: null, notes: [head?.notes, `Owner: ${why.trim()}`].filter(Boolean).join(' · ') });
    notify('Wapas bhej diya.', 'ok');
    onDone?.();
  }

  async function refuse() {
    if (!why.trim()) { notify('Mana karne ki wajah likho.', 'danger'); return; }
    if (!(await confirm('Ye entry mana kar dein?', 'Stock nahi badhega. Staff ko wajah ke saath “Mana kiya” dikhega.'))) return;
    await refuseEntry(db, id, why, actor);
    notify('Mana kar diya.', 'ok');
    onDone?.();
  }

  return (
    <View style={{ gap: space.sm, paddingVertical: space.sm }}>
      {(lines ?? []).map((l, i) => (
        <View key={l.id} style={{ gap: space.xs }}>
          {i > 0 ? <Divider /> : null}
          <Text style={{ fontWeight: '600' }}>{l.description}</Text>
          <Row gap={12} wrap>
            <View style={{ flex: 1, minWidth: 90 }}>
              <NumberField label="Kitne aaye" value={l.qty} decimals={0}
                onChange={(v) => updateRow(db, 'purchase_lines', l.id, { qty: v ?? 0 })} />
            </View>
            {showCost ? (
              <View style={{ flex: 1, minWidth: 110 }}>
                <NumberField label="Kharid rate" value={l.rate || null}
                  onChange={(v) => updateRow(db, 'purchase_lines', l.id, { rate: v ?? 0 })}
                  hint={!l.rate && l.last_cost ? `Pichhli baar ${formatINR(l.last_cost)}` : undefined} />
              </View>
            ) : null}
          </Row>
          {showCost && !l.rate && l.last_cost ? (
            <Button title={`${formatINR(l.last_cost)} lagao`} tone="ghost" size="sm" onPress={() => updateRow(db, 'purchase_lines', l.id, { rate: l.last_cost })} />
          ) : null}
          {/* A kism made with this entry has no selling rate yet. */}
          {!l.retail_price ? (
            <NumberField label="Bechne ka rate (nayi kism)" value={null}
              onChange={(v) => { if (v && v > 0) updateRow(db, 'product_variants', l.variant_id, { retail_price: v, dealer_price: v }); }}
              hint="Bill par yahi rate aayega" />
          ) : null}
        </View>
      ))}

      {showCost && withKnown.length > 1 ? (
        <Button title={`Sab ${withKnown.length} line par pichhla rate lagao`} tone="secondary" size="sm"
          onPress={async () => { await db.writeTransaction(async (tx) => { for (const l of withKnown) await updateRow(tx, 'purchase_lines', l.id, { rate: l.last_cost }); }); }} />
      ) : null}
      {showCost ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Text color="textMuted">{(lines ?? []).reduce((a, l) => a + l.qty, 0)} pcs{unpriced ? ` · ${unpriced} line bina rate` : ''}</Text>
          <Text variant="number" mono>{formatINR(total)}</Text>
        </Row>
      ) : null}
      {head?.supplier_invoice_no ? <Text variant="small" color="textMuted">Supplier ka bill: {head.supplier_invoice_no}</Text> : null}
      {head?.notes ? <Text variant="small" color="textMuted">Note: {head.notes}</Text> : null}

      <Row gap={space.sm}>
        <Button title="Approve karo" onPress={approve} loading={busy} style={{ flex: 1 }} />
        <Button title="Poora kholo" tone="ghost" onPress={() => router.push(`/purchase/approve?id=${id}` as never)} />
      </Row>
      <Input label="Wapas bhejne ya mana karne ki wajah" value={why} onChangeText={setWhy} placeholder="Qty galat hai, dobara gino" />
      <Row gap={space.sm}>
        <Button title="Wapas bhejo" tone="secondary" size="sm" onPress={sendBack} style={{ flex: 1 }} />
        <Button title="Mana karo" tone="danger" size="sm" onPress={refuse} />
      </Row>
    </View>
  );
}
