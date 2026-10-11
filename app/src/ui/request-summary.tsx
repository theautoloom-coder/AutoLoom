/**
 * What a staff request asks for, read plainly — on the request's own screen
 * and opened in place in the approval list (owner, 11 Oct 2026).
 *
 * A new item or kism: its category, name, details, cars and rates. A change
 * to one that exists (8 Oct 2026): what it was beside what is asked, detail
 * by detail, the changed ones marked.
 */
import { useQuery } from '@powersync/react';
import React from 'react';

import { fitsOf, parseProposal, variantNameOf, type ChangeRequest, type ProposalFit } from '@/lib/requests';
import { useSession } from '@/lib/session';

import { Card, Divider, KV, Row, SectionTitle, Text } from './index';
import { space } from './theme';

export function RequestSummary({ req, bare }: { req: ChangeRequest; /** No section titles or cards: inside a list row. */ bare?: boolean }) {
  const { can } = useSession();
  const p = parseProposal(req);
  const isEdit = !!(p?.edit_variant_id || p?.edit_product_id);
  const { data: famRows } = useQuery<{ name: string }>('SELECT name FROM product_families WHERE id = ? LIMIT 1', [p?.family_id ?? '']);
  const family = famRows?.[0] ?? null;
  const { data: defRows } = useQuery<{ id: string; name: string; sort_order: number }>(
    'SELECT id, name, sort_order FROM spec_definitions WHERE family_id = ? ORDER BY sort_order', [isEdit ? p?.family_id ?? '' : '']);
  const { data: modelRows } = useQuery<{ id: string; name: string }>(
    'SELECT id, name FROM vehicle_models WHERE ? = 1', [isEdit ? 1 : 0]);

  if (!p) return <Text color="textMuted">Request ka data padha nahi ja saka.</Text>;

  const carsOf = (fits: ProposalFit[] | undefined) => (fits ?? []).map((f) => {
    const m = (modelRows ?? []).find((x) => x.id === f.model_id)?.name ?? f.label ?? 'Gaadi';
    return `${m}${f.year_from ? ` ${f.year_from}${f.year_to ? (f.year_to === f.year_from ? '' : `–${f.year_to}`) : '+'}` : ''}`;
  }).join(', ') || 'Sab gaadi';

  if (isEdit) {
    const diff: { k: string; was: string; now: string }[] = [];
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
    const changed = diff.filter((d) => d.was !== d.now).length;
    const rows = diff.map((d) => (
      <Row key={d.k} style={{ justifyContent: 'space-between' }} gap={space.sm} align="flex-start">
        <Text variant="small" color="textMuted" style={{ flex: 1 }}>{d.k}</Text>
        {d.was === d.now
          ? <Text variant="small" color="textFaint" style={{ flex: 2, textAlign: 'right' }}>{d.now}</Text>
          : <Text variant="small" style={{ flex: 2, textAlign: 'right' }}><Text variant="small" color="danger">{d.was}</Text>{'  →  '}<Text variant="small" color="ok">{d.now}</Text></Text>}
      </Row>
    ));
    if (bare) return <>{rows}</>;
    return (
      <>
        <Text color="textMuted">{p.product_name ?? p.name}{p.edit_variant_id && p.before?.name ? ` · ${p.before.name}` : ''}</Text>
        <SectionTitle right={<Text variant="small" color="textFaint">{changed} badle</Text>}>Pehle → ab</SectionTitle>
        <Card style={{ gap: space.xs }}>{rows}</Card>
      </>
    );
  }

  const facts = (
    <>
      <KV k="Category" v={family?.name ?? p.family_name ?? '—'} />
      <KV k="Item" v={p.name ?? '—'} />
      {p.product_id ? <KV k="Kya hai" v="Is item ki nayi kism — item pehle se hai" /> : null}
      {(p.specs ?? []).length
        ? (p.specs ?? []).map((sp) => <KV key={sp.def_id} k={sp.name} v={sp.display} />)
        : p.master ? null : (<>
            <KV k="Type" v={p.type || '—'} />
            <KV k="Colour" v={p.colour || '—'} />
          </>)}
      {p.master ? null : <KV k="Gaadi" v={p.universal ? 'Sab gaadi' : (p.fits ?? []).map((f) => f.label).filter(Boolean).join(', ') || [p.car_text, p.year_text].filter(Boolean).join(' ') || 'Sab gaadi'} />}
      <Divider />
      {p.master ? null : <KV k="Qty" v={String(p.qty ?? 0)} mono />}
      <KV k="Bechne ka rate" v={p.price != null ? `₹${p.price}` : '—'} mono />
      {can('catalog.view_cost') ? <KV k="Kharid rate" v={p.cost != null ? `₹${p.cost}` : '—'} mono /> : null}
      {p.pack_size && p.pack_size > 1 ? <KV k="Set mein" v={`${p.pack_size} ${p.pack_label || 'pcs'}`} mono /> : null}
      {p.warranty_months ? <KV k="Warranty" v={`${p.warranty_months} mahine`} mono /> : null}
      {req.note ? <KV k="Unka note" v={req.note} /> : null}
    </>
  );
  if (bare) return facts;
  return (
    <>
      <SectionTitle>Kya maanga hai</SectionTitle>
      <Card>{facts}</Card>
    </>
  );
}
