// app.js - TAM VERSİYON (Login + Kamera + Favoriler + AI)
import { auth, googleProvider, firebaseConfigLooksInvalid } from "./firebase.js";
import { saveGeminiKey } from "./ai.js";  // ← BU SATIRI EKLE (BURAYA!)
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

const db = getFirestore();
const $ = (id) => document.getElementById(id);
// ========== API KONFİGÜRASYONU ==========
let API_URL = localStorage.getItem('fiyattakip_api_url') || "https://fiyattakip-api.onrender.com";
// "api" kısmını kaldırdım çünkü server.js'te endpoint'ler "/api/" ile başlıyor

// ========== GLOBAL DEĞİŞKENLER ==========
let currentPage = 1;
let currentSort = 'asc';
let currentSearch = '';
let totalPages = 1;
let allProducts = [];
let favCache = [];
window.currentUser = null;

// ========== TOAST MESAJ ==========
function toast(msg, type = 'info') {
  const t = $("toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 3000);
}

// ========== SAYFA GEÇİŞLERİ ==========
function showPage(key) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

  const page = $(`page-${key}`);
  const tab = document.querySelector(`.tab[data-page="${key}"]`);

  if (page) page.classList.add("active");
  if (tab) tab.classList.add("active");

  console.log("📱 Sayfa:", key);
  
  // Sayfa özel işlemler
  if (key === 'favs') renderFavoritesPage(window.currentUser?.uid);
  if (key === 'home') renderRecentSearches();
}

// ========== ARAMA MODU ==========
function setSearchMode(mode) {
  localStorage.setItem("searchMode", mode);
  $("modeNormal")?.classList.toggle("active", mode === "normal");
  $("modeFiyat")?.classList.toggle("active", mode === "fiyat");
  $("modeAI")?.classList.toggle("active", mode === "ai");
}

function getSearchMode() {
  return localStorage.getItem("searchMode") || "normal";
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
  
  if (!query?.trim()) {
    container.innerHTML = '<div class="emptyState">Arama kelimesi girin</div>';
    return;
  }
  
  console.log("🔗 Site linkleri oluşturuluyor:", query);
  
  SITES.forEach(site => {
    const url = site.build(query);
    const isFavorite = isFav(url);
    
    const div = document.createElement("div");
    div.className = "cardBox siteCard";
    div.innerHTML = `
      <div class="rowLine">
        <div class="siteInfo">
          <div class="siteIcon">${getSiteIcon(site.key)}</div>
          <div class="siteText">
            <div class="ttl">${site.name}</div>
            <div class="sub">${truncateText(query, 50)}</div>
          </div>
        </div>
        <div class="actions">
          <button class="btnOpen btnPrimary sm" data-url="${url}">Aç</button>
          <button class="btnCopy btnGhost sm" data-text="${url}">⧉</button>
          <button class="btnFav btnGhost sm ${isFavorite ? 'isFav' : ''}" data-url="${url}" data-site="${site.key}" data-name="${site.name}" data-query="${query}">
            ${isFavorite ? '❤️' : '🤍'}
          </button>
        </div>
      </div>
    `;
    
    // Buton event'lerini bağla
    const btnOpen = div.querySelector('.btnOpen');
    const btnCopy = div.querySelector('.btnCopy');
    const btnFav = div.querySelector('.btnFav');
    
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        window.open(url, '_blank');
      });
    }
    
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        copyToClipboard(url);
      });
    }
    
    if (btnFav) {
      btnFav.addEventListener('click', () => {
        if (!window.currentUser) {
          openLogin();
          return;
        }
        
        const favData = {
          url: url,
          siteKey: site.key,
          siteName: site.name,
          query: query,
          type: 'site_link'
        };
        
        toggleFavorite(window.currentUser?.uid, favData);
        
        // Favori ikonunu güncelle
        if (btnFav.classList.contains('isFav')) {
          btnFav.innerHTML = '🤍';
          btnFav.classList.remove('isFav');
        } else {
          btnFav.innerHTML = '❤️';
          btnFav.classList.add('isFav');
        }
      });
    }
    
    container.appendChild(div);
  });
}

