// Service worker PWA-сканера: интерфейс открывается без интернета, отметки копятся в очереди
const CACHE = 'za-scan-v1';
const FILES = ['./', './index.html', './app.js', './manifest.webmanifest',
  '../shared/config.js', '../shared/i18n.js', '../shared/ui.js', '../shared/ui.css', '../shared/api.js',
  '../shared/vendor/qrcode.js', '../shared/vendor/jsQR.js', '../shared/logo.png', '../shared/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // API и шрифты — мимо кэша
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
