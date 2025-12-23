// GUARANTEED SAFE BASELINE
(function(){
  'use strict';
  const log = (m)=>{ const d=document.getElementById('log'); d.textContent+=m+'\n'; };

  function esc(s){
    if (s===null || s===undefined) return '';
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const btn = document.getElementById('btnTest');
    btn.addEventListener('click', ()=>{
      log('OK: Tıklama çalışıyor ✔');
      log('esc test: '+esc('<test>'));
    });
  });
})();
