// app.js - Fiyat Takip Uygulaması (Render API entegreli)
import { auth, googleProvider, firebaseConfigLooksInvalid } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore();
const $ = (id) => document.getElementById(id);

// ========== API KONFİGÜRASYONU ==========
const DEFAULT_API_URL = "https://fiyattakip-api.onrender.com/api";
let API_URL = localStorage.getItem('fiyattakip_api_url') || DEFAULT_API_URL;

// ========== SAYFALAMA AYARLARI ==========
let currentPage = 1;
let favPage = 1;
let currentSort = 'asc';
let currentSearch = '';
let totalPages = 1;
let allProducts = [];

// ========== FAVORİLER ==========
let favCache = [];

// ========== TOAST MESAJ ==========
function toast(msg, type = 'info'){
  const t = $("toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.add("hidden"), 2200);
}

// ========== SAYFA GEÇİŞLERİ ==========
function showPage(key){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));

  const page = document.querySelector(`#page-${CSS.escape(key)}`);
  if (page) page.classList.add("active");

  const tab = document.querySelector(`.tab[data-page="${CSS.escape(key)}"]`);
  if (tab) tab.classList.add("active");

  // Sayfa özel işlemler
  if (key === 'favs') { favPage = 1; renderFavoritesPage(window.currentUser?.uid); }
  if (key === 'home') renderRecentSearches();
}

// ========== ARAMA MODU AYARLARI ==========
function setSearchMode(mode){
  localStorage.setItem("searchMode", mode);
  $("modeNormal")?.classList.toggle("active", mode==="normal");
  $("modeFiyat")?.classList.toggle("active", mode==="fiyat");
  $("modeAI")?.classList.toggle("active", mode==="ai");
  const hint = $("modeHint");
  if (hint){
    const hints = {
      "normal": "Link modu: Sadece arama linkleri oluşturur",
      "fiyat": "Fiyat modu: Gerçek fiyatları çeker (Render API)",
      "ai": "AI modu: AI ile optimize edilmiş arama"
    };
    hint.textContent = hints[mode] || "";
  }
}

function getSearchMode(){
  return localStorage.getItem("searchMode") || "normal";
}

