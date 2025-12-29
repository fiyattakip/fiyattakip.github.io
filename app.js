// ========== DEBUG MODE ==========
const DEBUG = true;

function debugLog(...args) {
  if (DEBUG) console.log("🔍 DEBUG:", ...args);
}

// ========== API KONFİGÜRASYONU ==========
let API_URL = localStorage.getItem('fiyattakip_api_url') || "https://fiyattakip-api.onrender.com/api";

// ========== DEĞİŞKENLER ==========
let currentPage = 1;
let currentSort = 'asc';
let currentSearch = '';
let totalPages = 1;
let allProducts = [];
let favCache = [];
window.currentUser = null;

// ========== KISA YARDIMCI FONKSİYONLAR ==========
const $ = (id) => document.getElementById(id);

function toast(msg, type = 'info') {
  const t = $("toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 3000);
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  
  const page = $(`page-${pageId}`);
  const tab = document.querySelector(`.tab[data-page="${pageId}"]`);
  
  if (page) page.classList.add("active");
  if (tab) tab.classList.add("active");
  
  debugLog("Sayfa:", pageId);
}

// ========== ARAMA İŞLEMLERİ ==========
function getSearchMode() {
  return localStorage.getItem("searchMode") || "normal";
}

function setSearchMode(mode) {
  localStorage.setItem("searchMode", mode);
  $("modeNormal")?.classList.toggle("active", mode === "normal");
  $("modeFiyat")?.classList.toggle("active", mode === "fiyat");
  $("modeAI")?.classList.toggle("active", mode === "ai");
}

// ========== SITE LISTESI ==========
const SITES = [
  { key:"trendyol", name:"Trendyol", build:q=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", build:q=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11", name:"N11", build:q=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazontr", name:"Amazon TR", build:q=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"pazarama", name:"Pazarama", build:q=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:q=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key:"idefix", name:"idefix", build:q=>`https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` },
];

function renderSiteList(container, query) {
  if (!container) return;
  container.innerHTML = "";
  
  SITES.forEach(site => {
    const url = site.build(query);
    const div = document.createElement("div");
    div.className = "cardBox";
    div.innerHTML = `
      <div class="rowLine">
        <div>
          <div class="ttl">${site.name}</div>
          <div class="sub">${query}</div>
        </div>
        <div class="actions">
          <button class="btnOpen btnPrimary sm">Aç</button>
          <button class="btnCopy btnGhost sm">⧉</button>
          <button class="btnFav btnGhost sm" data-url="${url}">🤍</button>
        </div>
      </div>
    `;
    
    div.querySelector(".btnOpen").onclick = () => window.open(url, "_blank");
    div.querySelector(".btnCopy").onclick = () => {
      navigator.clipboard.writeText(url);
      toast("Link kopyalandı", "success");
    };
    
    container.appendChild(div);
  });
}

// ========== FIYAT ARAMA ==========
async function fiyatAra(query, page = 1, sort = 'asc') {
  debugLog("fiyatAra:", { query, page, sort });
  
  if (!query?.trim()) {
    toast("Ürün adı girin", "error");
    return;
  }
  
  showPage("search");
  const container = $("normalList");
  container.innerHTML = `<div class="loading"><div class="spinner"></div><p>"${query}" aranıyor...</p></div>`;
  
  try {
    const response = await fetch(`${API_URL}/fiyat-cek`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urun: query, page: page, sort: sort })
    });
    
    if (!response.ok) throw new Error(`API: ${response.status}`);
    
    const data = await response.json();
    debugLog("API verisi:", data);
    
    if (data.success && data.fiyatlar?.length > 0) {
      container.innerHTML = "";
      
      data.fiyatlar.forEach((product, index) => {
        const div = document.createElement("div");
        div.className = index === 0 ? "cheapestBanner" : "productCard";
        div.innerHTML = `
          <div class="${index === 0 ? 'productInfo' : 'productRow'}">
            <div class="productSite">${product.site}</div>
            <div class="productName">${product.urun}</div>
            <div class="productPrice">${product.fiyat}</div>
            <div class="productActions">
              <button class="btnPrimary sm" onclick="window.open('${product.link}', '_blank')">Aç</button>
              <button class="btnGhost sm" onclick="copyToClipboard('${product.link}')">⧉</button>
            </div>
          </div>
        `;
        container.appendChild(div);
      });
      
      toast(`✅ ${data.toplamUrun || 0} ürün bulundu`, "success");
    } else {
      container.innerHTML = `<div class="emptyState"><p>"${query}" için ürün bulunamadı</p></div>`;
    }
  } catch (error) {
    console.error("Fiyat arama hatası:", error);
    container.innerHTML = `
      <div class="errorState">
        <p>❌ Hata: ${error.message}</p>
        <p>API URL: ${API_URL}</p>
        <button class="btnPrimary" onclick="testAPI()">API Test</button>
      </div>
    `;
  }
}

// ========== AI YORUM ==========
async function getAiCommentForFavorite(favorite) {
  try {
    toast("🤖 AI analiz yapıyor...", "info");
    
    const response = await fetch(`${API_URL}/ai-yorum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urun: favorite.query || favorite.urun,
        fiyatlar: [{ site: favorite.siteName || "Site", fiyat: favorite.fiyat || "Fiyat yok" }]
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      const modal = document.createElement('div');
      modal.className = 'aiModal';
      modal.innerHTML = `
        <div class="aiModalContent">
          <div class="aiModalHeader">
            <h3>🤖 AI Değerlendirmesi</h3>
            <button class="closeAiModal">✕</button>
          </div>
          <div class="aiModalBody">
            <div class="aiProduct">
              <strong>${favorite.query || favorite.urun}</strong>
              <small>${favorite.siteName || favorite.site}</small>
            </div>
            <div class="aiComment">
              ${data.aiYorum || data.yorum || "AI yorum yapamadı."}
            </div>
          </div>
          <div class="aiModalFooter">
            <button class="btnPrimary" onclick="this.closest('.aiModal').remove()">Tamam</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      modal.querySelector('.closeAiModal').onclick = () => modal.remove();
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }
  } catch (error) {
    console.error("AI yorum hatası:", error);
    toast("AI servisi kullanılamıyor", "error");
  }
}

