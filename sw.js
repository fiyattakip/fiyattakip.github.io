// sw.js — cache + update (v3)
const CACHE = "fiyattakip-cache-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./ai.js",
  "./firebase.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith((async ()=>{
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: false });
    if (cached) return cached;
    try{
      const fresh = await fetch(req);
      // cache only same-origin
      const url = new URL(req.url);
      if (url.origin === self.location.origin && fresh.ok){
        cache.put(req, fresh.clone());
      }
      return fresh;
    }catch{
      return cached || new Response("Offline", { status: 503 });
    }
  })());
});
