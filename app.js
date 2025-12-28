// Fiyat Takip Uygulaması - TAM ÇALIŞAN
const $ = id => document.getElementById(id);
const DEFAULT_API_URL = "https://fiyattakip-api.onrender.com/api";
let API_URL = localStorage.getItem('fiyattakip_api_url') || DEFAULT_API_URL;

// DEĞİŞKENLER
let currentPage = 1;
let currentSort = 'asc';
let currentSearch = '';
let totalPages = 1;

// TOAST MESAJ
function toast(msg, type = 'info') {
  const t = $("toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2200);
}

// SAYFA GEÇİŞİ
function showPage(key) {
  // Tüm sayfaları gizle
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  // Tüm tabları pasif yap
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  
  // İstenen sayfayı aç
  const page = $(`page-${key}`);
  if (page) page.classList.add("active");
  
  // Tab'ı aktif yap
  const tab = document.querySelector(`.tab[data-page="${key}"]`);
  if (tab) tab.classList.add("active");
  
  // Sayfa özel işlemler
  if (key === 'home') renderRecentSearches();
  if (key === 'search') {
    if (!$("normalList").innerHTML.trim()) {
      $("normalList").innerHTML = '<div class="emptyState">🔍 Arama yapın</div>';
    }
  }
}

// ARAMA MODU
function setSearchMode(mode) {
  localStorage.setItem("searchMode", mode);
  $("modeNormal")?.classList.toggle("active", mode === "normal");
  $("modeFiyat")?.classList.toggle("active", mode === "fiyat");
  $("modeAI")?.classList.toggle("active", mode === "ai");
  
  const hint = $("modeHint");
  if (hint) {
    const hints = {
      "normal": "Sadece link oluşturur",
      "fiyat": "Gerçek fiyatları çeker",
      "ai": "AI ile optimize eder"
    };
    hint.textContent = hints[mode] || "";
  }
}
function getSearchMode() { return localStorage.getItem("searchMode") || "normal"; }

// FIYAT ARAMA
async function fiyatAra(query, page = 1, sort = 'asc') {
  if (!query || query.trim().length < 2) {
    toast("En az 2 karakter girin", "error");
    return;
  }
  
  showPage("search");
  const container = $("normalList");
  container.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Fiyatlar çekiliyor...</p>
    </div>
  `;
  
  // Son aramaya kaydet
  saveRecentSearch(query);
  
  try {
    toast("Fiyatlar çekiliyor...", "info");
    
    const response = await fetch(`${API_URL}/fiyat-cek`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        urun: query,
        page: page,
        sort: sort
      })
    });
    
    if (!response.ok) {
      throw new Error(`API hatası: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      currentPage = data.sayfa || 1;
      currentSort = data.siralama || 'asc';
      currentSearch = query;
      totalPages = data.toplamSayfa || 1;
      
      renderFiyatSonuclari(data);
      updatePaginationControls();
      updateSortControls();
      
      toast(`${data.toplamUrun || 0} ürün bulundu`, "success");
    } else {
      throw new Error(data.error || "Fiyat çekilemedi");
    }
    
  } catch (error) {
    console.error("Fiyat arama hatası:", error);
    container.innerHTML = `
      <div class="errorState">
        <div class="errorIcon">😕</div>
        <h3>Fiyat çekilemedi</h3>
        <p>${error.message}</p>
        <button onclick="showPage('home')" class="btnPrimary">Ana Sayfaya Dön</button>
      </div>
    `;
  }
}

