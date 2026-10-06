// Anima service worker.
// - Geometry, search data and built JS/CSS have content hashes in their names, so they are
//   served cache-first and never revalidated.
// - The page and models/manifest.json are network-first, falling back to the cache offline.
// - After a deploy the app posts the list of current asset URLs; anything else is deleted.
const IMMUTABLE = 'anima-immutable-v1';
const SHELL = 'anima-shell-v1';
const scope = new URL(self.registration.scope).pathname;

const isImmutable = path =>
  /\.[0-9a-f]{10}\.(bin\.gz|json)$/.test(path) || (path.startsWith(scope + 'assets/') && /-[\w-]{8}\.(js|css)$/.test(path));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (![IMMUTABLE, SHELL].includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(scope)) return;

  if (isImmutable(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMMUTABLE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  if (request.mode === 'navigate' || url.pathname.endsWith('/models/manifest.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const hit = await cache.match(request, {ignoreSearch: true});
        if (hit) return hit;
        throw error;
      }
    })());
  }
});

// Sync with the current build: cache listed files that are missing (on a first visit they
// were fetched before this worker took control, so they usually come from the HTTP cache)
// and delete geometry or data files that the current build no longer references.
self.addEventListener('message', event => {
  if (event.data?.type !== 'sync' || !Array.isArray(event.data.keep)) return;
  const keep = new Set(event.data.keep.map(u => new URL(u, self.registration.scope).href));
  event.waitUntil((async () => {
    const cache = await caches.open(IMMUTABLE);
    const cached = new Set((await cache.keys()).map(r => r.url));
    for (const url of cached) {
      // Built JS/CSS are not listed in the manifest; only prune geometry and data.
      if (new URL(url).pathname.includes('/models/') && !keep.has(url)) await cache.delete(url);
    }
    for (const url of keep) {
      if (cached.has(url)) continue;
      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch { /* Offline or interrupted; try again on the next visit. */ }
    }
    // The page and manifest are network-first, so store the current copies for offline use.
    const shell = await caches.open(SHELL);
    for (const url of event.data.shell ?? []) {
      if (await shell.match(url)) continue;
      try {
        const response = await fetch(url);
        if (response.ok) await shell.put(url, response);
      } catch { /* As above. */ }
    }
  })());
});
