/* ============================
   やめログ — Service Worker
   アプリシェルをプリキャッシュし、オフラインでも起動できるようにする。
   ファイルを更新したら VERSION を上げること（利用者に「更新」トーストが出る）。
   ============================ */

const VERSION = 'yamelog-v1.0.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/logic.js',
  './js/store.js',
  './js/presets.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/sos-96.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('yamelog-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ページ遷移はアプリシェル（index.html）を返す
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match('./index.html', { cacheName: VERSION });
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        return new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // それ以外はキャッシュ優先、なければネットワーク
  event.respondWith((async () => {
    const cached = await caches.match(request, { cacheName: VERSION, ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