// FIYAT SONUÇLARINI GÖSTER
function renderFiyatSonuclari(data) {
  const container = $("normalList");
  if (!container) return;
  
  if (!data.fiyatlar || data.fiyatlar.length === 0) {
    container.innerHTML = `
      <div class="emptyState">
        <div class="emptyIcon">😕</div>
        <h3>Ürün bulunamadı</h3>
        <p>"${data.query}" için sonuç bulunamadı</p>
        <button onclick="showPage('home')" class="btnPrimary">Yeni Arama</button>
      </div>
    `;
    return;
  }
  
  let html = `
    <div class="sortInfo">
      <span>Sıralama: ${currentSort === 'asc' ? '🏷️ En Düşük Fiyat' : '🏷️ En Yüksek Fiyat'}</span>
      <span>Sayfa: ${currentPage}/${totalPages}</span>
      ${data.kategori ? `<span class="kategoriTag">${data.kategori}</span>` : ''}
    </div>
  `;
  
  // En ucuz ürün
  if (data.fiyatlar.length > 0) {
    const cheapest = data.fiyatlar[0];
    html += `
      <div class="cheapestBanner">
        <div class="bannerHeader">
          <span class="badge">🥇 EN UCUZ</span>
          <span class="siteTag">${cheapest.site}</span>
        </div>
        <div class="productInfo">
          <div class="productTitle">${cheapest.urun}</div>
          <div class="productPrice">${cheapest.fiyat}</div>
          <div class="productActions">
            <button class="btnPrimary sm" onclick="window.open('${cheapest.link}', '_blank')">Ürüne Git</button>
            <button class="btnGhost sm" onclick="copyToClipboard('${cheapest.link}')">⧉ Kopyala</button>
          </div>
        </div>
      </div>
    `;
  }
  
  // Diğer ürünler
  html += '<div class="productList">';
  
  data.fiyatlar.forEach((product, index) => {
    if (index === 0) return; // En ucuz zaten gösterildi
    if (index >= 4) return; // Sadece 4 ürün göster
    
    html += `
      <div class="productCard">
        <div class="productRow">
          <div class="productSite">${product.site}</div>
          <div class="productName">${product.urun}</div>
          <div class="productPriceRow">
            <span class="productPrice">${product.fiyat}</span>
            <div class="productActions">
              <button class="btnGhost xs" onclick="window.open('${product.link}', '_blank')">Aç</button>
              <button class="btnGhost xs" onclick="copyToClipboard('${product.link}')">⧉</button>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// SAYFALAMA KONTROLLERİ
function updatePaginationControls() {
  const container = $("normalList");
  if (!container || totalPages <= 1) return;
  
  let paginationHTML = `
    <div class="pagination">
      <button class="pageBtn ${currentPage === 1 ? 'disabled' : ''}" 
              onclick="changePage(${currentPage - 1})" 
              ${currentPage === 1 ? 'disabled' : ''}>
        ⬅️ Önceki
      </button>
      
      <span class="pageInfo">Sayfa ${currentPage} / ${totalPages}</span>
      
      <button class="pageBtn ${currentPage >= totalPages ? 'disabled' : ''}" 
              onclick="changePage(${currentPage + 1})" 
              ${currentPage >= totalPages ? 'disabled' : ''}>
        Sonraki ➡️
      </button>
    </div>
  `;
  
  // Container'ın sonuna ekle
  const existingPagination = container.querySelector('.pagination');
  if (existingPagination) {
    existingPagination.remove();
  }
  
  container.insertAdjacentHTML('beforeend', paginationHTML);
}

// SIRALAMA KONTROLLERİ
function updateSortControls() {
  const container = $("normalList");
  if (!container) return;
  
  let sortHTML = `
    <div class="sortControls">
      <button class="sortBtn ${currentSort === 'asc' ? 'active' : ''}" 
              onclick="changeSort('asc')">
        ⬆️ En Düşük Fiyat
      </button>
      <button class="sortBtn ${currentSort === 'desc' ? 'active' : ''}" 
              onclick="changeSort('desc')">
        ⬇️ En Yüksek Fiyat
      </button>
    </div>
  `;
  
  // Container'ın başına ekle
  const existingSort = container.querySelector('.sortControls');
  if (existingSort) {
    existingSort.remove();
  }
  
  container.insertAdjacentHTML('afterbegin', sortHTML);
}

// SAYFA DEĞİŞTİR
function changePage(newPage) {
  if (newPage < 1 || newPage > totalPages) return;
  fiyatAra(currentSearch, newPage, currentSort);
}

// SIRALAMA DEĞİŞTİR
function changeSort(newSort) {
  if (newSort === currentSort) return;
  fiyatAra(currentSearch, 1, newSort);
}

// SON ARAMALAR
function saveRecentSearch(query) {
  let recent = JSON.parse(localStorage.getItem('fiyattakip_recent') || '[]');
  recent = recent.filter(q => q !== query);
  recent.unshift(query);
  recent = recent.slice(0, 5);
  localStorage.setItem('fiyattakip_recent', JSON.stringify(recent));
  renderRecentSearches();
}

function renderRecentSearches() {
  const container = $("recentList");
  if (!container) return;
  
  const recent = JSON.parse(localStorage.getItem('fiyattakip_recent') || '[]');
  
  if (recent.length === 0) {
    container.innerHTML = '<p class="muted">Henüz arama yapılmadı</p>';
    return;
  }
  
  let html = '';
  recent.forEach(query => {
    html += `
      <div class="recentItem" onclick="handleRecentSearch('${query}')">
        <span>🔍</span>
        <span>${query}</span>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function handleRecentSearch(query) {
  $("qNormal").value = query;
  const mode = getSearchMode();
  
  if (mode === 'fiyat') {
    fiyatAra(query);
  } else {
    showPage('search');
    // Normal arama için basit liste göster
    $("normalList").innerHTML = `
      <div class="cardBox">
        <h3>Normal Arama Modu</h3>
        <p>"${query}" için linkler oluşturulacak</p>
        <button class="btnPrimary" onclick="fiyatAra('${query}')">Fiyat Modunda Ara</button>
      </div>
    `;
  }
}

// KOPYALAMA
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Kopyalandı", 'success');
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
      toast("Kopyalandı", 'success');
    } catch (_) {}
    document.body.removeChild(ta);
  }
}

