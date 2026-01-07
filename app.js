// app.js - Fiyat Takip Uygulaması (Geliştirilmiş Tek Dosya)
import { auth, googleProvider, firebaseConfigLooksInvalid } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ========== KONSTANTLAR ==========
const SITES = [
  { key: "trendyol", name: "Trendyol", build: q => `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key: "hepsiburada", name: "Hepsiburada", build: q => `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key: "n11", name: "N11", build: q => `https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key: "amazontr", name: "Amazon TR", build: q => `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key: "pazarama", name: "Pazarama", build: q => `https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key: "ciceksepeti", name: "ÇiçekSepeti", build: q => `https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key: "idefix", name: "idefix", build: q => `https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` },
];

const DEFAULT_API_URL = "https://fiyattakip-api.onrender.com";
const PAGE_SIZE = 4;
const MAX_COMPARE_ITEMS = 5;
const MAX_RECENT_SEARCHES = 5;

// ========== GLOBAL STATE ==========
class AppState {
  constructor() {
    this.currentUser = null;
    this.favorites = [];
    this.compareItems = JSON.parse(localStorage.getItem('fiyattakip_compare') || '[]');
    this.currentPage = 1;
    this.currentSort = 'asc';
    this.currentSearch = '';
    this.totalPages = 1;
    this.allProducts = [];
    this.API_URL = localStorage.getItem('fiyattakip_api_url') || DEFAULT_API_URL;
  }

  saveCompareItems() {
    localStorage.setItem('fiyattakip_compare', JSON.stringify(this.compareItems));
  }

  clearCompareItems() {
    this.compareItems = [];
    this.saveCompareItems();
  }

  addToCompare(product, query = "") {
    if (this.compareItems.length >= MAX_COMPARE_ITEMS) {
      this.showToast("Maksimum 5 ürün karşılaştırabilirsiniz", "warning");
      return false;
    }

    const existing = this.compareItems.find(item => item.link === product.link);
    if (existing) {
      this.removeFromCompare(existing.id);
      return false;
    }

    const compareItem = {
      id: 'compare_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      title: product.urun || product.title || product.query || "",
      price: product.fiyat || "Fiyat bilgisi yok",
      site: product.site || "",
      link: product.link || "",
      query: query,
      addedAt: Date.now()
    };

    this.compareItems.push(compareItem);
    this.saveCompareItems();
    return true;
  }

  removeFromCompare(itemId) {
    this.compareItems = this.compareItems.filter(item => item.id !== itemId);
    this.saveCompareItems();
  }

  showToast(msg, type = 'info') {
    const t = document.getElementById("toast");
    if (!t) { console.log(msg); return; }
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.classList.remove("hidden");
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => t.classList.add("hidden"), 2200);
  }
}

// ========== UYGULAMA ==========
const $ = (id) => document.getElementById(id);
const db = getFirestore();
const appState = new AppState();

// ========== SAYFA GEÇİŞLERİ ==========
function showPage(key) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

  const page = document.querySelector(`#page-${CSS.escape(key)}`);
  if (page) page.classList.add("active");

  const tab = document.querySelector(`.tab[data-page="${CSS.escape(key)}"]`);
  if (tab) tab.classList.add("active");

  if (key === 'favs') renderFavoritesPage();
  if (key === 'home') renderRecentSearches();
  if (key === 'search') updateCompareButtons();
}

// ========== ARAMA MODU ==========
function setSearchMode(mode) {
  localStorage.setItem("searchMode", mode);
  $("modeNormal")?.classList.toggle("active", mode === "normal");
  $("modeFiyat")?.classList.toggle("active", mode === "fiyat");
  $("modeAI")?.classList.toggle("active", mode === "ai");
  
  const hint = $("modeHint");
  if (hint) {
    const hints = {
      "normal": "Link modu: Sadece arama linkleri oluşturur",
      "fiyat": "Fiyat modu: Gerçek fiyatları çeker (Render API)",
      "ai": "AI modu: AI ile optimize edilmiş arama"
    };
    hint.textContent = hints[mode] || "";
  }
}

function getSearchMode() {
  return localStorage.getItem("searchMode") || "normal";
}

