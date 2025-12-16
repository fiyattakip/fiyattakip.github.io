/* =========================================
   fiyattakip - sw.js (FULL)
   Cache-first + hızlı güncelleme
   ========================================= */

const CACHE_VERSION = "fiyattakip-v8"; // ✅ değişiklik yaptıkça v9, v10 diye artır
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Install: core dosyaları cache'e al
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
});

// Activate: eski cache'leri temizle
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k !== CACHE_VERSION ? caches.delete(k) : Promise.resolve()))
    );
    await self.clients.claim();
  })());
});

// Fetch: aynı domainde cache-first, ağ varsa güncelle
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Sadece GET yakala
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Cross-origin (firebase, google vs) -> network
  if (url.origin !== self.location.origin) {
    return; // tarayıcı normal network yapsın
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Cache'ten dön (varsa)
    const cached = await cache.match(req);
    if (cached) {
      // arka planda güncelle (stale-while-revalidate)
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        } catch (e) {}
      })());
      return cached;
    }

    // Cache'te yoksa network'ten al
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) await cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      // offline fallback: ana sayfa varsa onu döndür
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
      throw e;
    }
  })());
});