// API AYARLARI
function openAPIModal() {
  const m = $("apiModal");
  if (!m) return;
  m.classList.add("show");
  $("apiUrl").value = API_URL;
  checkAPIStatus();
}

function closeAPIModal() {
  const m = $("apiModal");
  if (!m) return;
  m.classList.remove("show");
}

async function checkAPIStatus() {
  const statusElement = $("apiStatus");
  if (!statusElement) return;
  
  try {
    statusElement.textContent = "Bağlanıyor...";
    statusElement.className = "apiStatus checking";
    
    const response = await fetch(`${API_URL.replace('/api/fiyat-cek', '/health')}`);
    
    if (response.ok) {
      statusElement.textContent = "Çalışıyor";
      statusElement.className = "apiStatus online";
    } else {
      statusElement.textContent = "Hata";
      statusElement.className = "apiStatus error";
    }
  } catch (error) {
    statusElement.textContent = "Bağlantı yok";
    statusElement.className = "apiStatus offline";
  }
}

function saveAPISettings() {
  const url = $("apiUrl")?.value?.trim() || DEFAULT_API_URL;
  API_URL = url;
  localStorage.setItem('fiyattakip_api_url', url);
  toast("API URL kaydedildi", "success");
  closeAPIModal();
}

// UI BAĞLANTILARI
function wireUI() {
  // API Modal
  $("btnApiSettings")?.addEventListener("click", openAPIModal);
  $("closeApi")?.addEventListener("click", closeAPIModal);
  $("apiBackdrop")?.addEventListener("click", closeAPIModal);
  $("btnSaveApi")?.addEventListener("click", saveAPISettings);
  $("btnTestApi")?.addEventListener("click", checkAPIStatus);
  
  // Arama Modu
  $("modeNormal")?.addEventListener("click", () => setSearchMode("normal"));
  $("modeFiyat")?.addEventListener("click", () => setSearchMode("fiyat"));
  $("modeAI")?.addEventListener("click", () => setSearchMode("ai"));
  setSearchMode(getSearchMode());
  
  // Ana Arama Butonu
  $("btnNormal")?.addEventListener("click", () => {
    const query = ($("qNormal")?.value || "").trim();
    if (!query) return toast("Ürün adı girin", "error");
    
    const mode = getSearchMode();
    fiyatAra(query);
  });
  
  // Enter Tuşu
  $("qNormal")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      $("btnNormal").click();
    }
  });
  
  // Hızlı Aramalar
  document.querySelectorAll(".quickTag").forEach(tag => {
    tag.addEventListener("click", () => {
      const query = tag.dataset.query;
      $("qNormal").value = query;
      fiyatAra(query);
    });
  });
  
  // Tab Butonları
  document.querySelectorAll(".tab[data-page]").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });
  
  // Temizleme Butonları
  $("btnClearSearch")?.addEventListener("click", () => {
    $("normalList").innerHTML = "";
    toast("Arama temizlendi", "info");
  });
}

// UYGULAMA BAŞLANGICI
window.addEventListener("DOMContentLoaded", () => {
  wireUI();
  renderRecentSearches();
  showPage("home");
});

// GLOBAL FONKSİYONLAR
window.showPage = showPage;
window.fiyatAra = fiyatAra;
window.copyToClipboard = copyToClipboard;
window.handleRecentSearch = handleRecentSearch;
window.changePage = changePage;
window.changeSort = changeSort;
window.openAPIModal = openAPIModal;
