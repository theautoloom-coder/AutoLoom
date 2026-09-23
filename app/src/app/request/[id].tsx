/**
 * Review one request.
 *
 * The admin has to be able to answer "is this right?" without opening another
 * screen, so everything the submitter typed is listed plainly — including the
 * cost, which is the field an owner actually checks.
 *
 * Approving creates the item. Rejecting demands a reason, because the reason is
 * the only thing that makes the next attempt better.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import {
  approveRequest, cancelRequest, parseProposal, rejectRequest, type ChangeRequest,
} from '@/lib/requests';
import { Badge, Button, Card, Divider, Input, KV, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type Row = ChangeRequest & { submitter: string | null; reviewer: string | null };

const stamp = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function RequestReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const isReviewer = can('catalog.edit');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: rows } = useQuery<Row>(
    `SELECT cr.*,
            sub.full_name AS submitter,
            rev.full_name AS reviewer
       FROM change_requests cr
       LEFT JOIN profiles sub ON sub.id = cr.submitted_by
       LEFT JOIN profiles rev ON rev.id = cr.reviewed_by
      WHERE cr.id = ? LIMIT 1`,
    [id ?? ''],
  );
  const req = rows?.[0] ?? null;

  // The SKU generator needs the set that already exists, and the prefix comes
  // from the category the submitter chose.
  const { data: skuRows } = useQuery<{ sku: string }>('SELECT sku FROM product_variants');
  const takenSkus = useMemo(() => new Set((skuRows ?? []).map((r) => r.sku)), [skuRows]);

  const p = req ? parseProposal(req) : null;
  const { data: famRows } = useQuery<{ sku_prefix: string; name: string }>(
    'SELECT sku_prefix, name FROM product_families WHERE id = ? LIMIT 1',
    [p?.family_id ?? ''],
  );
  const family = famRows?.[0] ?? null;

  if (!req) {
    return (
      <Screen>
        <Text>Request nahi mili.</Text>
      </Screen>
    );
  }

  const mine = req.submitted_by === actor.userId;
  const decided = req.status === 'approved' || req.status === 'cancelled';

  async function approve() {
    if (!req || !p) return;
    if (!(await confirm('Approve karein?', `"${p.name}" catalogue mein daal diya jayega.`))) return;
    setBusy(true);
    try {
      await approveRequest(db, req, {
        actor, locationId, takenSkus, skuPrefix: family?.sku_prefix ?? null,
      });
      notify('Approve ho gaya. Item catalogue mein aa gaya.');
      router.replace('/requests');
    } catch (e) {
      notify(`Approve nahi hua: ${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!req) return;
    if (!reason.trim()) {
      notify('Wajah likho — usi se staff theek karke bhej payega.');
      return;
    }
    setBusy(true);
    try {
      await rejectRequest(db, req.id, reason);
      notify('Wapas bhej diya.');
      router.replace('/requests');
    } catch (e) {
      notify(`Reject nahi hua: ${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!req) return;
    if (!(await confirm('Wapas lein?', 'Ye request hat jayegi. Baad mein dobara bhej sakte ho.'))) return;
    setBusy(true);
    try {
      await cancelRequest(db, req.id);
      router.replace('/requests');
    } catch (e) {
      notify(`Wapas nahi li ja saki: ${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  const tone =
    req.status === 'approved' ? 'ok' : req.status === 'rejected' ? 'danger' : req.status === 'cancelled' ? 'neutral' : 'warn';

  return (
    <>
      <Stack.Screen options={{ title: 'Request' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="display">{p?.name || 'Request'}</Text>
          <Badge tone={tone}>{req.status}</Badge>
        </Row>

        {req.status === 'rejected' && req.review_note ? (
          <Card keyline spine="accent">
            <Text variant="label" color="danger">WAPAS KYUN AAYI</Text>
            <Text>{req.review_note}</Text>
            {mine ? (
              <Button title="Theek karke dobara bhejo" onPress={() => router.push(`/admin/item?request=${req.id}`)} />
            ) : null}
          </Card>
        ) : null}

        <SectionTitle>Kya maanga hai</SectionTitle>
        <Card>
          <KV k="Category" v={family?.name ?? '—'} />
          <KV k="Item" v={p?.name ?? '—'} />
          <KV k="Type" v={p?.type || '—'} />
          <KV k="Colour" v={p?.colour || '—'} />
          <KV k="Gaadi" v={p?.car_text || 'Sab gaadi'} />
          <KV k="Model / saal" v={p?.year_text || '—'} />
          <Divider />
          <KV k="Qty" v={String(p?.qty ?? 0)} mono />
          <KV k="Selling price" v={p?.price != null ? `₹${p.price}` : '—'} mono />
          <KV k="Kharid rate" v={p?.cost != null ? `₹${p.cost}` : '—'} mono />
          {p?.pack_size && p.pack_size > 1 ? (
            <KV k="Set mein" v={`${p.pack_size} ${p.pack_label || 'pcs'}`} mono />
          ) : null}
          {p?.warranty_months ? <KV k="Warranty" v={`${p.warranty_months} mahine`} mono /> : null}
        </Card>

        <SectionTitle>Kisne, kab</SectionTitle>
        <Card>
          <KV k="Bheja" v={`${req.submitter ?? 'Staff'} · ${stamp(req.submitted_at)}`} />
          {req.note ? <KV k="Unka note" v={req.note} /> : null}
          {req.revision > 1 ? <KV k="Kitni baar" v={`${req.revision} baar bheji gayi`} /> : null}
          {req.reviewed_at ? <KV k="Dekha" v={`${req.reviewer ?? '—'} · ${stamp(req.reviewed_at)}`} /> : null}
        </Card>

        {isReviewer && req.status === 'pending' ? (
          <>
            <SectionTitle>Faisla</SectionTitle>
            <Card>
              <Button title="Approve karo — item bana do" size="lg" onPress={approve} loading={busy} />
              <Divider />
              <Input
                label="Reject karna ho to wajah likho"
                value={reason}
                onChangeText={setReason}
                placeholder="Rate zyada hai / photo bhejo / ye pehle se hai"
                multiline
              />
              <Button title="Wapas bhejo" tone="danger" onPress={reject} loading={busy} disabled={!reason.trim()} />
            </Card>
          </>
        ) : null}

        {mine && req.status === 'pending' ? (
          <Button title="Request wapas lo" tone="ghost" onPress={withdraw} loading={busy} style={{ marginTop: space.sm }} />
        ) : null}

        {decided && req.applied_product_id ? (
          <Button
            title="Item dekho"
            tone="secondary"
            onPress={() => router.push(`/admin/item?id=${req.applied_product_id}`)}
          />
        ) : null}
      </Screen>
    </>
  );
}
