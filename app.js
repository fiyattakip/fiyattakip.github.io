// app.js — NULL SAFE bağlama (patlamaz)
import { aiSuggest } from './ai.js';

const $ = (id)=>document.getElementById(id);

function setActiveTab(tab){
  ['tabNormal','tabAI','tabGorsel'].forEach(t=>$(t)?.classList.toggle('active', t===tab));
  const show = (panelId, on)=>$(panelId)?.classList.toggle('hidden', !on);
  show('panelNormal', tab==='tabNormal');
  show('panelAI', tab==='tabAI');
  show('panelGorsel', tab==='tabGorsel');
}

function bindClick(id, fn){
  const el = $(id);
  if(!el) return;
  el.addEventListener('click', fn);
}

function safeText(id, txt){
  const el=$(id); if(el) el.textContent = txt;
}

function init(){
  bindClick('tabNormal', ()=>setActiveTab('tabNormal'));
  bindClick('tabAI', ()=>setActiveTab('tabAI'));
  bindClick('tabGorsel', ()=>setActiveTab('tabGorsel'));

  bindClick('searchBtn', async ()=>{
    const q = ($('searchInput')?.value || '').trim();
    if(!q){ safeText('normalResults','Lütfen bir şey yaz.'); safeText('aiResults','Lütfen bir şey yaz.'); return; }

    // Normal
    safeText('normalResults', `Normal arama çalıştı: ${q}`);

    // AI
    const s = await aiSuggest(q);
    safeText('aiResults', s);

    // Favori demo
    safeText('favList', `Demo favori: ${q}`);
  });

  setActiveTab('tabNormal');
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