// ========== FIYAT ARAMA (Render API) ==========
async function fiyatAra(query, page = 1, sort = 'asc') {
  if (!query.trim()) {
    appState.showToast("Lütfen bir şey yazın", "error");
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

  saveRecentSearch(query);
  appState.showToast("Fiyatlar çekiliyor...", "info");

  try {
    const response = await fetch(`${appState.API_URL}/fiyat-cek`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        urun: query,
        page: page,
        sort: sort
      })
    });

    if (!response.ok) throw new Error(`API hatası: ${response.status}`);

    const data = await response.json();
    
    if (data.success) {
      appState.currentPage = data.sayfa || 1;
      appState.currentSort = data.siralama || 'asc';
      appState.currentSearch = query;
      appState.totalPages = data.toplamSayfa || 1;
      appState.allProducts = data.fiyatlar || [];
      
      renderFiyatSonuclari(data);
      updatePaginationControls();
      updateSortControls();
      updateCompareButtons();
      
      appState.showToast(`${data.toplamUrun || 0} ürün bulundu (Sayfa ${appState.currentPage}/${appState.totalPages})`, "success");
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

// ========== FIYAT SONUÇLARI ==========
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
      <span>Sıralama: ${appState.currentSort === 'asc' ? '🏷️ En Düşük Fiyat' : '🏷️ En Yüksek Fiyat'}</span>
      <span>Sayfa: ${appState.currentPage}/${appState.totalPages}</span>
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
            <button class="btnCompare sm" data-link="${cheapest.link}" data-title="${cheapest.urun}" data-price="${cheapest.fiyat}" data-site="${cheapest.site}">⚖️ Ekle</button>
            <button class="btnFav isFav" data-fav-url="${cheapest.link}" data-site-key="${cheapest.site.toLowerCase()}" data-site-name="${cheapest.site}" data-query="${data.query}">❤️</button>
          </div>
        </div>
      </div>
    `;
  }

  // Diğer ürünler
  html += '<div class="productList">';
  
  data.fiyatlar.forEach((product, index) => {
    if (index === 0 || index >= 4) return;
    
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
              <button class="btnGhost xs btnCompare" data-link="${product.link}" data-title="${product.urun}" data-price="${product.fiyat}" data-site="${product.site}">⚖️</button>
              <button class="btnGhost xs btnFav" data-fav-url="${product.link}" data-site-key="${product.site.toLowerCase()}" data-site-name="${product.site}" data-query="${data.query}">🤍</button>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
  
  applyFavUI();
  setupCompareButtons();
}

// ========== SAYFALAMA ==========
function updatePaginationControls() {
  const container = $("normalList");
  if (!container || appState.totalPages <= 1) return;
  
  let paginationHTML = `
    <div class="pagination">
      <button class="pageBtn ${appState.currentPage === 1 ? 'disabled' : ''}" 
              onclick="changePage(${appState.currentPage - 1})" 
              ${appState.currentPage === 1 ? 'disabled' : ''}>
        ⬅️ Önceki
      </button>
      <span class="pageInfo">Sayfa ${appState.currentPage} / ${appState.totalPages}</span>
      <button class="pageBtn ${appState.currentPage >= appState.totalPages ? 'disabled' : ''}" 
              onclick="changePage(${appState.currentPage + 1})" 
              ${appState.currentPage >= appState.totalPages ? 'disabled' : ''}>
        Sonraki ➡️
      </button>
    </div>
  `;
  
  const existing = container.querySelector('.pagination');
  if (existing) existing.remove();
  container.insertAdjacentHTML('beforeend', paginationHTML);
}

function updateSortControls() {
  const container = $("normalList");
  if (!container) return;
  
  let sortHTML = `
    <div class="sortControls">
      <button class="sortBtn ${appState.currentSort === 'asc' ? 'active' : ''}" onclick="changeSort('asc')">
        ⬆️ En Düşük Fiyat
      </button>
      <button class="sortBtn ${appState.currentSort === 'desc' ? 'active' : ''}" onclick="changeSort('desc')">
        ⬇️ En Yüksek Fiyat
      </button>
    </div>
  `;
  
  const existing = container.querySelector('.sortControls');
  if (existing) existing.remove();
  container.insertAdjacentHTML('afterbegin', sortHTML);
}

// ========== KARŞILAŞTIRMA SİSTEMİ ==========
function setupCompareButtons() {
  document.querySelectorAll('.btnCompare').forEach(btn => {
    const link = btn.getAttribute('data-link');
    const isInCompare = appState.compareItems.some(item => item.link === link);
    
    btn.classList.toggle('added', isInCompare);
    btn.innerHTML = isInCompare ? '✓' : (btn.classList.contains('xs') ? '⚖️' : '⚖️ Ekle');
    btn.title = isInCompare ? 'Karşılaştırmadan çıkar' : 'Karşılaştırmaya ekle';
    
    btn.onclick = function(e) {
      e.stopPropagation();
      const product = {
        urun: btn.getAttribute('data-title'),
        fiyat: btn.getAttribute('data-price'),
        site: btn.getAttribute('data-site'),
        link: link
      };
      
      const added = appState.addToCompare(product, appState.currentSearch);
      if (added) {
        appState.showToast(`"${product.urun.substring(0, 30)}..." karşılaştırmaya eklendi`, "success");
      } else {
        appState.showToast(`"${product.urun.substring(0, 30)}..." karşılaştırmadan çıkarıldı`, "info");
      }
      
      updateCompareButtons();
      if (appState.compareItems.length === 1) {
        setTimeout(openCompareModal, 300);
      }
    };
  });
}

function updateCompareButtons() {
  document.querySelectorAll('.btnCompare').forEach(btn => {
    const link = btn.getAttribute('data-link');
    const isInCompare = appState.compareItems.some(item => item.link === link);
    
    btn.classList.toggle('added', isInCompare);
    btn.innerHTML = isInCompare ? '✓' : (btn.classList.contains('xs') ? '⚖️' : '⚖️ Ekle');
  });
}

function openCompareModal() {
  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.id = 'compareModal';
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="closeCompareModal()"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h3>⚖️ Karşılaştırma (${appState.compareItems.length})</h3>
        <button class="close-btn" onclick="closeCompareModal()">✕</button>
      </div>
      <div class="modal-body" id="compareListModal">
        ${renderCompareList()}
      </div>
      <div class="modal-footer">
        <button class="btnGhost" onclick="clearCompareList()">🗑️ Temizle</button>
        <button class="btnPrimary" onclick="runAICompare()" ${appState.compareItems.length < 2 ? 'disabled' : ''}>🤖 AI Karşılaştır</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.classList.add("modalOpen");
}

function closeCompareModal() {
  const modal = document.getElementById('compareModal');
  if (modal) {
    modal.remove();
    document.body.classList.remove("modalOpen");
  }
}

function renderCompareList() {
  if (appState.compareItems.length === 0) {
    return `
      <div class="emptyState">
        <div class="emptyIcon">⚖️</div>
        <h3>Karşılaştırma Listesi Boş</h3>
        <p>Ürünlerdeki "⚖️ Ekle" butonuna tıklayın.</p>
      </div>
    `;
  }

  let html = '<div class="compare-grid">';
  
  appState.compareItems.forEach(item => {
    html += `
      <div class="compare-card">
        <div class="compare-header">
          <span class="site-badge">${item.site}</span>
          <button class="remove-btn" onclick="removeFromCompare('${item.id}')">✕</button>
        </div>
        <div class="compare-title">${item.title.substring(0, 40)}${item.title.length > 40 ? '...' : ''}</div>
        <div class="compare-price">${item.price}</div>
        <div class="compare-actions">
          <button class="btnGhost xs" onclick="window.open('${item.link}', '_blank')">Aç</button>
          <button class="btnGhost xs" onclick="copyToClipboard('${item.link}')">⧉</button>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  return html;
}

