/**
 * Makes the web build installable, on iOS in particular.
 *
 * iOS is PWA-only for this product — no App Store build — so "Add to Home
 * Screen" is the whole iPhone story and it has to behave like an app:
 * full-screen, right icon, and opening with no signal.
 *
 * Like the fonts, these tags cannot live in `+html.tsx`, because
 * `web.output: "single"` makes Expo Router serve its own fixed template. They
 * are injected once at startup instead. Safari reads the apple-* tags rather
 * than the manifest for the icon and the status bar, so both are set.
 */
import { Platform } from 'react-native';

let done = false;

export function setupPwa(): void {
  if (done || Platform.OS !== 'web' || typeof document === 'undefined') return;
  done = true;

  const head = document.head;
  const add = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
    const key = attrs.rel ?? attrs.name;
    if (key && head.querySelector(`${tag}[${attrs.rel ? 'rel' : 'name'}="${key}"]`)) return;
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    head.appendChild(el);
  };

  add('link', { rel: 'manifest', href: '/manifest.json' });
  add('link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'AutoLoom' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'theme-color', content: '#0B0D10' });

  // The shell cache. Data is already offline via PowerSync; this is what
  // stops a no-signal phone getting a blank page. Failure is non-fatal —
  // the app runs fine without it, just online-only for the first load.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}
