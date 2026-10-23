/* ShortsDeck service worker — app shell works offline. Google/YouTube requests are NEVER cached or touched. */
const VERSION = 'shortsdeck-v2';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './offline.html',
  './js/theme-boot.js', './js/util.js', './js/storage.js', './js/demo-data.js', './js/notifications.js', './js/youtube.js',
  './js/auth.js', './js/analytics.js', './js/uploads.js', './js/scheduler.js', './js/comments.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;          // leave Google/YouTube alone
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', cp)); return r; })
      .catch(() => caches.match('./index.html').then(r => r || caches.match('./offline.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {                                      // stale-while-revalidate
    const net = fetch(req).then(r => { if (r && r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