async function runAICompare() {
  if (appState.compareItems.length < 2) {
    appState.showToast("En az 2 ürün karşılaştırmaya ekleyin", "warning");
    return;
  }

  appState.showToast("🤖 AI karşılaştırma yapılıyor...", "info");

  try {
    const prompt = `
    Aşağıdaki ${appState.compareItems.length} ürünü karşılaştır:
    
    ${appState.compareItems.map((item, i) => `
    ÜRÜN ${i+1}: ${item.title}
    - Site: ${item.site}
    - Fiyat: ${item.price}
    `).join('\n')}
    
    Fiyat-performans, kalite ve öneri açısından değerlendir.
    Kısa ve Türkçe yanıt ver.
    `;

    const aiResponse = await getAiYorumSafe({
      title: `${appState.compareItems.length} Ürün Karşılaştırması`,
      price: appState.compareItems.map(item => item.price).join(' vs '),
      site: 'Karşılaştırma',
      originalQuery: prompt
    });

    // AI sonucunu göster
    const aiResult = document.createElement('div');
    aiResult.className = 'ai-result';
    aiResult.innerHTML = `
      <div class="ai-header">🤖 AI Karşılaştırma Raporu</div>
      <div class="ai-content">${aiResponse.replace(/\n/g, '<br>')}</div>
    `;
    
    const modalBody = document.getElementById('compareListModal');
    if (modalBody) {
      modalBody.appendChild(aiResult);
    }
    
    appState.showToast("AI karşılaştırma tamamlandı", "success");
  } catch (error) {
    appState.showToast("AI karşılaştırma başarısız", "error");
    console.error("AI hatası:", error);
  }
}

