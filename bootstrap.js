// bootstrap.js — güvenli yükleyici (MODULE) (GitHub Pages + cache/SW sorunlarına karşı)
// Bu dosya type="module" olarak yüklenir ve diğer modülleri sırayla import eder.

const v = Date.now();
const $barId = 'ft-debug-bar';

function ensureBar(){
  let bar = document.getElementById($barId);
  if(bar) return bar;
  bar = document.createElement('div');
  bar.id = $barId;
  bar.style.cssText = [
    'position:fixed','left:12px','bottom:12px','z-index:99999',
    'background:rgba(255,255,255,.95)','border:1px solid #e5e7eb',
    'padding:10px 12px','border-radius:12px','font:12px/1.4 system-ui, -apple-system, sans-serif',
    'color:#111','box-shadow:0 6px 18px rgba(0,0,0,.08)',
    'max-width:92vw','white-space:pre-line'
  ].join(';');
  bar.textContent = '';
  document.body.appendChild(bar);
  return bar;
}

function $log(msg){
  const bar = ensureBar();
  bar.textContent += msg + '\n';
}

async function cleanSWandCache(){
  try{
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
      $log('SW: unregistered (' + regs.length + ')');
    } else {
      $log('SW: yok');
    }
  }catch(e){ $log('SW hata: ' + e.message); }

  try{
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      $log('CacheStorage: cleared (' + keys.length + ')');
    } else {
      $log('CacheStorage: yok');
    }
  }catch(e){ $log('Cache hata: ' + e.message); }
}

function mod(url){ // cache-bust
  return url + (url.includes('?') ? '&' : '?') + 'v=' + v;
}

window.addEventListener('error', (e)=>{
  $log('JS ERROR: ' + (e?.message || e));
});

window.addEventListener('unhandledrejection', (e)=>{
  $log('PROMISE ERROR: ' + (e?.reason?.message || e?.reason || e));
});

(async ()=>{
  try{
    await cleanSWandCache();

    // Sıra önemli: firebase.js -> ai.js -> app.js (hepsi ESM)
    await import(mod('./firebase.js'));
    $log('firebase.js OK');

    await import(mod('./ai.js'));
    $log('ai.js OK');

    await import(mod('./app.js'));
    $log('app.js OK');

    $log('Bootstrap loaded ✅');
  }catch(e){
    $log('Bootstrap failed ❌ ' + (e?.message || e));
    console.error(e);
  }
})();