// Yardımcı fonksiyonlar
function getSiteIcon(siteKey) {
  const icons = {
    trendyol: '🛒',
    hepsiburada: '📦',
    n11: '🔟',
    amazontr: '🏪',
    pazarama: '🥦',
    ciceksepeti: '🌸',
    idefix: '📚'
  };
  return icons[siteKey] || '🌐';
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// ========== FIYAT ARAMA ==========
async function fiyatAra(query, page = 1, sort = 'asc') {
  console.log("🔍 fiyatAra:", query);
  
  if (!query?.trim()) {
    toast("Ürün adı girin", "error");
    return;
  }

  showPage("search");
  const container = $("normalList");
  container.innerHTML = `<div class="loading"><div class="spinner"></div><p>"${query}" aranıyor...</p></div>`;

  try {
    toast("Fiyatlar çekiliyor...", "info");
    
    // BURASI ÖNEMLİ: ${API_URL}/api/fiyat-cek şeklinde olacak
    const response = await fetch(`${API_URL}/api/fiyat-cek`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urun: query, page: page, sort: sort })
    });

    if (!response.ok) throw new Error(`API: ${response.status}`);

    const data = await response.json();
    console.log("📦 API verisi:", data);
    
    if (data.success) {
      currentPage = data.sayfa || 1;
      currentSort = data.siralama || 'asc';
      currentSearch = query;
      totalPages = data.toplamSayfa || 1;
      allProducts = data.fiyatlar || [];
      
      renderFiyatSonuclari(data);
      toast(`✅ ${data.toplamUrun || 0} ürün bulundu`, "success");
    } else {
      throw new Error(data.error || "Fiyat çekilemedi");
    }
  } catch (error) {
    console.error("Fiyat arama hatası:", error);
    container.innerHTML = `
      <div class="errorState">
        <p>❌ Hata: ${error.message}</p>
        <button onclick="showPage('home')" class="btnPrimary">Ana Sayfaya Dön</button>
      </div>
    `;
  }
}

// ========== FIYAT SONUÇLARINI GÖSTER ==========
function renderFiyatSonuclari(data) {
  const container = $("normalList");
  if (!container) return;
  
  if (!data.fiyatlar || data.fiyatlar.length === 0) {
    container.innerHTML = `
      <div class="emptyState">
        <p>"${data.query}" için sonuç bulunamadı</p>
        <button onclick="showPage('home')" class="btnPrimary">Yeni Arama</button>
      </div>
    `;
    return;
  }

  let html = '<div class="sortInfo">Fiyat Karşılaştırması</div>';
  
  data.fiyatlar.forEach((product, index) => {
    const isCheapest = index === 0;
    html += `
      <div class="${isCheapest ? 'cheapestBanner' : 'productCard'}">
        <div class="${isCheapest ? 'productInfo' : 'productRow'}">
          <div class="productSite">${product.site}</div>
          <div class="productName">${product.urun}</div>
          <div class="productPrice">${product.fiyat}</div>
          <div class="productActions">
            <button class="btnPrimary sm" onclick="window.open('${product.link}', '_blank')">Aç</button>
            <button class="btnGhost sm" onclick="copyToClipboard('${product.link}')">⧉</button>
            <button class="btnGhost sm" onclick="toggleFavorite(currentUser?.uid, { 
              url: '${product.link}', 
              siteKey: '${product.site.toLowerCase()}', 
              siteName: '${product.site}', 
              query: '${data.query}' 
            })">🤍</button>
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// ========== KAMERA AI ==========
async function cameraAiSearch() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' } 
    });
    
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
          <button class="btnPrimary" id="captureBtn">📷 Çek ve Analiz Et</button>
          <button class="btnGhost" id="cancelBtn">İptal</button>
        </div>
        <canvas id="cameraCanvas" style="display:none"></canvas>
        <div class="cameraHint">Ürünün net fotoğrafını çekin</div>
      </div>
    `;
    
    document.body.appendChild(modal);
    const video = modal.querySelector('#cameraVideo');
    video.srcObject = stream;
    
    modal.querySelector('.closeCamera').onclick = 
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
      
      const imageData = canvas.toDataURL('image/jpeg', 0.7);
      stream.getTracks().forEach(t => t.stop());
      modal.remove();
      
      toast("📸 AI analiz ediyor...", "info");
      
      try {
        const base64Data = imageData.split(',')[1];
        const response = await fetch(`${API_URL}/kamera-ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            image: base64Data,
            mime: 'image/jpeg'
          })
        });
        
        if (!response.ok) {
          throw new Error(`API: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success) {
          const urunTahmini = data.urunTahmini || data.tespitEdilen || "ürün";
          $('qNormal').value = urunTahmini;
          toast(`✅ Tespit edilen: ${urunTahmini}`, "success");
          
          // Otomatik arama yap
          setTimeout(() => {
            const mode = getSearchMode();
            if (mode === "fiyat" || mode === "ai") {
              fiyatAra(urunTahmini);
            } else {
              showPage('search');
              renderSiteList($('normalList'), urunTahmini);
            }
          }, 800);
        } else {
          throw new Error(data.error || "Analiz başarısız");
        }
      } catch (error) {
        console.error("Kamera AI hatası:", error);
        toast("AI analiz başarısız", "error");
      }
    };
  } catch (error) {
    console.error("Kamera hatası:", error);
    toast("Kamera izni reddedildi", "error");
  }
}

