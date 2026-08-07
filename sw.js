'use strict';
/* Spotter service worker — cache-first so the app works fully offline.
   Bump VERSION on every deploy; clients show an "Update ready" toast.

   Two caches:
   - shell (versioned): the ~60 KB of HTML/CSS/JS — re-fetched on update
   - img (persistent): 5+ MB of demo photos that never change — survives
     updates, so a deploy costs kilobytes, not megabytes. Photos are filled
     in the background after activation and pruned when dropped from the
     manifest. */

importScripts('./precache-manifest.js');

const VERSION = 'v3.9.0';
const SHELL_CACHE = 'spotter-shell-' + VERSION;
const IMG_CACHE = 'spotter-img-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './rehab.js',
  './precache-manifest.js',
  './exercise-info.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

const IMGS = typeof IMG_ASSETS !== 'undefined' ? IMG_ASSETS : [];

self.addEventListener('install', e => {
  // only the small shell blocks installation — updates are ready in ~a second
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_ASSETS)));
});

/* Bring the photo cache in line with the manifest: drop what was removed,
   fetch what's missing a few at a time. Failures are tolerated — the fetch
   handler caches those lazily the first time they're shown, and the next
   worker boot retries. One key enumeration serves both halves, so the common
   case (nothing changed) is a single cache read. */
async function syncImageCache() {
  const c = await caches.open(IMG_CACHE);
  const keys = await c.keys();
  const want = new Set(IMGS.map(u => new URL(u, location.href).pathname));
  for (const req of keys) {
    if (!want.has(new URL(req.url).pathname)) await c.delete(req);
  }
  const have = new Set(keys.map(r => new URL(r.url).pathname));
  const missing = IMGS.filter(u => !have.has(new URL(u, location.href).pathname));
  const BATCH = 6;
  for (let i = 0; i < missing.length; i += BATCH) {
    await Promise.all(missing.slice(i, i + BATCH).map(u =>
      c.add(u).catch(() => {})
    ));
  }
}

/* Runs once per worker boot, and only when the page asks — see the message
   handler. A worker killed mid-sync just picks up where it left off next boot,
   since the cache itself is the progress record. */
let imageSync = null;
function startImageSync() {
  if (!imageSync) imageSync = syncImageCache().catch(() => {});
  return imageSync;
}

/* Drop caches from older versions. Runs last in activate — deleting while
   the outgoing worker may still have writes in flight can resurrect a
   "deleted" cache in Chromium. */
async function dropOldCaches() {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(k => k !== SHELL_CACHE && k !== IMG_CACHE)
    .map(k => caches.delete(k)));
}

/* Only cheap bookkeeping blocks activation. A worker stays in "activating"
   until this promise settles and every fetch queues behind it — including the
   reload the page performs on controllerchange. Syncing the photos here meant
   a deploy that added 40 of them made the next open wait on ~600 KB of
   downloads before index.html was served. */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await self.clients.claim();
    await dropOldCaches();
  })());
});

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  /* The page asks for the photo sync once it has finished loading. This is the
     trigger that matters on a fresh install: claim() takes control only after
     the page's own requests are done, so no fetch event would fire to start it.
     waitUntil here keeps the worker alive for the download without ever
     standing between the app and its shell. */
  if (e.data.type === 'SYNC_IMAGES') e.waitUntil(startImageSync());
});

/* Cache-first, looking only in the cache that could hold the request —
   a bare caches.match() searches every cache in the origin, and the photo
   cache is 240-odd entries deep. Cross-origin GETs skip the worker entirely
   rather than round-tripping through it. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const cacheName = url.pathname.includes('/img/') ? IMG_CACHE : SHELL_CACHE;
  e.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      if (e.request.mode === 'navigate') {
        const shell = await caches.open(SHELL_CACHE);
        return (await shell.match('./index.html')) || Response.error();
      }
      return Response.error();
    }
  })());
});
