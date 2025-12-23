// bootstrap.js — MUST EXIST (fixes dynamic import error)
const log = (m)=>{
  const el=document.getElementById('log');
  if(el) el.textContent += m + '\n';
};

log('bootstrap.js yüklendi');

// Kill old SW & cache just in case
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  caches?.keys?.().then(keys => keys.forEach(k => caches.delete(k)));
  log('SW + Cache temizlendi');
}

// Load main app safely
try {
  import('./app.js').then(()=>{
    log('app.js import OK');
  }).catch(e=>{
    log('app.js import HATA: ' + e.message);
  });
} catch (e) {
  log('import TRY HATA: ' + e.message);
}
