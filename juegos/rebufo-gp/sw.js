// Rebufo GP · service worker: juego disponible sin conexión
const CACHE='rebufo-gp-v16';
const CORE=['./','index.html','three.min.js','manifest.json','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  // Página: primero red (para recibir actualizaciones), si no hay conexión, la copia guardada
  if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put('index.html',c));}return r;}).catch(()=>caches.match('index.html')));return;}
  // Resto (scripts, iconos, tipografías): primero caché
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
    if(r.ok||r.type==='opaque'){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));}return r;})));
});
