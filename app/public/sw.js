/**
 * Service worker — app shell only.
 *
 * The business data is already offline: PowerSync keeps the whole khata in
 * SQLite in the browser. What was still online-only was the shell itself —
 * the HTML and the JS bundle — so a counter phone with no signal got a blank
 * page even though all its data was sitting right there. This fixes that and
 * nothing else; it deliberately never touches Supabase or PowerSync traffic,
 * which must always hit the network and must never be served stale.
 */
const CACHE = 'autoloom-shell-v1';
const SHELL = ['/', '/manifest.json', '/apple-touch-icon.png', '/pwa-192.png', '/pwa-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache the backends. Sync and auth have to see the real network,
  // and a stale token or checkpoint is worse than being offline.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/auth/') || url.pathname.includes('powersync')) return;

  // Navigations: network first so a deploy is picked up, cache as the
  // fallback so no-signal still opens the app.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r ?? Response.error()))
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const live = fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit ?? live;
    })
  );
});
