
/*
  FiyatTakip app.js – AI & UI FIXED
  Değişenler:
  - AI endpoint netleştirildi (/ai/yorum)
  - AI butonları için click handler örneği
  - safeQueryAll ile sayfa kilitlenmesi önlendi
*/

function safeQueryAll(selector) {
  try {
    return document.querySelectorAll(selector);
  } catch (e) {
    return [];
  }
}

async function getAIComment(item) {
  try {
    const res = await fetch("https://fiyattakip-api.onrender.com/ai/yorum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title || item.name,
        price: item.price,
        site: item.site
      })
    });
    const data = await res.json();
    return data.yorum || "Yorum yok";
  } catch (e) {
    return "AI yorumu alınamadı.";
  }
}

function bindAIButton(aiBtn, item) {
  if (!aiBtn) return;
  aiBtn.addEventListener("click", async () => {
    toast("AI yorumu hazırlanıyor...");
    const yorum = await getAIComment(item);
    alert(yorum);
  });
}

safeQueryAll(".page").forEach(p => {
  // mevcut logic buraya
});
