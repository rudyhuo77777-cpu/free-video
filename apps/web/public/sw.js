const CACHE = 'free-video-shell-v0.3.1-lite';
const SHELL = ['/manifest.webmanifest', '/icon.svg'];
const IS_LOCALHOST = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

self.addEventListener('install', event => {
  // Local demo must always execute the current source. Never pre-cache the app shell on localhost.
  event.waitUntil(IS_LOCALHOST ? Promise.resolve() : caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('auria-shell-') && k !== CACHE).map(k => caches.delete(k))))
  ]));
});

function isCacheableSameOrigin(req) {
  if (req.method !== 'GET') return false;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/_next/image')) return false;
  const dest = req.destination;
  return dest === 'document' || dest === 'script' || dest === 'style' || dest === 'font' || dest === 'image' || url.pathname === '/manifest.webmanifest';
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (!isCacheableSameOrigin(req)) return;

  // Critical demo rule: localhost is always network-only. This prevents a prior release's
  // cached Next.js chunks from masking newly shipped source such as the trilingual switch.
  if (IS_LOCALHOST) {
    event.respondWith(fetch(req));
    return;
  }

  // Production documents/scripts/styles are network-first; images/fonts can remain cache-first.
  if (req.destination === 'document' || req.destination === 'script' || req.destination === 'style') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(cache => cache.put(req, res.clone())).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || (req.destination === 'document' ? caches.match('/') : undefined)))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') caches.open(CACHE).then(cache => cache.put(req, res.clone())).catch(() => undefined);
      return res;
    }))
  );
});