// ========== KAMERA AI ==========
async function cameraAiSearch() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    
    const modal = document.createElement('div');
    modal.className = 'cameraModal';
    modal.innerHTML = `
      <div class="cameraContainer">
        <h3>📸 Ürün Fotoğrafı Çek</h3>
        <video id="cameraVideo" autoplay></video>
        <div class="cameraControls">
          <button class="btnPrimary" id="captureBtn">📷 Çek</button>
          <button class="btnGhost" id="cancelBtn">İptal</button>
        </div>
        <canvas id="cameraCanvas" style="display:none"></canvas>
      </div>
    `;
    
    document.body.appendChild(modal);
    const video = modal.querySelector('#cameraVideo');
    video.srcObject = stream;
    
    modal.querySelector('#cancelBtn').onclick = () => {
      stream.getTracks().forEach(t => t.stop());
      modal.remove();
    };
    
    modal.querySelector('#captureBtn').onclick = async () => {
      const canvas = modal.querySelector('#cameraCanvas');
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg');
      stream.getTracks().forEach(t => t.stop());
      modal.remove();
      
      toast("📸 AI analiz ediyor...", "info");
      
      try {
        const response = await fetch(`${API_URL}/kamera-ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageData.split(',')[1], mime: 'image/jpeg' })
        });
        
        const data = await response.json();
        if (data.success) {
          $('qNormal').value = data.urunTahmini || "telefon";
          const mode = getSearchMode();
          if (mode === "fiyat" || mode === "ai") {
            fiyatAra(data.urunTahmini || "telefon");
          } else {
            showPage('search');
            renderSiteList($('normalList'), data.urunTahmini || "telefon");
          }
        }
      } catch (error) {
        console.error("Kamera AI hatası:", error);
        fiyatAra("telefon");
      }
    };
  } catch (error) {
    console.error("Kamera hatası:", error);
    toast("Kamera izni reddedildi", "error");
  }
}

// ========== BUTONLARI BAĞLA ==========
function setupButtons() {
  debugLog("Butonlar bağlanıyor...");
  
  // 1. ANA ARAMA BUTONU
  const btnNormal = $("btnNormal");
  if (btnNormal) {
    btnNormal.onclick = () => {
      const query = ($("qNormal")?.value || "").trim();
      const mode = getSearchMode();
      debugLog("Arama:", { query, mode });
      
      if (!query) {
        toast("Ürün adı girin", "error");
        return;
      }
      
      if (mode === "fiyat" || mode === "ai") {
        fiyatAra(query);
      } else {
        showPage("search");
        renderSiteList($("normalList"), query);
      }
    };
  }
  
  // 2. ARAMA MODU BUTONLARI
  $("modeNormal")?.addEventListener("click", () => setSearchMode("normal"));
  $("modeFiyat")?.addEventListener("click", () => setSearchMode("fiyat"));
  $("modeAI")?.addEventListener("click", () => setSearchMode("ai"));
  setSearchMode(getSearchMode());
  
  // 3. SAYFA BUTONLARI
  document.querySelectorAll('.tab[data-page]').forEach(tab => {
    tab.onclick = () => showPage(tab.dataset.page);
  });
  
  // 4. KAMERA BUTONU
  const cameraTab = document.querySelector('.cameraTab');
  if (cameraTab) cameraTab.onclick = cameraAiSearch;
  
  // 5. HIZLI ARAMA ETİKETLERİ
  document.querySelectorAll('.quickTag').forEach(tag => {
    tag.onclick = () => {
      const query = tag.dataset.query;
      $('qNormal').value = query;
      const mode = getSearchMode();
      if (mode === "fiyat" || mode === "ai") {
        fiyatAra(query);
      } else {
        showPage("search");
        renderSiteList($("normalList"), query);
      }
    };
  });
  
  // 6. ENTER TUŞU
  $("qNormal")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") $("btnNormal")?.click();
  });
  
  debugLog("Tüm butonlar bağlandı");
}

// ========== API TEST ==========
async function testAPI() {
  try {
    const response = await fetch(API_URL.replace('/api/fiyat-cek', '/health'));
    const data = await response.json();
    alert(`API Çalışıyor!\nAI: ${data.ai}\nURL: ${API_URL}`);
  } catch (error) {
    alert(`API HATASI!\n${error.message}\nURL: ${API_URL}`);
  }
}

// ========== YARDIMCI FONKSİYONLAR ==========
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Kopyalandı", 'success');
  } catch (e) {
    console.error("Kopyalama hatası:", e);
  }
}

// ========== UYGULAMA BAŞLANGICI ==========
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 FiyatTakip başlatılıyor...");
  
  setupButtons();
  showPage("home");
  
  console.log("🌐 API URL:", API_URL);
  toast("FiyatTakip hazır!", "success");
});

// ========== GLOBAL FONKSİYONLAR ==========
window.showPage = showPage;
window.fiyatAra = fiyatAra;
window.cameraAiSearch = cameraAiSearch;
window.getAiCommentForFavorite = getAiCommentForFavorite;
window.testAPI = testAPI;
window.copyToClipboard = copyToClipboard;
