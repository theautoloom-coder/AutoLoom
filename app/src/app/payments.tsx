import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { formatINR, statusLabel } from '@domain';

import { cancelPayment } from '@/lib/posting';
import { proofUrl } from '@/lib/proofs';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { Badge, Button, Card, Chip, Empty, ListRow, Row, Screen, Text } from '@/ui';
import { confirm, notify } from '@/ui/forms';
import { space } from '@/ui/theme';

type P = { id: string; direction: 'in' | 'out'; doc_no: string | null; payment_date: string; amount: number; mode: string; reference_no: string | null; status: string; party_name: string; party_id: string; party_type: string; remarks: string | null; proof_path: string | null };

export default function PaymentsScreen() {
  const router = useRouter();
  const { db } = useSystem();
  const { can, actor } = useSession();
  const [dir, setDir] = useState<'all' | 'in' | 'out'>('all');
  const { data: rows } = useQuery<P>(`
    SELECT p.*, COALESCE(c.name, s.name) AS party_name
    FROM payments p LEFT JOIN customers c ON c.id = p.party_id AND p.party_type = 'customer' LEFT JOIN suppliers s ON s.id = p.party_id AND p.party_type = 'supplier'
    WHERE (?1 = 'all' OR p.direction = ?1) ORDER BY p.payment_date DESC, p.created_at DESC LIMIT 300`, [dir]);

  async function reverse(p: P) {
    const reason = typeof globalThis.prompt === 'function' ? globalThis.prompt('Reason (e.g. cheque bounced, entered twice)') : 'Reversed';
    if (!reason || !(await confirm('Payment wapas lein?', `${p.doc_no} for ${formatINR(p.amount)} will be reversed in the ledger and its allocations removed.`))) return;
    try { await db.writeTransaction((tx) => cancelPayment(tx, p.id, reason, actor)); notify('Wapas le liya.'); } catch (e) { notify((e as Error).message); }
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Payment</Text>
        <Row gap={space.xs}>
          {can('payment.receive') ? <Button title="Le lo" size="sm" onPress={() => router.push('/payment/edit?direction=in')} /> : null}
          {can('payment.pay_supplier') ? <Button title="Paisa do" size="sm" tone="secondary" onPress={() => router.push('/payment/edit?direction=out')} /> : null}
        </Row>
      </Row>
      <Row gap={space.xs}>
        {(['all', 'in', 'out'] as const).map((d) => <Chip key={d} label={d === 'all' ? 'All' : d === 'in' ? 'Received' : 'Paid'} selected={dir === d} onPress={() => setDir(d)} />)}
      </Row>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {(rows ?? []).map((p) => (
          <ListRow key={p.id} title={`${p.party_name}`} subtitle={`${p.doc_no ?? ''} · ${p.payment_date} · ${p.mode.toUpperCase()}${p.reference_no ? ` ${p.reference_no}` : ''}${p.remarks ? ` · ${p.remarks}` : ''}`}
            onPress={() => router.push(p.party_type === 'customer' ? `/customer/${p.party_id}` : `/supplier/${p.party_id}`)}
            left={p.proof_path ? <Text onPress={async () => { const u = await proofUrl(p.proof_path!); if (u) { if (Platform.OS === 'web') window.open(u, '_blank'); else Linking.openURL(u); } else notify('Proof abhi khul nahi raha.'); }}>📎</Text> : undefined}
            right={
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text mono color={p.status !== 'posted' ? 'textFaint' : p.direction === 'in' ? 'ok' : 'text'}>{p.direction === 'in' ? '+' : '−'}{formatINR(p.amount)}</Text>
                {p.status !== 'posted' ? <Badge tone="danger">{statusLabel(p.status)}</Badge> : ((p.direction === 'in' && can('payment.receive')) || (p.direction === 'out' && can('payment.pay_supplier'))) && can('sale.cancel') ? <Text variant="small" color="danger" onPress={() => reverse(p)}>Wapas lo</Text> : null}
              </View>
            } />
        ))}
        {(rows ?? []).length === 0 ? <Empty title="Abhi koi payment nahi" /> : null}
      </Card>
    </Screen>
  );
}
