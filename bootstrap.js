// ES module loader
const log = (m)=>{
  const el=document.getElementById('log');
  if(el) el.textContent += m + '\n';
};

log('bootstrap start');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));
  caches?.keys?.().then(keys=>keys.forEach(k=>caches.delete(k)));
  log('SW/cache cleared');
}

try{
  await import('./firebase.js');
  log('firebase.js OK');
  await import('./ai.js');
  log('ai.js OK');
  await import('./app.js');
  log('app.js OK');
  log('Bootstrap loaded ✅');
}catch(e){
  log('Bootstrap failed ❌ ' + e.message);
}
