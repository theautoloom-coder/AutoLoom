/**
 * Aur — the fifth place on the bar, and the only one that is not a place.
 *
 * Ghar, Stock, Khata and Bill/Hisab are the questions the business asks all
 * day. The "+" is the entries it makes all day. Everything else has to be
 * reachable from here, or it does not exist.
 *
 * The grouping is by WHEN somebody needs the thing, not by which table it
 * touches:
 *
 *   Madad   — the manual, first, because somebody who needs it needs it now
 *   Roz ka  — every day: kharcha, the day-end reminder round, my entries
 *   Maal    — the godown jobs the Stock tab is too busy to carry
 *   Paisa   — money in and out, the partners' money, the reports
 *   Dukan   — owner only: approvals, the catalogue, the staff, the settings
 *   Sync    — is this phone talking to the server
 *
 * AutoLoom keeps all its maal in one godown (owner, 6 Oct 2026), so there is
 * no "kaam ki jagah" to pick and no screen for moving maal between places.
 */
import { useQuery, useStatus } from '@powersync/react';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { ROLE_DESCRIPTIONS, roleLabel } from '@domain';

import { APP_BUILD } from '@/lib/build';
import { cancelDailyPendingReminder, ensureDailyPendingReminder } from '@/lib/daily-reminder';
import { useSession } from '@/lib/session';
import { changeMyPassword } from '@/lib/staff';
import { Avatar, Badge, Button, Card, Divider, IconBadge, Input, ListRow, Row, Screen, SectionTitle, Text } from '@/ui';
import { confirm, notify, SwitchRow } from '@/ui/forms';
import { runningVersion } from '@/ui/app-updates';
import { space } from '@/ui/theme';

