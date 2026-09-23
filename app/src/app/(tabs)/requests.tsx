/**
 * The approval queue.
 *
 * One screen, two audiences. An admin sees everything waiting on them; a staff
 * member sees only what they sent, because the thing they actually want to know
 * is "did my item go through, and if not, why".
 *
 * Rejections are given the loudest treatment on purpose. A rejection that is
 * easy to miss is a rejection that gets resubmitted unchanged next week.
 */
import { useQuery } from '@powersync/react';
import { Stack, useRouter } from 'expo-router';
import React from 'react';

import { useSession } from '@/lib/session';
import { parseProposal, type ChangeRequest } from '@/lib/requests';
import { Badge, Button, Card, Divider, Empty, ListRow, Screen, SectionTitle, Text } from '@/ui';

type Row = ChangeRequest & { submitter: string | null };

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
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
  const me = actor.userId ?? '';

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
      <Stack.Screen options={{ title: isReviewer ? 'Requests' : 'Meri requests' }} />
      <Screen>
        <Text variant="display">{isReviewer ? 'Requests' : 'Meri requests'}</Text>

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

        <SectionTitle>
          {isReviewer ? `Approve karne hain ${pending.length || ''}` : `Bheji hui ${pending.length || ''}`}
        </SectionTitle>
        {pending.length === 0 ? (
          <Empty
            title={isReviewer ? 'Kuch pending nahi' : 'Kuch bheja nahi'}
            hint={
              isReviewer
                ? 'Staff koi naya item bhejega to yahan aayega.'
                : 'Naya maal mile to "Naya item" se bhej do — admin approve karega.'
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
