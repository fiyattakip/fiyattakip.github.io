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
const DEFAULT_API_URL = "https://fiyattakip-api.onrender.com"; // /api YOK!
let API_URL = localStorage.getItem('fiyattakip_api_url') || DEFAULT_API_URL;

// ========== SAYFALAMA AYARLARI ==========
let currentPage = 1;
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
  if (key === 'favs') renderFavoritesPage(window.currentUser?.uid);
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
            <button class="btnPrimary sm" onclick="window.open('${cheapest.link}', '_blank')">Ürüne Git</button>
            <button class="btnGhost sm" onclick="copyToClipboard('${cheapest.link}')">⧉ Kopyala</button>
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
              <button class="btnGhost xs" onclick="window.open('${product.link}', '_blank')">Aç</button>
              <button class="btnGhost xs" onclick="copyToClipboard('${product.link}')">⧉</button>
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
        const response = await fetch(`${API_URL}/kamera-ai`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
        toast("AI analiz başarısız, normal arama yapılıyor", "warning");
        fiyatAra('telefon');
      }
    };
    
  } catch (error) {
    console.error("Kamera hatası:", error);
    toast("Kamera erişimi reddedildi", "error");
  }
}

// ========== FAVORİ AI YORUM ==========
async function getAiCommentForFavorite(favorite) {
  try {
    toast("🤖 AI analiz yapıyor...", "info");
    
    const response = await fetch(`${API_URL}/ai-yorum`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-Key": (loadAISettings().key || ""),
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
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedFavs = favCache.slice(startIndex, endIndex);
  const favTotalPages = Math.ceil(favCache.length / pageSize);
  
  // Sayfalama kontrolleri
  let paginationHTML = '';
  if (favTotalPages > 1) {
    paginationHTML = `
      <div class="favPagination">
        <button class="pageBtn ${currentPage === 1 ? 'disabled' : ''}" 
                onclick="changeFavPage(${currentPage - 1})" 
                ${currentPage === 1 ? 'disabled' : ''}>
          ⬅️
        </button>
        <span class="pageInfo">${currentPage}/${favTotalPages}</span>
        <button class="pageBtn ${currentPage >= favTotalPages ? 'disabled' : ''}" 
                onclick="changeFavPage(${currentPage + 1})" 
                ${currentPage >= favTotalPages ? 'disabled' : ''}>
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
// AI yorum butonu - KESİN ÇÖZÜM (GÜNCELLENMİŞ)
// AI buton event listener'ı - GÜNCELLENMİŞ
card.querySelector('.btnAiComment').addEventListener('click', async (event) => {
  const button = event.target;
  const originalText = button.textContent;
  
  button.disabled = true;
  button.textContent = '🤖...';
  button.style.opacity = '0.7';
  
  // ORİJİNAL ARAMA KELİMESİNİ AL
  const originalQuery = fav.query || fav.title || fav.urun || "";
  
  toast(`🤖 "${originalQuery}" için AI analiz yapılıyor...`, "info");
  
  try {
    // BACKEND'E ORIGINAL_QUERY DE GÖNDER
    const aiYorum = await getAiYorumSafe({
      title: fav.title || fav.urun || originalQuery,
      price: fav.fiyat || "Fiyat bilgisi yok",
      site: fav.siteName || "Bilinmeyen site",
      originalQuery: originalQuery // YENİ EKLENEN!
    });
    
    console.log("💬 Hugging Face AI yorumu:", aiYorum);
    
    // ============ MODAL AÇ ============
    const modal = document.createElement('div');
    modal.className = 'aiModal';
    modal.innerHTML = `
      <div class="aiModalContent">
        <div class="aiModalHeader">
          <h3>🤖 Hugging Face AI Analizi</h3>
          <button class="closeAiModal">✕</button>
        </div>
        <div class="aiModalBody">
          <div class="aiProduct">
            <strong>${originalQuery}</strong>
            <small>${fav.siteName || "Bilinmeyen site"}</small>
            ${fav.fiyat ? `<div class="favPrice" style="margin-top:8px;color:#36d399;">${fav.fiyat}</div>` : ''}
          </div>
          <div class="aiComment" style="
            background: linear-gradient(135deg, rgba(124,92,255,0.1), rgba(54,211,153,0.1));
            padding: 20px;
            border-radius: 16px;
            border-left: 4px solid #7c5cff;
            font-size: 14px;
            line-height: 1.6;
            color: rgba(255,255,255,0.9);
          ">
            ${aiYorum.replace(/\n/g, '<br>')}
          </div>
          <div style="
            margin-top: 15px;
            padding: 10px;
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            font-size: 11px;
            color: rgba(255,255,255,0.6);
            display: flex;
            justify-content: space-between;
            align-items: center;
          ">
            <div>
              <span style="color:#7c5cff;">🤖</span>
              <span> Powered by Hugging Face AI</span>
            </div>
            <div>
              <span style="color:#36d399;">🔍</span>
              <span> Arama: "${originalQuery.substring(0, 20)}${originalQuery.length > 20 ? '...' : ''}"</span>
            </div>
          </div>
        </div>
        <div class="aiModalFooter">
          <button class="btnPrimary closeModalBtn">Tamam</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => modal.remove();
    modal.querySelector('.closeAiModal').onclick = closeModal;
    modal.querySelector('.closeModalBtn').onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
    
  } catch (error) {
    console.error("AI yorum hatası:", error);
    toast("AI servisi geçici olarak kullanılamıyor", "error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
    button.style.opacity = '1';
  }
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
  
  currentPage = newPage;
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
  const s={
    enabled: $("aiEnabled")?.value || "on",
    provider: $("aiProvider")?.value || "gemini",
    key: $("aiApiKey")?.value || ""
  };
  localStorage.setItem("aiSettings", JSON.stringify(s));
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
  $("btnSaveApi")?.addEventListener("click", saveAPISettings);
  $("btnTestApi")?.addEventListener("click", checkAPIStatus);

  // Temizleme butonları
  $("btnClearCache")?.addEventListener("click", clearAppCache);
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
window.getAiCommentForFavorite = getAiCommentForFavorite;

// === GÜVENLİ AI YORUM FONKSİYONU (DÜZELTİLMİŞ) ===
// ========== GÜVENLİ AI YORUM FONKSİYONU (HUGGING FACE) ==========
async function getAiYorumSafe(payload) {
  console.log("🤖 getAiYorumSafe BAŞLADI", payload);
  
  const API_BASE = "https://fiyattakip-api.onrender.com";
  
  // BACKEND'İN BEKLEDİĞİ FORMAT
  const requestBody = {
    title: payload.title,
    price: payload.price,
    site: payload.site,
    originalQuery: payload.originalQuery // YENİ!
  };

  try {
    console.log("📡 İstek URL:", `${API_BASE}/ai/yorum`);
    console.log("📦 Gönderilen:", requestBody);
    
    const response = await fetch(`${API_BASE}/ai/yorum`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log("📡 Status Code:", response.status);
    
    if (!response.ok) {
      throw new Error(`API Hatası: ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ AI Yanıtı:", data);
    
    if (data.success) {
      return data.yorum || `${payload.originalQuery || payload.title} için AI değerlendirmesi mevcut.`;
    } else {
      throw new Error(data.error || "AI yorumu alınamadı");
    }
    
  } catch (error) {
    console.error("❌ AI Yorum Hatası:", error);
    
    // Local fallback
    return `
🤖 ${payload.originalQuery || payload.title} ürünü ${payload.site || "pazar yerinde"} incelendi.
${payload.price ? `💰 Fiyat: ${payload.price}` : "💵 Fiyat bilgisi mevcut değil"}
⭐ AI Analizi: Ürün teknik özellikleri ve kullanıcı deneyimleri ışığında değerlendirilebilir.
    `.trim();
  }
}

// ==================== KARŞILAŞTIRMA SİSTEMİ ====================
// ==================== TAM KARŞILAŞTIRMA SİSTEMİ ====================
let compareItems = JSON.parse(localStorage.getItem('fiyattakip_compare') || '[]');

// 1. HTML'DEN FİYAT ÇEKME FONKSİYONU
function extractPriceFromHTML(html) {
  // Trendyol formatı: <span class="discounted">4.699 TL</span>
  // Hepsiburada formatı: <span class="price">1.299,00 TL</span>
  // Genel regex
  const priceRegex = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:TL|₺|TRY)/i;
  const match = html.match(priceRegex);
  
  if (match) {
    return match[1] + ' TL';
  }
  
  // Eğer bulamazsa
  return 'Fiyat bilgisi yok';
}

// 2. KARŞILAŞTIRMA MODAL'ını AÇ
function openCompareModal() {
  const modal = document.getElementById('compareModal');
  if (!modal) return;
  
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modalOpen");
  
  renderComparePageModal();
}

// 3. KARŞILAŞTIRMAYA ÜRÜN EKLE (GELİŞMİŞ)
function addToCompare(product, query = "") {
  if (compareItems.length >= 5) {
    toast("Maksimum 5 ürün karşılaştırabilirsiniz", "warning");
    return;
  }
  
  // Aynı ürün kontrolü
  const existing = compareItems.find(item => item.link === product.link);
  if (existing) {
    // Eğer ekliyse çıkar
    removeFromCompare(existing.id);
    return;
  }
  
  // Fiyatı temizle
  let cleanPrice = product.fiyat || "";
  if (cleanPrice && !cleanPrice.includes('TL') && !cleanPrice.includes('₺')) {
    cleanPrice = cleanPrice + ' TL';
  }
  
  const compareItem = {
    id: 'compare_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    title: product.urun || product.title || product.query || "",
    price: cleanPrice,
    site: product.site || "",
    link: product.link || "",
    query: query,
    addedAt: Date.now()
  };
  
  compareItems.push(compareItem);
  localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
  
  // TÜM butonları güncelle
  updateAllCompareButtons();
  
  toast(`"${compareItem.title.substring(0, 30)}..." ${compareItems.length === 1 ? 'karşılaştırmaya eklendi' : 'karşılaştırmadan çıkarıldı'}`, "success");
  
  // İlk ürün eklenirse modal'ı aç
  if (compareItems.length === 1) {
    setTimeout(openCompareModal, 300);
  }
}

// 4. KARŞILAŞTIRMADAN ÜRÜN ÇIKAR
function removeFromCompare(itemId) {
  compareItems = compareItems.filter(item => item.id !== itemId);
  localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
  
  updateAllCompareButtons();
  renderComparePageModal();
  
  toast("Ürün karşılaştırmadan çıkarıldı", "info");
}

// 5. TÜM BUTONLARI GÜNCELLE
function updateAllCompareButtons() {
  // Normal ürün kartları
  updateProductCompareButtons();
  
  // Favori kartları
  updateFavoriteCompareButtons();
  
  // Modal'ı güncelle
  if (document.getElementById('compareModal')?.classList.contains('show')) {
    renderComparePageModal();
  }
}

// 6. NORMAL ÜRÜN KARTLARINA BUTON EKLE
function addCompareButtonsToProducts() {
  // A. EN UCUZ ÜRÜN BANNER'ı
  document.querySelectorAll('.cheapestBanner').forEach(banner => {
    addCompareButtonToBanner(banner);
  });
  
  // B. DİĞER ÜRÜN KARTLARI
  document.querySelectorAll('.productCard').forEach(card => {
    addCompareButtonToProductCard(card);
  });
  
  // C. NORMAL ARAMA SONUÇLARI (link-only modu)
  document.querySelectorAll('.cardBox .rowLine').forEach(card => {
    addCompareButtonToLinkCard(card);
  });
}

// 7. BANNER'A BUTON EKLE
function addCompareButtonToBanner(banner) {
  const actions = banner.querySelector('.productActions');
  if (!actions) return;
  
  // Buton zaten var mı?
  let compareBtn = actions.querySelector('.btnCompare');
  
  // Ürün bilgilerini al
  const title = banner.querySelector('.productTitle')?.textContent || '';
  const price = banner.querySelector('.productPrice')?.textContent || '';
  const site = banner.querySelector('.siteTag')?.textContent || '';
  const link = extractLinkFromElement(banner);
  
  if (!link) return;
  
  const product = { urun: title, fiyat: price, site: site, link: link };
  
  if (!compareBtn) {
    compareBtn = document.createElement('button');
    compareBtn.className = 'btnCompare';
    compareBtn.setAttribute('data-compare-url', link);
    
    // Favori butonundan önce ekle
    const favBtn = actions.querySelector('.btnFav');
    if (favBtn) {
      actions.insertBefore(compareBtn, favBtn);
    } else {
      actions.appendChild(compareBtn);
    }
  }
  
  // Buton güncelle
  updateCompareButton(compareBtn, product);
}

// 8. ÜRÜN KARTINA BUTON EKLE
function addCompareButtonToProductCard(card) {
  const actions = card.querySelector('.productActions');
  if (!actions) return;
  
  let compareBtn = actions.querySelector('.btnCompare');
  
  const title = card.querySelector('.productName')?.textContent || '';
  const price = card.querySelector('.productPrice')?.textContent || '';
  const site = card.querySelector('.productSite')?.textContent || '';
  const link = extractLinkFromElement(card);
  
  if (!link) return;
  
  const product = { urun: title, fiyat: price, site: site, link: link };
  
  if (!compareBtn) {
    compareBtn = document.createElement('button');
    compareBtn.className = 'btnGhost xs btnCompare';
    compareBtn.setAttribute('data-compare-url', link);
    
    const favBtn = actions.querySelector('.btnFav');
    if (favBtn) {
      actions.insertBefore(compareBtn, favBtn);
    } else {
      actions.appendChild(compareBtn);
    }
  }
  
  updateCompareButton(compareBtn, product);
}

// 9. LİNK KARTINA BUTON EKLE (normal arama)
function addCompareButtonToLinkCard(card) {
  const actions = card.querySelector('.actions');
  if (!actions) return;
  
  let compareBtn = actions.querySelector('.btnCompare');
  
  const title = card.querySelector('.ttl')?.textContent || '';
  const query = card.querySelector('.sub')?.textContent || '';
  const link = card.querySelector('.btnCopy')?.getAttribute('data-copy-url') || '';
  
  if (!link) return;
  
  const siteMatch = title.match(/Trendyol|Hepsiburada|n11|Amazon|Pazarama|ÇiçekSepeti|idefix/);
  const site = siteMatch ? siteMatch[0] : 'Site';
  
  const product = { urun: query, fiyat: 'Fiyat bilgisi yok', site: site, link: link };
  
  if (!compareBtn) {
    compareBtn = document.createElement('button');
    compareBtn.className = 'btnGhost sm btnCompare';
    compareBtn.setAttribute('data-compare-url', link);
    compareBtn.style.marginRight = '5px';
    
    // Aç butonundan sonra ekle
    const openBtn = actions.querySelector('.btnOpen');
    if (openBtn) {
      openBtn.insertAdjacentElement('afterend', compareBtn);
    } else {
      actions.prepend(compareBtn);
    }
  }
  
  updateCompareButton(compareBtn, product);
}

// 10. FAVORİ KARTLARINA BUTON EKLE
function addCompareButtonsToFavorites() {
  document.querySelectorAll('.favoriteCard').forEach(card => {
    const actions = card.querySelector('.favoriteActions');
    if (!actions) return;
    
    let compareBtn = actions.querySelector('.btnCompare');
    
    const title = card.querySelector('.favQuery')?.textContent || '';
    const price = card.querySelector('.favPrice')?.textContent || '';
    const site = card.querySelector('.favSite')?.textContent || '';
    const link = card.querySelector('.btnGhost[onclick*="window.open"]')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || '';
    
    if (!link) return;
    
    const product = { urun: title, fiyat: price, site: site, link: link };
    
    if (!compareBtn) {
      compareBtn = document.createElement('button');
      compareBtn.className = 'btnGhost sm btnCompare';
      compareBtn.setAttribute('data-compare-url', link);
      compareBtn.style.marginLeft = 'auto';
      compareBtn.style.marginRight = '8px';
      
      // AI butonundan sonra ekle
      const aiBtn = actions.querySelector('.btnAiComment');
      if (aiBtn) {
        aiBtn.insertAdjacentElement('afterend', compareBtn);
      } else {
        actions.prepend(compareBtn);
      }
    }
    
    updateCompareButton(compareBtn, product);
  });
}

// 11. BUTON GÜNCELLE
function updateCompareButton(button, product) {
  if (!button) return;
  
  const isInCompare = compareItems.some(item => item.link === product.link);
  
  button.classList.toggle('added', isInCompare);
  
  if (button.classList.contains('xs')) {
    button.innerHTML = isInCompare ? '✓' : '⚖️';
  } else if (button.classList.contains('sm')) {
    button.innerHTML = isInCompare ? '✓ Çıkar' : '⚖️ Ekle';
  } else {
    button.innerHTML = isInCompare ? '✓ Eklendi' : '⚖️ Ekle';
  }
  
  button.title = isInCompare ? 'Karşılaştırmadan çıkar' : 'Karşılaştırmaya ekle';
  
  // Tıklama event'i
  button.onclick = function(e) {
    e.stopPropagation();
    e.preventDefault();
    addToCompare(product, currentSearch || '');
  };
}

// 12. TÜM ÜRÜN BUTONLARINI GÜNCELLE
function updateProductCompareButtons() {
  document.querySelectorAll('.btnCompare').forEach(btn => {
    const url = btn.getAttribute('data-compare-url') || '';
    const isInCompare = compareItems.some(item => item.link === url);
    
    btn.classList.toggle('added', isInCompare);
    
    if (btn.classList.contains('xs')) {
      btn.innerHTML = isInCompare ? '✓' : '⚖️';
    } else if (btn.classList.contains('sm')) {
      btn.innerHTML = isInCompare ? '✓ Çıkar' : '⚖️ Ekle';
    } else {
      btn.innerHTML = isInCompare ? '✓ Eklendi' : '⚖️ Ekle';
    }
  });
}

// 13. FAVORİ BUTONLARINI GÜNCELLE
function updateFavoriteCompareButtons() {
  document.querySelectorAll('.favoriteCard .btnCompare').forEach(btn => {
    const url = btn.getAttribute('data-compare-url') || '';
    const isInCompare = compareItems.some(item => item.link === url);
    
    btn.classList.toggle('added', isInCompare);
    btn.innerHTML = isInCompare ? '✓ Çıkar' : '⚖️ Ekle';
  });
}

// 14. MODAL İÇİN KARŞILAŞTIRMA LİSTESİ
function renderComparePageModal() {
  const container = document.getElementById('compareListModal');
  if (!container) return;
  
  if (compareItems.length === 0) {
    container.innerHTML = `
      <div class="emptyCompareState">
        <div class="emptyIcon">⚖️</div>
        <h3>Karşılaştırma Listesi Boş</h3>
        <p>Ürünlerdeki "⚖️ Ekle" butonuna tıklayın.</p>
        <p class="miniHint">En az 2 ürün ekleyin</p>
      </div>
    `;
    
    // AI sonucunu gizle
    document.getElementById('aiCompareResultModal')?.classList.add('hidden');
    return;
  }
  
  let html = `
    <div style="margin-bottom:15px;font-size:13px;color:var(--muted);">
      ${compareItems.length} ürün karşılaştırmada
    </div>
    <div class="compareGrid">
  `;
  
  compareItems.forEach(item => {
    html += `
      <div class="compareCard">
        <div class="compareCardHeader">
          <span class="compareSite">${item.site}</span>
          <button class="removeCompare" onclick="removeFromCompare('${item.id}')" title="Karşılaştırmadan çıkar">✕</button>
        </div>
        <div class="compareProductName">${item.title.substring(0, 50)}${item.title.length > 50 ? '...' : ''}</div>
        <div class="compareProductPrice">${item.price}</div>
        <div class="compareActions">
          <button class="btnGhost xs" onclick="window.open('${item.link}', '_blank')" title="Ürüne git">🔗</button>
          <button class="btnGhost xs" onclick="copyToClipboard('${item.link}')" title="Linki kopyala">⧉</button>
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  
  // KARŞILAŞTIRMA SEÇENEKLERİ (sadece 2+ ürün varsa)
  if (compareItems.length >= 2) {
    html += `
      <div class="compareOptions">
        <button class="btnManualCompare" onclick="showManualCompare()">📊 Manuel Karşılaştır</button>
        <button class="btnAiCompare" onclick="showAiCompare()">🤖 AI Karşılaştır</button>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // AI sonucunu gizle (yeni liste gösterildiğinde)
  document.getElementById('aiCompareResultModal')?.classList.add('hidden');
}

// 15. MANUEL KARŞILAŞTIRMA GÖSTER
function showManualCompare() {
  if (compareItems.length < 2) {
    toast("En az 2 ürün karşılaştırmaya ekleyin", "warning");
    return;
  }
  
  let html = `
    <div class="compareTable">
      <div class="compareHeaders">
        <div class="compareHeader">Özellik</div>
        ${compareItems.map(item => `<div class="compareHeader">${item.site}</div>`).join('')}
      </div>
      
      <div class="compareRow">
        <div class="compareLabel">Ürün</div>
        ${compareItems.map(item => `<div class="compareValue">${item.title.substring(0, 20)}${item.title.length > 20 ? '...' : ''}</div>`).join('')}
      </div>
      
      <div class="compareRow">
        <div class="compareLabel">Fiyat</div>
        ${compareItems.map(item => `<div class="compareValue ${getPriceClass(item.price)}">${item.price}</div>`).join('')}
      </div>
      
      <div class="compareRow">
        <div class="compareLabel">Site</div>
        ${compareItems.map(item => `<div class="compareValue">${item.site}</div>`).join('')}
      </div>
    </div>
    
    <div style="margin-top:15px;font-size:12px;color:var(--muted);text-align:center;">
      📊 ${compareItems.length} ürün karşılaştırılıyor
    </div>
  `;
  
  document.getElementById('aiCompareContentModal').innerHTML = html;
  document.getElementById('aiCompareResultModal').classList.remove('hidden');
  document.getElementById('aiCompareResultModal').querySelector('h3').textContent = '📊 Manuel Karşılaştırma';
  
  toast("Manuel karşılaştırma yapıldı", "success");
}

// 16. AI KARŞILAŞTIRMA GÖSTER
async function showAiCompare() {
  if (compareItems.length < 2) {
    toast("En az 2 ürün karşılaştırmaya ekleyin", "warning");
    return;
  }
  
  toast("🤖 AI karşılaştırma yapılıyor...", "info");
  
  try {
    const prompt = `
    Aşağıdaki ${compareItems.length} ürünü karşılaştır:
    
    ${compareItems.map((item, i) => `
    ÜRÜN ${i+1}: ${item.title}
    - Site: ${item.site}
    - Fiyat: ${item.price}
    `).join('\n')}
    
    Fiyat-performans, kalite ve öneri açısından değerlendir.
    Kısa ve Türkçe yanıt ver.
    `;
    
    const aiResponse = await getAiYorumSafe({
      title: `${compareItems.length} Ürün Karşılaştırması`,
      price: compareItems.map(item => item.price).join(' vs '),
      site: 'Karşılaştırma',
      originalQuery: prompt
    });
    
    document.getElementById('aiCompareContentModal').innerHTML = 
      `<div style="line-height:1.6;font-size:14px;">${aiResponse.replace(/\n/g, '<br>')}</div>`;
    
    document.getElementById('aiCompareResultModal').classList.remove('hidden');
    document.getElementById('aiCompareResultModal').querySelector('h3').textContent = '🤖 AI Karşılaştırma Raporu';
    
    toast("AI karşılaştırma tamamlandı", "success");
    
  } catch (error) {
    toast("AI karşılaştırma başarısız", "error");
    console.error("AI hatası:", error);
  }
}

// 17. FİYAT SINIFLANDIRMA
function getPriceClass(price) {
  const num = parseInt(price.replace(/[^\d]/g, '')) || 0;
  if (num < 1000) return 'price-low';
  if (num < 5000) return 'price-medium';
  return 'price-high';
}

// 18. MODAL EVENT'LERİNİ KUR
function setupCompareModalEvents() {
  // Banner'a tıklama
  const banner = document.querySelector('.banner');
  if (banner) {
    banner.style.cursor = 'pointer';
    banner.onclick = openCompareModal;
  }
  
  // Modal kapatma
  document.getElementById('closeCompare')?.addEventListener('click', closeCompareModal);
  document.getElementById('compareBackdrop')?.addEventListener('click', closeCompareModal);
  
  // Manuel ekleme butonu
  document.getElementById('btnAddManuallyModal')?.addEventListener('click', function() {
    const panel = document.getElementById('manualAddPanelModal');
    if (panel) panel.classList.toggle('hidden');
    document.getElementById('manualInputModal')?.focus();
  });
  
  // Temizle butonu
  document.getElementById('btnClearCompareModal')?.addEventListener('click', function() {
    if (compareItems.length === 0) return;
    
    if (confirm(`${compareItems.length} ürünü karşılaştırmadan çıkarmak istiyor musunuz?`)) {
      compareItems = [];
      localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
      updateAllCompareButtons();
      renderComparePageModal();
      toast("Karşılaştırma listesi temizlendi", "success");
    }
  });
  
  // Manuel panel kapatma
  document.querySelector('.closeManualPanelModal')?.addEventListener('click', function() {
    document.getElementById('manualAddPanelModal')?.classList.add('hidden');
  });
  
  // Linkten getir butonu (FİYAT ÇEKME İLE)
  document.getElementById('btnFetchFromLinkModal')?.addEventListener('click', async function() {
    const input = document.getElementById('manualInputModal');
    if (!input || !input.value.trim()) {
      toast("Link girin", "error");
      return;
    }
    
    const url = input.value.trim();
    toast("Link analiz ediliyor ve fiyat çekiliyor...", "info");
    
    try {
      // Fiyat çekmeyi dene
      const response = await fetch(url);
      const html = await response.text();
      const price = extractPriceFromHTML(html);
      
      const mockProduct = {
        urun: "Linkten gelen ürün",
        fiyat: price,
        site: new URL(url).hostname.replace('www.', '').split('.')[0],
        link: url
      };
      
      addToCompare(mockProduct, "manuel-link");
      input.value = '';
      document.getElementById('manualAddPanelModal')?.classList.add('hidden');
      
    } catch (e) {
      console.error("Fiyat çekme hatası:", e);
      toast("Fiyat çekilemedi, manuel ekleniyor", "warning");
      
      const mockProduct = {
        urun: "Linkten gelen ürün",
        fiyat: "Fiyat bilgisi yok",
        site: new URL(url).hostname.replace('www.', '').split('.')[0],
        link: url
      };
      
      addToCompare(mockProduct, "manuel-link");
      input.value = '';
      document.getElementById('manualAddPanelModal')?.classList.add('hidden');
    }
  });
  
  // Bul ve eşleştir butonu
  document.getElementById('btnSearchAndMatchModal')?.addEventListener('click', function() {
    const input = document.getElementById('manualInputModal');
    if (!input || !input.value.trim()) {
      toast("Ürün adı girin", "error");
      return;
    }
    
    const query = input.value.trim();
    toast(`"${query}" aranıyor...`, "info");
    
    fiyatAra(query);
    input.value = '';
    document.getElementById('manualAddPanelModal')?.classList.add('hidden');
    
    // Modal'ı kapat
    setTimeout(closeCompareModal, 500);
  });
  
  // AI sonuç kapatma
  document.querySelector('.closeAiResultModal')?.addEventListener('click', function() {
    document.getElementById('aiCompareResultModal')?.classList.add('hidden');
  });
}

// 19. SAYFA YÜKLENDİĞİNDE ÇALIŞTIR
document.addEventListener('DOMContentLoaded', function() {
  console.log("Karşılaştırma sistemi başlatılıyor...");
  
  // Event'leri kur
  setupCompareModalEvents();
  
  // Butonları ekle
  setTimeout(() => {
    addCompareButtonsToProducts();
    addCompareButtonsToFavorites();
  }, 1000);
  
  // Sürekli kontrol et
  setInterval(() => {
    addCompareButtonsToProducts();
    addCompareButtonsToFavorites();
  }, 2000);
  
  console.log("Karşılaştırma sistemi hazır");
});

// 20. ARAMA YAPILDIĞINDA
const originalFiyatAra = window.fiyatAra;
window.fiyatAra = function(...args) {
  const result = originalFiyatAra.apply(this, args);
  setTimeout(() => {
    addCompareButtonsToProducts();
    addCompareButtonsToFavorites();
  }, 1500);
  return result;
};

// 21. FAVORİ SAYFASI AÇILDIĞINDA
const originalShowPage = window.showPage;
window.showPage = function(key) {
  const result = originalShowPage.apply(this, arguments);
  
  if (key === 'favs') {
    setTimeout(addCompareButtonsToFavorites, 500);
  }
  
  return result;
};

// 22. GLOBAL FONKSİYONLAR
window.addToCompare = addToCompare;
window.removeFromCompare = removeFromCompare;
window.clearCompareList = function() {
  compareItems = [];
  localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
  updateAllCompareButtons();
  toast("Karşılaştırma listesi temizlendi", "success");
};
window.openCompareModal = openCompareModal;
window.closeCompareModal = closeCompareModal;
window.showManualCompare = showManualCompare;
window.showAiCompare = showAiCompare;
