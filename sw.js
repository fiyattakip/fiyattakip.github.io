const CACHE = "fiyattakip-cache-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase.js",
  "./manifest.json",
  "./icon-172.png",
  "./icon-512.png"
  '/app.nav.js',
  '/ai.js',
  '/firebase.js',
  '/firebase-config.js',
  '/firebase-messaging-sw.js',];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(k => {
          if (k !== CACHE) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      
      return fetch(req).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => {
            cache.put(req, clone);
          });
        }
        return response;
      }).catch(() => {
        return new Response("Offline", { status: 503 });
      });
    })
  );
});
