/**
 * Aur — the fifth place on the bar, and the only one that is not a place.
 *
 * Ghar, Stock, Bill and Hisab are four questions the shop asks all day. The
 * "+" is the entries it makes all day. Everything else in the app has to be
 * reachable from here, or it does not exist — which is exactly what had
 * happened to Maal kahan pada hai, Kharab Likho, Ginti Karo and the partner's
 * money: four screens that were built and then linked from nowhere.
 *
 * The grouping is by WHEN somebody needs the thing, not by which table it
 * touches:
 *
 *   Madad   — the manual, first, because somebody who needs it needs it now
 *   Roz ka  — every day: kharcha, the day-end reminder round
 *   Godown  — the weekly maal jobs the Stock tab is too busy to carry
 *   Paisa   — who owes whom, and the bills behind it
 *   Dukan   — owner only: the catalogue, the staff, the settings
 *   Sync    — is this phone talking to the server
 *
 * Every row carries an IconBadge. This screen used to be a wall of identical
 * text rows and it was unreadable at a glance; the coloured square is what
 * makes a list of fourteen things scannable in one second.
 *
 * Two things deliberately do NOT appear here: a row for Bill or Hisab (they
 * are tabs — repeating a tab teaches people the bar is not trustworthy) and
 * the old diagnostics panels (row counts per table, a wall of permission
 * strings). Those answered a developer's question, in a screen named for the
 * shop's.
 */
import { useQuery, useStatus } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@domain';

import { cancelDailyPendingReminder, ensureDailyPendingReminder } from '@/lib/daily-reminder';
import { useSession } from '@/lib/session';
import { changeMyPassword } from '@/lib/staff';
import { Avatar, Badge, Button, Card, Chip, Divider, IconBadge, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify, SwitchRow } from '@/ui/forms';
import { space } from '@/ui/theme';

