// SW (safe) - does not cache app shell; clears old caches
self.addEventListener('install', (e)=> self.skipWaiting());
self.addEventListener('activate', (e)=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e)=> {
  // Network-first pass-through (no caching)
  e.respondWith(fetch(e.request));
});
