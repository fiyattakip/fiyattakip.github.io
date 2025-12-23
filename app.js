// app.js (ES module) — NO top-level return allowed
function initApp(){
  const log = document.getElementById('log');
  const q = document.getElementById('q');
  const searchBtn = document.getElementById('searchBtn');

  document.getElementById('tabNormal').onclick = ()=>log.textContent += 'Normal sekme OK\n';
  document.getElementById('tabAI').onclick = ()=>log.textContent += 'AI sekme OK\n';

  searchBtn.onclick = ()=>{
    log.textContent += 'Arama OK: ' + (q.value||'') + '\n';
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
