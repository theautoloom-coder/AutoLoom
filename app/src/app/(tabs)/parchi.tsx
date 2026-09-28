/**
 * Kisne kya kiya — the activity log.
 *
 * `audit_logs` has been written by server triggers since day one and was never
 * shown anywhere, so an owner who handed out staff logins had no way to see
 * what was done with them. A cancelled bill, an overridden price, a raised
 * credit limit: all recorded, none visible.
 *
 * Rows are turned into sentences rather than listed as table names and UUIDs.
 * "Sales invoice · update" tells the owner nothing; "Bill badla" does. The
 * noisy half of the log — every draft keystroke syncing as an update — is
 * folded away behind a toggle so the things that matter are not buried under
 * it.
 */
import { useQuery } from '@powersync/react';
import { Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';

import { useSession } from '@/lib/session';
import { Badge, Card, Chip, Divider, Empty, ListRow, Row, Screen, Text } from '@/ui';
import { space } from '@/ui/theme';

type Entry = {
  id: string; at: string; action: string; table_name: string; row_id: string;
  reason: string | null; who: string | null;
};

/** The tables an owner would ask about, in the words they would use. */
const SUBJECT: Record<string, string> = {
  sales_invoices: 'Bill',
  sales_invoice_lines: 'Bill ki line',
  purchases: 'Purchase',
  payments: 'Payment',
  customers: 'Customer',
  suppliers: 'Supplier',
  products: 'Item',
  product_variants: 'Item ka rate',
  product_families: 'Category',
  stock_adjustments: 'Stock adjustment',
  stock_transfers: 'Transfer',
  stock_audits: 'Stock count',
  job_cards: 'Job card',
  profiles: 'Staff',
  role_permissions: 'Permission',
  company_settings: 'Dukaan settings',
  locations: 'Location',
  change_requests: 'Request',
  expenses: 'Kharcha',
  price_lists: 'Rate list',
};

const VERB: Record<string, string> = {
  insert: 'banaya',
  update: 'badla',
  delete: 'hataya',
  create_staff: 'staff banaya',
};

/**
 * Line-level rows and draft churn are most of the log by volume and almost
 * none of it by meaning — a single bill can produce a dozen updates while it is
 * being typed.
 */
const NOISY = new Set([
  'sales_invoice_lines', 'purchase_lines', 'job_card_lines', 'job_card_labour',
  'stock_adjustment_lines', 'stock_transfer_lines', 'stock_audit_lines',
  'payment_allocations', 'devices',
]);

export default function ActivityScreen() {
  const { can } = useSession();
  const [who, setWho] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: rows } = useQuery<Entry>(
    `SELECT a.id, a.at, a.action, a.table_name, a.row_id, a.reason, p.full_name AS who
       FROM audit_logs a
       LEFT JOIN profiles p ON p.id = a.user_id
      ORDER BY a.at DESC
      LIMIT 500`);

  const all = rows ?? [];
  const people = useMemo(
    () => [...new Set(all.map((e) => e.who).filter(Boolean))] as string[],
    [all]);

  const shown = all
    .filter((e) => showAll || !NOISY.has(e.table_name))
    .filter((e) => !who || e.who === who);

  if (!can('admin.users')) {
    return <Screen><Empty title="Ye sirf owner aur admin dekh sakte hain" /></Screen>;
  }

  const when = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date().toDateString() === d.toDateString();
    return today
      ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
        ' · ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  };

  const sentence = (e: Entry) =>
    `${SUBJECT[e.table_name] ?? e.table_name} ${VERB[e.action] ?? e.action}`;

  return (
    <>
      <Stack.Screen options={{ title: 'Kisne kya kiya' }} />
      <Screen>
        <Text variant="display">Kisne kya kiya</Text>
        <Text variant="small" color="textMuted">
          Har bill, rate, customer aur setting ka record — kisne badla aur kab.
        </Text>

        {people.length > 1 ? (
          <Row gap={8} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
            <Chip label="Sab" selected={!who} onPress={() => setWho(null)} />
            {people.map((p) => (
              <Chip key={p} label={p} selected={who === p} onPress={() => setWho(p)} />
            ))}
          </Row>
        ) : null}

        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Chip
            label={showAll ? 'Sab kuch dikha raha hai' : 'Chhoti cheezein chhupi hain'}
            selected={showAll}
            onPress={() => setShowAll(!showAll)}
          />
        </Row>

        {shown.length === 0 ? (
          <Empty
            title="Abhi kuch nahi"
            hint="Jaise hi koi bill, rate ya customer badlega, yahan dikhega."
          />
        ) : (
          <Card style={{ gap: 0 }}>
            {shown.slice(0, 200).map((e, i) => (
              <React.Fragment key={e.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={sentence(e)}
                  subtitle={[e.who ?? 'System', e.reason].filter(Boolean).join(' · ')}
                  right={
                    <Row gap={8} align="center">
                      {e.action === 'delete' ? <Badge tone="danger">hataya</Badge> : null}
                      <Text variant="small" color="textFaint">{when(e.at)}</Text>
                    </Row>
                  }
                />
              </React.Fragment>
            ))}
          </Card>
        )}
      </Screen>
    </>
  );
}
