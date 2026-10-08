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
import React, { useMemo, useState } from 'react';

import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import {
  approveRequest, cancelRequest, fitsOf, formHref, parseProposal, rejectRequest, variantNameOf, type ChangeRequest, type ProposalFit,
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
  // A change to what exists (owner, 8 Oct 2026): what it was beside what is
  // asked, detail by detail, the changed ones marked.
  const isEdit = !!(p?.edit_variant_id || p?.edit_product_id);
  const { data: defRows } = useQuery<{ id: string; name: string; sort_order: number }>(
    'SELECT id, name, sort_order FROM spec_definitions WHERE family_id = ? ORDER BY sort_order', [isEdit ? p?.family_id ?? '' : '']);
  const { data: modelRows } = useQuery<{ id: string; name: string }>(
    'SELECT id, name FROM vehicle_models WHERE ? = 1', [isEdit ? 1 : 0]);
  const carsOf = (fits: ProposalFit[] | undefined) => (fits ?? []).map((f) => {
    const m = (modelRows ?? []).find((x) => x.id === f.model_id)?.name ?? f.label ?? 'Gaadi';
    return `${m}${f.year_from ? ` ${f.year_from}${f.year_to ? (f.year_to === f.year_from ? '' : `–${f.year_to}`) : '+'}` : ''}`;
  }).join(', ') || 'Sab gaadi';
  const diff: { k: string; was: string; now: string }[] = [];
  if (p && isEdit) {
    const b = p.before ?? {};
    if (p.edit_variant_id) diff.push({ k: 'Kism ka naam', was: b.name ?? '—', now: variantNameOf(p) });
    else {
      diff.push({ k: 'Item ka naam', was: b.name ?? '—', now: p.name });
      diff.push({ k: 'Category', was: b.family_name ?? '—', now: family?.name ?? p.family_name ?? '—' });
    }
    const was = new Map((b.specs ?? []).map((x) => [x.def_id, x.display]));
    const now = new Map((p.specs ?? []).map((x) => [x.def_id, x.display]));
    for (const d of defRows ?? []) {
      if (!was.has(d.id) && !now.has(d.id)) continue;
      diff.push({ k: d.name, was: was.get(d.id) || '—', now: now.get(d.id) || '—' });
    }
    if (p.edit_variant_id) diff.push({ k: 'Gaadi', was: carsOf(b.fits), now: p.universal ? 'Sab gaadi' : carsOf(fitsOf(p)) });
    else diff.push({ k: 'Har gaadi mein', was: b.universal ? 'Haan' : 'Nahi', now: p.universal ? 'Haan' : 'Nahi' });
    diff.push({ k: 'Bechne ka rate', was: b.price != null ? `₹${b.price}` : '—', now: p.price != null ? `₹${p.price}` : '—' });
    if (p.edit_variant_id) {
      diff.push({ k: 'Set mein', was: String(b.pack_size ?? 1), now: String(p.pack_size ?? 1) });
      diff.push({ k: 'Warranty (mahine)', was: String(b.warranty_months ?? 0), now: String(p.warranty_months ?? 0) });
    }
  }
  const changed = diff.filter((d) => d.was !== d.now);

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
      ? `${changed.length} badlav lag jayenge — ${p.edit_variant_id ? 'sirf isi kism par' : 'item par'}.`
      : `"${p.name}" catalogue mein daal diya jayega.`))) return;
    setBusy(true);
    try {
      await approveRequest(db, req, {
        actor, locationId, takenSkus, skuPrefix: family?.sku_prefix ?? null,
      });
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

        {isEdit ? (
          <>
            <Text color="textMuted">{p?.product_name ?? p?.name}{p?.edit_variant_id && p.before?.name ? ` · ${p.before.name}` : ''}</Text>
            <SectionTitle right={<Text variant="small" color="textFaint">{changed.length} badle</Text>}>Pehle → ab</SectionTitle>
            <Card style={{ gap: space.xs }}>
              {diff.map((d) => (
                <Row key={d.k} style={{ justifyContent: 'space-between' }} gap={space.sm} align="flex-start">
                  <Text variant="small" color="textMuted" style={{ flex: 1 }}>{d.k}</Text>
                  {d.was === d.now
                    ? <Text variant="small" color="textFaint" style={{ flex: 2, textAlign: 'right' }}>{d.now}</Text>
                    : <Text variant="small" style={{ flex: 2, textAlign: 'right' }}><Text variant="small" color="danger">{d.was}</Text>{'  →  '}<Text variant="small" color="ok">{d.now}</Text></Text>}
                </Row>
              ))}
            </Card>
          </>
        ) : null}

        {isEdit ? null : <SectionTitle>Kya maanga hai</SectionTitle>}
        {isEdit ? null : <Card>
          <KV k="Category" v={family?.name ?? '—'} />
          <KV k="Item" v={p?.name ?? '—'} />
          {p?.product_id ? <KV k="Kya hai" v="Is item ki nayi kism — item pehle se hai" /> : null}
          {(p?.specs ?? []).length
            ? (p?.specs ?? []).map((sp) => <KV key={sp.def_id} k={sp.name} v={sp.display} />)
            : (<>
                <KV k="Type" v={p?.type || '—'} />
                <KV k="Colour" v={p?.colour || '—'} />
              </>)}
          <KV k="Gaadi" v={p?.universal ? 'Sab gaadi' : (p?.fits ?? []).map((f) => f.label).filter(Boolean).join(', ') || [p?.car_text, p?.year_text].filter(Boolean).join(' ') || 'Sab gaadi'} />
          <Divider />
          <KV k="Qty" v={String(p?.qty ?? 0)} mono />
          <KV k="Bechne ka rate" v={p?.price != null ? `₹${p.price}` : '—'} mono />
          {can('catalog.view_cost') ? <KV k="Kharid rate" v={p?.cost != null ? `₹${p.cost}` : '—'} mono /> : null}
          {p?.pack_size && p.pack_size > 1 ? (
            <KV k="Set mein" v={`${p.pack_size} ${p.pack_label || 'pcs'}`} mono />
          ) : null}
          {p?.warranty_months ? <KV k="Warranty" v={`${p.warranty_months} mahine`} mono /> : null}
        </Card>}

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
