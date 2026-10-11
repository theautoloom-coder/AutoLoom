import { statusLabel } from '@domain';
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
import React, { useState } from 'react';

import { approveChangeRequest } from '@/lib/approvals';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { cancelRequest, formHref, parseProposal, rejectRequest, type ChangeRequest } from '@/lib/requests';
import { Badge, Button, Card, Divider, Input, KV, Row, Screen, SectionTitle, Text } from '@/ui';
import { RequestSummary } from '@/ui/request-summary';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type ReqRow = ChangeRequest & { submitter: string | null; reviewer: string | null };

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

  const { data: rows } = useQuery<ReqRow>(
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

  const p = req ? parseProposal(req) : null;
  const isEdit = !!(p?.edit_variant_id || p?.edit_product_id);

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
    if (!(await confirm('Approve karein?', isEdit
      ? `Badlav lag jayega — ${p.edit_variant_id ? 'sirf isi kism par' : 'item par'}.`
      : `"${p.name}" catalogue mein daal diya jayega.`))) return;
    setBusy(true);
    try {
      await approveChangeRequest(db, req, actor, locationId ?? null);
      notify(isEdit ? 'Approve ho gaya — badlav lag gaya.' : 'Approve ho gaya. Item catalogue mein aa gaya.', 'ok');
      router.replace('/requests');
    } catch (e) {
      notify(`Approve nahi hua: ${String((e as Error).message ?? e)}`, 'danger');
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
      notify('Wapas bhej diya.', 'ok');
      router.replace('/requests');
    } catch (e) {
      notify(`Reject nahi hua: ${String((e as Error).message ?? e)}`, 'danger');
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
          <Text variant="display">{isEdit ? (p?.edit_variant_id ? 'Kism mein badlav' : 'Item mein badlav') : p?.name || 'Request'}</Text>
          <Badge tone={tone}>{statusLabel(req.status)}</Badge>
        </Row>

        {req.status === 'rejected' && req.review_note ? (
          <Card keyline spine="accent">
            <Text variant="label" color="danger">WAPAS KYUN AAYI</Text>
            <Text>{req.review_note}</Text>
            {mine ? (
              <Button title="Theek karke dobara bhejo" onPress={() => router.push(formHref(req) as never)} />
            ) : null}
          </Card>
        ) : null}

        {mine && req.status === 'pending' ? (
          <Card spine="warn">
            <Text variant="heading">Owner ke review mein hai</Text>
            <Text variant="small" color="textMuted">Approve hone tak badal sakte ho — naam, detail, gaadi, rate. Owner ko naya wala dikhega.</Text>
            <Button title="Badlo" onPress={() => router.push(formHref(req) as never)} />
          </Card>
        ) : null}
        {isReviewer && req.status === 'pending' && req.revised_at ? (
          <Card spine="accent">
            <Text variant="small" color="danger">Bhejne ke baad badli gayi — {stamp(req.revised_at)}. Neeche jo hai wahi taaza hai.</Text>
          </Card>
        ) : null}

        <RequestSummary req={req} />

        <SectionTitle>Kisne, kab</SectionTitle>
        <Card>
          <KV k="Bheja" v={`${req.submitter ?? 'Staff'} · ${stamp(req.submitted_at)}`} />
          {req.note ? <KV k="Unka note" v={req.note} /> : null}
          {req.revision > 1 ? <KV k="Kitni baar" v={`${req.revision} baar bheji / badli gayi`} /> : null}
          {req.revised_at ? <KV k="Aakhri badlav" v={stamp(req.revised_at)} /> : null}
          {req.reviewed_at ? <KV k="Dekha" v={`${req.reviewer ?? '—'} · ${stamp(req.reviewed_at)}`} /> : null}
        </Card>

        {isReviewer && req.status === 'pending' ? (
          <>
            <SectionTitle>Faisla</SectionTitle>
            <Card>
              <Button title={isEdit ? 'Approve karo — badlav lagao' : 'Approve karo — item bana do'} size="lg" onPress={approve} loading={busy} />
              <Divider />
              <Input
                label="Reject karna ho to wajah likho"
                value={reason}
                onChangeText={setReason}
                placeholder={isEdit ? 'Ye gaadi galat hai / rate sahi tha' : 'Rate zyada hai / photo bhejo / ye pehle se hai'}
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
