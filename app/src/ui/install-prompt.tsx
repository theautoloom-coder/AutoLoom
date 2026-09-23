/**
 * "Phone par laga lo" — the nudge, shown once, in the browser only.
 *
 * Staff will happily use the site in a browser tab for months and never learn
 * the app exists, which costs them the two things that matter most: it working
 * with no signal, and opening from the home screen instead of being hunted for
 * in twenty tabs. So the app says so itself, rather than relying on somebody
 * remembering to send the install link.
 *
 * Three rules keep it from being an annoyance:
 *   · never when it is already installed — `display-mode: standalone` is true
 *     inside the installed PWA and inside the APK's web view
 *   · never on a desktop, where there is nothing to install and the browser is
 *     the right place to be
 *   · once. Dismissed is remembered, and it does not come back.
 *
 * iOS and Android get different words because they need different actions:
 * Android installs an APK, iPhone uses Share → Add to Home Screen, which only
 * Safari can do.
 */
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Row, Text, useTheme } from './index';
import { radius, space } from './theme';

const KEY = 'autoloom.install-prompt.dismissed';

type Kind = 'android' | 'ios' | null;

function detect(): Kind {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return null;

  // Already installed: the PWA and the APK's web view both report standalone.
  const standalone =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return null;

  const ua = navigator.userAgent || '';
  if (/Android/.test(ua)) return 'android';
  // iPadOS 13+ claims to be a Mac; the touch points give it away.
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    ((navigator as { platform?: string }).platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  return iOS ? 'ios' : null;
}

export function InstallPrompt() {
  const t = useTheme();
  const [kind, setKind] = useState<Kind>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      // Private mode or blocked storage: show it, and it simply will not be
      // remembered. Better than never showing it at all.
    }
    setKind(detect());
  }, []);

  if (!kind) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* nothing to do */ }
    setKind(null);
  };

  const open = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* nothing to do */ }
    if (typeof window !== 'undefined') window.location.href = '/install';
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: space.md,
        right: space.md,
        bottom: space.md,
        backgroundColor: t.surface,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderColor: t.keyline,
        padding: space.md,
        gap: 4,
        // Above the tab bar and every screen, below a modal.
        zIndex: 90,
        shadowColor: '#0B0D10',
        shadowOffset: { width: 3, height: 3 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 6,
      }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.sm}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="rowTitle">
            {kind === 'android' ? 'Phone par app laga lo' : 'Home screen par laga lo'}
          </Text>
          <Text variant="small" color="textMuted">
            {kind === 'android'
              ? 'Signal na ho tab bhi chalegi, aur har baar browser kholna nahi padega.'
              : 'Share ▸ Add to Home Screen. Poori screen mein khulegi, signal ke bina bhi.'}
          </Text>
        </View>
        <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Band karo" hitSlop={12}>
          <Text variant="small" color="textFaint">✕</Text>
        </Pressable>
      </Row>

      <Row gap={space.sm} style={{ marginTop: 6 }}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          style={({ pressed }) => [{
            backgroundColor: t.accent,
            paddingVertical: 9,
            paddingHorizontal: 18,
            borderRadius: radius.pill,
            opacity: pressed ? 0.9 : 1,
          }]}>
          <Text style={{ color: t.accentText, fontWeight: '700' }}>
            {kind === 'android' ? 'Kaise lagayein' : 'Tareeka dekho'}
          </Text>
        </Pressable>
        <Pressable onPress={dismiss} accessibilityRole="button" style={{ paddingVertical: 9, paddingHorizontal: 12 }}>
          <Text variant="small" color="textMuted">Abhi nahi</Text>
        </Pressable>
      </Row>
    </View>
  );
}
