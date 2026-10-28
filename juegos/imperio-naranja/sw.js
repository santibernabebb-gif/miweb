// Imperio Naranja · service worker (offline)
const CACHE='imperio-naranja-v4';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('imperio-naranja-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // red primero para el HTML (así llegan las actualizaciones), caché si no hay conexión
    if (req.mode === 'navigate') { e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); } return r; }).catch(() => caches.match('./index.html'))); return; }
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  } else if (url.host.includes('fonts.g')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })));
  }
});
