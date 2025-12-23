const CACHE = "fiyattakip-cache-v5-plus2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./ai.js",
  "./firebase.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k===CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  if (req.method !== "GET") return;

  e.respondWith((async ()=>{
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try{
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type !== "opaque") cache.put(req, fresh.clone());
      return fresh;
    }catch{
      return cached || new Response("Offline", { status: 503 });
    }
  })());
});


// Notification click -> open url
self.addEventListener("notificationclick", (event)=>{
  event.notification.close();
  const url = event.notification?.data?.url || "./";
  event.waitUntil((async ()=>{
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of allClients){
      if (c.url && c.url.includes(self.location.origin)){
        c.focus();
        c.navigate(url);
        return;
      }
    }
    await clients.openWindow(url);
  })());
});
