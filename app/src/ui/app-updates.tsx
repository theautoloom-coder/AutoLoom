/**
 * Over-the-air updates (owner, 7 Oct 2026: "apk dynamic banado — bar bar
 * change na karni pade"), made compulsory (8 Oct 2026: "app ko force update
 * laga sakte hai?").
 *
 * The APK carries the native layer; the app itself — every screen, rule and
 * word — comes from EAS Update, published with `node scripts/ship-update.mjs`.
 *
 *   · Opening the app: the newest version is fetched and put on before
 *     anything else, behind a "Naya version lag raha hai…" screen. With no
 *     signal it gives up after a few seconds and opens what it has.
 *   · Coming back to the app after a while away (2 min+): the same — nobody
 *     is mid-bill after a break, and a phone left open all day still updates.
 *   · Back within 2 minutes (a photo taken, WhatsApp opened from a bill): it
 *     is never pulled out from under the person. A banner with no ✕ says a
 *     new version is waiting; it goes on with "Abhi lagao" or at the next
 *     break.
 *
 * The web app follows the same rules (8 Oct 2026): a tab compares the build it
 * runs with the one the server serves, on return and every 5 minutes.
 *
 * A new APK is needed only when the native layer changes (a new native module,
 * a permission, an Expo SDK upgrade); app.json's runtimeVersion then goes up
 * and older APKs stop receiving updates. To stop those older APKs being used,
 * set app_settings 'min_runtime_version' to the new runtime: a phone below it
 * shows only "Nayi APK chahiye" with the download button. That screen is in
 * this JS, which every APK already has — so it reaches them before the cut.
 */
import { useQuery } from '@powersync/react';
import * as Updates from 'expo-updates';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, View } from 'react-native';

import { Text, useTheme } from './index';
import { radius, space } from './theme';

/** How long opening the app waits for a new version before giving up. */
const LAUNCH_WAIT_MS = 8000;
/** Away at least this long and the update goes on when the app is back. */
const AWAY_MS = 2 * 60 * 1000;
/** Back sooner than that: check at most this often. */
const RECHECK_MS = 5 * 60 * 1000;
const APK_URL = 'https://app.theautoloom.in/download/autoloom.apk';

const otaOn = () => Platform.OS !== 'web' && Updates.isEnabled && !__DEV__;

/** Fetch a newer version if there is one. True when one is downloaded. */
async function fetchNewer(): Promise<boolean> {
  const found = await Updates.checkForUpdateAsync();
  if (!found.isAvailable) return false;
  const got = await Updates.fetchUpdateAsync();
  return got.isNew;
}