// ========== GERÇEK AI YORUM ==========
async function getAiCommentForFavorite(favorite) {
  try {
    toast("🤖 AI analiz ediyor...", "info");
    
    // 1. API Key kontrolü
    const geminiKey = localStorage.getItem('gemini_api_key');
    if (!geminiKey) {
      toast("API Key bulunamadı. Lütfen AI ayarlarından ekleyin.", "error");
      openAIModal();
      return;
    }
    
    console.log("🔑 API Key ile AI çağrısı yapılıyor...");
    
    // 2. Sunucuya istek yap
const response = await fetch(`${API_URL}/api/ai-yorum`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    urun: favorite.query || favorite.urun || "Ürün",
    link: favorite.url || favorite.link || "",  // LINK EKLE!
    fiyatlar: favorite.fiyat ? [{
      site: favorite.siteName || favorite.site || "Site",
      fiyat: favorite.fiyat
    }] : [],
    apiKey: geminiKey
  })
});
    
    const data = await response.json();
    console.log("📦 AI yanıtı:", data);
    
    if (data.success) {
      // Modal göster
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
              ${favorite.fiyat ? `<div class="aiPrice">${favorite.fiyat}</div>` : ''}
            </div>
            <div class="aiComment">
              ${data.aiYorum.replace(/\n/g, '<br>')}
            </div>
            ${data.model ? `<div class="aiModel">Model: ${data.model}</div>` : ''}
          </div>
          <div class="aiModalFooter">
            <button class="btnPrimary" onclick="this.closest('.aiModal').remove()">Tamam</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      modal.querySelector('.closeAiModal').onclick = () => modal.remove();
      
    } else {
      throw new Error(data.error || "AI yanıt alamadı");
    }
    
  } catch (error) {
    console.error("AI hatası:", error);
    toast("AI servisi kullanılamıyor", "error");
  }
}

// BASİT AI MODAL'I
function showSimpleAiModal(favorite, comment) {
  const modal = document.createElement('div');
  modal.className = 'aiModal';
  modal.innerHTML = `
    <div class="aiModalContent" style="
      background: white;
      padding: 20px;
      border-radius: 10px;
      max-width: 500px;
      width: 90%;
      margin: 50px auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    ">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3 style="margin: 0;">🤖 AI Analizi</h3>
        <button onclick="this.closest('.aiModal').remove()" style="
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
        ">✕</button>
      </div>
      
      <div style="margin-bottom: 15px;">
        <p><strong>Ürün:</strong> ${favorite.query || favorite.urun}</p>
        <p><strong>Site:</strong> ${favorite.siteName || favorite.site}</p>
        ${favorite.fiyat ? `<p><strong>Fiyat:</strong> ${favorite.fiyat}</p>` : ''}
      </div>
      
      <div style="
        background: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
        border-left: 4px solid #3498db;
        margin-bottom: 15px;
      ">
        ${comment}
      </div>
      
      <button onclick="this.closest('.aiModal').remove()" style="
        background: #3498db;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        width: 100%;
      ">Tamam</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Tıklayınca kapat
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

// ACİL DURUM MODAL'I (AI çalışmazsa)
function showEmergencyModal(favorite) {
  const modal = document.createElement('div');
  modal.className = 'emergencyModal';
  modal.innerHTML = `
    <div style="
      background: white;
      padding: 25px;
      border-radius: 10px;
      max-width: 500px;
      width: 90%;
      margin: 50px auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      text-align: center;
    ">
      <div style="font-size: 50px; margin-bottom: 15px;">⚠️</div>
      <h3 style="margin: 0 0 10px 0;">AI Servisi Geçici Olarak Kullanılamıyor</h3>
      
      <div style="margin: 20px 0; text-align: left;">
        <p><strong>Ürün:</strong> ${favorite.query || favorite.urun}</p>
        <p><strong>Site:</strong> ${favorite.siteName || favorite.site}</p>
        ${favorite.fiyat ? `<p><strong>Fiyat:</strong> ${favorite.fiyat}</p>` : ''}
      </div>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107;">
        <p><strong>Yapabilecekleriniz:</strong></p>
        <p>1. Farklı bir ürün için AI analizi deneyin</p>
        <p>2. AI API Key'inizi kontrol edin</p>
        <p>3. Birkaç dakika sonra tekrar deneyin</p>
      </div>
      
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button onclick="openAIModal()" style="
          background: #6c757d;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 5px;
          cursor: pointer;
          flex: 1;
        ">AI Ayarları</button>
        
        <button onclick="window.open('${favorite.url || ''}', '_blank')" style="
          background: #28a745;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 5px;
          cursor: pointer;
          flex: 1;
        ">Siteyi Aç</button>
        
        <button onclick="this.closest('.emergencyModal').remove()" style="
          background: #dc3545;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 5px;
          cursor: pointer;
          flex: 1;
        ">Kapat</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Tıklayınca kapat
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
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
  if (!uid) { favCache = []; return favCache; }
  try {
    const snap = await getDocs(FAV_COLL(uid));
    favCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Favori yükleme hatası:", e);
    favCache = [];
  }
  return favCache;
}