// ========== FIYAT ARAMA (Render API) ==========
async function fiyatAra(query, page = 1, sort = 'asc') {
  if (!query.trim()) {
    toast("Lütfen bir şey yazın", "error");
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
      headers: {
        "Content-Type": "application/json",
      },
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
      // Global değişkenlere kaydet
      currentPage = data.sayfa || 1;
      currentSort = data.siralama || 'asc';
      currentSearch = query;
      totalPages = data.toplamSayfa || 1;
      allProducts = data.fiyatlar || [];
      
      renderFiyatSonuclari(data);
      updatePaginationControls();
      updateSortControls();
      
      toast(`${data.toplamUrun || 0} ürün bulundu (Sayfa ${currentPage}/${totalPages})`, "success");
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

// ========== FIYAT SONUÇLARINI GÖSTER (4'erli) ==========
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

  let html = '';
  
  // Sıralama bilgisi
  html += `
    <div class="sortInfo">
      <span>Sıralama: ${currentSort === 'asc' ? '🏷️ En Düşük Fiyat' : '🏷️ En Yüksek Fiyat'}</span>
      <span>Sayfa: ${currentPage}/${totalPages}</span>
    </div>
  `;
  
  // En ucuz ürün banner'ı (ilk ürün)
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
            <button class="btnPrimary sm" onclick="safeOpen('${cheapest.link}')">Ürüne Git</button>
            <button class="btnGhost sm" onclick="copyToClipboard('${cheapest.link}')">⧉ Kopyala</button>
            <button class="btnGhost sm" onclick="aiCommentForSearch('${data.query}')">🤖 AI</button>
            <button class="btnFav isFav" data-fav-url="${cheapest.link}" 
                    data-site-key="${cheapest.site.toLowerCase()}" 
                    data-site-name="${cheapest.site}" 
                    data-query="${data.query}">❤️</button>
          </div>
        </div>
      </div>
    `;
  }

  // Diğer ürünler (max 3 tane - toplam 4 ürün)
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
              <button class="btnGhost xs" onclick="safeOpen('${product.link}')">Aç</button>
              <button class="btnGhost xs" onclick="copyToClipboard('${product.link}')">⧉</button>
              <button class="btnGhost xs" onclick="aiCommentForSearch('${data.query}')">🤖</button>
              <button class="btnGhost xs btnFav" 
                      data-fav-url="${product.link}" 
                      data-site-key="${product.site.toLowerCase()}" 
                      data-site-name="${product.site}" 
                      data-query="${data.query}">🤍</button>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
  
  applyFavUI();
}

// ========== SAYFALAMA KONTROLLERİ ==========
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

// ========== SIRALAMA KONTROLLERİ ==========
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

// ========== SAYFA DEĞİŞTİRME ==========
function changePage(newPage) {
  if (newPage < 1 || newPage > totalPages) return;
  fiyatAra(currentSearch, newPage, currentSort);
}

// ========== SIRALAMA DEĞİŞTİRME ==========
function changeSort(newSort) {
  if (newSort === currentSort) return;
  fiyatAra(currentSearch, 1, newSort);
}

// ========== KAMERA AI ARAMA ==========
async function cameraAiSearch() {
  try {
    // Kamera erişimi
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    
    // Kamera modalı oluştur
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
    
    // Event listeners
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
      
      // Base64'e çevir
      const imageData = canvas.toDataURL('image/jpeg');
      
      // Stream'i durdur
      stream.getTracks().forEach(track => track.stop());
      modal.remove();
      
      // AI ile görsel analiz
      toast("Görsel AI ile analiz ediliyor...", "info");
      
      
try {
  // Önce cihazda (ai.js) Gemini Vision dene (PIN + key ile)
  if (typeof window.geminiVision === "function" && typeof window.aiConfigured === "function" && window.aiConfigured()) {
    const pin = ($("aiPin")?.value || "").trim();
    if (pin) window.setSessionPin?.(pin);
    const guess = await window.geminiVision("Bu görseldeki ürün/ürün adını 3-6 kelimeyle Türkçe yaz.", imageData);
    const q = (guess || "").trim() || "telefon";
    toast("Bulunan: " + q, "success");
    return fiyatAra(q);
  }

  // Fallback: Backend endpoint
  const response = await fetch(`${API_URL}/kamera-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageData.split(',')[1], mime: 'image/jpeg' })
  });

  if (response.ok) {
    const data = await response.json();
    if (data.success) {
      const q = (data.urunTahmini || data.tespitEdilen || "telefon").trim();
      toast("Bulunan: " + q, "success");
      return fiyatAra(q);
    }
  }
  toast("AI analiz başarısız, normal arama yapılıyor", "warning");
  fiyatAra("telefon");
} catch (error) {
  console.error("Kamera AI hatası:", error);
  toast("AI analiz başarısız, normal arama yapılıyor", "warning");
  fiyatAra("telefon");
}
    };
    
  } catch (error) {
    console.error("Kamera hatası:", error);
    toast("Kamera erişimi reddedildi", "error");
  }
}

// ========== FAVORİ AI YORUM ==========

