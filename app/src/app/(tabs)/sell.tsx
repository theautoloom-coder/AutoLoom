import { useQuery } from '@powersync/react';
import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { formatINR, toDateString } from '@domain';

import { useSession } from '@/lib/session';
import { Badge, Button, Card, Empty, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';

type InvoiceRow = { id: string; doc_type: string; doc_no: string | null; doc_date: string; grand_total: number; paid_total: number; status: string; customer_name: string; payment_mode: string | null };

export default function BillingScreen() {
  const router = useRouter();
  const { can } = useSession();
  const today = toDateString();
  const { data: recent } = useQuery<InvoiceRow>(`
    SELECT i.id, i.doc_type, i.doc_no, i.doc_date, i.grand_total, i.paid_total, i.status, i.payment_mode, c.name AS customer_name
    FROM sales_invoices i JOIN customers c ON c.id = i.customer_id
    ORDER BY i.doc_date DESC, i.created_at DESC LIMIT 60`);
  const { data: today_ } = useQuery<{ total: number; n: number; pending: number }>(`
    SELECT COALESCE(SUM(grand_total),0) AS total, COUNT(*) AS n, COALESCE(SUM(grand_total - paid_total),0) AS pending
    FROM sales_invoices WHERE doc_type='invoice' AND status='posted' AND doc_date = ?`, [today]);
  const t = today_?.[0];
  const drafts = (recent ?? []).filter((i) => i.status === 'draft');
  const posted = (recent ?? []).filter((i) => i.status !== 'draft');

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Bill</Text>
        {can('sale.create') ? <Button title="Naya bill" onPress={() => router.push('/invoice/edit')} /> : null}
      </Row>

      <Card tone="navy">
        <Row gap={16} wrap>
          <View style={{ flex: 1, minWidth: 100 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Aaj ka maal</Text><Text variant="number" color="navyText">{formatINR(t?.total ?? 0)}</Text><Text variant="small" color="navyText" style={{ opacity: 0.7 }}>{t?.n ?? 0} bill</Text></View>
          <View style={{ flex: 1, minWidth: 100 }}><Text variant="label" color="navyText" style={{ opacity: 0.7 }}>Aaj ka pending</Text><Text variant="number" color="navyText">{formatINR(t?.pending ?? 0)}</Text></View>
        </Row>
      </Card>

      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {can('payment.receive') ? <ListRow title="Payment aaya" subtitle="Cash / online, screenshot, remark" onPress={() => router.push('/payment/edit?direction=in')} /> : null}
        <ListRow title="WhatsApp par yaad dilao aur parchi bhejo" subtitle="Din ke aakhir ki pending list, UPI link, aaj ki parchi" onPress={() => router.push('/reminders')} />
        <ListRow title="Grahak (khata)" subtitle="Khata, baaki paisa, pichhle rate" onPress={() => router.push('/customers')} />
        {can('payment.receive') ? <ListRow title="Payment" subtitle="Rasid, proof, wapasi" onPress={() => router.push('/payments')} /> : null}
        {can('jobcard.edit') ? <ListRow title="Job card" subtitle="Workshop: parts + labour → bill" onPress={() => router.push('/job-cards')} /> : null}
        {can('reports.view') ? <ListRow title="Hisaab-kitab" subtitle="Bikri, baaki paisa, stock, margin" onPress={() => router.push('/reports')} /> : null}
      </Card>

      {drafts.length > 0 ? (
        <>
          <SectionTitle>Adhoore bill</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {drafts.map((i) => <ListRow key={i.id} title={i.customer_name} subtitle={i.doc_date} onPress={() => router.push(`/invoice/edit?id=${i.id}`)} right={<Text mono>{formatINR(i.grand_total)}</Text>} />)}
          </Card>
        </>
      ) : null}

      <SectionTitle>Pichhle bill</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {posted.length > 0 ? (
          posted.map((i) => (
            <ListRow key={i.id} title={`${i.customer_name}`} subtitle={`${i.doc_no ?? ''} · ${i.doc_date}${i.payment_mode ? ` · ${i.payment_mode}` : ''}`} onPress={() => router.push(`/invoice/${i.id}`)}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text mono>{formatINR(i.grand_total)}</Text>
                  <Badge tone={i.status === 'cancelled' ? 'danger' : i.doc_type === 'credit_note' ? 'info' : i.paid_total >= i.grand_total ? 'ok' : 'warn'}>
                    {i.status === 'cancelled' ? 'cancelled' : i.doc_type === 'credit_note' ? 'return' : i.paid_total >= i.grand_total ? 'paid' : 'pending'}
                  </Badge>
                </View>
              } />
          ))
        ) : (
          <Empty title="Abhi koi bill nahi" hint="“Naya bill” dabao: grahak chuno, maal scan ya search karo, post kar do." />
        )}
      </Card>
    </Screen>
  );
}
