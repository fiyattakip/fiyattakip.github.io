/* unchanged: keep your repo version of app.js */



// ===== FAVORI AI YORUM EKLE =====
function attachFavAi(){
  document.querySelectorAll('.fav-item').forEach(card=>{
    if(card.querySelector('.btnFavAI')) return;

    const title = card.dataset.title || card.innerText.slice(0,80);
    const btn = document.createElement('button');
    btn.className='btnGhost btnFavAI';
    btn.innerText='🤖 AI Yorum';

    const out = document.createElement('div');
    out.className='aiFavResult hidden';

    btn.onclick = async ()=>{
      out.classList.remove('hidden');
      out.innerText='AI yorum hazırlanıyor...';
      try{
        if(window.geminiText){
          const res = await window.geminiText(
            'Bu ürün için kısa kullanıcı yorumu yaz: '+title
          );
          out.innerText=res;
        }else{
          out.innerText='AI servisi yok';
        }
      }catch(e){ out.innerText='AI hata';}
    };

    card.appendChild(btn);
    card.appendChild(out);
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  setInterval(attachFavAi, 1500);
});
// ===== FAVORI AI YORUM SON =====
