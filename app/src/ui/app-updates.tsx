/**
 * Over-the-air updates (owner, 7 Oct 2026: "apk dynamic banado — bar bar
 * change na karni pade").
 *
 * The APK carries the native layer; the app itself — every screen, rule and
 * word — comes from EAS Update, published with `node scripts/ship-update.mjs`.
 * A phone checks when the app opens and whenever it comes back to the front
 * (at most every 15 minutes), downloads a new version in the background, and
 * offers it. Nobody is pulled out of a half-written bill: if the button is not
 * pressed, the new version simply starts on the next launch.
 *
 * A new APK is needed only when the native layer changes (a new native module,
 * a permission, an Expo SDK upgrade) — then app.json's runtimeVersion goes up
 * and older APKs stop receiving updates meant for the new one.
 */
import * as Updates from 'expo-updates';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, View } from 'react-native';

import { Text, useTheme } from './index';
import { radius, space } from './theme';

const EVERY_MS = 15 * 60 * 1000;

export function AppUpdates() {
  const t = useTheme();
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    if (Platform.OS === 'web' || !Updates.isEnabled || __DEV__) return;
    if (Date.now() - lastCheck.current < EVERY_MS) return;
    lastCheck.current = Date.now();
    try {
      const found = await Updates.checkForUpdateAsync();
      if (!found.isAvailable) return;
      const got = await Updates.fetchUpdateAsync();
      if (got.isNew) setReady(true);
    } catch {
      // Offline or the update server is unreachable: the app keeps running
      // the version it has, and tries again next time it comes to the front.
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [check]);

  if (!ready) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: space.md, right: space.md, top: space.xxl + space.md }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md,
        borderRadius: radius.lg, backgroundColor: t.navy,
      }}>
        <Text style={{ flex: 1 }} color="navyText">Naya version aa gaya.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={async () => { setApplying(true); try { await Updates.reloadAsync(); } catch { setApplying(false); } }}
          style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: t.accent, opacity: pressed || applying ? 0.7 : 1 })}>
          <Text style={{ fontWeight: '700', color: '#FFFFFF' }}>{applying ? 'Lag raha hai…' : 'Abhi lagao'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Baad mein" onPress={() => setReady(false)} hitSlop={10}>
          <Text color="navyText">✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** "1.0.0 · update 7 Oct, 4:30 pm" — which version this phone is running. */
export function runningVersion(appVersion: string): string {
  if (Platform.OS === 'web') return `web · ${appVersion}`;
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return `${appVersion} · APK wala`;
  return `${appVersion} · update ${Updates.createdAt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`;
}
