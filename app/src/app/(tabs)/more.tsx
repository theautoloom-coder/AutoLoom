import { useQuery, useStatus } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@domain';

import { cancelDailyPendingReminder, ensureDailyPendingReminder } from '@/lib/daily-reminder';
import { useSession } from '@/lib/session';
import { changeMyPassword } from '@/lib/staff';
import { Avatar, Badge, Button, Card, Chip, Divider, Input, KV, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify, SwitchRow } from '@/ui/forms';
import { space } from '@/ui/theme';

type Counts = { families: number; specs: number; options: number; products: number; variants: number; models: number; fitments: number; customers: number; suppliers: number; movements: number };

export default function MoreScreen() {
  const router = useRouter();
  const status = useStatus();
  const { profile, permissions, locationId, setLocationId, signOut, can, session, actor } = useSession();

  // Anyone can change their own password. This needs no Edge Function and no
  // admin: Supabase lets a signed-in user set their own, which means it keeps
  // working even where the server half is not deployed.
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  async function savePassword() {
    setPwBusy(true);
    const err = await changeMyPassword(pw);
    setPwBusy(false);
    if (err) { notify(err); return; }
    notify('Password badal gaya. Agli baar isi se sign in karna.');
    setPw('');
    setPwOpen(false);
  }

  const isReviewer = can('catalog.edit');

  const { data: locations } = useQuery<{ id: string; code: string; name: string }>('SELECT id, code, name FROM locations WHERE is_active = 1 ORDER BY sort_order');

  // Two numbers, because the row means different things to the two audiences:
  // an admin needs to know what is waiting on them, a staff member needs to
  // know what came back for correction.
  const { data: reqRows } = useQuery<{ pending: number; mine_back: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN status = 'rejected' AND submitted_by = ? THEN 1 ELSE 0 END), 0) AS mine_back
     FROM change_requests`,
    [actor.userId ?? ''],
  );
  const pendingReq = reqRows?.[0]?.pending ?? 0;
  const myRejected = reqRows?.[0]?.mine_back ?? 0;
  const { data: countRows } = useQuery<Counts>(`
    SELECT (SELECT COUNT(*) FROM product_families) AS families,
           (SELECT COUNT(*) FROM spec_definitions) AS specs,
           (SELECT COUNT(*) FROM spec_options) AS options,
           (SELECT COUNT(*) FROM products) AS products,
           (SELECT COUNT(*) FROM product_variants) AS variants,
           (SELECT COUNT(*) FROM vehicle_models) AS models,
           (SELECT COUNT(*) FROM product_fitments) AS fitments,
           (SELECT COUNT(*) FROM customers) AS customers,
           (SELECT COUNT(*) FROM suppliers) AS suppliers,
           (SELECT COUNT(*) FROM stock_movements) AS movements`);
  const counts = countRows?.[0];

  const [dailyReminder, setDailyReminder] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const N = await import('expo-notifications');
      const all = await N.getAllScheduledNotificationsAsync();
      setDailyReminder(all.some((n) => n.identifier === 'autoloom-daily-pending-reminder'));
    })().catch(() => {});
  }, []);

  async function toggleDailyReminder(on: boolean) {
    setDailyReminder(on);
    if (on) await ensureDailyPendingReminder();
    else await cancelDailyPendingReminder();
  }

  async function confirmSignOut() {
    if (await confirm('Sign out', 'Sign out of AutoLoom on this device? Local data stays for the next sign-in.')) signOut();
  }

  return (
    <Screen>
      <Text variant="display">Aur</Text>

      <Card>
        <Row gap={space.md} align="flex-start">
          <Avatar name={profile?.full_name ?? session?.user.email ?? '?'} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="title">{profile?.full_name ?? session?.user.email}</Text>
              {profile ? <Badge tone="accent">{ROLE_LABELS[profile.role]}</Badge> : null}
            </Row>
            <Text variant="small" color="textMuted">
              {profile ? ROLE_DESCRIPTIONS[profile.role] : 'Profile abhi sync nahi hua. Pehla sync poora hone tak sirf dekh sakte ho.'}
            </Text>
          </View>
        </Row>
        <Divider />
        <Text variant="label" color="textMuted">
          Kaam ki jagah
        </Text>
        <Row gap={space.xs} wrap>
          {(locations ?? []).map((l) => (
            <Chip key={l.id} label={l.name} selected={locationId === l.id} onPress={() => setLocationId(l.id)} />
          ))}
        </Row>

        <Divider />
        {pwOpen ? (
          <>
            <Input
              label="Naya password"
              value={pw}
              onChangeText={setPw}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Kam se kam 8 character"
            />
            <Row gap={space.sm}>
              <Button title="Password badlo" onPress={savePassword} loading={pwBusy} disabled={pw.length < 8} />
              <Button title="Rehne do" tone="ghost" onPress={() => { setPwOpen(false); setPw(''); }} />
            </Row>
          </>
        ) : (
          <Button title="Apna password badlo" tone="secondary" size="sm" onPress={() => setPwOpen(true)} />
        )}
      </Card>

      <SectionTitle>Sync</SectionTitle>
      <Card style={{ gap: 0 }}>
        <ListRow
          title="Sync ka haal"
          subtitle={status.connected ? (status.lastSyncedAt ? `Aakhri sync ${status.lastSyncedAt.toLocaleTimeString('en-IN')}` : 'Juda hua') : 'Offline — badlav is phone par ruke hue hain'}
          onPress={() => router.push('/sync')}
          right={<Badge tone={status.connected ? 'ok' : 'warn'}>{status.connected ? 'Juda hua' : 'Offline'}</Badge>}
        />
      </Card>

      <SectionTitle>Paisa</SectionTitle>
      <Card style={{ gap: 0 }}>
        <ListRow
          title="Kharcha"
          subtitle="Transport, packing, chai, advance — jo bhi bahar jaaye"
          onPress={() => router.push('/expenses')}
        />
      </Card>

      <SectionTitle>{isReviewer ? 'Requests' : 'Meri requests'}</SectionTitle>
      <Card style={{ gap: 0 }}>
        <ListRow
          title={isReviewer ? 'Approve karne hain' : 'Naya item bheja hua'}
          subtitle={
            isReviewer
              ? (pendingReq > 0 ? `${pendingReq} request admin ke paas pending hai` : 'Kuch pending nahi')
              : (myRejected > 0 ? `${myRejected} wapas aayi hai — theek karni hai` : 'Naya maal admin ko bhejo')
          }
          onPress={() => router.push('/requests')}
          right={
            myRejected > 0 ? <Badge tone="danger">{String(myRejected)}</Badge>
            : pendingReq > 0 ? <Badge tone="warn">{String(pendingReq)}</Badge>
            : undefined
          }
        />
      </Card>

      {Platform.OS !== 'web' ? (
        <>
          <SectionTitle>Yaad dilane wale</SectionTitle>
          <Card>
            <SwitchRow
              label="Roz 6:30 baje yaad dilao"
              hint="Roz shaam is phone par yaad aayega — baaki paisa dekh lo aur yaad dila do."
              value={dailyReminder}
              onChange={toggleDailyReminder}
            />
          </Card>
        </>
      ) : null}

      {can('reports.view') ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <ListRow title="Hisaab-kitab" subtitle="Bikri, GST, purchase, baaki paisa, stock, margin" onPress={() => router.push('/reports')} />
        </Card>
      ) : null}

      <SectionTitle>Is phone par kitna maal</SectionTitle>
      <Card style={{ gap: 0 }}>
        <KV k="Category" v={String(counts?.families ?? 0)} mono />
        <KV k="Spec ke khaane" v={`${counts?.specs ?? 0} with ${counts?.options ?? 0} options`} mono />
        <KV k="Item / SKU" v={`${counts?.products ?? 0} / ${counts?.variants ?? 0}`} mono />
        <KV k="Gaadi ke model" v={String(counts?.models ?? 0)} mono />
        <KV k="Kis gaadi mein lagta hai" v={String(counts?.fitments ?? 0)} mono />
        <KV k="Grahak / supplier" v={`${counts?.customers ?? 0} / ${counts?.suppliers ?? 0}`} mono />
        <KV k="Stock ka aana-jaana" v={String(counts?.movements ?? 0)} mono />
      </Card>

      {can('catalog.edit') || can('admin.settings') ? (
        <>
          <SectionTitle>Admin</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            <ListRow title="Admin kholo" subtitle="Maal, gaadi, party, dukan settings" onPress={() => router.push('/admin')} />
          </Card>
        </>
      ) : null}

      <SectionTitle>Aap kya kar sakte ho</SectionTitle>
      <Card>
        <Row gap={space.xs} wrap>
          {[...permissions].sort().map((p) => (
            <Badge key={p}>{p}</Badge>
          ))}
          {permissions.size === 0 ? (
            <Text variant="small" color="textMuted">
              None yet — waiting for first sync.
            </Text>
          ) : null}
        </Row>
      </Card>

      <Button title="Sign out" tone="secondary" onPress={confirmSignOut} />
    </Screen>
  );
}
