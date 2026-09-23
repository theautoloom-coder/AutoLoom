/**
 * Count sheet. Anyone with stock.count enters counts (scan or search, type
 * the number). Differences show live. Close needs stock.adjust and writes one
 * posted adjustment for the differences.
 */
import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { closeAudit } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { updateRow } from '@/lib/writes';
import { Badge, Button, Card, Chip, Empty, Input, ListRow, Row, Screen, Text, useTheme } from '@/ui';
import { NumberField, confirm, notify } from '@/ui/forms';
import { VariantPicker, type PickedVariant } from '@/ui/lines';
import { space } from '@/ui/theme';

type A = { id: string; doc_no: string | null; name: string; status: string; location_id: string; location_name: string; adjustment_id: string | null };
type L = { id: string; variant_id: string; system_qty: number; counted_qty: number | null; reason_code: string | null; description: string; sku: string; barcode: string | null; family_name: string | null };

const REASONS = ['damage', 'missing', 'found', 'wrong_entry', 'counting_error', 'other'];

export default function AuditSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTheme();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const [filter, setFilter] = useState<'all' | 'uncounted' | 'diff'>('uncounted');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  const { data: rows } = useQuery<A>('SELECT a.*, l.name AS location_name FROM stock_audits a JOIN locations l ON l.id = a.location_id WHERE a.id = ?', [id]);
  const a = rows?.[0];
  const { data: lines } = useQuery<L>(
    `SELECT l.*, p.name || ' ' || pv.variant_name AS description, pv.sku, pv.barcode, f.name AS family_name
     FROM stock_audit_lines l JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id LEFT JOIN product_families f ON f.id = p.family_id
     WHERE l.audit_id = ? ORDER BY f.sort_order, p.name, pv.variant_name`, [id]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (lines ?? []).filter((l) => {
      if (filter === 'uncounted' && l.counted_qty !== null) return false;
      if (filter === 'diff' && (l.counted_qty === null || l.counted_qty === l.system_qty)) return false;
      if (term && !`${l.description} ${l.sku} ${l.barcode ?? ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [lines, filter, q]);

  const counted = (lines ?? []).filter((l) => l.counted_qty !== null).length;
  const diffs = (lines ?? []).filter((l) => l.counted_qty !== null && l.counted_qty !== l.system_qty);
  const open = a?.status === 'open' || a?.status === 'review';

  async function setCount(l: L, qty: number | null) {
    await updateRow(db, 'stock_audit_lines', l.id, { counted_qty: qty, counted_by: actor.userId, counted_at: new Date().toISOString() });
  }

  /** Scanned/picked an item not on the sheet (zero system stock): add it so a found item can be counted. */
  async function addUnlisted(v: PickedVariant) {
    if (!a) return;
    const ex = (lines ?? []).find((l) => l.variant_id === v.id);
    if (ex) { setFocus(ex.id); setFilter('all'); setQ(v.sku); return; }
    const { uuidv7 } = await import('@domain');
    await db.execute('INSERT INTO stock_audit_lines (id, audit_id, variant_id, system_qty, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)', [uuidv7(), a.id, v.id, new Date().toISOString(), new Date().toISOString()]);
    setFilter('all');
    setQ(v.sku);
  }

  async function close() {
    if (!a) return;
    const uncounted = (lines ?? []).length - counted;
    const msg = `${diffs.length} SKU${diffs.length === 1 ? '' : 's'} differ and will be adjusted.${uncounted ? ` ${uncounted} uncounted SKUs are left as they are.` : ''}`;
    if (!(await confirm('Close audit?', msg))) return;
    setBusy(true);
    try {
      let res: { docNo: string | null; lines: number } = { docNo: null, lines: 0 };
      await db.writeTransaction(async (tx) => { res = await closeAudit(tx, a.id, actor); });
      notify(res.lines ? `Closed. Adjustment ${res.docNo} posted for ${res.lines} SKUs.` : 'Closed with no differences.');
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  if (!a) return <Screen><Empty title="Audit not found on this device" /></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: a.name }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <View><Text variant="display">{a.name}</Text><Text color="textMuted">{a.location_name}{a.doc_no ? ` · ${a.doc_no}` : ''}</Text></View>
          <Badge tone={a.status === 'closed' ? 'ok' : 'warn'}>{a.status}</Badge>
        </Row>
        <Card tone="alt">
          <Row gap={space.lg} wrap>
            <View><Text variant="label" color="textMuted">Counted</Text><Text variant="number">{counted} / {(lines ?? []).length}</Text></View>
            <View><Text variant="label" color="textMuted">Differences</Text><Text variant="number" style={{ color: diffs.length ? t.warn : t.ok }}>{diffs.length}</Text></View>
          </Row>
          {open && can('stock.adjust') ? <Button title="Close audit & post differences" onPress={close} loading={busy} /> : null}
          {open && !can('stock.adjust') ? <Text variant="small" color="textMuted">Counting is open. An owner or admin closes the audit to apply differences.</Text> : null}
          {a.status === 'closed' && a.adjustment_id ? <Button title="View adjustment" tone="secondary" onPress={() => router.push(`/adjustment/${a.adjustment_id}`)} /> : null}
        </Card>

        {open && can('stock.count') ? (
          <Card>
            <Text variant="label" color="textMuted">Scan or search</Text>
            <VariantPicker onPick={addUnlisted} locationId={a.location_id} autoFocus={false} />
          </Card>
        ) : null}

        <Row gap={space.xs} wrap>
          <Chip label={`Uncounted · ${(lines ?? []).length - counted}`} selected={filter === 'uncounted'} onPress={() => setFilter('uncounted')} />
          <Chip label={`Differences · ${diffs.length}`} selected={filter === 'diff'} onPress={() => setFilter('diff')} />
          <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        </Row>
        <Input value={q} onChangeText={setQ} placeholder="Filter sheet" autoCapitalize="none" />

        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {visible.map((l) => {
            const d = l.counted_qty === null ? null : l.counted_qty - l.system_qty;
            return (
              <ListRow
                key={l.id}
                title={l.description}
                subtitle={`${l.sku} · system ${l.system_qty}${d !== null && d !== 0 ? ` · ${d > 0 ? '+' : ''}${d}` : ''}`}
                right={
                  open && can('stock.count') ? (
                    <View style={{ width: 120, gap: 4 }}>
                      <NumberField value={l.counted_qty} onChange={(v) => setCount(l, v)} decimals={3} placeholder="count" />
                      {d !== null && d !== 0 ? (
                        <Row gap={4} wrap>
                          {REASONS.map((r) => <Chip key={r} label={r.replace('_', ' ')} selected={l.reason_code === r} onPress={() => updateRow(db, 'stock_audit_lines', l.id, { reason_code: r })} />)}
                        </Row>
                      ) : null}
                    </View>
                  ) : (
                    <Text mono color={d === null ? 'textFaint' : d === 0 ? 'ok' : 'warn'}>{l.counted_qty ?? '—'}</Text>
                  )
                }
              />
            );
          })}
          {visible.length === 0 ? <Empty title={filter === 'uncounted' ? 'Everything is counted' : 'Nothing here'} /> : null}
        </Card>
      </Screen>
    </>
  );
}
