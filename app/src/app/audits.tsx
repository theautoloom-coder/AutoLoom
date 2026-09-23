import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { snapshotAudit } from '@/lib/posting';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow } from '@/lib/writes';
import { Badge, Button, Card, Empty, Input, ListRow, Row, Screen, Text } from '@/ui';
import { FormSection, SelectField, notify } from '@/ui/forms';

type A = { id: string; doc_no: string | null; name: string; status: string; started_at: string; location_name: string; total: number; counted: number; diffs: number };

export default function AuditsScreen() {
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor, locationId } = useSession();
  const [starting, setStarting] = useState(false);
  const [name, setName] = useState('');
  const [loc, setLoc] = useState<string | null>(null);
  const [family, setFamily] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: rows } = useQuery<A>(`
    SELECT a.id, a.doc_no, a.name, a.status, a.started_at, l.name AS location_name,
           (SELECT COUNT(*) FROM stock_audit_lines x WHERE x.audit_id = a.id) AS total,
           (SELECT COUNT(*) FROM stock_audit_lines x WHERE x.audit_id = a.id AND x.counted_qty IS NOT NULL) AS counted,
           (SELECT COUNT(*) FROM stock_audit_lines x WHERE x.audit_id = a.id AND x.counted_qty IS NOT NULL AND x.counted_qty <> x.system_qty) AS diffs
    FROM stock_audits a JOIN locations l ON l.id = a.location_id
    ORDER BY a.status IN ('open','review') DESC, a.started_at DESC LIMIT 100`);
  const { data: locations } = useQuery<{ id: string; name: string }>('SELECT id, name FROM locations WHERE is_active = 1 ORDER BY sort_order');
  const { data: families } = useQuery<{ id: string; name: string }>('SELECT id, name FROM product_families WHERE is_active = 1 ORDER BY sort_order');

  async function start() {
    const location = loc ?? locationId;
    if (!location) { notify('Choose a location.'); return; }
    setBusy(true);
    try {
      let auditId = '';
      let n = 0;
      await db.writeTransaction(async (tx) => {
        auditId = await insertRow(tx, 'stock_audits', { location_id: location, name: name.trim() || `Count ${new Date().toLocaleDateString('en-IN')}`, filter_family_id: family, status: 'open' }, actor);
        n = await snapshotAudit(tx, auditId);
      });
      setStarting(false);
      setName('');
      notify(`Count sheet ready with ${n} SKUs. System quantities are frozen as of now; sales can continue.`);
      router.push(`/audit/${auditId}`);
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Stock audits</Text>
        {can('stock.count') && !starting ? <Button title="Start count" onPress={() => { setLoc(locationId); setStarting(true); }} /> : null}
      </Row>
      {starting ? (
        <FormSection title="New count session" hint="System quantities are snapshotted when the session starts, so counting can take days while billing continues. Closing applies only the differences.">
          <Input label="Name" value={name} onChangeText={setName} placeholder="Quarterly count, Lighting rack A…" />
          <SelectField label="Location" value={loc} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} onChange={setLoc} />
          <SelectField label="Only this family (optional)" value={family} options={(families ?? []).map((f) => ({ value: f.id, label: f.name }))} onChange={setFamily} allowClear placeholder="All families with stock" />
          <Row gap={8}><Button title="Start" onPress={start} loading={busy} /><Button title="Cancel" tone="ghost" onPress={() => setStarting(false)} /></Row>
        </FormSection>
      ) : null}
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {(rows ?? []).map((a) => (
          <ListRow key={a.id} title={a.name} subtitle={`${a.location_name} · ${new Date(a.started_at).toLocaleDateString('en-IN')} · ${a.counted}/${a.total} counted · ${a.diffs} differences`}
            onPress={() => router.push(`/audit/${a.id}`)}
            right={<View style={{ alignItems: 'flex-end' }}><Badge tone={a.status === 'closed' ? 'ok' : a.status === 'cancelled' ? 'danger' : 'warn'}>{a.status}</Badge></View>} />
        ))}
        {(rows ?? []).length === 0 ? <Empty title="No audits yet" /> : null}
      </Card>
    </Screen>
  );
}
