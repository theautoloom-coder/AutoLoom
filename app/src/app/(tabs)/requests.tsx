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
 *
 * Owner, 11 Oct 2026: "sorting, filter, timeline nahi hai — sab ek saath
 * faila hua dikhta hai". So all three sit in one list, in three tabs — waiting
 * on the owner, back with staff, decided — narrowed by kind and by who sent
 * it, newest or oldest first, and laid out day by day. The bulk buttons act on
 * exactly what the filters show: "Ramesh ka saara maal approve" is two taps.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { formatINR } from '@domain';

import { approveChangeRequest, approveEntry, queueSummary, refuseEntry, refuseFix } from '@/lib/approvals';
import { postAdjustment } from '@/lib/posting';
import { useSystem } from '@/lib/system';

import { useSession } from '@/lib/session';
import { formHref, parseProposal, rejectRequest, type ChangeRequest } from '@/lib/requests';
import { Badge, Button, Card, Chip, Divider, Empty, IconBadge, Input, ListRow, Row, Screen, SectionTitle, Text, type IconName } from '@/ui';
import { EntryReview } from '@/ui/entry-review';
import { RequestSummary } from '@/ui/request-summary';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type ReqRow = ChangeRequest & { submitter: string | null; decider: string | null; updated_at?: string | null };
type Entry = {
  id: string; status: string; doc_no: string | null; doc_date: string; submitted_at: string | null; revised_at: string | null;
  updated_at: string | null; notes: string | null; cancel_reason: string | null; decided_at: string | null;
  supplier: string | null; submitter: string | null; decider: string | null; items: number; qty: number;
  corrects_no: string | null;
};
type Fix = {
  id: string; status: string; doc_no: string | null; doc_date: string; submitted_at: string | null; notes: string | null;
  cancel_reason: string | null; decided_at: string | null; submitter: string | null; decider: string | null;
  items: number; up: number; down: number;
};

type Kind = 'maal' | 'fix' | 'item';
/** Waiting on the owner; back with the staff member; decided. */
type Tab = 'baaki' | 'wapas' | 'hua';
/** One thing in the queue, whatever its kind, placed on the timeline at `t`. */
type Q = { key: string; id: string; tab: Tab; t: number; who: string } & (
  | { kind: 'maal'; row: Entry }
  | { kind: 'fix'; row: Fix }
  | { kind: 'item'; row: ReqRow }
);

const KIND: Record<Kind, { label: string; icon: IconName; accent: string }> = {
  maal: { label: 'Maal', icon: 'cube-outline', accent: 'blue' },
  fix: { label: 'Stock theek', icon: 'swap-vertical-outline', accent: 'amber' },
  item: { label: 'Item', icon: 'pricetag-outline', accent: 'violet' },
};
const KINDS: Kind[] = ['maal', 'fix', 'item'];
const PAGE = 40;
// A sideways row of chips takes its own height; left to flex, a short list let it
// stretch every chip down the screen.
const CHIPS = { flexGrow: 0, flexShrink: 0 } as const;

/** "Sudhaar PUR/0007 · Bright Auto · 8 pcs" for a correction; the plain line otherwise. */
const entryTitle = (e: Entry) => `${e.corrects_no ? `Sudhaar ${e.corrects_no} · ` : ''}${e.supplier ?? 'Supplier'} · ${e.qty} pcs`;
const fixTitle = (f: Fix) => [`Stock theek · ${f.items} item`, f.up ? `+${f.up}` : null, f.down ? `−${f.down}` : null].filter(Boolean).join('  ');

