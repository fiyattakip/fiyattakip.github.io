document.addEventListener("DOMContentLoaded", () => {

  /*
    FiyatTakip app.js – AI & UI FIXED (STABLE)
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
          title: item.title,
          price: item.price,
          site: item.site
        })
      });

      const data = await res.json();
      return data.yorum || "Yorum yok";
    } catch (e) {
      console.error(e);
      return "AI yorumu alınamadı.";
    }
  }

  function bindAIButton(btn) {
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const item = {
        title: btn.getAttribute("data-title") || btn.dataset.title || "Ürün",
        price: btn.getAttribute("data-price") || "",
        site: btn.getAttribute("data-site") || ""
      };

      toast("AI yorumu hazırlanıyor...");
      const yorum = await getAIComment(item);
      alert(yorum);
    });
  }

  // 🔥 ASIL ÖNEMLİ KISIM
  safeQueryAll(".btnAI").forEach(bindAIButton);

});