export default function MoreScreen() {
  const router = useRouter();
  const status = useStatus();
  const { profile, signOut, can, session, actor } = useSession();

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
  // Two numbers, because the row means different things to the two audiences:
  // an admin needs to know what is waiting on them, a staff member needs to
  // know what came back for correction.
  // Stock entries waiting on the owner count as much as new-item requests.
  const { data: reqRows } = useQuery<{ pending: number; mine_back: number; mine_waiting: number }>(
    `SELECT
       (SELECT COUNT(*) FROM change_requests WHERE status = 'pending')
     + (SELECT COUNT(*) FROM purchases WHERE status = 'draft' AND submitted_at IS NOT NULL)
     + (SELECT COUNT(*) FROM stock_adjustments WHERE status = 'draft' AND submitted_at IS NOT NULL) AS pending,
       (SELECT COUNT(*) FROM change_requests WHERE status = 'rejected' AND submitted_by = ?1)
     + (SELECT COUNT(*) FROM purchases WHERE status = 'draft' AND submitted_at IS NULL AND submitted_by = ?1) AS mine_back,
       (SELECT COUNT(*) FROM change_requests WHERE status = 'pending' AND submitted_by = ?1)
     + (SELECT COUNT(*) FROM purchases WHERE status = 'draft' AND submitted_at IS NOT NULL AND submitted_by = ?1)
     + (SELECT COUNT(*) FROM stock_adjustments WHERE status = 'draft' AND submitted_at IS NOT NULL AND submitted_by = ?1) AS mine_waiting`,
    [actor.userId ?? ''],
  );
  const { data: kharabRows } = useQuery<{ items: number }>(
    `SELECT COUNT(*) AS items FROM (
       SELECT m.variant_id FROM stock_movements m JOIN locations l ON l.id = m.location_id
        WHERE l.type = 'damaged' GROUP BY m.variant_id HAVING SUM(m.qty) > 0)`);
  const kharabItems = kharabRows?.[0]?.items ?? 0;
  const pendingReq = reqRows?.[0]?.pending ?? 0;
  const myRejected = reqRows?.[0]?.mine_back ?? 0;
  const myWaiting = reqRows?.[0]?.mine_waiting ?? 0;

  const [dailyReminder, setDailyReminder] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const N = await import('expo-notifications');
      const all = await N.getAllScheduledNotificationsAsync();
      setDailyReminder(all.some((n) => n.identifier === 'autoloom-daily-pending-reminder'));
    })().catch(() => {});
  }, []);

  const isReviewer = can('catalog.edit') || can('purchase.approve');
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
              {profile ? <Badge tone="accent">{roleLabel(profile.role)}</Badge> : null}
            </Row>
            <Text variant="small" color="textMuted">
              {profile
                ? ROLE_DESCRIPTIONS[profile.role as keyof typeof ROLE_DESCRIPTIONS] ?? ROLE_DESCRIPTIONS.staff
                : 'Profile abhi sync nahi hua. Pehla sync poora hone tak sirf dekh sakte ho.'}
            </Text>
          </View>
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
        {can('party.edit') ? (
          <ListRow
            left={<IconBadge name="people-circle-outline" accent="teal" />}
            title="Supplier aur grahak ki list"
            subtitle="Naya jodo, number badlo, band karo — saare khate ek jagah"
            onPress={() => router.push('/parties' as never)}
          />
        ) : null}
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
            subtitle={myRejected > 0
              ? `${myRejected} wapas aayi hai — theek karke dobara bhejo`
              : myWaiting > 0
              ? `${myWaiting} review mein — approve hone tak badal sakte ho`
              : 'Aaya hua maal aur naye item — owner ke haan ka intezaar'}
            onPress={() => router.push('/requests')}
            right={myRejected > 0 ? <Badge tone="danger">{String(myRejected)}</Badge> : myWaiting > 0 ? <Badge tone="warn">{String(myWaiting)}</Badge> : undefined}
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

      {/* The maal jobs. Daily stock-in and the daily count are on the "+";
          these are the ones the Stock tab has no room for. */}
      <SectionTitle>Maal</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <ListRow
          left={<IconBadge name="alert-circle-outline" accent="rose" />}
          title="Kharab maal"
          subtitle={kharabItems > 0
            ? `${kharabItems} item kharab mein pade hain — supplier ko wapas bhejo`
            : 'Toota ya wapas aaya maal yahan rukta hai, phir supplier ko jaata hai'}
          onPress={() => router.push('/kharab' as never)}
          right={kharabItems > 0 ? <Badge tone="danger">{String(kharabItems)}</Badge> : undefined}
        />
        {canStock || can('stock.damage') ? (
          <ListRow
            left={<IconBadge name="hammer-outline" accent="amber" />}
            title="Kharab Likho"
            subtitle="Toot gaya ya kharab nikla — godown se kharab mein daal do"
            onPress={() => router.push('/kharab-maal')}
          />
        ) : null}
        {canStock || can('stock.count') ? (
          <ListRow
            left={<IconBadge name="checkbox-outline" accent="teal" />}
            title="Stock theek karo"
            subtitle="Ginti, toota ya galat chadha — jitna sach mein hai wo likho"
            onPress={() => router.push('/stock-check')}
          />
        ) : null}
        {can('purchase.create') ? (
          <ListRow
            left={<IconBadge name="documents-outline" accent="blue" />}
            title="Supplier se aaya maal"
            subtitle="Har entry, approval ka haal, supplier ko wapas gaya maal"
            onPress={() => router.push('/purchases')}
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

      {/* Money that is not a bill. The khata itself is a tab. */}
      {canMoney || can('partner.capital') || isOwner ? (
        <>
          <SectionTitle>Paisa</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {canMoney ? (
              <ListRow
                left={<IconBadge name="cash-outline" accent="green" />}
                title={can('payment.pay_supplier') ? 'Paisa aaya, paisa diya' : 'Paisa aaya'}
                subtitle={can('payment.pay_supplier') ? 'Grahak se aaya aur supplier ko diya — rasid ke saath' : 'Grahak se aaya paisa — rasid ke saath'}
                onPress={() => router.push('/payments')}
              />
            ) : null}
            {can('partner.capital') ? (
              <ListRow
                left={<IconBadge name="briefcase-outline" accent="rose" />}
                title="Partner ka paisa"
                subtitle="Kis partner ne kab kitna lagaya aur kitna nikala"
                onPress={() => router.push('/partner-paisa' as never)}
              />
            ) : null}
            {isOwner ? (
              <ListRow
                left={<IconBadge name="document-text-outline" accent="blue" />}
                title="Report — PDF"
                subtitle="Sale, party ka khata, stock, partner ka hisaab, munafa"
                onPress={() => router.push('/reports' as never)}
              />
            ) : null}
          </Card>
        </>
      ) : null}

      {showDukan ? (
        <>
          <SectionTitle>Dukan</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {isReviewer ? (
              <ListRow
                left={<IconBadge name="checkmark-done-outline" accent="amber" />}
                title="Approval"
                subtitle={pendingReq > 0 ? `${pendingReq} cheez aapke haan ya na ka intezaar kar rahi hai` : 'Staff ka aaya hua maal aur naye item — abhi kuch baaki nahi'}
                onPress={() => router.push('/requests')}
                right={pendingReq > 0 ? <Badge tone="warn">{String(pendingReq)}</Badge> : undefined}
              />
            ) : null}
            {can('catalog.edit') ? (
              <ListRow
                left={<IconBadge name="pricetags-outline" accent="violet" />}
                title="Category aur detail"
                subtitle="Category, uski detail (socket, colour, watt) aur options — app badle bina"
                onPress={() => router.push('/admin/categories' as never)}
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
              subtitle="Category, brand, rate list, bill number ka format"
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
      {/* Which version this phone runs — so "naya feature nahi dikh raha"
          is answered by looking, not guessing (9 Oct 2026). */}
      <Text variant="small" color="textFaint" style={{ textAlign: 'center' }}>
        Version: {runningVersion(Constants.expoConfig?.version ?? '1.0.0')} · build {APP_BUILD}
      </Text>
    </Screen>
  );
}
