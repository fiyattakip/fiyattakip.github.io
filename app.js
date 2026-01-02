/* =====================================================
   FiyatTakip – STABLE APP.JS
   AI Yorum EKLENDİ – UI BOZULMAZ
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {

  /* =====================
     GENEL YARDIMCILAR
  ===================== */

  const $ = (q) => document.querySelector(q);
  const $$ = (q) => document.querySelectorAll(q);

  window.toast = function (msg) {
    console.log("[Toast]", msg);
  };

  /* =====================
     SAYFA / SEKME GEÇİŞİ
  ===================== */

  function showPage(pageId) {
    $$(".page").forEach(p => p.classList.add("hidden"));
    const page = $("#page-" + pageId);
    if (page) page.classList.remove("hidden");
  }

  $$(".modeBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.id.replace("mode", "").toLowerCase();
      showPage(id);
    });
  });

  showPage("link"); // default

  /* =====================
     AI YORUM FONKSİYONU
  ===================== */

  async function getAIComment(item) {
    try {
      const res = await fetch(
        "https://fiyattakip-api.onrender.com/ai/yorum",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title || "Ürün",
            price: item.price || "",
            site: item.site || ""
          })
        }
      );

      if (!res.ok) throw new Error("AI servis hatası");

      const data = await res.json();
      return data.yorum || "AI yorum üretmedi.";
    } catch (e) {
      console.error(e);
      return "AI yorumu şu an alınamıyor.";
    }
  }

  /* =====================
     AI BUTON BAĞLAMA
  ===================== */

  function bindAIButtons() {
    $$(".btnAI").forEach(btn => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";

      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        toast("🤖 AI yorumu hazırlanıyor...");

        const item = {
          title: btn.dataset.title || "",
          price: btn.dataset.price || "",
          site: btn.dataset.site || ""
        };

        const yorum = await getAIComment(item);
        alert(yorum);
      });
    });
  }

  /* =====================
     ÖRNEK ÜRÜN LİSTESİ
     (SENİN MEVCUT LİSTENİ
      BOZMAZ)
  ===================== */

  function renderDemoItems() {
    const container = $("#demoList");
    if (!container) return;

    container.innerHTML = `
      <div class="item">
        <b>Xiaomi Pad 7 256GB</b>
        <button class="btnAI"
          data-title="Xiaomi Pad 7 256GB"
          data-price="—"
          data-site="Genel">
          🤖 AI Yorum
        </button>
      </div>
    `;

    bindAIButtons();
  }

  renderDemoItems();

});