// ========== FAVORİ İŞLEMLERİ ==========
function favIdFromUrl(url) {
  try {
    const u = new URL(url);
    const key = (u.hostname + u.pathname + u.search).toLowerCase();
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = ((h << 5) - h) + key.charCodeAt(i);
      h |= 0;
    }
    return "fav_" + Math.abs(h);
  } catch {
    return "fav_" + Math.random().toString(36).slice(2);
  }
}

const FAV_COLL = (uid) => collection(db, "users", uid, "favorites");

async function loadFavorites(uid) {
  if (!uid) { appState.favorites = []; return appState.favorites; }
  try {
    const snap = await getDocs(FAV_COLL(uid));
    appState.favorites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Favori yükleme hatası:", e);
    appState.favorites = [];
  }
  return appState.favorites;
}

function isFav(url) {
  const id = favIdFromUrl(url);
  return appState.favorites.some(f => f.id === id);
}

async function toggleFavorite(uid, fav) {
  if (!uid) { openLogin(); return; }
  
  const id = favIdFromUrl(fav.url);
  const ref = doc(db, "users", uid, "favorites", id);
  
  if (appState.favorites.some(f => f.id === id)) {
    await deleteDoc(ref);
    appState.showToast("Favoriden çıkarıldı", 'info');
  } else {
    await setDoc(ref, {
      ...fav,
      createdAt: Date.now(),
    }, { merge: true });
    appState.showToast("Favorilere eklendi", 'success');
  }
  await loadFavorites(uid);
  applyFavUI();
}

function applyFavUI() {
  document.querySelectorAll("[data-fav-url]").forEach(btn => {
    const url = btn.getAttribute("data-fav-url") || "";
    const fav = isFav(url);
    btn.classList.toggle("isFav", fav);
    btn.innerHTML = fav ? "❤️" : "🤍";
    btn.title = fav ? "Favoride" : "Favoriye ekle";
  });
}

