function $(id){return document.getElementById(id);}
const btn=$('btnAiYorum');
if(btn){
btn.addEventListener('click',async()=>{
 const q=$('qNormal')?.value?.trim();
 if(!q){alert('Ürün adı gir');return;}
 const box=$('aiYorumBox');
 if(box){box.textContent='AI yorum hazırlanıyor...';box.classList.remove('hidden');}
 try{
   const res = window.geminiText ? await window.geminiText('Bu ürün için kısa yorum yap: '+q) : 'AI yok';
   if(box) box.textContent=res; else alert(res);
 }catch(e){alert('AI hata');}
});
}
