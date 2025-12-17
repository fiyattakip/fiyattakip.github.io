const CACHE_VERSION = "fiyattakip-v10"; // <- güncelledikçe v11, v12 yap
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase.js",
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Firebase / Google endpoints cacheleme
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com") || url.hostname.includes("firebaseapp.com")) {
    return;
  }

  // Sadece GET
  if (req.method !== "GET") return;

  event.respondWith((async ()=>{
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    if (cached) return cached;

    try{
      const res = await fetch(req);
      // html/js/css gibi dosyaları cachele
      if (res && res.ok && (req.destination === "document" || req.destination === "script" || req.destination === "style" || req.destination === "image")) {
        cache.put(req, res.clone());
      }
      return res;
    }catch{
      // offline fallback
      if (req.destination === "document") {
        return cache.match("./index.html");
      }
      throw new Error("offline");
    }
  })());
});