function renderFavoritesPage() {
  const list = $("favList");
  if (!list) return;
  list.innerHTML = "";
  
  if (!appState.favorites.length) {
    list.innerHTML = `<div class="emptyState">Favori yok.</div>`;
    return;
  }
  
  // Sayfalama
  const pageSize = 4;
  const startIndex = (appState.currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedFavs = appState.favorites.slice(startIndex, endIndex);
  const favTotalPages = Math.ceil(appState.favorites.length / pageSize);
  
  // Sayfalama kontrolleri
  let paginationHTML = '';
  if (favTotalPages > 1) {
    paginationHTML = `
      <div class="favPagination">
        <button class="pageBtn ${appState.currentPage === 1 ? 'disabled' : ''}" 
                onclick="changeFavPage(${appState.currentPage - 1})" 
                ${appState.currentPage === 1 ? 'disabled' : ''}>
          ⬅️
        </button>
        <span class="pageInfo">${appState.currentPage}/${favTotalPages}</span>
        <button class="pageBtn ${appState.currentPage >= favTotalPages ? 'disabled' : ''}" 
                onclick="changeFavPage(${appState.currentPage + 1})" 
                ${appState.currentPage >= favTotalPages ? 'disabled' : ''}>
          ➡️
        </button>
      </div>
    `;
  }
  
  list.innerHTML = paginationHTML;
  
  for (const fav of pagedFavs) {
    const card = document.createElement("div");
    card.className = "cardBox favoriteCard";
    card.innerHTML = `
      <div class="favoriteHeader">
        <div class="favoriteInfo">
          <div class="favSite">${fav.siteName || "Favori"}</div>
          <div class="favQuery">${fav.query || fav.urun || ""}</div>
          ${fav.fiyat ? `<div class="favPrice">${fav.fiyat}</div>` : ''}
        </div>
        <div class="favoriteActions">
          <button class="btnGhost sm" onclick="window.open('${fav.url || ""}', '_blank')">Aç</button>
          <button class="btnGhost sm btnCompare" data-link="${fav.url || ""}" data-title="${fav.query || fav.urun || ""}" data-price="${fav.fiyat || ''}" data-site="${fav.siteName || ''}">⚖️</button>
          <button class="btnGhost sm btnFav isFav" data-fav-url="${fav.url || ""}">❤️</button>
        </div>
      </div>
    `;
    
    // Favori çıkar butonu
    card.querySelector('.btnFav').addEventListener('click', async () => {
      await toggleFavorite(appState.currentUser?.uid, { 
        url: fav.url, 
        siteKey: fav.siteKey, 
        siteName: fav.siteName, 
        query: fav.query 
      });
      renderFavoritesPage();
    });
    
    list.appendChild(card);
  }
  
  // Alt sayfalama
  if (favTotalPages > 1) {
    list.insertAdjacentHTML('beforeend', paginationHTML);
  }
  
  applyFavUI();
  setupCompareButtons();
}

// ========== KAMERA AI ARAMA ==========
async function cameraAiSearch() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    
    const modal = document.createElement('div');
    modal.className = 'cameraModal';
    modal.innerHTML = `
      <div class="cameraContainer">
        <div class="cameraHeader">
          <h3>📸 Ürün Fotoğrafı Çek</h3>
          <button class="closeCamera">✕</button>
        </div>
        <video id="cameraVideo" autoplay playsinline></video>
        <div class="cameraControls">
          <button class="btnPrimary" id="captureBtn">📷 Çek</button>
          <button class="btnGhost" id="cancelBtn">İptal</button>
        </div>
        <canvas id="cameraCanvas" style="display:none;"></canvas>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const video = modal.querySelector('#cameraVideo');
    video.srcObject = stream;
    
    modal.querySelector('.closeCamera').onclick = 
    modal.querySelector('#cancelBtn').onclick = () => {
      stream.getTracks().forEach(track => track.stop());
      modal.remove();
    };
    
    modal.querySelector('#captureBtn').onclick = async () => {
      const canvas = modal.querySelector('#cameraCanvas');
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg');
      
      stream.getTracks().forEach(track => track.stop());
      modal.remove();
      
      appState.showToast("Görsel AI ile analiz ediliyor...", "info");
      
      try {
        const response = await fetch(`${appState.API_URL}/kamera-ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: imageData.split(',')[1],
            mime: 'image/jpeg'
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            fiyatAra(data.urunTahmini || data.tespitEdilen || 'telefon');
          }
        }
      } catch (error) {
        console.error("Kamera AI hatası:", error);
        appState.showToast("AI analiz başarısız, normal arama yapılıyor", "warning");
        fiyatAra('telefon');
      }
    };
    
  } catch (error) {
    console.error("Kamera hatası:", error);
    appState.showToast("Kamera erişimi reddedildi", "error");
  }
}

