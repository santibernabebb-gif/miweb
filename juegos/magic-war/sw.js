// Magic War · SantiSystems Games — funciona sin conexión una vez cargado
const CACHE='magic-war-v3';
const FILES=["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "assets/dirt_floor_diff.jpg", "assets/grass_ground_diff.jpg", "assets/grey_roof_tiles_02_diff.jpg", "assets/guns.gltf.json", "assets/plastered_wall_02_diff.jpg", "assets/rock_face_03_diff.jpg", "assets/rock_face_03_nor_gl.jpg", "assets/sky_valencia.jpg", "assets/sky_valle.jpg", "assets/skyinfo.json", "assets/soldier.gltf.json", "assets/soldier_body_n.jpg", "assets/soldier_grey.jpg", "assets/soldier_head.jpg", "assets/soldier_head_n.jpg", "assets/soldier_khaki.jpg", "assets/soldier_merc.jpg", "assets/soldier_officer.jpg", "lib/GLTFLoader.js", "lib/SkeletonUtils.js", "lib/three.min.js"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
// solo borra cachés antiguas de este juego (no las de los demás juegos de la web)
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('magic-war-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.origin===location.origin){
    // la página: red primero (así llegan las actualizaciones), caché si no hay conexión
    if(req.mode==='navigate'){e.respondWith(fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put('index.html',cp))}return r}).catch(()=>caches.match('index.html')));return}
    e.respondWith(caches.match(req).then(r=>r||fetch(req)));
  }else if(url.host.includes('fonts.g')){
    e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));return res})));
  }});
