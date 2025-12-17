/* sw.js — SAFE VERSION (blank screen fix) */
const CACHE_VERSION = "v30";
const APP_CACHE = `fiyattakip-app-${CACHE_VERSION}`;
const RUNTIME_CACHE = `fiyattakip-runtime-${CACHE_VERSION}`;

// SADECE KESİN VAR OLANLAR
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE).then(async (cache) => {
      // addAll yerine tek tek: biri bile yoksa komple fail olmasın
      await Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u)));
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith("fiyattakip-") && !k.includes(CACHE_VERSION))
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isHTML(request) {
  return request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");
}

function isStatic(url) {
  return (
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico")
  );
}

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    return cached || caches.match("./index.html");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((fresh) => {
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  }).catch(() => null);

  return cached || (await fetchPromise) || new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (isHTML(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStatic(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