export default function MoreScreen() {
  const router = useRouter();
  const status = useStatus();
  const { profile, locationId, setLocationId, signOut, can, session, actor } = useSession();

  // Anyone can change their own password. This needs no Edge Function and no
  // admin: Supabase lets a signed-in user set their own, which means it keeps
  // working even where the server half is not deployed.
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  // ---------------------------------------------------------------------------
  // Every hook lives above the first return. A useQuery below a conditional
  // return blanks the screen at runtime and the typechecker says nothing.
  // ---------------------------------------------------------------------------
  const { data: locations } = useQuery<{ id: string; code: string; name: string }>(
    'SELECT id, code, name FROM locations WHERE is_active = 1 ORDER BY sort_order');

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

  const [dailyReminder, setDailyReminder] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const N = await import('expo-notifications');
      const all = await N.getAllScheduledNotificationsAsync();
      setDailyReminder(all.some((n) => n.identifier === 'autoloom-daily-pending-reminder'));
    })().catch(() => {});
  }, []);

  const isReviewer = can('catalog.edit');
  const canStock = can('stock.adjust');
  const canMoney = can('payment.receive') || can('payment.pay_supplier');
  const isOwner = can('reports.view');
  const showDukan = can('catalog.edit') || can('admin.settings') || can('admin.users');

  async function savePassword() {
    setPwBusy(true);
    const err = await changeMyPassword(pw);
    setPwBusy(false);
    if (err) { notify(err); return; }
    notify('Password badal gaya. Agli baar isi se sign in karna.', 'ok');
    setPw('');
    setPwOpen(false);
  }

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
      <View>
        <Text variant="display">Aur</Text>
        <Text variant="small" color="textMuted">
          Jo char tab mein nahi hai, wo sab yahan se khulta hai.
        </Text>
      </View>

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

      {/* Near the top: somebody who needs the manual needs it now, not after
          scrolling past nine things they do not understand. */}
      <SectionTitle>Madad</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <ListRow
          left={<IconBadge name="help-buoy-outline" accent="rose" />}
          title="Kaise chalayein"
          subtitle="Bill, maal, khata, hisaab — har kaam ka tareeka"
          onPress={() => router.push('/help')}
        />
        {/* The Stock tab searches maal. This one searches everything else —
            gaadi, grahak, gaadi number, bill number — and after the redesign
            nothing linked to it, which on a phone means it did not exist. */}
        <ListRow
          left={<IconBadge name="search-outline" accent="blue" />}
          title="Dhoondo"
          subtitle="Gaadi, grahak, gaadi number ya bill number — sab ek box se"
          onPress={() => router.push('/search')}
        />
      </Card>

      {/* The things that happen every single day and are not already a tab or
          a "+" job. Bill and Hisab are deliberately absent — they are tabs. */}
      <SectionTitle>Roz ka</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <ListRow
          left={<IconBadge name="wallet-outline" accent="amber" />}
          title="Kharcha Likho"
          subtitle="Transport, packing, chai, advance — jo bhi paisa bahar jaaye"
          onPress={() => router.push('/expenses')}
        />
        <ListRow
          left={<IconBadge name="logo-whatsapp" accent="green" />}
          title="Yaad dilao"
          subtitle="Din ke aakhir mein kisse paise lene hain, WhatsApp par bhej do"
          onPress={() => router.push('/reminders')}
        />
        {/* A staff member's own submissions. The owner's side of the same queue
            sits under Dukan, where the rest of the approving happens. */}
        {!isReviewer ? (
          <ListRow
            left={<IconBadge name="paper-plane-outline" accent="violet" />}
            title="Maine kya bheja"
            subtitle={myRejected > 0 ? `${myRejected} wapas aayi hai — theek karke dobara bhejo` : 'Naya maal ya rate ka badlav jo owner ko bheja hai'}
            onPress={() => router.push('/requests')}
            right={myRejected > 0 ? <Badge tone="danger">{String(myRejected)}</Badge> : undefined}
          />
        ) : null}
      </Card>

      {Platform.OS !== 'web' ? (
        <Card>
          <SwitchRow
            label="Roz 6:30 baje yaad dilao"
            hint="Roz shaam is phone par yaad aayega — baaki paisa dekh lo aur yaad dila do."
            value={dailyReminder}
            onChange={toggleDailyReminder}
          />
        </Card>
      ) : null}

      {/* The maal jobs. Daily receiving and daily correction are on the "+";
          these are the once-a-week ones the Stock tab has no room for. */}
      <SectionTitle>Godown</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <ListRow
          left={<IconBadge name="map-outline" accent="blue" />}
          title="Maal kahan pada hai"
          subtitle="Godown, dukan, workshop — kis jagah kitna maal aur kitne ka"
          onPress={() => router.push('/warehouse')}
        />
        {canStock || can('stock.damage') ? (
          <ListRow
            left={<IconBadge name="alert-circle-outline" accent="rose" />}
            title="Kharab Likho"
            subtitle="Toot gaya, kharab ho gaya, kam nikla — stock se nikal do"
            onPress={() => router.push('/kharab-maal')}
          />
        ) : null}
        {canStock || can('stock.count') ? (
          <ListRow
            left={<IconBadge name="checkbox-outline" accent="teal" />}
            title="Ginti Karo"
            subtitle="Godown ka maal ginke app se mila lo"
            onPress={() => router.push('/stock-check')}
          />
        ) : null}
        {can('stock.transfer') ? (
          <ListRow
            left={<IconBadge name="swap-horizontal-outline" accent="violet" />}
            title="Maal doosri jagah bhejo"
            subtitle="Godown se dukan, dukan se workshop — jahan chahiye wahan"
            onPress={() => router.push('/transfers')}
          />
        ) : null}
        {can('purchase.create') || isOwner ? (
          <ListRow
            left={<IconBadge name="cart-outline" accent="green" />}
            title="Kya mangwana hai"
            subtitle="Jo tezi se bik raha hai aur khatam hone wala hai"
            onPress={() => router.push('/reorder')}
          />
        ) : null}
      </Card>

      {/* Who owes whom. The parties sit here rather than under Dukan because a
          counter hand needs a khata all day and never needs a setting. */}
      <SectionTitle>Paisa</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {canMoney ? (
          <ListRow
            left={<IconBadge name="cash-outline" accent="green" />}
            title="Paisa aaya, paisa diya"
            subtitle="Grahak se aaya aur supplier ko diya — rasid ke saath"
            onPress={() => router.push('/payments')}
          />
        ) : null}
        <ListRow
          left={<IconBadge name="people-outline" accent="teal" />}
          title="Grahak"
          subtitle="Kiska khata kitna chal raha hai, pichhla rate kya tha"
          onPress={() => router.push('/customers')}
        />
        <ListRow
          left={<IconBadge name="business-outline" accent="violet" />}
          title="Supplier"
          subtitle="Kis se maal aata hai aur uska kitna baaki hai"
          onPress={() => router.push('/suppliers')}
        />
        {can('purchase.create') ? (
          <ListRow
            left={<IconBadge name="documents-outline" accent="blue" />}
            title="Supplier ke bill"
            subtitle="Jo maal aaya uske bill, return, aur kitna paisa dena baaki hai"
            onPress={() => router.push('/purchases')}
          />
        ) : null}
        {isOwner ? (
          <ListRow
            left={<IconBadge name="briefcase-outline" accent="rose" />}
            title="Partner ka paisa likho"
            subtitle="Partner ne apne liye nikala ya dukan ke liye — dono alag"
            onPress={() => router.push('/partner-kharcha')}
          />
        ) : null}
      </Card>

      {showDukan ? (
        <>
          <SectionTitle>Dukan</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {isReviewer ? (
              <ListRow
                left={<IconBadge name="checkmark-done-outline" accent="amber" />}
                title="Staff ne kya bheja"
                subtitle={pendingReq > 0 ? `${pendingReq} cheez aapke haan ya na ka intezaar kar rahi hai` : 'Naya maal ya rate ka badlav — abhi kuch pending nahi'}
                onPress={() => router.push('/requests')}
                right={pendingReq > 0 ? <Badge tone="warn">{String(pendingReq)}</Badge> : undefined}
              />
            ) : null}
            {can('catalog.edit') ? (
              <ListRow
                left={<IconBadge name="cube-outline" accent="blue" />}
                title="Saara maal"
                subtitle="Naya item banao, rate badlo, purana band karo"
                onPress={() => router.push('/admin/products')}
              />
            ) : null}
            {can('admin.users') ? (
              <ListRow
                left={<IconBadge name="person-add-outline" accent="violet" />}
                title="Staff"
                subtitle="Kiska login banega aur woh kya-kya kar sakta hai"
                onPress={() => router.push('/admin/users')}
              />
            ) : null}
            {can('admin.settings') ? (
              <ListRow
                left={<IconBadge name="storefront-outline" accent="teal" />}
                title="Dukan settings"
                subtitle="Dukan ka naam, number, UPI aur bill ke neeche ka likha"
                onPress={() => router.push('/admin/settings')}
              />
            ) : null}
            {can('catalog.edit') ? (
              <ListRow
                left={<IconBadge name="cloud-upload-outline" accent="green" />}
                title="Excel se chadhao"
                subtitle="Ek saath saara maal, grahak ya opening stock — Excel file se"
                onPress={() => router.push('/admin/import')}
              />
            ) : null}
            {/* The deep master data — categories, brand, unit, HSN, rate list,
                location, bill number format — lives only behind this. Without
                the row a phone cannot reach any of it. */}
            <ListRow
              left={<IconBadge name="options-outline" accent="amber" />}
              title="Baaki sab settings"
              subtitle="Category, brand, rate list, jagah, bill number ka format"
              onPress={() => router.push('/admin')}
            />
          </Card>
        </>
      ) : null}

      <SectionTitle>Sync</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <ListRow
          left={<IconBadge name="cloud-done-outline" accent="blue" />}
          title="Sync ka haal"
          subtitle={status.connected
            ? (status.lastSyncedAt ? `Aakhri baar ${status.lastSyncedAt.toLocaleTimeString('en-IN')} par server se mila` : 'Server se juda hua hai')
            : 'Offline — badlav is phone par ruke hue hain'}
          onPress={() => router.push('/sync')}
          right={<Badge tone={status.connected ? 'ok' : 'warn'}>{status.connected ? 'Juda hua' : 'Offline'}</Badge>}
        />
      </Card>

      <Button title="Sign out" tone="secondary" onPress={confirmSignOut} />
    </Screen>
  );
}
