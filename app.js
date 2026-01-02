document.addEventListener("DOMContentLoaded", () => {

/* ================================
   FiyatTakip – STABLE app.js
   AI MOD EKLENDİ (minimum risk)
================================ */

// -----------------------------
// Yardımcılar
// -----------------------------
function $(id) {
  return document.getElementById(id);
}

function toast(msg) {
  console.log("[Toast]", msg);
  alert(msg);
}

// Global seçili ürün (AI için)
window.lastSelectedItem = null;

// -----------------------------
// AI SERVİSİ
// -----------------------------
async function getAIComment(item) {
  try {
    const res = await fetch("https://fiyattakip-api.onrender.com/ai/yorum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title || "Ürün",
        price: item.price || "",
        site: item.site || ""
      })
    });

    if (!res.ok) throw new Error("AI servis hatası");

    const data = await res.json();
    return data.yorum || "AI yorum üretmedi.";
  } catch (e) {
    console.error(e);
    return "AI servisi şu anda kullanılamıyor.";
  }
}

// -----------------------------
// 🤖 AI MODE BUTONU
// HTML:
// <button class="modeBtn" id="modeAI">🤖 AI</button>
// -----------------------------
const aiModeBtn = $("modeAI");

if (aiModeBtn) {
  aiModeBtn.addEventListener("click", async () => {
    toast("AI yorumu hazırlanıyor...");

    const item =
      window.lastSelectedItem || {
        title: "Genel ürün",
        price: "",
        site: ""
      };

    const yorum = await getAIComment(item);
    alert(yorum);
  });
}

// -----------------------------
// ÜRÜN TIKLAMASI (ÖRNEK)
// Bunu ürün kartı oluştururken çağır
// -----------------------------
window.setSelectedItemForAI = function (item) {
  window.lastSelectedItem = {
    title: item.title || "",
    price: item.price || "",
    site: item.site || ""
  };
};

// -----------------------------
// DİKKAT
// Mevcut kodların (kamera, grafik,
// favori, navigation vs) ALTINA
// EKLENMİŞTİR – SİLME!
// -----------------------------

});
