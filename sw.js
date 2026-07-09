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

const VERSION = 'v3.4.0';
const SHELL_CACHE = 'spotter-shell-' + VERSION;
const IMG_CACHE = 'spotter-img-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
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

/* Fetch any not-yet-cached photos, a few at a time; tolerate failures
   (they'll be retried lazily by the fetch handler). */
async function fillImageCache() {
  const c = await caches.open(IMG_CACHE);
  const cached = new Set((await c.keys()).map(r => new URL(r.url).pathname));
  const missing = IMGS.filter(u => !cached.has(new URL(u, location.href).pathname));
  const BATCH = 6;
  for (let i = 0; i < missing.length; i += BATCH) {
    await Promise.all(missing.slice(i, i + BATCH).map(u =>
      c.add(u).catch(() => {})
    ));
  }
}

/* Drop photos that are no longer in the manifest. */
async function pruneImageCache() {
  const c = await caches.open(IMG_CACHE);
  const want = new Set(IMGS.map(u => new URL(u, location.href).pathname));
  for (const req of await c.keys()) {
    if (!want.has(new URL(req.url).pathname)) await c.delete(req);
  }
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

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await self.clients.claim();
    await pruneImageCache();
    await fillImageCache();
    await dropOldCaches();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const isImg = new URL(e.request.url).pathname.includes('/img/');
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(isImg ? IMG_CACHE : SHELL_CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() =>
        e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()
      )
    )
  );
});
