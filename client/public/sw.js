/* DhanFunded — Service Worker
 * Provides:
 *  - Offline shell (cached HTML + favicon + manifest)
 *  - Stale-while-revalidate for built JS/CSS/images (instant reloads)
 *  - Network-only for /api requests (always fresh trading data)
 *  - Auto-update on new deploys via skipWaiting + clients.claim
 */
const CACHE_VERSION = 'df-v1';  // bumped for the DhanFunded rebrand — drops the old shell
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
// Deliberately NOT version-prefixed: the charting library is 27 MB across 1707
// content-hashed bundles, so re-downloading it on every SW release is exactly
// the "chart loads slowly every time" problem. Hashed filenames make stale
// entries harmless — a changed bundle is simply a new URL.
const TV_CACHE = 'pf-tradingview-v1';

const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION) && k !== TV_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip cross-origin (Google fonts, gstatic, charting library CDN, etc.)
  if (url.origin !== self.location.origin) return;

  // Never cache API calls — always hit network for live data.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  // TradingView charting library → cache-first, never revalidated.
  // Every file under here is content-hashed and served immutable, so once a
  // bundle is in the cache it can be returned straight from disk. This is what
  // makes the chart open instantly instead of pulling megabytes off the network
  // on every visit.
  if (url.pathname.startsWith('/charting_library/')) {
    event.respondWith(
      caches.open(TV_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        // Only store complete 200s — a opaque/partial response cached here
        // would break the chart until the cache is cleared.
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      })
    );
    return;
  }

  // Navigation requests → network-first, fallback to cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(req)))
    );
    return;
  }

  // Static assets → stale-while-revalidate.
  if (/\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});

// Allow page to trigger immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
