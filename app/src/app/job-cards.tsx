import { useQuery } from '@powersync/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatINR, formatRegistration } from '@domain';

import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Empty, ListRow, Row, Screen, Text } from '@/ui';
import { space } from '@/ui/theme';

type J = { id: string; doc_no: string | null; doc_date: string; status: string; requirement: string | null; grand_total: number; customer_name: string; registration_no: string | null; model_name: string | null; technician_name: string | null; parts: number; labour: number };
const STATUSES = ['open', 'in_progress', 'ready', 'closed'] as const;

export default function JobCardsScreen() {
  const router = useRouter();
  const { can } = useSession();
  const { vehicle } = useLocalSearchParams<{ vehicle?: string }>();
  const [status, setStatus] = useState<string | null>(null);
  const { data: rows } = useQuery<J>(`
    SELECT j.id, j.doc_no, j.doc_date, j.status, j.requirement, j.grand_total, c.name AS customer_name, cv.registration_no, vm.name AS model_name, pr.full_name AS technician_name,
           (SELECT COUNT(*) FROM job_card_lines l WHERE l.job_card_id = j.id) AS parts, (SELECT COUNT(*) FROM job_card_labour l WHERE l.job_card_id = j.id) AS labour
    FROM job_cards j JOIN customers c ON c.id = j.customer_id LEFT JOIN customer_vehicles cv ON cv.id = j.customer_vehicle_id LEFT JOIN vehicle_models vm ON vm.id = cv.model_id LEFT JOIN profiles pr ON pr.id = j.technician_id
    WHERE (?1 = '' OR j.status = ?1) AND (?2 = '' OR j.customer_vehicle_id = ?2)
    ORDER BY CASE j.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END, j.doc_date DESC, j.created_at DESC LIMIT 200`, [status ?? '', vehicle ?? '']);
  const tone = (s: string) => (s === 'closed' ? 'ok' : s === 'ready' ? 'info' : s === 'in_progress' ? 'warn' : s === 'cancelled' ? 'danger' : 'neutral');

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="display">Job cards</Text>
        {can('jobcard.edit') ? <Button title="New job card" onPress={() => router.push('/job-card/edit')} /> : null}
      </Row>
      <Row gap={space.xs} wrap>
        <Chip label="All" selected={!status} onPress={() => setStatus(null)} />
        {STATUSES.map((s) => <Chip key={s} label={s.replace('_', ' ')} selected={status === s} onPress={() => setStatus(status === s ? null : s)} />)}
      </Row>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {(rows ?? []).map((j) => (
          <ListRow key={j.id} title={`${j.registration_no ? formatRegistration(j.registration_no) : j.customer_name}${j.model_name ? ` · ${j.model_name}` : ''}`}
            subtitle={`${j.doc_no ?? 'Draft'} · ${j.doc_date} · ${j.customer_name}${j.technician_name ? ` · ${j.technician_name}` : ''} · ${j.parts} parts, ${j.labour} labour${j.requirement ? ` · ${j.requirement}` : ''}`}
            onPress={() => router.push(j.status === 'closed' || j.status === 'cancelled' ? `/job-card/${j.id}` : `/job-card/edit?id=${j.id}`)}
            right={<View style={{ alignItems: 'flex-end' }}>{j.grand_total ? <Text mono>{formatINR(j.grand_total)}</Text> : null}<Badge tone={tone(j.status)}>{j.status.replace('_', ' ')}</Badge></View>} />
        ))}
        {(rows ?? []).length === 0 ? <Empty title="No job cards" hint="A job card tracks one vehicle's work: parts used, labour, and the invoice it becomes." /> : null}
      </Card>
    </Screen>
  );
}
