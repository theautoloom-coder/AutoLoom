import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, Pressable, Text as RNText, useColorScheme, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { ensureDailyPendingReminder } from '@/lib/daily-reminder';
import { setupPwa } from '@/lib/pwa';
import { describeRejection, onSyncRejected } from '@/lib/sync-events';
import { SessionProvider, useSession } from '@/lib/session';
import { SystemProvider } from '@/lib/system';
import { Loading, useTheme } from '@/ui';
import { showToast } from '@/ui/toast';
import { palette } from '@/ui/theme';
import { useAppFonts } from '@/ui/fonts';
import { AnimatedSplash } from '@/ui/splash';
import { InstallPrompt } from '@/ui/install-prompt';
import { ToastHost } from '@/ui/toast';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Installable web build: manifest, iOS home-screen tags, offline shell.
setupPwa();

/** Sends signed-out users to the sign-in screen and signed-in users away from it. */
/** The one control the stack header carries. See screenOptions for why. */
function BackHome() {
  const router = useRouter();
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Peeche jao"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={(s) => [{
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingVertical: 8, paddingRight: 14,
        opacity: s.pressed ? 0.6 : 1,
      }]}>
      <RNText style={{ color: t.text, fontSize: 22, lineHeight: 24, marginTop: -2 }}>‹</RNText>
      <RNText style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>Peeche</RNText>
    </Pressable>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, session } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync().catch(() => {});
    const onSignIn = segments[0] === 'sign-in';
    // The password-recovery link arrives with its own short-lived session, but
    // it can land a moment before that session is parsed out of the URL. Let
    // the screen stand either way, or the reset bounces to sign-in and the
    // link is spent for nothing.
    const onReset = segments[0] === 'reset-password';
    if (!session && !onSignIn && !onReset) router.replace('/sign-in');
    if (session && onSignIn) router.replace('/');
  }, [loading, session, segments, router]);

  // A refused entry is announced by the connector; this is where it becomes
  // something the person can see. It stays up longer than an ordinary toast
  // because it is the one message here that means work was lost.
  useEffect(() => onSyncRejected((r) => showToast(describeRejection(r), 'danger')), []);

  // Once signed in, make sure the 6:30pm "check pending payments" reminder
  // is scheduled on this device. Idempotent, so this is cheap on every launch.
  useEffect(() => {
    if (session) ensureDailyPendingReminder().catch(() => {});
  }, [session]);

  // Tapping the reminder notification opens the Reminders screen.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const N = require('expo-notifications') as typeof import('expo-notifications');
    const sub = N.addNotificationResponseReceivedListener((res) => {
      const url = res.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    });
    return () => sub.remove();
  }, [router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  // The native splash hands over to the animated one. The app mounts
  // underneath while the louvres play, so when the sheet lifts the first
  // screen is already painted — no second flash of loading.
  const [splashDone, setSplashDone] = React.useState(false);
  // Hold the tree until the type is ready — the splash is already covering,
  // so nothing flashes in a fallback face first.
  const fontsReady = useAppFonts();
  const p = scheme === 'dark' ? palette.dark : palette.light;
  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: p.bg,
      card: p.surface,
      text: p.text,
      border: p.border,
      primary: p.accent,
    },
  };

  if (!fontsReady) return null;

  return (
    // Every text field in the app sits inside a scroll view that has to get
    // out of the keyboard's way. Android 16 draws edge-to-edge, where the
    // window is never resized and the stock KeyboardAvoidingView does nothing
    // at all — the password box just sits behind the keys. This provider feeds
    // the real keyboard frame to every KeyboardAwareScrollView below it.
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <SystemProvider>
        <SessionProvider>
          <ThemeProvider value={navTheme}>
            <AuthGate>
              <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: p.surface },
                  headerTintColor: p.text,
                  headerTitleStyle: { fontWeight: '600' },
                  headerShadowVisible: false,
                  // Every screen already renders its own in-page heading, so the
                  // header carries no title — but with the title gone AND the
                  // back arrow minimal, a screen opened without history showed
                  // a 130px band of blank white and no way out at all. On the
                  // web that is every screen reached by link or reload, which
                  // is to say Kharcha Likho, Bill Banao and every other place
                  // money is entered.
                  //
                  // So the header carries one thing, always: the way back. It
                  // goes to the previous screen when there is one and to Ghar
                  // when there is not, because a dead end is worse than a
                  // slightly wrong destination.
                  headerTitle: () => null,
                  headerLeft: () => <BackHome />,
                  contentStyle: { backgroundColor: p.bg },
                }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="sign-in" options={{ headerShown: false }} />
                <Stack.Screen name="reset-password" options={{ headerShown: false }} />
                <Stack.Screen name="product/[id]" options={{ title: 'Item' }} />
                <Stack.Screen name="vehicle/[id]" options={{ title: 'Gaadi' }} />
                <Stack.Screen name="customer/[id]" options={{ title: 'Grahak' }} />
                <Stack.Screen name="customer/edit" options={{ title: 'Grahak' }} />
                <Stack.Screen name="customers" options={{ title: 'Grahak' }} />
                <Stack.Screen name="suppliers" options={{ title: 'Supplier' }} />
                <Stack.Screen name="supplier/[id]" options={{ title: 'Supplier' }} />
                <Stack.Screen name="supplier/edit" options={{ title: 'Supplier' }} />
                <Stack.Screen name="admin/item" options={{ title: 'Item' }} />
                <Stack.Screen name="admin/products" options={{ title: 'Saara maal' }} />
                <Stack.Screen name="admin/masters" options={{ title: 'Master data' }} />
                <Stack.Screen name="admin/settings" options={{ title: 'Dukan settings' }} />
                <Stack.Screen name="admin/users" options={{ title: 'Staff aur role' }} />
                <Stack.Screen name="admin/import" options={{ title: 'Import' }} />
                <Stack.Screen name="purchases" options={{ title: 'Supplier se aaya maal' }} />
                <Stack.Screen name="purchase/edit" options={{ title: 'Maal aaya' }} />
                <Stack.Screen name="purchase/approve" options={{ title: 'Approval' }} />
                <Stack.Screen name="purchase/[id]" options={{ title: 'Maal' }} />
                <Stack.Screen name="transfer/[id]" options={{ title: 'Maal ki jagah badli' }} />
                <Stack.Screen name="adjustments" options={{ title: 'Stock sudhaara' }} />
                <Stack.Screen name="adjustment/edit" options={{ title: 'Stock sudhaaro' }} />
                <Stack.Screen name="adjustment/[id]" options={{ title: 'Stock sudhaara' }} />
                <Stack.Screen name="stock/add" options={{ title: 'Stock Chadhao' }} />
                <Stack.Screen name="kharab-maal" options={{ title: 'Kharab Likho' }} />
                <Stack.Screen name="kharab" options={{ title: 'Kharab maal' }} />
                <Stack.Screen name="stock-check" options={{ title: 'Ginti Karo' }} />
                <Stack.Screen name="expenses" options={{ title: 'Kharcha Likho' }} />
                <Stack.Screen name="partner-paisa" options={{ title: 'Partner ka paisa' }} />
                <Stack.Screen name="reports" options={{ title: 'Report' }} />
                <Stack.Screen name="stock/ledger/[id]" options={{ title: 'Stock ka hisaab' }} />
                <Stack.Screen name="payments" options={{ title: 'Paisa aaya, paisa diya' }} />
                <Stack.Screen name="payment/edit" options={{ title: 'Payment' }} />
                <Stack.Screen name="invoice/edit" options={{ title: 'Bill Banao' }} />
                <Stack.Screen name="invoice/[id]" options={{ title: 'Bill' }} />
                <Stack.Screen name="reorder" options={{ title: 'Kya mangwana hai' }} />
                <Stack.Screen name="reminders" options={{ title: 'Yaad dilao' }} />
                <Stack.Screen name="help" options={{ title: 'Kaise chalayein' }} />
                <Stack.Screen name="sync" options={{ title: 'Sync ka haal', presentation: 'modal' }} />
              </Stack>
              <ToastHost />
              <InstallPrompt />
            </AuthGate>
            {splashDone ? null : <AnimatedSplash onDone={() => setSplashDone(true)} />}
          </ThemeProvider>
        </SessionProvider>
      </SystemProvider>
    </KeyboardProvider>
  );
}