/** SEARCH SONUÇLARI İÇİN AI YORUM (seçilen sorgu + listelenen fiyatlar) */
async function aiCommentForSearch(query){
  try{
    toast("🤖 AI analiz yapıyor...", "info");
    const fiyatlar = (allProducts || []).slice(0, 8).map(p=>({
      site: p.site,
      fiyat: p.fiyat,
      link: p.link
    }));
    const response = await fetch(`${API_URL}/ai-yorum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urun: query, fiyatlar })
    });
    if (!response.ok) throw new Error("AI servisi yanıt vermedi");
    const data = await response.json();
    const yorum = data.aiYorum || data.yorum || "AI yorum yapamadı.";

    const modal = document.createElement('div');
    modal.className = 'aiModal';
    modal.innerHTML = `
      <div class="aiModalContent">
        <div class="aiModalHeader">
          <h3>🤖 AI Analizi</h3>
          <button class="closeAiModal">✕</button>
        </div>
        <div class="aiModalBody">
          <div class="aiProduct">
            <strong>${query}</strong>
            <small>Sonuçlar içinden özet</small>
          </div>
          <div class="aiComment">${yorum}</div>
          ${data.detay ? `
            <div class="aiDetails">
              <div><strong>En Ucuz:</strong> ${data.detay.enUcuzFiyat || 'N/A'}</div>
              <div><strong>En Pahalı:</strong> ${data.detay.enPahaliFiyat || 'N/A'}</div>
              <div><strong>Ortalama:</strong> ${data.detay.ortalamaFiyat || 'N/A'}</div>
              <div><strong>Site:</strong> ${data.detay.siteSayisi || 'N/A'}</div>
            </div>
          ` : ''}
        </div>
        <div class="aiModalFooter">
          <button class="btnPrimary" type="button">Tamam</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.closeAiModal').onclick = () => modal.remove();
    modal.querySelector('.btnPrimary').onclick = () => modal.remove();
    modal.addEventListener('click', (e)=>{ if (e.target === modal) modal.remove(); });
  }catch(e){
    console.error(e);
    toast(e.message || "AI hata", "error");
  }
}
async function getAiCommentForFavorite(favorite) {
  try {
    toast("🤖 AI analiz yapıyor...", "info");
    
    const response = await fetch(`${API_URL}/ai-yorum`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        urun: favorite.query || favorite.urun,
        fiyatlar: [{
          site: favorite.siteName || favorite.site,
          fiyat: favorite.fiyat || "Fiyat bilgisi yok"
        }]
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // AI yorum modalı göster
      const modal = document.createElement('div');
      modal.className = 'aiModal';
      modal.innerHTML = `
        <div class="aiModalContent">
          <div class="aiModalHeader">
            <h3>🤖 AI Analizi</h3>
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
            ${data.detay ? `
              <div class="aiDetails">
                <div><strong>En Ucuz:</strong> ${data.detay.enUcuzFiyat || 'N/A'}</div>
                <div><strong>En Pahalı:</strong> ${data.detay.enPahaliFiyat || 'N/A'}</div>
                <div><strong>Ortalama:</strong> ${data.detay.ortalamaFiyat || 'N/A'}</div>
              </div>
            ` : ''}
          </div>
          <div class="aiModalFooter">
            <button class="btnPrimary" onclick="this.closest('.aiModal').remove()">Tamam</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      modal.querySelector('.closeAiModal').onclick = () => modal.remove();
      modal.querySelector('.aiModal').onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
      
    } else {
      toast("AI yorum alınamadı", "error");
    }
    
  } catch (error) {
    console.error("AI yorum hatası:", error);
    toast("AI servisi şu anda kullanılamıyor", "error");
  }
}

// ========== FAVORİ İŞLEMLERİ ==========
function favIdFromUrl(url){
  try{
    const u = new URL(url);
    const key = (u.hostname + u.pathname + u.search).toLowerCase();
    let h=0; for (let i=0;i<key.length;i++){ h=((h<<5)-h)+key.charCodeAt(i); h|=0; }
    return "fav_" + Math.abs(h);
  }catch{
    return "fav_" + Math.random().toString(36).slice(2);
  }
}

const FAV_COLL = (uid)=> collection(db, "users", uid, "favorites");

async function loadFavorites(uid){
  if (!uid){ favCache=[]; return favCache; }
  try {
    const snap = await getDocs(FAV_COLL(uid));
    favCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  } catch(e) {
    console.error("Favori yükleme hatası:", e);
    favCache = [];
  }
  return favCache;
}

function isFav(url){
  const id = favIdFromUrl(url);
  return favCache.some(f=>f.id===id);
}

async function toggleFavorite(uid, fav){
  if (!uid) { openLogin(); return; }
  
  const id = favIdFromUrl(fav.url);
  const ref = doc(db, "users", uid, "favorites", id);
  
  if (favCache.some(f=>f.id===id)){
    await deleteDoc(ref);
    toast("Favoriden çıkarıldı", 'info');
  } else {
    await setDoc(ref, {
      ...fav,
      createdAt: Date.now(),
    }, { merge:true });
    toast("Favorilere eklendi", 'success');
  }
  await loadFavorites(uid);
  applyFavUI();
}

function applyFavUI(){
  document.querySelectorAll("[data-fav-url]").forEach(btn=>{
    const url = btn.getAttribute("data-fav-url") || "";
    const fav = isFav(url);
    btn.classList.toggle("isFav", fav);
    btn.innerHTML = fav ? "❤️" : "🤍";
    btn.title = fav ? "Favoride" : "Favoriye ekle";
  });
}

// ========== FAVORİLERİ GÖSTER (AI YORUM BUTONLU) ==========
function renderFavoritesPage(uid){
  const list = $("favList");
  if (!list) return;
  list.innerHTML = "";
  
  if (!favCache.length){
    list.innerHTML = `<div class="emptyState">Favori yok.</div>`;
    return;
  }
  
  // Favorileri sayfalama (4'erli)
  const pageSize = 4;
  const startIndex = (favPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedFavs = favCache.slice(startIndex, endIndex);
  const favTotalPages = Math.ceil(favCache.length / pageSize);
  
  // Sayfalama kontrolleri
  let paginationHTML = '';
  if (favTotalPages > 1) {
    paginationHTML = `
      <div class="favPagination">
        <button class="pageBtn ${favPage === 1 ? 'disabled' : ''}" 
                onclick="changeFavPage(${favPage - 1})" 
                ${favPage === 1 ? 'disabled' : ''}>
          ⬅️
        </button>
        <span class="pageInfo">${favPage}/${favTotalPages}</span>
        <button class="pageBtn ${favPage >= favTotalPages ? 'disabled' : ''}" 
                onclick="changeFavPage(${favPage + 1})" 
                ${favPage >= favTotalPages ? 'disabled' : ''}>
          ➡️
        </button>
      </div>
    `;
  }
  
  list.innerHTML = paginationHTML;
  
  for (const fav of pagedFavs){
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
          <button class="btnGhost sm" onclick="window.open('${fav.url||""}', '_blank')">Aç</button>
          <button class="btnGhost sm btnAiComment" data-fav-id="${fav.id}">🤖 AI</button>
          <button class="btnGhost sm btnFav isFav" data-fav-url="${fav.url||""}">❤️</button>
        </div>
      </div>
    `;
    
    // AI yorum butonu
    card.querySelector('.btnAiComment').addEventListener('click', () => {
      getAiCommentForFavorite(fav);
    });
    
    // Favori çıkar butonu
    card.querySelector('.btnFav').addEventListener('click', async () => {
      await toggleFavorite(uid, { url: fav.url, siteKey: fav.siteKey, siteName: fav.siteName, query: fav.query });
      renderFavoritesPage(uid);
    });
    
    list.appendChild(card);
  }
  
  // Alt sayfalama
  if (favTotalPages > 1) {
    list.insertAdjacentHTML('beforeend', paginationHTML);
  }
  
  applyFavUI();
}

// ========== FAVORİ SAYFA DEĞİŞTİRME ==========
function changeFavPage(newPage) {
  if (newPage < 1) return;
  const pageSize = 4;
  const totalPages = Math.ceil(favCache.length / pageSize);
  if (newPage > totalPages) return;
  
  favPage = newPage;
  renderFavoritesPage(window.currentUser?.uid);
}

// ========== ORTADA KAMERA BUTONU EKLE ==========
function addCameraButton() {
  const tabbar = document.querySelector('.tabbar');
  if (!tabbar) return;
  
  const tabs = tabbar.querySelectorAll('.tab');
  if (tabs.length < 4) return;
  
  // Ortada kamera butonu ekle
  const cameraBtn = document.createElement('button');
  cameraBtn.className = 'cameraTab';
  cameraBtn.innerHTML = `
    <span class="ico">📸</span>
    <span class="lbl">Kamera</span>
  `;
  cameraBtn.onclick = cameraAiSearch;
  
  const spacer = tabbar.querySelector('.tabSpacer');
  if (spacer) {
    spacer.replaceWith(cameraBtn);
  } else {
    const newSpacer = document.createElement('div');
    newSpacer.className = 'tabSpacer';
    tabbar.insertBefore(cameraBtn, tabs[2]);
  }
}

// ========== SON ARAMALAR ==========
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
        <button class="recentRemove" onclick="event.stopPropagation(); removeRecentSearch('${query}')">✕</button>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function handleRecentSearch(query) {
  document.getElementById('qNormal').value = query;
  const mode = getSearchMode();
  
  if (mode === 'fiyat') {
    fiyatAra(query);
  } else {
    showPage('search');
    renderSiteList($('normalList'), query);
  }
}

function removeRecentSearch(query) {
  let recent = JSON.parse(localStorage.getItem('fiyattakip_recent') || '[]');
  recent = recent.filter(q => q !== query);
  localStorage.setItem('fiyattakip_recent', JSON.stringify(recent));
  renderRecentSearches();
}

// ========== NORMAL ARAMA (Link-only) ==========
const SITES = [
  { key:"trendyol", name:"Trendyol", build:q=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", build:q=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11", name:"N11", build:q=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazontr", name:"Amazon TR", build:q=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"pazarama", name:"Pazarama", build:q=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:q=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key:"idefix", name:"idefix", build:q=>`https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` },
];

function renderSiteList(container, query){
  if (!container) return;
  const q = String(query||"").trim();
  if (!q){
    container.innerHTML = `<div class="cardBox"><b>Bir şey yaz.</b></div>`;
    return;
  }

  container.innerHTML = "";
  for (const s of SITES){
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
          <button class="btnGhost sm btnFav" type="button" data-fav-url="${url}" data-site-key="${s.key}" data-site-name="${s.name}" data-query="${q}">🤍</button>
        </div>
      </div>
    `;
    card.querySelector(".btnOpen")?.addEventListener("click", ()=> {
      window.open(url, "_blank", "noopener");
    });
    card.querySelector(".btnFav")?.addEventListener("click", async ()=>{
      if (!window.currentUser) return openLogin();
      await toggleFavorite(window.currentUser.uid, { url, siteKey: s.key, siteName: s.name, query: q });
    });
    container.appendChild(card);
  }
  applyFavUI();
}

// ========== AUTH İŞLEMLERİ ==========
window.currentUser = null;

function setAuthPane(mode){
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

function openLogin(){
  setAuthPane('login');
  const m = $("loginModal");
  if (!m) return;
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
  document.body.classList.add("modalOpen");
}

function closeLogin(){
  const m = $("loginModal");
  if (!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden","true");
  document.body.classList.remove("modalOpen");
}

async function doEmailLogin(isRegister){
  const btnL = $("btnLogin");
  const btnR = $("btnRegister");
  if (btnL) btnL.disabled = true;
  if (btnR) btnR.disabled = true;

  const email = (isRegister ? ($("regEmail")?.value || "") : ($("loginEmail")?.value || "")).trim();
  const pass  = (isRegister ? ($("regPass")?.value || "") : ($("loginPass")?.value || ""));
  const pass2 = (isRegister ? ($("regPass2")?.value || "") : "");

  if (!email || !pass){
    if (btnL) btnL.disabled = false;
    if (btnR) btnR.disabled = false;
    return toast("E-posta ve şifre gir.", "error");
  }
  
  if (isRegister){
    if (pass.length < 6){
      if (btnL) btnL.disabled = false;
      if (btnR) btnR.disabled = false;
      return toast("Şifre en az 6 karakter olmalı.", "error");
    }
    if (!pass2 || pass !== pass2){
      if (btnL) btnL.disabled = false;
      if (btnR) btnR.disabled = false;
      return toast("Şifreler uyuşmuyor.", "error");
    }
  }

  toast(isRegister ? "Kayıt deneniyor..." : "Giriş deneniyor...", "info");

  try{
    if (isRegister){
      await createUserWithEmailAndPassword(auth, email, pass);
      toast("Kayıt tamam. Giriş yapıldı.", "success");
      setAuthPane("login");
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Giriş başarılı.", "success");
    }
  }catch(e){
    console.error(e);
    const code = String(e?.code || "");
    const msg = String(e?.message || e || "");
    if (code.includes("auth/email-already-in-use")) return toast("Bu e-posta zaten kayıtlı. Giriş yap.", "error");
    if (code.includes("auth/weak-password")) return toast("Şifre çok zayıf (en az 6 karakter).", "error");
    if (code.includes("auth/invalid-email")) return toast("E-posta formatı hatalı.", "error");
    toast("Hata: " + msg.replace(/^Firebase:\s*/,""), "error");
  }finally{
    if (btnL) btnL.disabled = false;
    if (btnR) btnR.disabled = false;
  }
}

async function doGoogleLogin(){
  try{
    await signInWithPopup(auth, googleProvider);
  }catch(e){
    try{
      await signInWithRedirect(auth, googleProvider);
    }catch(e2){
      const msg = String(e2?.message || e?.message || e2 || e || "");
      if (msg.includes("auth/unauthorized-domain")){
        toast("Google giriş için domain yetkisi yok. Firebase > Authentication > Settings > Authorized domains içine siteni ekle (örn: fiyattakip.github.io).", "error");
        return;
      }
      toast("Google giriş hatası: " + msg.replace(/^Firebase:\s*/,""), "error");
    }
  }
}

// ========== MODAL İŞLEMLERİ ==========
function openAIModal(){
  const m = $("aiModal");
  if(!m) return;
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
  loadAISettings();
}

function closeAIModal(){
  const m = $("aiModal");
  if(!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden","true");
}

function openAPIModal(){
  const m = $("apiModal");
  if(!m) return;
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
  $("apiUrl").value = API_URL;
  checkAPIStatus();
}

function closeAPIModal(){
  const m = $("apiModal");
  if(!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden","true");
}

async function checkAPIStatus() {
  const statusElement = $("apiStatus");
  if (!statusElement) return;
  
  try {
    statusElement.textContent = "Bağlanıyor...";
    statusElement.className = "apiStatus checking";
    
    const response = await fetch(API_URL.replace('/api/fiyat-cek', '/health'), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
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

// ========== AI AYARLARI ==========
function loadAISettings(){
  try{
    const s=JSON.parse(localStorage.getItem("aiSettings")||"{}");
    $("aiEnabled") && ($("aiEnabled").value = s.enabled || "on");
    $("aiProvider") && ($("aiProvider").value = s.provider || "gemini");
    $("aiApiKey") && ($("aiApiKey").value = s.key || "");
  }catch(e){}
}

function saveAISettings(){
  const provider = $("aiProvider")?.value || "gemini";
  const key = ($("aiApiKey")?.value || "").trim();
  const pin = ($("aiPin")?.value || "").trim();

  if (!key){
    return toast("API Key girin", "error");
  }
  if (!pin || pin.length < 4){
    return toast("PIN en az 4 hane olmalı", "error");
  }

  // ai.js varsa: şifreli sakla
  if (typeof window.saveGeminiKey === "function" && provider === "gemini"){
    window.setSessionPin?.(pin);
    window.saveGeminiKey(key, pin).then(()=>{
      localStorage.setItem("aiSettings", JSON.stringify({ enabled:"on", provider:"gemini" }));
      toast("AI ayarları kaydedildi (şifreli)", "success");
      closeAIModal();
    }).catch((e)=>{
      console.error(e);
      toast(e?.message || "Kaydetme hatası", "error");
    });
    return;
  }

  // fallback: düz kayıt (önerilmez)
  localStorage.setItem("aiSettings", JSON.stringify({ enabled:"on", provider, key }));
  toast("AI ayarları kaydedildi", "success");
  closeAIModal();
}

// ========== YARDIMCI FONKSİYONLAR ==========
async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    toast("Kopyalandı", 'success');
  }catch(e){
    const ta=document.createElement("textarea");
    ta.value=text;
    ta.style.position="fixed"; ta.style.left="-9999px";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try{ document.execCommand("copy"); toast("Kopyalandı", 'success'); }catch(_){}
    document.body.removeChild(ta);
  }
}

function isProbablyHomeUrl(url){
  try{
    const u = new URL(url);
    const p = (u.pathname || "/");
    return p === "/" || p === "" || p.length < 2;
  }catch{ return true; }
}

function safeOpen(url){
  if (!url) return toast("Link yok", "error");
  if (isProbablyHomeUrl(url)) return toast("Ürün linki net değil (anasayfa).", "warning");
  window.open(url, "_blank", "noopener");
}

async function clearAppCache(){
  try{
    if (window.caches && caches.keys){
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
    try{ localStorage.clear(); }catch(e){}
    try{ sessionStorage.clear(); }catch(e){}
    if (indexedDB && indexedDB.databases){
      const dbs = await indexedDB.databases();
      await Promise.all((dbs||[]).map(db=>{
        if (!db || !db.name) return Promise.resolve();
        return new Promise(res=>{
          const req = indexedDB.deleteDatabase(db.name);
          req.onsuccess=req.onerror=req.onblocked=()=>res();
        });
      }));
    }
    toast("Önbellek temizlendi. Yenileniyor...", 'info');
  }catch(e){
    console.error(e);
    toast("Temizleme hatası", 'error');
  }
  setTimeout(()=>location.reload(true), 600);
}

// ========== UYGULAMA BAŞLATMA ==========
function wireUI(){
  // Modal butonları
  $("btnAiSettings")?.addEventListener("click", openAIModal);
  $("btnApiSettings")?.addEventListener("click", openAPIModal);
  $("closeAi")?.addEventListener("click", closeAIModal);
  $("closeApi")?.addEventListener("click", closeAPIModal);
  $("aiBackdrop")?.addEventListener("click", closeAIModal);
  $("apiBackdrop")?.addEventListener("click", closeAPIModal);
  $("btnSaveAI")?.addEventListener("click", saveAISettings);
  $("btnTestAI")?.addEventListener("click", async ()=>{
    try{
      const pin = ($("aiPin")?.value || "").trim();
      if (pin) window.setSessionPin?.(pin);
      if (typeof window.geminiText !== "function") throw new Error("ai.js yüklenmedi");
      const out = await window.geminiText("Kısa test: merhaba de.");
      toast("Test OK ✅", "success");
      console.log("AI Test Output:", out);
    }catch(e){
      console.error(e);
      toast(e?.message || "Test başarısız", "error");
    }
  });
  $("btnSaveApi")?.addEventListener("click", saveAPISettings);
  $("btnTestApi")?.addEventListener("click", checkAPIStatus);

  // Temizleme butonları
  $("btnClearCache")?.addEventListener("click", clearAppCache);
  // Login modal kapatma
  $("closeLogin")?.addEventListener("click", closeLogin);
  $("loginBackdrop")?.addEventListener("click", closeLogin);
  document.addEventListener("keydown", (e)=>{ if (e.key==="Escape") closeLogin(); });
  $("btnClearSearch")?.addEventListener("click", () => {
    $("normalList").innerHTML = "";
    toast("Arama temizlendi", "info");
  });

  // Login/Register
  $("tabLogin")?.addEventListener("click", ()=>setAuthPane("login"));
  $("tabRegister")?.addEventListener("click", ()=>setAuthPane("register"));
  $("btnLogin")?.addEventListener("click", ()=>doEmailLogin(false));
  $("btnRegister")?.addEventListener("click", ()=>doEmailLogin(true));
  $("btnGoogleLogin")?.addEventListener("click", ()=>doGoogleLogin());
  $("btnGoogleLogin2")?.addEventListener("click", ()=>doGoogleLogin());

  // Arama modu
  $("modeNormal")?.addEventListener("click", ()=> setSearchMode("normal"));
  $("modeFiyat")?.addEventListener("click", ()=> setSearchMode("fiyat"));
  $("modeAI")?.addEventListener("click", ()=> setSearchMode("ai"));
  setSearchMode(getSearchMode());

  // Ana arama butonu
  $("btnNormal")?.addEventListener("click", async ()=>{
    const query = ($("qNormal")?.value || "").trim();
    if (!query) return toast("Ürün adı girin", "error");
    
    const mode = getSearchMode();
    
    if (mode === "fiyat") {
      await fiyatAra(query);
    } else if (mode === "ai") {
      toast("AI ile optimize ediliyor...", "info");
      await fiyatAra(query);
    } else {
      showPage("search");
      renderSiteList($("normalList"), query);
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

  // Enter tuşu ile arama
  $("qNormal")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      $("btnNormal").click();
    }
  });

  // Copy butonları
  document.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("[data-copy-url]");
    if (!btn) return;
    const url = btn.getAttribute("data-copy-url") || "";
    if (url) await copyToClipboard(url);
  });

  // Tab butonları
  document.querySelectorAll(".tab[data-page]").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });

  // Logout
  $("logoutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      toast("Çıkış yapıldı", "info");
    } catch (error) {
      console.error("Çıkış hatası:", error);
    }
  });

  // Favori yenileme
  $("btnFavRefresh")?.addEventListener("click", async () => {
    if (!window.currentUser) return openLogin();
    await loadFavorites(window.currentUser.uid);
    renderFavoritesPage(window.currentUser.uid);
    toast("Favoriler yenilendi", "info");
  });
}

// ========== AUTH DURUMU ==========
function setAuthedUI(isAuthed){
  if (!isAuthed) {
    openLogin();
  } else {
    closeLogin();
  }
}

// ========== UYGULAMA BAŞLANGICI ==========
window.addEventListener("DOMContentLoaded", () => {
  wireUI();
  // PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  renderRecentSearches();
  addCameraButton();
  
  if (firebaseConfigLooksInvalid()){
    toast("Firebase config eksik/yanlış. firebase.js içindeki değerleri kontrol et.", "error");
  }

  onAuthStateChanged(auth, async (user) => {
    window.currentUser = user || null;
    setAuthedUI(!!user);
    if (user){
      try{
        await loadFavorites(user.uid);
        renderFavoritesPage(user.uid);
        applyFavUI();
      }catch(e){ console.error(e); }
    }
  });
});

// ========== GLOBAL FONKSIYONLAR ==========
window.doNormalSearch = (query) => {
  showPage("search");
  renderSiteList($("normalList"), query);
};

window.showPage = showPage;
window.fiyatAra = fiyatAra;
window.copyToClipboard = copyToClipboard;
window.handleRecentSearch = handleRecentSearch;
window.removeRecentSearch = removeRecentSearch;
window.changePage = changePage;
window.changeSort = changeSort;
window.changeFavPage = changeFavPage;
window.cameraAiSearch = cameraAiSearch;
window.aiCommentForSearch = aiCommentForSearch;
window.getAiCommentForFavorite = getAiCommentForFavorite;