// ========== SON ARAMALAR ==========
function saveRecentSearch(query) {
  let recent = JSON.parse(localStorage.getItem('fiyattakip_recent') || '[]');
  recent = recent.filter(q => q !== query);
  recent.unshift(query);
  recent = recent.slice(0, MAX_RECENT_SEARCHES);
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
        <button class="recentRemove" onclick="event.stopPropagation(); removeRecentSearch('${query}')">✕</button>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// ========== NORMAL ARAMA (Link-only) ==========
function renderSiteList(container, query) {
  if (!container) return;
  const q = String(query || "").trim();
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
          <button class="btnPrimary sm btnOpen">Aç</button>
          <button class="btnGhost sm btnCopy" data-copy-url="${url}">⧉</button>
          <button class="btnGhost sm btnCompare" data-link="${url}" data-title="${q}" data-site="${s.name}">⚖️</button>
          <button class="btnGhost sm btnFav" data-fav-url="${url}" data-site-key="${s.key}" data-site-name="${s.name}" data-query="${q}">🤍</button>
        </div>
      </div>
    `;
    
    card.querySelector(".btnOpen").addEventListener("click", () => {
      window.open(url, "_blank", "noopener");
    });
    
    card.querySelector(".btnCopy").addEventListener("click", async () => {
      await copyToClipboard(url);
    });
    
    card.querySelector(".btnFav").addEventListener("click", async () => {
      if (!appState.currentUser) return openLogin();
      await toggleFavorite(appState.currentUser.uid, { 
        url, 
        siteKey: s.key, 
        siteName: s.name, 
        query: q 
      });
    });
    
    container.appendChild(card);
  }
  
  applyFavUI();
  setupCompareButtons();
}

// ========== AUTH İŞLEMLERİ ==========
function setAuthPane(mode) {
  const loginPane = $("loginPane");
  const registerPane = $("registerPane");
  const tL = $("tabLogin");
  const tR = $("tabRegister");
  if (!loginPane || !registerPane) return;
  
  const isReg = mode === "register";
  loginPane.classList.toggle("hidden", isReg);
  registerPane.classList.toggle("hidden", !isReg);
  tL?.classList.toggle("isActive", !isReg);
  tR?.classList.toggle("isActive", isReg);
}

function openLogin() {
  setAuthPane('login');
  const m = $("loginModal");
  if (!m) return;
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
  document.body.classList.add("modalOpen");
}

function closeLogin() {
  const m = $("loginModal");
  if (!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modalOpen");
}

async function doEmailLogin(isRegister) {
  const btnL = $("btnLogin");
  const btnR = $("btnRegister");
  if (btnL) btnL.disabled = true;
  if (btnR) btnR.disabled = true;

  const email = (isRegister ? ($("regEmail")?.value || "") : ($("loginEmail")?.value || "")).trim();
  const pass = (isRegister ? ($("regPass")?.value || "") : ($("loginPass")?.value || ""));
  const pass2 = (isRegister ? ($("regPass2")?.value || "") : "");

  if (!email || !pass) {
    if (btnL) btnL.disabled = false;
    if (btnR) btnR.disabled = false;
    return appState.showToast("E-posta ve şifre gir.", "error");
  }
  
  if (isRegister) {
    if (pass.length < 6) {
      if (btnL) btnL.disabled = false;
      if (btnR) btnR.disabled = false;
      return appState.showToast("Şifre en az 6 karakter olmalı.", "error");
    }
    if (!pass2 || pass !== pass2) {
      if (btnL) btnL.disabled = false;
      if (btnR) btnR.disabled = false;
      return appState.showToast("Şifreler uyuşmuyor.", "error");
    }
  }

  appState.showToast(isRegister ? "Kayıt deneniyor..." : "Giriş deneniyor...", "info");

  try {
    if (isRegister) {
      await createUserWithEmailAndPassword(auth, email, pass);
      appState.showToast("Kayıt tamam. Giriş yapıldı.", "success");
      setAuthPane("login");
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      appState.showToast("Giriş başarılı.", "success");
    }
  } catch (e) {
    console.error(e);
    const code = String(e?.code || "");
    const msg = String(e?.message || e || "");
    if (code.includes("auth/email-already-in-use")) return appState.showToast("Bu e-posta zaten kayıtlı. Giriş yap.", "error");
    if (code.includes("auth/weak-password")) return appState.showToast("Şifre çok zayıf (en az 6 karakter).", "error");
    if (code.includes("auth/invalid-email")) return appState.showToast("E-posta formatı hatalı.", "error");
    appState.showToast("Hata: " + msg.replace(/^Firebase:\s*/, ""), "error");
  } finally {
    if (btnL) btnL.disabled = false;
    if (btnR) btnR.disabled = false;
  }
}

async function doGoogleLogin() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (msg.includes("auth/unauthorized-domain")) {
      appState.showToast("Google giriş için domain yetkisi yok. Firebase > Authentication > Settings > Authorized domains içine siteni ekle (örn: fiyattakip.github.io).", "error");
      return;
    }
    appState.showToast("Google giriş hatası: " + msg.replace(/^Firebase:\s*/, ""), "error");
  }
}

// ========== YARDIMCI FONKSİYONLAR ==========
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    appState.showToast("Kopyalandı", 'success');
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
      appState.showToast("Kopyalandı", 'success');
    } catch (_) { }
    document.body.removeChild(ta);
  }
}

// ========== AI YORUM FONKSİYONU ==========
async function getAiYorumSafe(payload) {
  const API_BASE = "https://fiyattakip-api.onrender.com";
  
  const requestBody = {
    title: payload.title,
    price: payload.price,
    site: payload.site,
    originalQuery: payload.originalQuery
  };

  try {
    const response = await fetch(`${API_BASE}/ai/yorum`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`API Hatası: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      return data.yorum || `${payload.originalQuery || payload.title} için AI değerlendirmesi mevcut.`;
    } else {
      throw new Error(data.error || "AI yorumu alınamadı");
    }
    
  } catch (error) {
    console.error("AI Yorum Hatası:", error);
    
    return `
🤖 ${payload.originalQuery || payload.title} ürünü ${payload.site || "pazar yerinde"} incelendi.
${payload.price ? `💰 Fiyat: ${payload.price}` : "💵 Fiyat bilgisi mevcut değil"}
⭐ AI Analizi: Ürün teknik özellikleri ve kullanıcı deneyimleri ışığında değerlendirilebilir.
    `.trim();
  }
}

