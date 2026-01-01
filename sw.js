// FiyatTakip Service Worker (v21) - cache safe, update-friendly
const CACHE_NAME = "fiyattakip-cache-v21";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== "GET") return;

  // For API calls, always go to network (no cache)
  if (url.pathname.startsWith("/api") || url.pathname.includes("onrender.com")) {
    return;
  }

  // Cache-first for same-origin static; update cache in background
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req, { ignoreSearch: false });
        if (cached) {
          // update in background
          event.waitUntil(
            fetch(req).then((res) => {
              if (res && res.ok) cache.put(req, res.clone());
            }).catch(() => {})
          );
          return cached;
        }
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          // offline fallback to cached index for navigation
          if (req.mode === "navigate") {
            const fallback = await cache.match("./index.html");
            if (fallback) return fallback;
          }
          throw e;
        }
      })()
    );
  }
});
