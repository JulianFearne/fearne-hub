/* public/sw.js
   Fearne Hub service worker. Runtime caching only, so it never needs to know the
   hashed Vite bundle names in advance.

   - Navigations: network-first, falling back to the cached index.html when
     offline (this is what makes React Router routes work with no signal).
   - Static assets: cache-first, populated on demand. Vite's hashed filenames
     mean a new deploy fetches new files (cache miss -> network) automatically.
   - Cross-origin requests (Supabase REST/realtime, Google Fonts CDN) are left
     completely alone.

   IMPORTANT: bump CACHE_VERSION on every deploy. The activate step deletes old
   caches, which clears any stale bundles from a previous release. */

const CACHE_VERSION = 'fearne-hub-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin requests. Supabase and font CDNs pass straight through.
  if (url.origin !== self.location.origin) return;

  // App navigations: network-first with an offline fallback to index.html.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_VERSION);
          cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          const cached = await cache.match('/index.html');
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first, fill the cache on a miss.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200 && fresh.type === 'basic') {
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});

// Web Push: shows a notification for whatever JSON payload the `notify`
// Edge Function sent ({ title, body, url }), and routes a click on it to
// that url in an existing tab if one's open, else a new one.
self.addEventListener('push', (event) => {
  let payload = { title: 'Fearne Hub', body: '' };
  try {
    payload = event.data ? event.data.json() : payload;
  } catch {
    payload.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Fearne Hub', {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(url);
        existing.focus();
      } else {
        self.clients.openWindow(url);
      }
    })(),
  );
});