export function AppUpdates() {
  const t = useTheme();
  // 'checking' covers the app while opening; 'applying' while it restarts.
  const [cover, setCover] = useState<null | 'checking' | 'applying'>(otaOn() ? 'checking' : null);
  const [waiting, setWaiting] = useState(false);
  const lastCheck = useRef(0);
  const awaySince = useRef<number | null>(null);

  const apply = useCallback(async () => {
    setCover('applying');
    if (Platform.OS === 'web') { window.location.reload(); return; }
    try { await Updates.reloadAsync(); } catch { setCover(null); setWaiting(true); }
  }, []);

  // The web app: a tab left open keeps running the code it opened with. On
  // 8 Oct one open since the day before ran an old kism form and its save
  // wiped every spec and car of an item. So the tab asks the server which
  // build is live — on return to it, and every 5 minutes — and takes the new
  // one by the same rules as a phone: at once after a while away, otherwise a
  // banner that stays until it is taken.
  useEffect(() => {
    if (Platform.OS !== 'web' || __DEV__ || typeof document === 'undefined') return;
    const mine = Array.from(document.scripts).map((s) => s.src.match(/entry-[0-9a-f]+\.js/)?.[0]).find(Boolean);
    if (!mine) return;
    let hiddenSince: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
    const check = async (takeNow: boolean) => {
      try {
        const html = await (await fetch(`/?fresh=${Date.now()}`, { cache: 'no-store' })).text();
        const live = html.match(/entry-[0-9a-f]+\.js/)?.[0];
        if (!live || live === mine) return;
        // One reload per build: if a cache still hands back the old page,
        // say so with the banner instead of reloading round and round.
        let tried = false;
        try { tried = sessionStorage.getItem('autoloom-reloaded-for') === live; } catch { /* private window */ }
        if (takeNow && !tried) {
          try { sessionStorage.setItem('autoloom-reloaded-for', live); } catch { /* private window */ }
          window.location.reload();
        } else {
          setWaiting(true);
        }
      } catch {
        // No signal: keep going on what is open.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'hidden') { hiddenSince = Date.now(); return; }
      const long = hiddenSince != null && Date.now() - hiddenSince >= AWAY_MS;
      hiddenSince = null;
      check(long);
    };
    const timer = setInterval(() => {
      check(hiddenSince != null && Date.now() - hiddenSince >= AWAY_MS);
    }, RECHECK_MS);
    document.addEventListener('visibilitychange', onVisible);
    check(true);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // Opening the app: put the newest version on first.
  useEffect(() => {
    if (!otaOn()) return;
    let late = false;
    lastCheck.current = Date.now();
    const giveUp = setTimeout(() => { late = true; setCover(null); }, LAUNCH_WAIT_MS);
    fetchNewer()
      .then((isNew) => {
        clearTimeout(giveUp);
        if (!isNew) { setCover(null); return; }
        // Arrived after the app had opened: the person is already working.
        if (late) setWaiting(true); else apply();
      })
      .catch(() => { clearTimeout(giveUp); setCover(null); });
    return () => clearTimeout(giveUp);
  }, [apply]);

  // Back to the app.
  useEffect(() => {
    if (!otaOn()) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') { if (awaySince.current == null) awaySince.current = Date.now(); return; }
      const away = awaySince.current ? Date.now() - awaySince.current : 0;
      awaySince.current = null;
      const long = away >= AWAY_MS;
      if (waiting) { if (long) apply(); return; }
      if (!long && Date.now() - lastCheck.current < RECHECK_MS) return;
      lastCheck.current = Date.now();
      if (long) setCover('checking');
      fetchNewer()
        .then((isNew) => { if (isNew && long) apply(); else { setCover(null); if (isNew) setWaiting(true); } })
        .catch(() => setCover(null));
    });
    return () => sub.remove();
  }, [apply, waiting]);

  // An APK too old for the app the shop now runs.
  const { data: minRows } = useQuery<{ value: string }>("SELECT value FROM app_settings WHERE id = 'min_runtime_version'");
  const min = (() => { const v = minRows?.[0]?.value; if (!v) return null; try { return String(JSON.parse(v)); } catch { return v; } })();
  const tooOld = Platform.OS !== 'web' && !!min && !!Updates.runtimeVersion && Number(Updates.runtimeVersion) < Number(min);

  if (tooOld) {
    return (
      <Cover>
        <Text variant="title" style={{ textAlign: 'center' }}>Nayi APK chahiye</Text>
        <Text color="textMuted" style={{ textAlign: 'center' }}>
          Ye APK purani ho gayi hai. Nayi APK download karke install karo — aapka saara data waisa hi rahega.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => Linking.openURL(APK_URL)}
          style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 22, borderRadius: radius.md, backgroundColor: t.accent, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontWeight: '700', color: '#FFFFFF' }}>Nayi APK download karo</Text>
        </Pressable>
      </Cover>
    );
  }

  if (cover) {
    return (
      <Cover>
        <Text variant="title" style={{ textAlign: 'center' }}>{cover === 'applying' ? 'Naya version lag raha hai…' : 'Naya version dekh rahe hain…'}</Text>
        <Text color="textMuted" style={{ textAlign: 'center' }}>Bas kuch second.</Text>
      </Cover>
    );
  }

  if (!waiting) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: space.md, right: space.md, top: space.xxl + space.md }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md,
        borderRadius: radius.lg, backgroundColor: t.navy,
      }}>
        <Text style={{ flex: 1 }} color="navyText">Naya version aa gaya — kaam save karke lagao.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={apply}
          style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: t.accent, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontWeight: '700', color: '#FFFFFF' }}>Abhi lagao</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A full screen over the app: nothing behind it can be tapped. */
function Cover({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg,
      alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl,
    }}>
      {children}
    </View>
  );
}

/** "1.0.0 · update 7 Oct, 4:30 pm" — which version this phone is running. */
export function runningVersion(appVersion: string): string {
  if (Platform.OS === 'web') return `web · ${appVersion}`;
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return `${appVersion} · APK wala`;
  return `${appVersion} · update ${Updates.createdAt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`;
}
