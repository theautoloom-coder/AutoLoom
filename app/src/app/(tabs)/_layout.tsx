import { useQuery, useStatus } from '@powersync/react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { type ColorValue, Image, Platform, Pressable, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { visibleSections } from '@domain';

import { useSession } from '@/lib/session';
import { TAGLINE } from '@/ui/brand';
import { Avatar, Badge, Icon, Row, Text, useIsWide, useTheme, type IconName } from '@/ui';
import { palette, radius, space } from '@/ui/theme';

/** The mark is red, so its tile has to be dark for it to read at all. */
const INK_TILE = palette.dark.navy;

/** Real icons (Ionicons) - one font family for the whole app. */
function Glyph({ symbol, color, size = 22 }: { symbol: IconName; color: ColorValue; size?: number }) {
  return <Icon name={symbol} size={size} color={String(color)} />;
}

type NavItem = { key: string; href: string; title: string; symbol: IconName; visible?: boolean };


/** One sidebar link. Extracted so the owner group renders identically. */
function NavLink({
  href, title, symbol, active, badge,
}: { href: string; title: string; symbol: IconName; active: boolean; badge?: number }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href as never)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={(state) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingVertical: 10,
          paddingHorizontal: space.sm,
          borderRadius: radius.md,
          backgroundColor: active ? t.accentSoft : state.pressed ? t.surfaceAlt : 'transparent',
          borderLeftWidth: 3,
          borderLeftColor: active ? t.accent : 'transparent',
          borderTopLeftRadius: 4,
          borderBottomLeftRadius: 4,
        },
      ]}>
      <Glyph symbol={symbol} color={active ? t.accent : t.textMuted} size={17} />
      <RNText style={{ flex: 1, fontSize: 14, fontWeight: active ? '700' : '500', color: active ? t.accentStrong : t.text }}>
        {title}
      </RNText>
      {badge ? <Badge tone="warn">{String(badge)}</Badge> : null}
    </Pressable>
  );
}


type OwnerItem = NavItem & { badge?: number };

/**
 * The owner-only links. Returns an empty list for everyone else, so a salesman
 * never sees a group of things they will only be refused at.
 *
 * The approvals count is carried as a badge because it is the one number in
 * this app that means "somebody is waiting on you".
 */
function useOwnerNav(): OwnerItem[] {
  const { can } = useSession();
  const { data } = useQuery<{ pending: number }>(
    "SELECT COUNT(*) AS pending FROM change_requests WHERE status = 'pending'");
  const pending = data?.[0]?.pending ?? 0;

  const out: OwnerItem[] = [];
  if (can('catalog.edit') || can('admin.settings') || can('admin.users')) {
    out.push({ key: 'admin', href: '/admin', title: 'Admin', symbol: 'options-outline' });
  }
  if (can('catalog.edit')) {
    out.push({ key: 'requests', href: '/requests', title: 'Requests', symbol: 'checkmark-done-outline', badge: pending || undefined });
  }
  if (can('admin.users')) {
    out.push({ key: 'staff', href: '/admin/users', title: 'Staff', symbol: 'people-outline' });
  }
  return out;
}

function useNavItems(): NavItem[] {
  const { permissions } = useSession();
  const sections = visibleSections(permissions);
  return [
    { key: 'index', href: '/', title: 'Ghar', symbol: 'home' },
    { key: 'search', href: '/search', title: 'Dhoondo', symbol: 'search' },
    { key: 'sell', href: '/sell', title: 'Bill', symbol: 'receipt-outline', visible: sections.sell },
    { key: 'stock', href: '/stock', title: 'Stock', symbol: 'cube-outline', visible: sections.stock },
    { key: 'more', href: '/more', title: 'Aur', symbol: 'ellipsis-horizontal' },
  ];
}

