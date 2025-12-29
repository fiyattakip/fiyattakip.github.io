// app.js - FiyatTakip (stabil UI + Render API + AI yorum)
// Bu dosya "type=module" kullanmaz. index.html'de normal script olarak yüklenir.

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ========= CONFIG =========
  const DEFAULT_API_BASE = "https://fiyattakip-api.onrender.com";
  // Kullanıcı /api girse de girmese de sorun olmasın:
  function normalizeApiBase(input) {
    let s = String(input || "").trim();
    if (!s) s = DEFAULT_API_BASE;
    s = s.replace(/\/+$/, ""); // trim trailing /
    // kullanıcı /api yazdıysa base'e çevir
    if (s.endsWith("/api")) s = s.slice(0, -4);
    return s;
  }
  let API_BASE = normalizeApiBase(localStorage.getItem("fiyattakip_api_base"));

  function apiUrl(path) {
    const p = String(path || "");
    if (!p.startsWith("/")) return `${API_BASE}/api/${p}`;
    // health root'ta:
    if (p === "/health") return `${API_BASE}/health`;
    return `${API_BASE}/api${p}`;
  }

  // ========= UI HELPERS =========
  function toast(msg, type = "info") {
    const t = $("toast");
    if (!t) return console.log("[toast]", msg);
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  function withTimeout(ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return { signal: ctrl.signal, done: () => clearTimeout(t) };
  }

  // ========= SEARCH MODE =========
  function setSearchMode(mode) {
    localStorage.setItem("searchMode", mode);
    $("modeNormal")?.classList.toggle("active", mode === "normal");
    $("modeFiyat")?.classList.toggle("active", mode === "fiyat");
    $("modeAI")?.classList.toggle("active", mode === "ai");
    const hint = $("modeHint");
    if (hint) {
      const m = {
        normal: "Normal arama: sitelerde direkt arar.",
        fiyat: "Fiyat arama: Render API ile fiyatları çeker.",
        ai: "AI arama: ürün adını optimize edip fiyat arar.",
      };
      hint.textContent = m[mode] || "";
    }
  }
  function getSearchMode() {
    return localStorage.getItem("searchMode") || "normal";
  }

  // ========= NORMAL (LINK) SEARCH =========
  const SITES = [
    { key: "trendyol", name: "Trendyol", build: (q) => `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
    { key: "hepsiburada", name: "Hepsiburada", build: (q) => `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
    { key: "n11", name: "N11", build: (q) => `https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
    { key: "amazontr", name: "Amazon TR", build: (q) => `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  ];

  function renderSiteList(container, query) {
    const q = String(query || "").trim();
    if (!container) return;
    if (!q) {
      container.innerHTML = `<div class="cardBox"><b>Bir şey yaz.</b></div>`;
      return;
    }
    container.innerHTML = "";
    for (const s of SITES) {
      const url = s.build(q);
      const card = document.createElement("div");
      card.className = "cardBox";
      card.innerHTML = `
        <div class="rowLine">
          <div>
            <div class="ttl">${s.name}</div>
            <div class="sub">${q}</div>
          </div>
          <div class="actions">
            <button class="btnPrimary sm btnOpen" type="button">Aç</button>
            <button class="btnGhost sm btnCopy" type="button" data-copy-url="${url}" title="Linki kopyala">⧉</button>
            <button class="btnGhost sm btnFav" type="button" data-fav-url="${url}" data-site-name="${s.name}" data-query="${q}">♡</button>
          </div>
        </div>
      `;
      card.querySelector(".btnOpen")?.addEventListener("click", () => window.open(url, "_blank", "noopener"));
      card.querySelector(".btnFav")?.addEventListener("click", () => addFav({ url, siteName: s.name, query: q }));
      container.appendChild(card);
    }
  }

  // ========= FAVORITES (LOCAL) =========
  const LS_FAVS = "fiyattakip_favs_v1";
  function loadFavs() {
    try { return JSON.parse(localStorage.getItem(LS_FAVS) || "[]"); } catch { return []; }
  }
  function saveFavs(f) { localStorage.setItem(LS_FAVS, JSON.stringify(f)); }
  function addFav(item) {
    const favs = loadFavs();
    const id = (item.url || "").toLowerCase();
    if (!id) return;
    if (favs.some(x => (x.url || "").toLowerCase() === id)) {
      toast("Favoride zaten var", "info");
      return;
    }
    favs.unshift({ ...item, createdAt: Date.now() });
    saveFavs(favs);
    toast("Favorilere eklendi", "success");
    renderFavorites();
  }
  function removeFav(url) {
    const id = String(url || "").toLowerCase();
    const favs = loadFavs().filter(x => (x.url || "").toLowerCase() !== id);
    saveFavs(favs);
    toast("Favoriden çıkarıldı", "info");
    renderFavorites();
  }

  function renderFavorites() {
    const list = $("favList");
    if (!list) return;
    const favs = loadFavs();
    if (!favs.length) {
      list.innerHTML = `<div class="emptyState">Favori yok.</div>`;
      return;
    }
    list.innerHTML = "";
    favs.slice(0, 50).forEach((fav) => {
      const card = document.createElement("div");
      card.className = "cardBox favoriteCard";
      card.innerHTML = `
        <div class="favoriteHeader">
          <div class="favoriteInfo">
            <div class="favSite">${fav.siteName || "Favori"}</div>
            <div class="favQuery">${fav.query || fav.urun || ""}</div>
          </div>
          <div class="favoriteActions">
            <button class="btnGhost sm" type="button" data-open="${fav.url}">Aç</button>
            <button class="btnGhost sm btnAiComment" type="button" data-urun="${(fav.query || fav.urun || "").replace(/"/g, "&quot;")}">🤖 AI</button>
            <button class="btnGhost sm" type="button" data-del="${fav.url}">✕</button>
          </div>
        </div>
      `;
      list.appendChild(card);
    });
  }

  // ========= PRICE SEARCH =========
  async function fiyatAra(query) {
    const q = String(query || "").trim();
    if (!q) return toast("Ürün adı girin", "error");

    // nav.js varsa search sayfasına geçirebilir; yoksa kendimiz de gösterebiliriz
    if (typeof window.showPage === "function") window.showPage("graph", 1);

    const container = $("graphList") || $("normalList");
    if (!container) return;

    container.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Fiyatlar çekiliyor...</p>
      </div>
    `;

    const t = withTimeout(15000);
    try {
      const res = await fetch(apiUrl("/fiyat-cek"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: t.signal,
        body: JSON.stringify({ urun: q })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `API hata: ${res.status}`);

      const fiyatlar = data.fiyatlar || data.items || [];
      if (!Array.isArray(fiyatlar) || fiyatlar.length === 0) {
        container.innerHTML = `
          <div class="emptyState">
            <div class="emptyIcon">😕</div>
            <h3>Ürün bulunamadı</h3>
            <p>"${q}" için sonuç bulunamadı</p>
          </div>
        `;
        return;
      }
      renderPriceCards(container, q, fiyatlar);
      toast(`${fiyatlar.length} sonuç`, "success");
    } catch (e) {
      console.error(e);
      container.innerHTML = `
        <div class="errorState">
          <div class="errorIcon">😕</div>
          <h3>Fiyat çekilemedi</h3>
          <p>${String(e?.message || e)}</p>
        </div>
      `;
      toast("Fiyat çekilemedi", "error");
    } finally {
      t.done();
    }
  }

  function renderPriceCards(container, query, items) {
    // ilk 4 göster
    const list = items.slice(0, 4);
    let html = `<div class="sortInfo"><span>Sonuçlar: ${list.length}</span></div><div class="productList">`;
    for (const it of list) {
      const site = it.site || it.siteName || "Site";
      const urun = it.urun || it.title || query;
      const fiyat = it.fiyat || it.price || "";
      const link = it.link || it.url || "#";
      html += `
        <div class="productCard">
          <div class="productRow">
            <div class="productSite">${site}</div>
            <div class="productName">${urun}</div>
            <div class="productPriceRow">
              <span class="productPrice">${fiyat}</span>
              <div class="productActions">
                <button class="btnGhost xs" type="button" data-open="${link}">Aç</button>
                <button class="btnGhost xs" type="button" data-copy-url="${link}">⧉</button>
                <button class="btnGhost xs" type="button" data-addfav="${encodeURIComponent(JSON.stringify({url:link, siteName:site, query:urun}))}">♡</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    html += `</div>`;
    container.innerHTML = html;
  }

  // ========= AI SEARCH =========
  async function aiAra(query) {
    // Şimdilik: kısa optimize + fiyat ara
    const q = String(query || "").trim();
    if (!q) return toast("Ürün adı girin", "error");
    toast("AI arama: ürün adı optimize ediliyor...", "info");
    // Basit normalize: çok uzunsa kısalt
    const optimized = q.replace(/\s+/g, " ").trim().slice(0, 80);
    return fiyatAra(optimized);
  }

  // ========= AI COMMENT (FAVORITE) =========
  async function aiYorumGetir(urunAdi) {
    const urun = String(urunAdi || "").trim();
    if (!urun) return toast("Ürün adı yok", "error");

    toast("🤖 AI yorum hazırlanıyor...", "info");
    const t = withTimeout(12000);
    try {
      const res = await fetch(apiUrl("/ai-yorum"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: t.signal,
        body: JSON.stringify({ urun })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `AI hata: ${res.status}`);

      const text = data.yorum || data.aiYorum || data.text || "";
      if (!text) throw new Error("Boş cevap");
      toast("✅ AI yorum hazır", "success");
      alert(text);
    } catch (e) {
      console.error(e);
      toast("AI yorum alınamadı", "error");
      alert("AI yorum alınamadı");
    } finally {
      t.done();
    }
  }

  // ========= CAMERA =========
  async function cameraAiSearch() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });

      const modal = document.createElement("div");
      modal.className = "cameraModal";
      modal.innerHTML = `
        <div class="cameraContainer">
          <div class="cameraHeader">
            <h3>📷 Ürün Fotoğrafı Çek</h3>
            <button class="closeCamera" type="button">✕</button>
          </div>
          <video id="cameraVideo" autoplay playsinline></video>
          <div class="cameraControls">
            <button class="btnPrimary" id="captureBtn" type="button">📷 Çek</button>
            <button class="btnGhost" id="cancelBtn" type="button">İptal</button>
          </div>
          <canvas id="cameraCanvas" style="display:none;"></canvas>
        </div>
      `;
      document.body.appendChild(modal);

      const video = modal.querySelector("#cameraVideo");
      video.srcObject = stream;

      const close = () => {
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
        modal.remove();
      };

      modal.querySelector(".closeCamera").addEventListener("click", close);
      modal.querySelector("#cancelBtn").addEventListener("click", close);

      modal.querySelector("#captureBtn").addEventListener("click", async () => {
        const canvas = modal.querySelector("#cameraCanvas");
        const ctx = canvas.getContext("2d");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        close();

        toast("Görsel analiz ediliyor...", "info");
        const t = withTimeout(15000);
        try {
          const res = await fetch(apiUrl("/kamera-ai"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: t.signal,
            body: JSON.stringify({ image: dataUrl.split(",")[1], mime: "image/jpeg" })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `Kamera AI hata: ${res.status}`);
          const guess = data.urunTahmini || data.tespitEdilen || data.query || "telefon";
          toast(`Bulundu: ${guess}`, "success");
          // AI mod gibi davranıp fiyat ara
          await fiyatAra(guess);
        } catch (e) {
          console.error(e);
          toast("Kamera AI başarısız", "error");
        } finally {
          t.done();
        }
      });
    } catch (e) {
      console.error(e);
      toast("Kamera erişimi reddedildi", "error");
    }
  }

  // ========= API MODAL =========
  function openApiModal() {
    const m = $("apiModal");
    if (!m) return;
    m.classList.remove("hidden");
    m.classList.add("show");
    m.setAttribute("aria-hidden", "false");
    $("apiUrl").value = API_BASE;
    checkAPIStatus();
  }
  function closeApiModal() {
    const m = $("apiModal");
    if (!m) return;
    m.classList.add("hidden");
    m.classList.remove("show");
    m.setAttribute("aria-hidden", "true");
  }

  async function checkAPIStatus() {
    const statusElement = $("apiStatus");
    if (!statusElement) return;
    try {
      statusElement.textContent = "Bağlanıyor...";
      statusElement.className = "apiStatus checking";
      const t = withTimeout(7000);
      const res = await fetch(apiUrl("/health"), { method: "GET", signal: t.signal });
      t.done();
      if (res.ok) {
        statusElement.textContent = "Çalışıyor";
        statusElement.className = "apiStatus online";
      } else {
        statusElement.textContent = "Hata";
        statusElement.className = "apiStatus error";
      }
    } catch (e) {
      statusElement.textContent = "Bağlantı yok";
      statusElement.className = "apiStatus offline";
    }
  }

  function saveAPISettings() {
    const url = $("apiUrl")?.value?.trim() || DEFAULT_API_BASE;
    API_BASE = normalizeApiBase(url);
    localStorage.setItem("fiyattakip_api_base", API_BASE);
    toast("API URL kaydedildi", "success");
    closeApiModal();
  }

  // ========= COPY =========
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Kopyalandı", "success");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand("copy"); toast("Kopyalandı", "success"); } catch {}
      document.body.removeChild(ta);
    }
  }

  // ========= WIRE =========
  function wireUI() {
    // mode buttons
    $("modeNormal")?.addEventListener("click", () => setSearchMode("normal"));
    $("modeFiyat")?.addEventListener("click", () => setSearchMode("fiyat"));
    $("modeAI")?.addEventListener("click", () => setSearchMode("ai"));
    setSearchMode(getSearchMode());

    // main search
    $("btnNormal")?.addEventListener("click", async () => {
      const q = ($("qNormal")?.value || "").trim();
      const mode = getSearchMode();
      if (mode === "normal") {
        if (typeof window.showPage === "function") window.showPage("graph", 1);
        renderSiteList($("graphList") || $("normalList"), q);
      } else if (mode === "fiyat") {
        await fiyatAra(q);
      } else {
        await aiAra(q);
      }
    });
    $("qNormal")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("btnNormal")?.click();
    });

    // camera
    $("fabCamera")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      cameraAiSearch();
    });

    // api modal
    $("btnApiSettings")?.addEventListener("click", openApiModal);
    $("apiBackdrop")?.addEventListener("click", closeApiModal);
    $("closeApi")?.addEventListener("click", closeApiModal);
    $("btnTestApi")?.addEventListener("click", checkAPIStatus);
    $("btnSaveApi")?.addEventListener("click", saveAPISettings);

    // delegated actions
    document.addEventListener("click", async (e) => {
      const open = e.target?.closest?.("[data-open]");
      if (open) return window.open(open.getAttribute("data-open"), "_blank", "noopener");

      const copy = e.target?.closest?.("[data-copy-url]");
      if (copy) return copyToClipboard(copy.getAttribute("data-copy-url") || "");

      const del = e.target?.closest?.("[data-del]");
      if (del) return removeFav(del.getAttribute("data-del"));

      const addfav = e.target?.closest?.("[data-addfav]");
      if (addfav) {
        try {
          const obj = JSON.parse(decodeURIComponent(addfav.getAttribute("data-addfav")));
          addFav(obj);
        } catch {}
        return;
      }

      const aiBtn = e.target?.closest?.(".btnAiComment");
      if (aiBtn) return aiYorumGetir(aiBtn.getAttribute("data-urun"));
    });

    // initial renders
    renderFavorites();
  }

  window.addEventListener("DOMContentLoaded", () => {
    try {
      wireUI();
    } catch (e) {
      console.error(e);
      toast("Uygulama başlatılamadı", "error");
    }
  });

  // expose minimal globals if needed
  window.cameraAiSearch = cameraAiSearch;
})();
