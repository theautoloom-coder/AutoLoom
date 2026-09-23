import { useQuery } from '@powersync/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';

import { formatINR, formatRegistration } from '@domain';

import { Badge, Button, Card, Empty, KV, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';

type J = { id: string; doc_no: string | null; doc_date: string; status: string; requirement: string | null; odometer_km: number | null; notes: string | null; parts_total: number; labour_total: number; tax_total: number; grand_total: number; invoice_id: string | null; closed_at: string | null; customer_id: string; customer_name: string; registration_no: string | null; model_name: string | null; technician_name: string | null; location_name: string; invoice_no: string | null };

export default function JobCardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: rows } = useQuery<J>(`
    SELECT j.*, c.name AS customer_name, cv.registration_no, vm.name AS model_name, pr.full_name AS technician_name, l.name AS location_name, i.doc_no AS invoice_no
    FROM job_cards j JOIN customers c ON c.id = j.customer_id LEFT JOIN customer_vehicles cv ON cv.id = j.customer_vehicle_id LEFT JOIN vehicle_models vm ON vm.id = cv.model_id
    LEFT JOIN profiles pr ON pr.id = j.technician_id JOIN locations l ON l.id = j.location_id LEFT JOIN sales_invoices i ON i.id = j.invoice_id WHERE j.id = ?`, [id]);
  const j = rows?.[0];
  const { data: parts } = useQuery<{ id: string; description: string; qty: number; rate: number }>('SELECT id, description, qty, rate FROM job_card_lines WHERE job_card_id = ? ORDER BY created_at', [id]);
  const { data: labour } = useQuery<{ id: string; description: string; amount: number }>('SELECT id, description, amount FROM job_card_labour WHERE job_card_id = ? ORDER BY created_at', [id]);
  if (!j) return <Screen><Empty title="Job card not found on this device" /></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: j.doc_no ?? 'Job card' }} />
      <Screen>
        <Badge tone={j.status === 'closed' ? 'ok' : 'neutral'}>{j.status}</Badge>
        <Text variant="display">{j.registration_no ? formatRegistration(j.registration_no) : j.customer_name}</Text>
        <Text color="textMuted">{j.customer_name}{j.model_name ? ` · ${j.model_name}` : ''} · {j.doc_date} · {j.location_name}</Text>
        <Card style={{ gap: 0 }}>
          <KV k="Job card" v={j.doc_no ?? '—'} mono />
          {j.requirement ? <KV k="Requirement" v={j.requirement} /> : null}
          {j.technician_name ? <KV k="Technician" v={j.technician_name} /> : null}
          {j.odometer_km ? <KV k="Odometer" v={`${j.odometer_km} km`} mono /> : null}
          <KV k="Parts" v={formatINR(j.parts_total)} mono />
          <KV k="Labour" v={formatINR(j.labour_total)} mono />
          <KV k="Tax" v={formatINR(j.tax_total)} mono />
          <KV k="Total" v={formatINR(j.grand_total)} mono />
          {j.notes ? <KV k="Notes" v={j.notes} /> : null}
        </Card>
        <Row gap={8}>
          {j.invoice_id ? <Button title={`Invoice ${j.invoice_no ?? ''}`} onPress={() => router.push(`/invoice/${j.invoice_id}`)} /> : null}
          <Button title="Customer" tone="secondary" onPress={() => router.push(`/customer/${j.customer_id}`)} />
        </Row>
        <SectionTitle>Parts used</SectionTitle>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(parts ?? []).map((p) => <ListRow key={p.id} title={p.description} right={<Text mono>{p.qty} @ {formatINR(p.rate)}</Text>} />)}
          {(parts ?? []).length === 0 ? <Empty title="No parts" /> : null}
        </Card>
        <SectionTitle>Labour</SectionTitle>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {(labour ?? []).map((l) => <ListRow key={l.id} title={l.description} right={<Text mono>{formatINR(l.amount)}</Text>} />)}
          {(labour ?? []).length === 0 ? <Empty title="No labour" /> : null}
        </Card>
      </Screen>
    </>
  );
}