// ========== UI WIRING ==========
function wireUI() {
  // Arama modu
  $("modeNormal")?.addEventListener("click", () => setSearchMode("normal"));
  $("modeFiyat")?.addEventListener("click", () => setSearchMode("fiyat"));
  $("modeAI")?.addEventListener("click", () => setSearchMode("ai"));
  setSearchMode(getSearchMode());

  // Ana arama butonu
  $("btnNormal")?.addEventListener("click", async () => {
    const query = ($("qNormal")?.value || "").trim();
    if (!query) return appState.showToast("Ürün adı girin", "error");
    
    const mode = getSearchMode();
    
    if (mode === "fiyat") {
      await fiyatAra(query);
    } else if (mode === "ai") {
      appState.showToast("AI ile optimize ediliyor...", "info");
      await fiyatAra(query);
    } else {
      showPage("search");
      renderSiteList($("normalList"), query);
    }
  });

  // Enter tuşu ile arama
  $("qNormal")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      $("btnNormal").click();
    }
  });

  // Hızlı arama etiketleri
  document.querySelectorAll(".quickTag").forEach(tag => {
    tag.addEventListener("click", () => {
      const query = tag.dataset.query;
      $("qNormal").value = query;
      const mode = getSearchMode();
      
      if (mode === "fiyat") {
        fiyatAra(query);
      } else {
        showPage("search");
        renderSiteList($("normalList"), query);
      }
    });
  });

  // Tab butonları
  document.querySelectorAll(".tab[data-page]").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });

  // Copy butonları
  document.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("[data-copy-url]");
    if (!btn) return;
    const url = btn.getAttribute("data-copy-url") || "";
    if (url) await copyToClipboard(url);
  });

  // Login/Register
  $("tabLogin")?.addEventListener("click", () => setAuthPane("login"));
  $("tabRegister")?.addEventListener("click", () => setAuthPane("register"));
  $("btnLogin")?.addEventListener("click", () => doEmailLogin(false));
  $("btnRegister")?.addEventListener("click", () => doEmailLogin(true));
  $("btnGoogleLogin")?.addEventListener("click", () => doGoogleLogin());
  $("btnGoogleLogin2")?.addEventListener("click", () => doGoogleLogin());

  // Logout
  $("logoutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      appState.showToast("Çıkış yapıldı", "info");
    } catch (error) {
      console.error("Çıkış hatası:", error);
    }
  });

  // Favori yenileme
  $("btnFavRefresh")?.addEventListener("click", async () => {
    if (!appState.currentUser) return openLogin();
    await loadFavorites(appState.currentUser.uid);
    renderFavoritesPage();
    appState.showToast("Favoriler yenilendi", "info");
  });

  // Karşılaştırma butonu
  const compareBtn = document.createElement('button');
  compareBtn.className = 'tab compare-tab';
  compareBtn.innerHTML = `<span class="ico">⚖️</span><span class="lbl">Karşılaştır</span>`;
  compareBtn.onclick = openCompareModal;
  document.querySelector('.tabbar')?.appendChild(compareBtn);
}

