const CACHE_VERSION = "fiyattakip-v20"; // güncellemede artır
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase.js",
  "./ai.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_VERSION) ? caches.delete(k) : Promise.resolve()));
    self.clients.claim();
  })());
});

self.addEventListener("message", (event)=>{
  if (event?.data?.type === "CLEAR_ALL_CACHES"){
    event.waitUntil((async ()=>{
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
      const clients = await self.clients.matchAll({ includeUncontrolled:true });
      for (const c of clients){
        c.postMessage({ type:"CACHES_CLEARED" });
      }
    })());
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com") || url.hostname.includes("firebaseapp.com")) {
    return;
  }
  if (req.method !== "GET") return;

  event.respondWith((async ()=>{
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    if (cached) return cached;

    try{
      const res = await fetch(req);
      if (res && res.ok && (req.destination === "document" || req.destination === "script" || req.destination === "style" || req.destination === "image")) {
        cache.put(req, res.clone());
      }
      return res;
    }catch{
      if (req.destination === "document") return cache.match("./index.html");
      throw new Error("offline");
    }
  })());
});