/** Left navigation rail shown on wide (desktop/tablet) layouts, replacing the bottom tab bar. */
function Sidebar() {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const status = useStatus();
  const { profile, session } = useSession();
  const items = useNavItems().filter((i) => i.visible !== false);
  const ownerNav = useOwnerNav();

  return (
    <SafeAreaView edges={['top', 'bottom', 'left']} style={{ backgroundColor: t.surface, borderRightWidth: 1, borderRightColor: t.border }}>
      <View style={{ width: 236, flex: 1, paddingVertical: space.lg, paddingHorizontal: space.md }}>
        <Row gap={space.sm} style={{ paddingHorizontal: space.sm, marginBottom: space.xl }}>
          {/* The mark itself, not the letters "AL" — the sidebar is the one
              place the brand sits on every screen all day. */}
          <View style={{ width: 34, height: 34, borderRadius: radius.md, backgroundColor: INK_TILE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Image source={require('../../../assets/images/splash-icon.png')} style={{ width: 23, height: 23 }} resizeMode="contain" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text variant="heading">AutoLoom</Text>
            <Text variant="small" color="textFaint" numberOfLines={1}>
              {TAGLINE}
            </Text>
          </View>
        </Row>

        <View style={{ gap: 2 }}>
          {items.map((item) => (
            <NavLink
              key={item.key}
              href={item.href}
              title={item.title}
              symbol={item.symbol}
              active={item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)}
            />
          ))}
        </View>

        {/* The owner's own controls, kept as a group of their own rather than
            buried two taps deep under "More" — staff, approvals and shop
            settings are the things only this person can do, and they were the
            hardest things in the app to find. */}
        {ownerNav.length > 0 ? (
          <>
            <RNText
              style={{
                marginTop: space.lg,
                marginBottom: 6,
                marginLeft: space.sm,
                fontSize: 10,
                letterSpacing: 1.4,
                fontWeight: '700',
                color: t.textFaint,
              }}>
              OWNER
            </RNText>
            <View style={{ gap: 2 }}>
              {ownerNav.map((item) => (
                <NavLink
                  key={item.key}
                  href={item.href}
                  title={item.title}
                  symbol={item.symbol}
                  active={pathname.startsWith(item.href)}
                  badge={item.badge}
                />
              ))}
            </View>
          </>
        ) : null}

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={() => router.push('/sync')}
          style={(state) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: space.sm, borderRadius: radius.md, opacity: state.pressed ? 0.7 : 1 }]}>
          <Text variant="small" color="textFaint">
            Sync
          </Text>
          <Badge tone={!status.connected ? 'warn' : status.dataFlowStatus.uploading ? 'info' : 'ok'} dot>
            {!status.connected ? 'Offline' : status.dataFlowStatus.uploading ? 'Syncing' : 'Synced'}
          </Badge>
        </Pressable>

        <Pressable
          onPress={() => router.push('/more')}
          style={(state) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius.md, marginTop: 4, backgroundColor: state.pressed ? t.surfaceAlt : 'transparent' }]}>
          <Avatar name={profile?.full_name ?? session?.user.email ?? '?'} size={32} />
          <View style={{ flex: 1 }}>
            <Text variant="small" numberOfLines={1}>
              {profile?.full_name ?? session?.user.email ?? 'Account'}
            </Text>
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const wide = useIsWide();
  const items = useNavItems();

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: wide
          ? { display: 'none' }
          : {
              backgroundColor: t.surface,
              borderTopColor: t.border,
              ...(Platform.OS === 'web' ? { height: 56 } : null),
            },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarItemStyle: { borderTopWidth: 2, borderTopColor: 'transparent' },
        tabBarActiveBackgroundColor: 'transparent',
      }}>
      {items.map((item) => (
        <Tabs.Screen
          key={item.key}
          name={item.key}
          options={{
            title: item.title,
            href: item.visible === false ? null : undefined,
            tabBarIcon: ({ color }) => <Glyph symbol={item.symbol} color={color} />,
          }}
        />
      ))}

      {/* Admin and the approval queue live inside the tab group so the sidebar
          stays put when you open them — as stack routes they replaced the whole
          frame with a back arrow, which is what made them feel buried. They are
          hidden from the tab bar itself (`href: null`) because a phone does not
          need a sixth tab; the sidebar reaches them on a wide screen and "More"
          reaches them on a narrow one. */}
      <Tabs.Screen name="admin" options={{ href: null, title: 'Admin' }} />
      <Tabs.Screen name="requests" options={{ href: null, title: 'Requests' }} />
    </Tabs>
  );

  if (!wide) return tabs;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg }}>
      <Sidebar />
      <View style={{ flex: 1 }}>{tabs}</View>
    </View>
  );
}
