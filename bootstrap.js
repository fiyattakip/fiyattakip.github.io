// bootstrap.js (ES Module) — güvenli import zinciri + debug
const dbg = (m)=>{ const el=document.getElementById('debug'); if(el) el.textContent += m + "\n"; };

dbg("SW: unregistering...");
if ('serviceWorker' in navigator) {
  try { (await navigator.serviceWorker.getRegistrations()).forEach(r=>r.unregister()); } catch {}
}
dbg("CacheStorage: clearing...");
if (globalThis.caches?.keys) {
  try { (await caches.keys()).forEach(k=>caches.delete(k)); } catch {}
}

try{
  await import('./firebase.js');
  dbg("firebase.js OK");
  await import('./ai.js');
  dbg("ai.js OK");
  await import('./app.js');
  dbg("app.js OK");
  dbg("Bootstrap loaded ✅");
}catch(e){
  dbg("Bootstrap failed ❌ " + (e?.message||String(e)));
  console.error(e);
}
