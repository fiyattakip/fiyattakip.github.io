// bootstrap.js — güvenli yükleyici (GitHub Pages + cache/SW sorunlarını çözer)
const $log = (() => {
  const bar = document.createElement('div');
  bar.style.cssText = [
    'position:fixed','left:12px','right:12px','bottom:12px','z-index:99999',
    'background:rgba(255,255,255,.96)','border:1px solid rgba(0,0,0,.12)',
    'border-radius:12px','padding:10px 12px','font:12px/1.35 system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
    'color:#111','box-shadow:0 6px 18px rgba(0,0,0,.08)'
  ].join(';');
  bar.innerHTML = '<div style="font-weight:700;margin-bottom:6px">Loader</div><pre id="__ftlog" style="margin:0;white-space:pre-wrap"></pre>';
  document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(bar));
  return (m)=>{ try{ const p=document.getElementById('__ftlog'); if(p) p.textContent += m+'\n'; }catch{} };
})();

const v = Date.now();
$log('v=' + v);

async function cleanSWandCache(){
  try{
    if ('serviceWorker' in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
      $log('SW: unregistered (' + regs.length + ')');
    } else {
      $log('SW: yok');
    }
  }catch(e){ $log('SW hata: ' + e.message); }

  try{
    if (window.caches?.keys){
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
      $log('CacheStorage: cleared (' + keys.length + ')');
    } else {
      $log('CacheStorage: yok');
    }
  }catch(e){ $log('Cache hata: ' + e.message); }
}

function loadScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src = src + (src.includes('?') ? '&' : '?') + 'v=' + v;
    s.defer = true;
    s.onload = ()=>resolve();
    s.onerror = ()=>reject(new Error('Script yüklenemedi: ' + src));
    document.head.appendChild(s);
  });
}

await cleanSWandCache();

// Sıra önemli: firebase.js -> ai.js -> app.js
try{
  await loadScript('./firebase.js');
  $log('firebase.js OK');
  await loadScript('./ai.js');
  $log('ai.js OK');
  await loadScript('./app.js');
  $log('app.js OK');
  $log('Bootstrap loaded ✅');
}catch(e){
  $log('Bootstrap failed ❌ ' + e.message);
  console.error(e);
}
