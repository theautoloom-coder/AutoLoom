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
 * Three kinds of thing wait here: maal a staff member counted in (it does not
 * reach the stock until an owner or admin approves it — owner, 6 Oct 2026),
 * stock put right — an approved entry corrected, or the shelf count fixed
 * (owner, 8 Oct 2026) — and new items a staff member asked for.
 */
import { useQuery } from '@powersync/react';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { approveEntry, queueSummary, refuseEntry } from '@/lib/approvals';
import { postAdjustment } from '@/lib/posting';
import { useSystem } from '@/lib/system';

import { useSession } from '@/lib/session';
import { formHref, parseProposal, type ChangeRequest } from '@/lib/requests';
import { Badge, Button, Card, Divider, Empty, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { EntryReview } from '@/ui/entry-review';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type ReqRow = ChangeRequest & { submitter: string | null };
type Entry = {
  id: string; status: string; doc_no: string | null; doc_date: string; submitted_at: string | null; revised_at: string | null;
  notes: string | null; cancel_reason: string | null; decided_at: string | null;
  supplier: string | null; submitter: string | null; decider: string | null; items: number; qty: number;
  corrects_no: string | null;
};
type Fix = {
  id: string; status: string; doc_no: string | null; doc_date: string; submitted_at: string | null; notes: string | null;
  cancel_reason: string | null; decided_at: string | null; submitter: string | null; decider: string | null;
  items: number; up: number; down: number;
};
/** "Sudhaar PUR/0007 · Bright Auto · 8 pcs" for a correction; the plain line otherwise. */
const entryTitle = (e: Entry) => `${e.corrects_no ? `Sudhaar ${e.corrects_no} · ` : ''}${e.supplier ?? 'Supplier'} · ${e.qty} pcs`;
const fixTitle = (f: Fix) => [`Stock theek · ${f.items} item`, f.up ? `+${f.up}` : null, f.down ? `−${f.down}` : null].filter(Boolean).join('  ');

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

function title(req: ChangeRequest): string {
  const p = parseProposal(req);
  if (!p) return 'Request';
  // A change to what exists (owner, 8 Oct 2026): which kism or item.
  if (p.edit_variant_id) return `Badlav · ${p.product_name ?? p.name} · ${p.before?.name ?? 'kism'}`;
  if (p.edit_product_id) return `Badlav · ${p.before?.name ?? p.name} (item)`;
  // A kism request names the item it belongs to and what is new about it.
  if (p.product_id) {
    const what = [...(p.fits ?? []).map((f) => f.label), p.colour].filter(Boolean).join(', ');
    return `${p.product_name ?? p.name} · nayi kism${what ? ` (${what})` : ''}`;
  }
  return [p.name, p.colour].filter(Boolean).join(' · ') || 'Naya item';
}

function subtitle(req: ReqRow, mine: boolean): string {
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
  const { db } = useSystem();
  const { can, actor } = useSession();
  const isReviewer = can('catalog.edit');
  const approver = can('purchase.approve');
  const showCost = can('catalog.view_cost');
  const me = actor.userId ?? '';
  // Owner, 10 Oct 2026: approve from the list, open an entry in place, and
  // approve or refuse the whole queue at once.
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkWhy, setBulkWhy] = useState('');
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  // Stock entries from staff: the approver sees all of them, staff their own.
  // submitted_at set = waiting; cleared = sent back for a fix.
  // Everything a staff member sent, wherever it is now: waiting (and still
  // theirs to change), back with them, or decided in the last 30 days —
  // approved or refused, with who decided and why.
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: entryRows } = useQuery<Entry>(
    `SELECT p.id, p.status, p.doc_no, p.doc_date, p.submitted_at, p.revised_at, p.notes, p.cancel_reason,
            COALESCE(p.posted_at, p.cancelled_at) AS decided_at,
            s.name AS supplier, pr.full_name AS submitter, dp.full_name AS decider, o.doc_no AS corrects_no,
            (SELECT COUNT(*) FROM purchase_lines l WHERE l.purchase_id = p.id) AS items,
            (SELECT COALESCE(SUM(l.qty), 0) FROM purchase_lines l WHERE l.purchase_id = p.id) AS qty
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN profiles pr ON pr.id = p.submitted_by
       LEFT JOIN profiles dp ON dp.id = COALESCE(p.approved_by, p.cancelled_by)
       LEFT JOIN purchases o ON o.id = p.corrects_purchase_id
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

  // Stock put right on the shelf: a count or a piece gone, waiting or decided.
  const fixer = can('stock.adjust');
  const { data: fixRows } = useQuery<Fix>(
    `SELECT a.id, a.status, a.doc_no, a.doc_date, a.submitted_at, a.notes, a.cancel_reason,
            COALESCE(a.posted_at, a.cancelled_at) AS decided_at, pr.full_name AS submitter, dp.full_name AS decider,
            (SELECT COUNT(*) FROM stock_adjustment_lines l WHERE l.adjustment_id = a.id) AS items,
            (SELECT COALESCE(SUM(CASE WHEN l.qty_delta > 0 THEN l.qty_delta ELSE 0 END), 0) FROM stock_adjustment_lines l WHERE l.adjustment_id = a.id) AS up,
            (SELECT COALESCE(SUM(CASE WHEN l.qty_delta < 0 THEN -l.qty_delta ELSE 0 END), 0) FROM stock_adjustment_lines l WHERE l.adjustment_id = a.id) AS down
       FROM stock_adjustments a
       LEFT JOIN profiles pr ON pr.id = a.submitted_by
       LEFT JOIN profiles dp ON dp.id = COALESCE(a.approved_by, a.cancelled_by)
      WHERE a.submitted_by IS NOT NULL AND (?1 = 1 OR a.submitted_by = ?2)
        AND (a.status = 'draft' OR COALESCE(a.posted_at, a.cancelled_at, a.updated_at) >= ?3)
      ORDER BY COALESCE(a.posted_at, a.cancelled_at, a.submitted_at) DESC`,
    [fixer ? 1 : 0, me, since],
  );
  const fixWaiting = (fixRows ?? []).filter((f) => f.status === 'draft');

  /** One entry, straight from its row. Missing buy rates take the last known. */
  async function quickApprove(e: Entry) {
    const s = await queueSummary(db, [e.id]);
    const ok = await confirm(`${entryTitle(e)} — approve karein?`, [
      showCost ? `Kul lagbhag ${formatINR(s.value)}.` : null,
      'Jis line ka kharid rate nahi bhara, us par pichhla rate lagega.',
      s.unpriced ? `${s.unpriced} line ka rate kahin nahi mila — wo ₹0 par chadhegi; baad mein “Entry sudhaaro” se bharo.` : null,
    ].filter(Boolean).join(' '));
    if (!ok) return;
    try {
      let no = '';
      await db.writeTransaction(async (tx) => { no = await approveEntry(tx, e.id, actor, { fillRates: true }); });
      notify(`${no} approve — stock chadh gaya.`, 'ok');
      if (openId === e.id) setOpenId(null);
    } catch (err) {
      notify(`Nahi hua: ${(err as Error).message}`, 'danger');
    }
  }

  /** The whole queue: each entry on its own, so one bad one stops none of the rest. */
  async function approveAll() {
    const ids = waiting.map((w) => w.id);
    const s = await queueSummary(db, ids);
    const ok = await confirm(`Sab ${ids.length} entry approve karein?`, [
      `${s.pcs} pcs${showCost ? ` · lagbhag ${formatINR(s.value)}` : ''}.`,
      'Jin line ka kharid rate nahi bhara, un par pichhla rate lagega.',
      s.unpriced ? `${s.unpriced} line ka rate kahin nahi mila — wo ₹0 par chadhengi; baad mein entry kholke “Entry sudhaaro”.` : null,
    ].filter(Boolean).join(' '));
    if (!ok) return;
    const failed: string[] = [];
    setBulk({ done: 0, total: ids.length });
    for (const [i, id] of ids.entries()) {
      try {
        await db.writeTransaction(async (tx) => { await approveEntry(tx, id, actor, { fillRates: true }); });
      } catch (err) {
        const e = waiting.find((w) => w.id === id);
        failed.push(`${e ? entryTitle(e) : id}: ${(err as Error).message}`);
      }
      setBulk({ done: i + 1, total: ids.length });
    }
    setBulk(null);
    setOpenId(null);
    if (failed.length) notify(`${ids.length - failed.length} approve hui, ${failed.length} nahi — ${failed[0]}`, 'danger');
    else notify(`Sab ${ids.length} entry approve — stock chadh gaya.`, 'ok');
  }

  async function refuseAll() {
    if (!bulkWhy.trim()) { notify('Sab mana karne ki wajah likho.', 'danger'); return; }
    const ids = waiting.map((w) => w.id);
    if (!(await confirm(`Sab ${ids.length} entry mana karein?`, 'Kisi ka stock nahi badhega. Staff ko wajah ke saath “Mana kiya” dikhega.'))) return;
    await db.writeTransaction(async (tx) => { for (const id of ids) await refuseEntry(tx, id, bulkWhy, actor); });
    setBulkWhy('');
    setOpenId(null);
    notify(`${ids.length} entry mana kar di.`, 'ok');
  }

  async function quickApproveFix(f: Fix) {
    if (!(await confirm('Stock theek kar dein?', `${fixTitle(f)}${f.submitter ? ` — ${f.submitter}` : ''}.`))) return;
    try {
      let no = '';
      await db.writeTransaction(async (tx) => { no = await postAdjustment(tx, f.id, actor); });
      notify(`${no} — stock theek ho gaya.`, 'ok');
    } catch (err) {
      notify(`Nahi hua: ${(err as Error).message}`, 'danger');
    }
  }
  const fixDecided = (fixRows ?? []).filter((f) => f.status !== 'draft').slice(0, 20);

  // A reviewer sees the whole queue; everyone else sees only their own.
  const { data: rows } = useQuery<ReqRow>(
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

  const open = (r: ReqRow) => {
    // A reviewer reviews it. The submitter of a rejected one goes straight back
    // into the form to fix it — that is the only thing they can do with it.
    if (isReviewer) router.push(`/request/${r.id}`);
    else if (r.status === 'rejected') router.push(formHref(r) as never);
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
                <Text variant="rowTitle">{entryTitle(e)}</Text>
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
          <>
            {approver && waiting.length > 1 ? (
              <Card style={{ gap: space.sm }}>
                <Button
                  title={bulk ? `Approve ho rahi hain… ${bulk.done}/${bulk.total}` : `Sab approve karo (${waiting.length})`}
                  onPress={approveAll} loading={!!bulk} disabled={!!bulk} />
                <Row gap={space.sm} align="flex-end">
                  <Input containerStyle={{ flex: 1 }} value={bulkWhy} onChangeText={setBulkWhy} placeholder="Sab mana karne ki wajah" />
                  <Button title={`Sab mana karo (${waiting.length})`} tone="danger" onPress={refuseAll} disabled={!!bulk} />
                </Row>
              </Card>
            ) : null}
            <Card style={{ gap: 0 }}>
              {waiting.map((e, i) => (
                <View key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={entryTitle(e)}
                    subtitle={[approver ? e.submitter : null, `${e.items} item`, e.doc_date, revised(e) ? `badla ${when(e.revised_at!)}` : null].filter(Boolean).join('  ·  ')}
                    right={approver ? (
                      <Row gap={space.xs} align="center">
                        {revised(e) ? <Badge tone="danger">Badla gaya</Badge> : null}
                        <Button title="Approve" size="sm" onPress={() => quickApprove(e)} disabled={!!bulk} />
                      </Row>
                    ) : <Badge tone="warn">Badal sakte ho</Badge>}
                    // The owner opens it here, in place; staff go to their entry to change it.
                    onPress={() => (approver ? setOpenId(openId === e.id ? null : e.id) : router.push(`/purchase/approve?id=${e.id}`))}
                  />
                  {approver && openId === e.id ? <EntryReview id={e.id} onDone={() => setOpenId(null)} /> : null}
                </View>
              ))}
            </Card>
          </>
        )}

        {/* Stock put right: a count, a piece broken or gone. Nothing moves
            until an owner or admin says yes. */}
        <SectionTitle>{fixer ? `Stock theek karna — approve karo ${fixWaiting.length || ''}` : `Stock theek karne ki request ${fixWaiting.length || ''}`}</SectionTitle>
        {fixWaiting.length === 0 ? (
          <Empty
            title={fixer ? 'Koi request nahi' : 'Kuch bheja nahi'}
            hint={fixer
              ? 'Staff ginti kare ya stock theek karna maange to yahan aayega.'
              : 'Shelf par maal app se alag ho to item kholo → “Stock theek karo”, ya “Ginti Karo”.'}
          />
        ) : (
          <Card style={{ gap: 0 }}>
            {fixWaiting.map((f, i) => (
              <React.Fragment key={f.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={fixTitle(f)}
                  subtitle={[fixer ? f.submitter : null, f.notes, when(f.submitted_at ?? f.doc_date)].filter(Boolean).join('  ·  ')}
                  right={fixer
                    ? <Button title="Approve" size="sm" onPress={() => quickApproveFix(f)} />
                    : <Badge tone="warn">Review mein</Badge>}
                  onPress={() => router.push(`/adjustment/${f.id}`)}
                />
              </React.Fragment>
            ))}
          </Card>
        )}
        {fixDecided.length > 0 ? (
          <Card style={{ gap: 0 }}>
            {fixDecided.map((f, i) => (
              <React.Fragment key={f.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={fixTitle(f)}
                  subtitle={[
                    fixer ? f.submitter : null,
                    f.status === 'posted' ? `${f.decider ?? 'Owner'} ne approve kiya` : `${f.decider ?? 'Owner'} ne mana kiya: ${f.cancel_reason ?? '—'}`,
                    f.decided_at ? when(f.decided_at) : f.doc_date,
                  ].filter(Boolean).join('  ·  ')}
                  right={f.status === 'posted' ? <Badge tone="ok">Approve</Badge> : <Badge tone="danger">Mana kiya</Badge>}
                  onPress={() => router.push(`/adjustment/${f.id}`)}
                />
              </React.Fragment>
            ))}
          </Card>
        ) : null}

        {decidedEntries.length > 0 ? (
          <>
            <SectionTitle>{approver ? 'Haal ke faisle (30 din)' : 'Faisla ho gaya (30 din)'}</SectionTitle>
            <Card style={{ gap: 0 }}>
              {decidedEntries.map((e, i) => (
                <React.Fragment key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={entryTitle(e)}
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
                  onPress={() => router.push(formHref(r) as never)}
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
