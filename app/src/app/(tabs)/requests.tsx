/**
 * The approval queue.
 *
 * One screen, two audiences. An admin sees everything waiting on them; a staff
 * member sees only what they sent, because the thing they actually want to know
 * is "did my item go through, and if not, why".
 *
 * Rejections are given the loudest treatment on purpose. A rejection that is
 * easy to miss is a rejection that gets resubmitted unchanged next week.
 *
 * Two kinds of thing wait here: maal a staff member counted in (it does not
 * reach the stock until an owner or admin approves it — owner, 6 Oct 2026),
 * and new items a staff member asked for.
 */
import { useQuery } from '@powersync/react';
import { Stack, useRouter } from 'expo-router';
import React from 'react';

import { useSession } from '@/lib/session';
import { parseProposal, type ChangeRequest } from '@/lib/requests';
import { Badge, Button, Card, Divider, Empty, ListRow, Screen, SectionTitle, Text } from '@/ui';

type Row = ChangeRequest & { submitter: string | null };
type Entry = {
  id: string; status: string; doc_no: string | null; doc_date: string; submitted_at: string | null; revised_at: string | null;
  notes: string | null; cancel_reason: string | null; decided_at: string | null;
  supplier: string | null; submitter: string | null; decider: string | null; items: number; qty: number;
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

function title(req: ChangeRequest): string {
  const p = parseProposal(req);
  if (!p) return 'Request';
  return [p.name, p.colour].filter(Boolean).join(' · ') || 'Naya item';
}

function subtitle(req: Row, mine: boolean): string {
  const p = parseProposal(req);
  const bits = [
    p?.price != null ? `₹${p.price}` : null,
    (p?.qty ?? 0) > 0 ? `${p?.qty} pcs` : null,
    mine ? null : (req.submitter ?? 'Staff'),
    when(req.submitted_at),
  ].filter(Boolean);
  return bits.join('  ·  ');
}

export default function RequestsScreen() {
  const router = useRouter();
  const { can, actor } = useSession();
  const isReviewer = can('catalog.edit');
  const approver = can('purchase.approve');
  const me = actor.userId ?? '';

  // Stock entries from staff: the approver sees all of them, staff their own.
  // submitted_at set = waiting; cleared = sent back for a fix.
  // Everything a staff member sent, wherever it is now: waiting (and still
  // theirs to change), back with them, or decided in the last 30 days —
  // approved or refused, with who decided and why.
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: entryRows } = useQuery<Entry>(
    `SELECT p.id, p.status, p.doc_no, p.doc_date, p.submitted_at, p.revised_at, p.notes, p.cancel_reason,
            COALESCE(p.posted_at, p.cancelled_at) AS decided_at,
            s.name AS supplier, pr.full_name AS submitter, dp.full_name AS decider,
            (SELECT COUNT(*) FROM purchase_lines l WHERE l.purchase_id = p.id) AS items,
            (SELECT COALESCE(SUM(l.qty), 0) FROM purchase_lines l WHERE l.purchase_id = p.id) AS qty
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN profiles pr ON pr.id = p.submitted_by
       LEFT JOIN profiles dp ON dp.id = COALESCE(p.approved_by, p.cancelled_by)
      WHERE p.doc_type = 'purchase' AND p.submitted_by IS NOT NULL
        AND (?1 = 1 OR p.submitted_by = ?2)
        AND (p.status = 'draft' OR COALESCE(p.posted_at, p.cancelled_at, p.updated_at) >= ?3)
      ORDER BY COALESCE(p.posted_at, p.cancelled_at, p.submitted_at, p.updated_at) DESC`,
    [approver ? 1 : 0, me, since],
  );
  const drafts = (entryRows ?? []).filter((e) => e.status === 'draft');
  const waiting = drafts.filter((e) => e.submitted_at);
  const sentBack = drafts.filter((e) => !e.submitted_at);
  const decidedEntries = (entryRows ?? []).filter((e) => e.status !== 'draft').slice(0, 30);
  const revised = (e: Entry) => !!e.revised_at && !!e.submitted_at && e.revised_at > e.submitted_at;

  // A reviewer sees the whole queue; everyone else sees only their own.
  const { data: rows } = useQuery<Row>(
    `SELECT cr.*, pr.full_name AS submitter
       FROM change_requests cr
       LEFT JOIN profiles pr ON pr.id = cr.submitted_by
      WHERE (? = 1 OR cr.submitted_by = ?)
      ORDER BY cr.submitted_at DESC`,
    [isReviewer ? 1 : 0, me],
  );

  const all = rows ?? [];
  const pending = all.filter((r) => r.status === 'pending');
  const rejected = all.filter((r) => r.status === 'rejected');
  const done = all.filter((r) => r.status === 'approved' || r.status === 'cancelled');

  const open = (r: Row) => {
    // A reviewer reviews it. The submitter of a rejected one goes straight back
    // into the form to fix it — that is the only thing they can do with it.
    if (isReviewer) router.push(`/request/${r.id}`);
    else if (r.status === 'rejected') router.push(`/admin/item?request=${r.id}`);
    else router.push(`/request/${r.id}`);
  };

  return (
    <>
      <Stack.Screen options={{ title: isReviewer ? 'Approval' : 'Maine kya bheja' }} />
      <Screen>
        <Text variant="display">{isReviewer ? 'Approval' : 'Maine kya bheja'}</Text>

        {/* Maal first: until it is approved the godown holds pieces the app
            does not know about, and a bill for them would show short. */}
        {sentBack.length > 0 ? (
          <>
            <SectionTitle>{approver ? 'Maal — staff ke paas wapas' : 'Maal — abhi bheja nahi ya wapas aaya'}</SectionTitle>
            {sentBack.map((e) => (
              <Card key={e.id} keyline={!approver} spine="accent">
                <Text variant="rowTitle">{e.supplier ?? 'Supplier'} · {e.qty} pcs</Text>
                <Text variant="small" color="textMuted">{[approver ? e.submitter : null, `${e.items} item`, e.doc_date].filter(Boolean).join('  ·  ')}</Text>
                {e.notes ? <Text variant="small">{e.notes}</Text> : null}
                <Button title={approver ? 'Dekho' : 'Theek karo'} tone={approver ? 'secondary' : 'primary'} onPress={() => router.push(`/purchase/approve?id=${e.id}`)} />
              </Card>
            ))}
          </>
        ) : null}

        <SectionTitle>{approver ? `Aaya hua maal — approve karo ${waiting.length || ''}` : `Review mein ${waiting.length || ''}`}</SectionTitle>
        {!approver && waiting.length > 0 ? (
          <Text variant="small" color="textMuted">Approve hone tak inhe badal sakte ho — kholo, qty ya maal theek karo. Owner ko turant dikhega.</Text>
        ) : null}
        {waiting.length === 0 ? (
          <Empty
            title={approver ? 'Koi maal approval ke liye nahi' : 'Kuch baaki nahi'}
            hint={approver
              ? 'Staff “Stock Chadhao” se maal likhega to yahan aayega. Rate bhar ke approve karo, tab stock badhega.'
              : 'Maal aaye to “+” → Stock Chadhao. Owner approve karega, tab stock mein dikhega.'}
          />
        ) : (
          <Card style={{ gap: 0 }}>
            {waiting.map((e, i) => (
              <React.Fragment key={e.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={`${e.supplier ?? 'Supplier'} · ${e.qty} pcs`}
                  subtitle={[approver ? e.submitter : null, `${e.items} item`, e.doc_date, revised(e) ? `badla ${when(e.revised_at!)}` : null].filter(Boolean).join('  ·  ')}
                  right={
                    revised(e) && approver
                      ? <Badge tone="danger">Badla gaya</Badge>
                      : <Badge tone="warn">{approver ? 'Approve karo' : 'Badal sakte ho'}</Badge>
                  }
                  onPress={() => router.push(`/purchase/approve?id=${e.id}`)}
                />
              </React.Fragment>
            ))}
          </Card>
        )}

        {decidedEntries.length > 0 ? (
          <>
            <SectionTitle>{approver ? 'Haal ke faisle (30 din)' : 'Faisla ho gaya (30 din)'}</SectionTitle>
            <Card style={{ gap: 0 }}>
              {decidedEntries.map((e, i) => (
                <React.Fragment key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={`${e.supplier ?? 'Supplier'} · ${e.qty} pcs`}
                    subtitle={[
                      approver ? e.submitter : null,
                      e.status === 'posted'
                        ? `${e.decider ?? 'Owner'} ne approve kiya${e.doc_no ? ` · ${e.doc_no}` : ''}`
                        : `${e.decider ?? 'Owner'} ne mana kiya: ${e.cancel_reason ?? '—'}`,
                      e.decided_at ? when(e.decided_at) : e.doc_date,
                    ].filter(Boolean).join('  ·  ')}
                    right={e.status === 'posted' ? <Badge tone="ok">Approve</Badge> : <Badge tone="danger">Mana kiya</Badge>}
                    onPress={() => router.push(`/purchase/${e.id}`)}
                  />
                </React.Fragment>
              ))}
            </Card>
          </>
        ) : null}

        {/* The submitter's rejections come first: they are the only items here
            that need someone to do something today. */}
        {!isReviewer && rejected.length > 0 ? (
          <>
            <SectionTitle>Wapas aayi — theek karni hai</SectionTitle>
            {rejected.map((r) => (
              <Card key={r.id} keyline spine="accent">
                <Text variant="rowTitle">{title(r)}</Text>
                <Text variant="small" color="textMuted">{subtitle(r, true)}</Text>
                <Text variant="label" color="danger">ADMIN NE KYA KAHA</Text>
                <Text variant="small">{r.review_note || '—'}</Text>
                <Button
                  title="Theek karke dobara bhejo"
                  onPress={() => router.push(`/admin/item?request=${r.id}`)}
                />
              </Card>
            ))}
          </>
        ) : null}

        {/* The hint below used to say "Naya item se bhej do" on a screen with
            no such button, and nowhere else offered one to staff either — a
            counter hand with new maal in front of them had no way in. */}
        {!isReviewer ? (
          <Button title="+ Naya item bhejo" onPress={() => router.push('/admin/item')} />
        ) : null}

        <SectionTitle>
          {isReviewer ? `Naye item — approve karo ${pending.length || ''}` : `Naye item jo bheje ${pending.length || ''}`}
        </SectionTitle>
        {pending.length === 0 ? (
          <Empty
            title={isReviewer ? 'Kuch pending nahi' : 'Kuch bheja nahi'}
            hint={
              isReviewer
                ? 'Staff koi naya item bhejega to yahan aayega.'
                : 'Naya maal mile to upar “Naya item bhejo” dabao — admin approve karega.'
            }
          />
        ) : (
          <Card style={{ gap: 0 }}>
            {pending.map((r, i) => (
              <React.Fragment key={r.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                title={title(r)}
                subtitle={subtitle(r, !isReviewer)}
                right={r.revision > 1 ? <Badge tone="info">{`${r.revision}x`}</Badge> : <Badge tone="warn">Baaki hai</Badge>}
                onPress={() => open(r)}
              />
              </React.Fragment>
            ))}
          </Card>
        )}

        {isReviewer && rejected.length > 0 ? (
          <>
            <SectionTitle>Wapas bheji hui</SectionTitle>
            <Card style={{ gap: 0 }}>
              {rejected.map((r, i) => (
                <React.Fragment key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                  title={title(r)}
                  subtitle={r.review_note ?? ''}
                  right={<Badge tone="danger">Mana kar diya</Badge>}
                  onPress={() => open(r)}
                />
                </React.Fragment>
              ))}
            </Card>
          </>
        ) : null}

        {done.length > 0 ? (
          <>
            <SectionTitle>Ho chuki</SectionTitle>
            <Card style={{ gap: 0 }}>
              {done.slice(0, 20).map((r, i) => (
                <React.Fragment key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                  title={title(r)}
                  subtitle={subtitle(r, !isReviewer)}
                  right={
                    r.status === 'approved'
                      ? <Badge tone="ok">Haan kar diya</Badge>
                      : <Badge tone="neutral">Wapas li</Badge>
                  }
                  onPress={() => open(r)}
                />
                </React.Fragment>
              ))}
            </Card>
          </>
        ) : null}
      </Screen>
    </>
  );
}
