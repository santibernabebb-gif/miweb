const CACHE='revienta-pompas-v9';
const FILES=['./','index.html','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==CACHE).map(n=>caches.delete(n)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();
    if(res.ok&&(e.request.url.startsWith(self.location.origin)||e.request.url.includes('fonts.g')))caches.open(CACHE).then(c=>c.put(e.request,cp));return res}).catch(()=>e.request.mode==='navigate'?caches.match('index.html'):Response.error())))});