/** Server timestamps come as "2026-10-11 04:31:22Z"; not every engine reads the space. */
const ms = (iso: string | null | undefined) => {
  if (!iso) return 0;
  const t = Date.parse(iso.length > 10 ? iso.replace(' ', 'T') : iso);
  return Number.isNaN(t) ? 0 : t;
};
const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const clock = (t: number) => (t ? new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');
const when = (iso: string) => {
  const t = ms(iso);
  return t ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
};
const shortDate = (d: string) => {
  const t = ms(d);
  return t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : d;
};
/** "Aaj · 11 Oct", "Kal · 10 Oct", "Wed · 8 Oct". */
function dayLabel(key: string, now: number): string {
  const d = new Date(`${key}T12:00:00`);
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (key === dayKey(now)) return `Aaj · ${date}`;
  if (key === dayKey(now - 86400000)) return `Kal · ${date}`;
  return `${d.toLocaleDateString('en-IN', { weekday: 'short' })} · ${date}`;
}

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

const titleOf = (q: Q) => (q.kind === 'maal' ? entryTitle(q.row) : q.kind === 'fix' ? fixTitle(q.row) : title(q.row));

export default function RequestsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const isReviewer = can('catalog.edit');
  const approver = can('purchase.approve');
  const fixer = can('stock.adjust');
  const showCost = can('catalog.view_cost');
  const me = actor.userId ?? '';
  /** Whether this person decides this kind — and so sees everyone's, not only their own. */
  const decides = (k: Kind) => (k === 'maal' ? approver : k === 'fix' ? fixer : isReviewer);
  const owner = approver || fixer || isReviewer;

  const [tab, setTab] = useState<Tab>(params.tab === 'wapas' || params.tab === 'hua' ? params.tab : 'baaki');
  const [kind, setKind] = useState<Kind | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [oldFirst, setOldFirst] = useState(false);
  const [find, setFind] = useState('');
  const [shown, setShown] = useState(PAGE);
  // Owner, 10 Oct 2026: approve from the list, open one in place, and approve
  // or refuse the whole queue at once.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [reqWhy, setReqWhy] = useState('');
  const [bulkWhy, setBulkWhy] = useState('');
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  // Everything a staff member sent, wherever it is now: waiting (and still
  // theirs to change), back with them, or decided in the last 30 days —
  // approved or refused, with who decided and why.
  // Fixed for the life of the screen. Computed on every render it was a new
  // value each time, every query using it restarted on each render and, once
  // the screen re-rendered often enough, never finished: the stock requests
  // sat on "loading" and showed as none (11 Oct 2026).
  const [now] = useState(() => Date.now());
  const [since] = useState(() => new Date(now - 30 * 86400000).toISOString());

  // Stock entries from staff. submitted_at set = waiting; cleared = sent back for a fix.
  const { data: entryRows } = useQuery<Entry>(
    `SELECT p.id, p.status, p.doc_no, p.doc_date, p.submitted_at, p.revised_at, p.updated_at, p.notes, p.cancel_reason,
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
        AND (p.status = 'draft' OR COALESCE(p.posted_at, p.cancelled_at, p.updated_at) >= ?3)`,
    [approver ? 1 : 0, me, since],
  );

  // Stock put right on the shelf: a count or a piece gone, waiting or decided.
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
        AND (a.status = 'draft' OR COALESCE(a.posted_at, a.cancelled_at, a.updated_at) >= ?3)`,
    [fixer ? 1 : 0, me, since],
  );

  // New items, new kisms and changes. One sent back stays until it is fixed.
  const { data: reqRows } = useQuery<ReqRow>(
    `SELECT cr.*, pr.full_name AS submitter, rv.full_name AS decider
       FROM change_requests cr
       LEFT JOIN profiles pr ON pr.id = cr.submitted_by
       LEFT JOIN profiles rv ON rv.id = cr.reviewed_by
      WHERE (?1 = 1 OR cr.submitted_by = ?2)
        AND (cr.status IN ('pending', 'rejected') OR COALESCE(cr.reviewed_at, cr.updated_at, cr.submitted_at) >= ?3)`,
    [isReviewer ? 1 : 0, me, since],
  );

  // Each on the timeline where it now matters: when it was sent while it
  // waits, when it was decided once it is.
  const all = useMemo<Q[]>(() => {
    const out: Q[] = [];
    for (const e of entryRows ?? []) {
      const tb: Tab = e.status !== 'draft' ? 'hua' : e.submitted_at ? 'baaki' : 'wapas';
      const at = tb === 'hua' ? e.decided_at : tb === 'baaki' ? e.submitted_at : e.updated_at;
      out.push({ key: `maal:${e.id}`, id: e.id, kind: 'maal', row: e, tab: tb, t: ms(at ?? e.doc_date), who: e.submitter ?? 'Staff' });
    }
    for (const f of fixRows ?? []) {
      const tb: Tab = f.status === 'draft' ? 'baaki' : 'hua';
      out.push({ key: `fix:${f.id}`, id: f.id, kind: 'fix', row: f, tab: tb, t: ms((tb === 'hua' ? f.decided_at : f.submitted_at) ?? f.doc_date), who: f.submitter ?? 'Staff' });
    }
    for (const r of reqRows ?? []) {
      const tb: Tab = r.status === 'pending' ? 'baaki' : r.status === 'rejected' ? 'wapas' : 'hua';
      const at = tb === 'baaki' ? r.submitted_at : r.reviewed_at ?? r.updated_at ?? r.submitted_at;
      out.push({ key: `item:${r.id}`, id: r.id, kind: 'item', row: r, tab: tb, t: ms(at), who: r.submitter ?? 'Staff' });
    }
    return out;
  }, [entryRows, fixRows, reqRows]);

  const count = (tb: Tab) => all.filter((q) => q.tab === tb).length;
  const inTab = all.filter((q) => q.tab === tab);
  const byKind = kind ? inTab.filter((q) => q.kind === kind) : inTab;
  const people = [...byKind.reduce((m, q) => m.set(q.who, (m.get(q.who) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const byWho = who ? byKind.filter((q) => q.who === who) : byKind;
  const needle = find.trim().toLowerCase();
  const list = (needle ? byWho.filter((q) => `${titleOf(q)} ${q.who}`.toLowerCase().includes(needle)) : byWho)
    .sort((a, b) => (oldFirst ? a.t - b.t : b.t - a.t));
  const filtered = !!(kind || who || needle);

  // Day by day: a heading per day, that day's in one card.
  const days: { key: string; list: Q[] }[] = [];
  for (const q of list.slice(0, shown)) {
    const k = dayKey(q.t);
    const last = days[days.length - 1];
    if (last?.key === k) last.list.push(q);
    else days.push({ key: k, list: [q] });
  }
  const oldest = tab === 'baaki' && inTab.length ? Math.min(...inTab.map((q) => q.t).filter(Boolean)) : 0;
  const waitedDays = oldest ? Math.floor((now - oldest) / 86400000) : 0;
  // What the bulk buttons act on: everything the filters show that this person decides.
  const actionable = tab === 'baaki' ? list.filter((q) => decides(q.kind)) : [];

  const switchTab = (tb: Tab) => { setTab(tb); setShown(PAGE); setOpenKey(null); };
  const clearFilters = () => { setKind(null); setWho(null); setFind(''); };

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
      setOpenKey(null);
    } catch (err) {
      notify(`Nahi hua: ${(err as Error).message}`, 'danger');
    }
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

  async function quickApproveReq(r: ReqRow) {
    if (!(await confirm('Approve karein?', `${title(r)}${r.submitter ? ` — ${r.submitter}` : ''}.`))) return;
    try {
      await approveChangeRequest(db, r, actor, locationId ?? null);
      notify(`${title(r)} — approve ho gaya.`, 'ok');
      setOpenKey(null);
    } catch (err) {
      notify(`Nahi hua: ${(err as Error).message}`, 'danger');
    }
  }

  async function rejectReq(r: ReqRow) {
    if (!reqWhy.trim()) { notify('Wajah likho — usi se staff theek karke bhej payega.', 'danger'); return; }
    await rejectRequest(db, r.id, reqWhy);
    setReqWhy('');
    setOpenKey(null);
    notify('Wapas bhej diya.', 'ok');
  }

  /** Everything the filters show, each on its own, so one bad one stops none of the rest. */
  async function approveMany(qs: Q[]) {
    const ent = qs.filter((q) => q.kind === 'maal');
    const fx = qs.filter((q) => q.kind === 'fix').length;
    const rq = qs.filter((q) => q.kind === 'item').length;
    const s = ent.length ? await queueSummary(db, ent.map((q) => q.id)) : null;
    const ok = await confirm(`Sab ${qs.length} approve karein?`, [
      s ? `${ent.length} maal entry · ${s.pcs} pcs${showCost ? ` · lagbhag ${formatINR(s.value)}` : ''}.` : null,
      fx ? `${fx} stock theek.` : null,
      rq ? `${rq} naye item / badlav.` : null,
      s ? 'Jin line ka kharid rate nahi bhara, un par pichhla rate lagega.' : null,
      s?.unpriced ? `${s.unpriced} line ka rate kahin nahi mila — wo ₹0 par chadhengi; baad mein entry kholke “Entry sudhaaro”.` : null,
      rq ? 'Jis naye item ka naam pehle se hai, wo chhod diya jayega.' : null,
    ].filter(Boolean).join(' '));
    if (!ok) return;
    const failed: string[] = [];
    setBulk({ done: 0, total: qs.length });
    for (const [i, q] of qs.entries()) {
      try {
        if (q.kind === 'maal') await db.writeTransaction(async (tx) => { await approveEntry(tx, q.id, actor, { fillRates: true }); });
        else if (q.kind === 'fix') await db.writeTransaction(async (tx) => { await postAdjustment(tx, q.id, actor); });
        else await approveChangeRequest(db, q.row, actor, locationId ?? null);
      } catch (err) {
        failed.push(`${titleOf(q)}: ${(err as Error).message}`);
      }
      setBulk({ done: i + 1, total: qs.length });
    }
    setBulk(null);
    setOpenKey(null);
    if (failed.length) notify(`${qs.length - failed.length} approve hui, ${failed.length} nahi — ${failed[0]}`, 'danger');
    else notify(`Sab ${qs.length} approve ho gayi.`, 'ok');
  }

  async function refuseMany(qs: Q[]) {
    if (!bulkWhy.trim()) { notify('Sab mana karne ki wajah likho.', 'danger'); return; }
    const rq = qs.some((q) => q.kind === 'item');
    if (!(await confirm(`Sab ${qs.length} mana karein?`, [
      'Kisi ka stock nahi badhega. Staff ko wajah dikhegi.',
      rq ? 'Naye item staff ke paas wapas jayenge — theek karke dobara bhej sakte hain.' : null,
    ].filter(Boolean).join(' ')))) return;
    await db.writeTransaction(async (tx) => {
      for (const q of qs) {
        if (q.kind === 'maal') await refuseEntry(tx, q.id, bulkWhy, actor);
        else if (q.kind === 'fix') await refuseFix(tx, q.id, bulkWhy, actor);
        else await rejectRequest(tx, q.id, bulkWhy);
      }
    });
    setBulkWhy('');
    setOpenKey(null);
    notify(`${qs.length} mana kar di.`, 'ok');
  }

  const openReq = (r: ReqRow) => {
    // A reviewer reviews it. The submitter of a rejected one goes straight back
    // into the form to fix it — that is the only thing they can do with it.
    if (!isReviewer && r.status === 'rejected') router.push(formHref(r) as never);
    else router.push(`/request/${r.id}`);
  };

  /** The line under a row's title: who, what, and the time on its day. */
  function lineOf(q: Q): string {
    const by = decides(q.kind) ? q.who : null;
    const at = clock(q.t);
    if (q.kind === 'maal') {
      const e = q.row;
      if (q.tab === 'hua') {
        return [by, e.status === 'posted'
          ? `${e.decider ?? 'Owner'} ne approve kiya${e.doc_no ? ` · ${e.doc_no}` : ''}`
          : `${e.decider ?? 'Owner'} ne mana kiya: ${e.cancel_reason ?? '—'}`, at].filter(Boolean).join('  ·  ');
      }
      const revised = q.tab === 'baaki' && !!e.revised_at && !!e.submitted_at && e.revised_at > e.submitted_at;
      return [by, `${e.items} item`, `aaya ${shortDate(e.doc_date)}`, q.tab === 'wapas' ? e.notes : null,
        revised ? `badla ${when(e.revised_at!)}` : at].filter(Boolean).join('  ·  ');
    }
    if (q.kind === 'fix') {
      const f = q.row;
      if (q.tab === 'hua') {
        return [by, f.status === 'posted' ? `${f.decider ?? 'Owner'} ne approve kiya` : `${f.decider ?? 'Owner'} ne mana kiya: ${f.cancel_reason ?? '—'}`, at]
          .filter(Boolean).join('  ·  ');
      }
      return [by, f.notes, at].filter(Boolean).join('  ·  ');
    }
    const r = q.row;
    const p = parseProposal(r);
    if (q.tab === 'wapas') return [by, `Wajah: ${r.review_note || '—'}`, at].filter(Boolean).join('  ·  ');
    if (q.tab === 'hua') {
      return [by, r.status === 'approved' ? `${r.decider ?? 'Owner'} ne haan kiya` : 'Staff ne wapas li', at].filter(Boolean).join('  ·  ');
    }
    return [p?.price != null ? `₹${p.price}` : null, (p?.qty ?? 0) > 0 ? `${p?.qty} pcs` : null, by, at].filter(Boolean).join('  ·  ');
  }

  function rightOf(q: Q): React.ReactNode {
    if (q.tab === 'hua') {
      const ok = q.row.status === 'posted' || q.row.status === 'approved';
      const label = ok ? 'Approve' : q.kind === 'item' ? 'Wapas li' : q.row.cancel_reason === 'Ulta kiya' ? 'Ulta kiya' : 'Mana kiya';
      return <Badge tone={ok ? 'ok' : q.kind === 'item' ? 'neutral' : 'danger'}>{label}</Badge>;
    }
    if (q.tab === 'wapas') return <Badge tone="danger">{decides(q.kind) ? 'Staff ke paas' : 'Theek karo'}</Badge>;
    const revised = q.kind === 'maal' && !!q.row.revised_at && !!q.row.submitted_at && q.row.revised_at > q.row.submitted_at;
    const times = q.kind === 'item' && q.row.revision > 1 ? <Badge tone="info">{`${q.row.revision}x`}</Badge> : null;
    if (!decides(q.kind)) return times ?? <Badge tone="warn">{q.kind === 'maal' ? 'Badal sakte ho' : 'Review mein'}</Badge>;
    const approve = () => (q.kind === 'maal' ? quickApprove(q.row) : q.kind === 'fix' ? quickApproveFix(q.row) : quickApproveReq(q.row));
    return (
      <Row gap={space.xs} align="center">
        {revised ? <Badge tone="danger">Badla gaya</Badge> : times}
        <Button title="Approve" size="sm" onPress={approve} disabled={!!bulk} />
      </Row>
    );
  }

  function press(q: Q) {
    // The owner opens maal and item requests here, in place; everything else
    // goes to its own screen.
    const inPlace = q.tab === 'baaki' && decides(q.kind) && q.kind !== 'fix';
    if (inPlace) { setOpenKey(openKey === q.key ? null : q.key); setReqWhy(''); return; }
    if (q.kind === 'maal') router.push(q.tab === 'hua' ? `/purchase/${q.id}` : `/purchase/approve?id=${q.id}`);
    else if (q.kind === 'fix') router.push(`/adjustment/${q.id}`);
    else openReq(q.row);
  }

  function opened(q: Q): React.ReactNode {
    if (openKey !== q.key) return null;
    if (q.kind === 'maal') return <EntryReview id={q.id} onDone={() => setOpenKey(null)} />;
    if (q.kind !== 'item') return null;
    return (
      <View style={{ gap: space.sm, paddingVertical: space.sm }}>
        <RequestSummary req={q.row} bare />
        <Row gap={space.sm}>
          <Button title="Approve karo" onPress={() => quickApproveReq(q.row)} style={{ flex: 1 }} />
          <Button title="Poora kholo" tone="ghost" onPress={() => openReq(q.row)} />
        </Row>
        <Row gap={space.sm} align="flex-end">
          <Input containerStyle={{ flex: 1 }} value={reqWhy} onChangeText={setReqWhy} placeholder="Wapas bhejne ki wajah" />
          <Button title="Wapas bhejo" tone="danger" size="sm" onPress={() => rejectReq(q.row)} />
        </Row>
      </View>
    );
  }

  /** What came back to a staff member, loud: what the owner said and the way to fix it. */
  function backCard(q: Q) {
    const reason = q.kind === 'item' ? q.row.review_note : q.kind === 'maal' ? q.row.notes : null;
    return (
      <Card key={q.key} keyline spine="accent">
        <Text variant="rowTitle">{titleOf(q)}</Text>
        <Text variant="small" color="textMuted">{[KIND[q.kind].label, clock(q.t)].filter(Boolean).join('  ·  ')}</Text>
        {reason ? (
          <>
            <Text variant="label" color="danger">ADMIN NE KYA KAHA</Text>
            <Text variant="small">{reason}</Text>
          </>
        ) : null}
        <Button
          title={q.kind === 'item' ? 'Theek karke dobara bhejo' : 'Theek karo'}
          onPress={() => (q.kind === 'item' ? router.push(formHref(q.row) as never) : press(q))}
        />
      </Card>
    );
  }

  const tabs: { tb: Tab; label: string }[] = [
    { tb: 'baaki', label: owner ? 'Baaki' : 'Review mein' },
    { tb: 'wapas', label: owner ? 'Staff ke paas' : 'Wapas aayi' },
    { tb: 'hua', label: 'Ho chuka' },
  ];
  const kindsHere = KINDS.filter((k) => k === kind || inTab.some((q) => q.kind === k));

  return (
    <>
      <Stack.Screen options={{ title: isReviewer ? 'Approval' : 'Maine kya bheja' }} />
      <Screen>
        <Text variant="display">{isReviewer ? 'Approval' : 'Maine kya bheja'}</Text>

        <Row gap={space.xs} wrap>
          {tabs.map(({ tb, label }) => <Chip key={tb} label={`${label} · ${count(tb)}`} selected={tab === tb} onPress={() => switchTab(tb)} />)}
        </Row>

        {/* What came back is the only thing here a staff member has to act on today. */}
        {!owner && tab !== 'wapas' && count('wapas') > 0 ? (
          <Card keyline spine="accent">
            <Text variant="rowTitle">{count('wapas')} wapas aayi — theek karke dobara bhejo</Text>
            <Button title="Dekho" onPress={() => switchTab('wapas')} />
          </Card>
        ) : null}

        {inTab.length > 0 ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={CHIPS} contentContainerStyle={{ gap: space.xs }}>
              <Chip label={`Sab · ${inTab.length}`} selected={!kind} onPress={() => { setKind(null); setWho(null); }} />
              {kindsHere.map((k) => (
                <Chip key={k} label={`${KIND[k].label} · ${inTab.filter((q) => q.kind === k).length}`} selected={kind === k}
                  onPress={() => { setKind(kind === k ? null : k); setWho(null); }} />
              ))}
              <Chip label={oldFirst ? '⇅ Purana pehle' : '⇅ Naya pehle'} onPress={() => setOldFirst(!oldFirst)} />
            </ScrollView>
            {owner && people.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={CHIPS} contentContainerStyle={{ gap: space.xs }}>
                <Chip label="Sab staff" selected={!who} onPress={() => setWho(null)} />
                {people.map(([name, n]) => <Chip key={name} label={`${name} · ${n}`} selected={who === name} onPress={() => setWho(who === name ? null : name)} />)}
              </ScrollView>
            ) : null}
            {inTab.length > 8 ? (
              <Input value={find} onChangeText={setFind} placeholder="Dhoondo — item, supplier, staff" />
            ) : null}
          </>
        ) : null}

        {owner && waitedDays >= 1 ? (
          <Text variant="small" color="warn">Sabse purani {waitedDays} din se ruki hai</Text>
        ) : null}
        {!owner && tab === 'baaki' && inTab.some((q) => q.kind === 'maal') ? (
          <Text variant="small" color="textMuted">Approve hone tak maal badal sakte ho — kholo, qty ya maal theek karo. Owner ko turant dikhega.</Text>
        ) : null}

        {actionable.length > 1 ? (
          <Card style={{ gap: space.sm }}>
            {filtered ? <Text variant="small" color="textMuted">Sirf jo neeche dikh rahi hain — {actionable.length}</Text> : null}
            <Button
              title={bulk ? `Approve ho rahi hain… ${bulk.done}/${bulk.total}` : `Sab approve karo (${actionable.length})`}
              onPress={() => approveMany(actionable)} loading={!!bulk} disabled={!!bulk} />
            <Row gap={space.sm} align="flex-end">
              <Input containerStyle={{ flex: 1 }} value={bulkWhy} onChangeText={setBulkWhy} placeholder="Sab mana karne ki wajah" />
              <Button title={`Sab mana karo (${actionable.length})`} tone="danger" onPress={() => refuseMany(actionable)} disabled={!!bulk} />
            </Row>
          </Card>
        ) : null}

        {inTab.length === 0 ? (
          <Empty
            title={tab === 'baaki' ? (owner ? 'Sab ho gaya — kuch baaki nahi' : 'Kuch review mein nahi')
              : tab === 'wapas' ? (owner ? 'Staff ke paas kuch nahi' : 'Kuch wapas nahi aaya')
              : 'Pichhle 30 din mein koi faisla nahi'}
            hint={tab === 'baaki'
              ? owner
                ? 'Staff maal chadhaye, stock theek karna maange ya naya item bheje to yahan aayega.'
                : 'Maal aaye to “+” → Stock Chadhao. Owner approve karega, tab stock mein dikhega.'
              : undefined}
          />
        ) : list.length === 0 ? (
          <>
            <Empty title="Is filter mein kuch nahi" />
            <Button title="Filter hatao" tone="secondary" onPress={clearFilters} />
          </>
        ) : (
          days.map((d) => (
            <React.Fragment key={d.key}>
              <SectionTitle right={<Text variant="small" color="textFaint">{String(d.list.length)}</Text>}>{dayLabel(d.key, now)}</SectionTitle>
              {tab === 'wapas' && !owner ? d.list.map(backCard) : (
                <Card style={{ gap: 0 }}>
                  {d.list.map((q, i) => (
                    <View key={q.key}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow
                        left={<IconBadge name={KIND[q.kind].icon} accent={KIND[q.kind].accent} size={30} />}
                        title={titleOf(q)}
                        subtitle={lineOf(q)}
                        right={rightOf(q)}
                        onPress={() => press(q)}
                        divider={false}
                      />
                      {opened(q)}
                    </View>
                  ))}
                </Card>
              )}
            </React.Fragment>
          ))
        )}
        {list.length > shown ? (
          <Button title={`Aur dikhao (${list.length - shown})`} tone="secondary" onPress={() => setShown(shown + PAGE)} />
        ) : null}

        {/* The hint used to say "Naya item se bhej do" on a screen with no such
            button, and nowhere else offered one to staff either — a counter
            hand with new maal in front of them had no way in. */}
        {!isReviewer ? (
          <Button title="+ Naya item bhejo" onPress={() => router.push('/admin/item')} />
        ) : null}
      </Screen>
    </>
  );
}