// ========== AUTH DURUMU ==========
function setAuthedUI(isAuthed) {
  if (!isAuthed) {
    openLogin();
  } else {
    closeLogin();
  }
}

// ========== UYGULAMA BAŞLANGICI ==========
window.addEventListener("DOMContentLoaded", () => {
  wireUI();
  renderRecentSearches();
  
  if (firebaseConfigLooksInvalid()) {
    appState.showToast("Firebase config eksik/yanlış. firebase.js içindeki değerleri kontrol et.", "error");
  }

  onAuthStateChanged(auth, async (user) => {
    appState.currentUser = user || null;
    setAuthedUI(!!user);
    if (user) {
      try {
        await loadFavorites(user.uid);
        renderFavoritesPage();
        applyFavUI();
      } catch (e) { console.error(e); }
    }
  });
});

// ========== GLOBAL FONKSIYONLAR ==========
window.showPage = showPage;
window.fiyatAra = fiyatAra;
window.copyToClipboard = copyToClipboard;
window.handleRecentSearch = (query) => {
  $("qNormal").value = query;
  const mode = getSearchMode();
  if (mode === 'fiyat') {
    fiyatAra(query);
  } else {
    showPage('search');
    renderSiteList($('normalList'), query);
  }
};
window.removeRecentSearch = (query) => {
  let recent = JSON.parse(localStorage.getItem('fiyattakip_recent') || '[]');
  recent = recent.filter(q => q !== query);
  localStorage.setItem('fiyattakip_recent', JSON.stringify(recent));
  renderRecentSearches();
};
window.changePage = (newPage) => {
  if (newPage < 1 || newPage > appState.totalPages) return;
  fiyatAra(appState.currentSearch, newPage, appState.currentSort);
};
window.changeSort = (newSort) => {
  if (newSort === appState.currentSort) return;
  fiyatAra(appState.currentSearch, 1, newSort);
};
window.changeFavPage = (newPage) => {
  if (newPage < 1) return;
  const pageSize = 4;
  const totalPages = Math.ceil(appState.favorites.length / pageSize);
  if (newPage > totalPages) return;
  appState.currentPage = newPage;
  renderFavoritesPage();
};
window.cameraAiSearch = cameraAiSearch;
window.openCompareModal = openCompareModal;
window.closeCompareModal = closeCompareModal;
window.removeFromCompare = (itemId) => {
  appState.removeFromCompare(itemId);
  updateCompareButtons();
  if (document.getElementById('compareModal')?.classList.contains('show')) {
    const modalBody = document.getElementById('compareListModal');
    if (modalBody) {
      modalBody.innerHTML = renderCompareList();
    }
  }
};
window.clearCompareList = () => {
  if (appState.compareItems.length === 0) return;
  if (confirm(`${appState.compareItems.length} ürünü karşılaştırmadan çıkarmak istiyor musunuz?`)) {
    appState.clearCompareItems();
    updateCompareButtons();
    appState.showToast("Karşılaştırma listesi temizlendi", "success");
    if (document.getElementById('compareModal')?.classList.contains('show')) {
      const modalBody = document.getElementById('compareListModal');
      if (modalBody) {
        modalBody.innerHTML = renderCompareList();
      }
    }
  }
};
window.runAICompare = runAICompare;