function isFav(url) {
  const id = favIdFromUrl(url);
  return favCache.some(f => f.id === id);
}

async function toggleFavorite(uid, fav) {
  if (!uid) { openLogin(); return; }
  
  const id = favIdFromUrl(fav.url);
  const ref = doc(db, "users", uid, "favorites", id);
  
  if (favCache.some(f => f.id === id)) {
    await deleteDoc(ref);
    toast("Favoriden çıkarıldı", 'info');
  } else {
    await setDoc(ref, {
      ...fav,
      createdAt: Date.now(),
    }, { merge: true });
    toast("Favorilere eklendi", 'success');
  }
  await loadFavorites(uid);
}

// ========== FAVORİLER SAYFASI ==========
function renderFavoritesPage(uid) {
  const list = $("favList");
  if (!list) return;
  list.innerHTML = "";
  
  if (!favCache.length) {
    list.innerHTML = `<div class="emptyState">Favori yok.</div>`;
    return;
  }
  
  favCache.forEach(fav => {
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
          <button class="btnGhost sm btnAiComment" data-fav-id="${fav.id}">🤖 AI</button>
          <button class="btnGhost sm" onclick="toggleFavorite('${uid}', { 
            url: '${fav.url}', 
            siteKey: '${fav.siteKey}', 
            siteName: '${fav.siteName}', 
            query: '${fav.query}' 
          })">❤️</button>
        </div>
      </div>
    `;
    
    card.querySelector('.btnAiComment').onclick = () => {
      getAiCommentForFavorite(fav);
    };
    
    list.appendChild(card);
  });
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
  $('qNormal').value = query;
  const mode = getSearchMode();
  if (mode === 'fiyat' || mode === 'ai') {
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

// ========== LOGIN İŞLEMLERİ ==========
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
  document.body.classList.add("modalOpen");
}

function closeLogin() {
  const m = $("loginModal");
  if (!m) return;
  m.classList.remove("show");
  document.body.classList.remove("modalOpen");
}

async function doEmailLogin(isRegister) {
  const email = (isRegister ? ($("regEmail")?.value || "") : ($("loginEmail")?.value || "")).trim();
  const pass = (isRegister ? ($("regPass")?.value || "") : ($("loginPass")?.value || ""));
  const pass2 = (isRegister ? ($("regPass2")?.value || "") : "");

  if (!email || !pass) {
    return toast("E-posta ve şifre gir.", "error");
  }
  
  if (isRegister) {
    if (pass.length < 6) return toast("Şifre en az 6 karakter", "error");
    if (!pass2 || pass !== pass2) return toast("Şifreler uyuşmuyor", "error");
  }

  toast(isRegister ? "Kayıt yapılıyor..." : "Giriş yapılıyor...", "info");

  try {
    if (isRegister) {
      await createUserWithEmailAndPassword(auth, email, pass);
      toast("Kayıt başarılı", "success");
      setAuthPane("login");
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Giriş başarılı", "success");
    }
  } catch (e) {
    console.error(e);
    toast("Hata: " + e.message, "error");
  }
}

async function doGoogleLogin() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    console.error("Google login hatası:", e);
    toast("Google giriş hatası", "error");
  }
}

// ========== MODAL İŞLEMLERİ ==========
function openAIModal() {
  const m = $("aiModal");
  if (!m) return;
  
  // API Key varsa göster
  const savedKey = localStorage.getItem('gemini_api_key');
  const keyInput = $("aiApiKey");
  
  if (savedKey && keyInput) {
    keyInput.value = savedKey; // Key'i göster
  }
  
  m.classList.add("show");
}

function closeAIModal() {
  const m = $("aiModal");
  if (!m) return;
  m.classList.remove("show");
}

function openAPIModal() {
  const m = $("apiModal");
  if (!m) return;
  m.classList.add("show");
  $("apiUrl").value = API_URL;
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
    
    const response = await fetch(API_URL.replace('/api/fiyat-cek', '/health'));
    
    if (response.ok) {
      statusElement.textContent = "✓ Çalışıyor";
      statusElement.className = "apiStatus online";
    } else {
      statusElement.textContent = "✗ Hata";
      statusElement.className = "apiStatus error";
    }
  } catch (error) {
    statusElement.textContent = "✗ Bağlantı yok";
    statusElement.className = "apiStatus offline";
  }
}

function saveAPISettings() {
  const url = $("apiUrl")?.value?.trim() || "https://fiyattakip-api.onrender.com/api";
  API_URL = url;
  localStorage.setItem('fiyattakip_api_url', url);
  toast("API URL kaydedildi", "success");
  closeAPIModal();
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

// ========== BUTONLARI BAĞLA ==========
function setupButtons() {
  console.log("🔗 Butonlar bağlanıyor...");
  
  // 1. ANA ARAMA BUTONU
  $("btnNormal")?.addEventListener("click", () => {
    const query = ($("qNormal")?.value || "").trim();
    const mode = getSearchMode();
    
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
  });
  
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
  
  // 7. LOGIN BUTONLARI
  $("tabLogin")?.addEventListener("click", () => setAuthPane("login"));
  $("tabRegister")?.addEventListener("click", () => setAuthPane("register"));
  $("btnLogin")?.addEventListener("click", () => doEmailLogin(false));
  $("btnRegister")?.addEventListener("click", () => doEmailLogin(true));
  $("btnGoogleLogin")?.addEventListener("click", () => doGoogleLogin());
  $("btnGoogleLogin2")?.addEventListener("click", () => doGoogleLogin());
  
  // 8. MODAL BUTONLARI
  $("btnAiSettings")?.addEventListener("click", openAIModal);
  $("btnApiSettings")?.addEventListener("click", openAPIModal);
  $("closeAi")?.addEventListener("click", closeAIModal);
  $("closeApi")?.addEventListener("click", closeAPIModal);
  $("btnSaveApi")?.addEventListener("click", saveAPISettings);
  $("btnTestApi")?.addEventListener("click", checkAPIStatus);
  
 // 9. AI AYARLARI KAYDETME BUTONU
$("btnSaveAI")?.addEventListener("click", async () => {
  const apiKey = $("aiApiKey")?.value?.trim();
  
  if (!apiKey) {
    toast("API Key boş olamaz", "error");
    return;
  }
  
  // Basit format kontrolü
  if (!apiKey.startsWith("AIza")) {
    toast("❌ API Key formatı yanlış. 'AIza...' şeklinde başlamalı.", "error");
    return;
  }
  
  // Önce kaydet
  localStorage.setItem('gemini_api_key', apiKey);
  localStorage.setItem('gemini_api_key_saved', new Date().toLocaleString());
  
  toast("✅ API Key kaydedildi. Test ediliyor...", "info");
  
  // Hemen test et (doğru modelle)
  const isValid = await testAiSimpleCorrect(apiKey);
  
  if (isValid) {
    toast("🎉 AI başarıyla ayarlandı!", "success");
    closeAIModal();
  } else {
    toast("⚠️ Key kaydedildi ama test başarısız. AI özellikleri çalışmayabilir.", "warning");
  }
});

// DOĞRU TEST FONKSİYONU
async function testAiSimpleCorrect(apiKey) {
  try {
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(testUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: "Test" }]
        }]
      })
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

// BASİT AI TEST FONKSİYONU - DÜZGÜN VERSİYON
async function testAiSimple() {
  const geminiKey = localStorage.getItem('gemini_api_key');
  if (!geminiKey) {
    toast("API Key bulunamadı", "error");
    return;
  }
  
  toast("🔍 API Key test ediliyor...", "info");
  
  try {
    // DOĞRU URL: gemini-1.5-flash kullan
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    
    console.log("🧪 Test URL:", testUrl);
    
    const response = await fetch(testUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: "Merhaba, bu bir test mesajıdır. Türkçe cevap ver." }]
        }]
      })
    });
    
    console.log("📊 Test sonucu:", response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log("✅ API Key çalışıyor!", data);
      toast("✅ API Key geçerli! AI çalışıyor.", "success");
      return true;
    } else {
      const errorData = await response.json();
      console.error("❌ API Key test hatası:", errorData);
      
      // Hata türüne göre mesaj
      if (response.status === 404) {
        toast("❌ Model bulunamadı. Lütfen 'gemini-1.5-flash' modelini kontrol edin.", "error");
      } else if (response.status === 400 || response.status === 403) {
        toast("❌ API Key geçersiz veya yetkisiz.", "error");
      } else {
        toast(`❌ API hatası: ${response.status}`, "error");
      }
      return false;
    }
  } catch (error) {
    console.error("❌ Test bağlantı hatası:", error);
    toast("❌ Sunucuya bağlanılamıyor.", "error");
    return false;
  }
}
  
  // 10. LOGOUT BUTONU
  $("logoutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      toast("Çıkış yapıldı", "info");
    } catch (error) {
      console.error("Çıkış hatası:", error);
    }
  });
  
  // 11. FAVORİ YENİLEME
  $("btnFavRefresh")?.addEventListener("click", async () => {
    if (!window.currentUser) return openLogin();
    await loadFavorites(window.currentUser.uid);
    renderFavoritesPage(window.currentUser.uid);
    toast("Favoriler yenilendi", "info");
  });
  
  console.log("✅ Tüm butonlar bağlandı");
}

// 12. TEMİZLE BUTONU (YENİ EKLENEN)
$("btnClearSearch")?.addEventListener("click", () => {
  $("normalList").innerHTML = "";
  $("qNormal").value = "";
  toast("Arama temizlendi", "info");
});

// 13. CACHE TEMİZLEME BUTONU (login modal'daki - YENİ EKLENEN)
$("btnClearCache")?.addEventListener("click", () => {
  if (confirm("Tüm cache ve localStorage verileri silinecek. Emin misiniz?")) {
    localStorage.clear();
    sessionStorage.clear();
    toast("✅ Tüm cache temizlendi", "success");
    setTimeout(() => {
      location.reload();
    }, 1500);
  }
});

console.log("✅ Tüm butonlar bağlandı");

// ========== KAMERA BUTONU EKLE ==========
function addCameraButton() {
  const tabbar = document.querySelector('.tabbar');
  if (!tabbar) return;
  
  const tabs = tabbar.querySelectorAll('.tab');
  if (tabs.length < 4) return;
  
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

// ========== UYGULAMA BAŞLATMA ==========
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 FiyatTakip başlatılıyor...");
  
  setupButtons();
  addCameraButton();
  showPage("home");
  renderRecentSearches();
  
  console.log("🌐 API URL:", API_URL);
  
  // Firebase Auth kontrol
  if (firebaseConfigLooksInvalid()) {
    toast("Firebase config kontrol edin", "error");
  }

  onAuthStateChanged(auth, async (user) => {
    window.currentUser = user || null;
    
    if (user) {
      console.log("✅ Giriş yapıldı:", user.email);
      closeLogin();
      await loadFavorites(user.uid);
      renderFavoritesPage(user.uid);
    } else {
      console.log("❌ Çıkış yapıldı");
      openLogin();
    }
  });
  
  toast("FiyatTakip hazır!", "success");
});

// ========== GLOBAL FONKSİYONLAR ==========
window.showPage = showPage;
window.fiyatAra = fiyatAra;
window.cameraAiSearch = cameraAiSearch;
window.getAiCommentForFavorite = getAiCommentForFavorite;
window.toggleFavorite = toggleFavorite;
window.copyToClipboard = copyToClipboard;
window.handleRecentSearch = handleRecentSearch;
window.removeRecentSearch = removeRecentSearch;
window.openLogin = openLogin;
window.closeLogin = closeLogin;
window.openAPIModal = openAPIModal;
window.checkAPIStatus = checkAPIStatus;
