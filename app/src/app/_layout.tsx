import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { ensureDailyPendingReminder } from '@/lib/daily-reminder';
import { setupPwa } from '@/lib/pwa';
import { SessionProvider, useSession } from '@/lib/session';
import { SystemProvider } from '@/lib/system';
import { Loading, useTheme } from '@/ui';
import { palette } from '@/ui/theme';
import { useAppFonts } from '@/ui/fonts';
import { AnimatedSplash } from '@/ui/splash';
import { InstallPrompt } from '@/ui/install-prompt';
import { ToastHost } from '@/ui/toast';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Installable web build: manifest, iOS home-screen tags, offline shell.
setupPwa();

/** Sends signed-out users to the sign-in screen and signed-in users away from it. */
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
                  // native header stays as a slim bar for the back affordance
                  // only — no redundant duplicate title text underneath it.
                  headerTitle: () => null,
                  headerBackButtonDisplayMode: 'minimal',
                  contentStyle: { backgroundColor: p.bg },
                }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="sign-in" options={{ headerShown: false }} />
                <Stack.Screen name="reset-password" options={{ headerShown: false }} />
                <Stack.Screen name="vehicle/[id]" options={{ title: 'Vehicle' }} />
                <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
                <Stack.Screen name="customer/[id]" options={{ title: 'Customer' }} />
                <Stack.Screen name="customer/edit" options={{ title: 'Customer' }} />
                <Stack.Screen name="customers" options={{ title: 'Customers' }} />
                <Stack.Screen name="suppliers" options={{ title: 'Suppliers' }} />
                <Stack.Screen name="supplier/[id]" options={{ title: 'Supplier' }} />
                <Stack.Screen name="supplier/edit" options={{ title: 'Supplier' }} />
                <Stack.Screen name="admin/index" options={{ title: 'Admin' }} />
                <Stack.Screen name="admin/item" options={{ title: 'Item' }} />
                <Stack.Screen name="admin/products" options={{ title: 'Products' }} />
                <Stack.Screen name="admin/product/[id]" options={{ title: 'Product' }} />
                <Stack.Screen name="admin/families" options={{ title: 'Product families' }} />
                <Stack.Screen name="admin/family/[id]" options={{ title: 'Family' }} />
                <Stack.Screen name="admin/spec/[id]" options={{ title: 'Specification' }} />
                <Stack.Screen name="admin/vehicles" options={{ title: 'Vehicle master' }} />
                <Stack.Screen name="admin/vehicle/[id]" options={{ title: 'Model' }} />
                <Stack.Screen name="admin/masters" options={{ title: 'Master data' }} />
                <Stack.Screen name="admin/settings" options={{ title: 'Company settings' }} />
                <Stack.Screen name="admin/users" options={{ title: 'Users & roles' }} />
                <Stack.Screen name="admin/import" options={{ title: 'Import' }} />
                <Stack.Screen name="purchases" options={{ title: 'Purchases' }} />
                <Stack.Screen name="purchase/edit" options={{ title: 'Purchase' }} />
                <Stack.Screen name="purchase/[id]" options={{ title: 'Purchase' }} />
                <Stack.Screen name="transfers" options={{ title: 'Transfers' }} />
                <Stack.Screen name="transfer/edit" options={{ title: 'Transfer' }} />
                <Stack.Screen name="transfer/[id]" options={{ title: 'Transfer' }} />
                <Stack.Screen name="adjustments" options={{ title: 'Adjustments' }} />
                <Stack.Screen name="adjustment/edit" options={{ title: 'Adjustment' }} />
                <Stack.Screen name="adjustment/[id]" options={{ title: 'Adjustment' }} />
                <Stack.Screen name="audits" options={{ title: 'Stock audits' }} />
                <Stack.Screen name="audit/[id]" options={{ title: 'Count sheet' }} />
                <Stack.Screen name="stock/add" options={{ title: 'Maal aaya' }} />
              <Stack.Screen name="stock/ledger/[id]" options={{ title: 'Stock ledger' }} />
                <Stack.Screen name="payments" options={{ title: 'Payments' }} />
                <Stack.Screen name="payment/edit" options={{ title: 'Payment' }} />
                <Stack.Screen name="invoice/edit" options={{ title: 'Invoice' }} />
                <Stack.Screen name="invoice/[id]" options={{ title: 'Invoice' }} />
                <Stack.Screen name="reports" options={{ title: 'Reports' }} />
                <Stack.Screen name="job-cards" options={{ title: 'Job cards' }} />
                <Stack.Screen name="job-card/edit" options={{ title: 'Job card' }} />
                <Stack.Screen name="job-card/[id]" options={{ title: 'Job card' }} />
                <Stack.Screen name="reorder" options={{ title: 'Reorder' }} />
                <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
                <Stack.Screen name="sync" options={{ title: 'Sync status', presentation: 'modal' }} />
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
