// app.js - Fiyat Takip Uygulaması
import { auth, googleProvider, db, firebaseConfigLooksInvalid } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection, getDocs, doc, setDoc, deleteDoc
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

const API_URL = "https://fiyattakip-api.onrender.com";
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
    this.searchMode = localStorage.getItem('searchMode') || 'link';
    this.theme = localStorage.getItem('theme') || 'auto';
  }

  saveCompareItems() {
    localStorage.setItem('fiyattakip_compare', JSON.stringify(this.compareItems));
    this.updateCompareCount();
  }

  clearCompareItems() {
    this.compareItems = [];
    this.saveCompareItems();
  }

  addToCompare(product, query = "") {
    if (this.compareItems.length >= MAX_COMPARE_ITEMS) {
      this.showToast("Maksimum 5 ürün karşılaştırabilirsiniz", "error");
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

  updateCompareCount() {
    const countEl = document.getElementById('compareCount');
    if (countEl) {
      countEl.textContent = `${this.compareItems.length} ürün`;
    }
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

  saveRecentSearch(query) {
    let recent = JSON.parse(localStorage.getItem('fiyattakip_recent') || '[]');
    recent = recent.filter(q => q !== query);
    recent.unshift(query);
    recent = recent.slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem('fiyattakip_recent', JSON.stringify(recent));
    this.renderRecentSearches();
  }

  renderRecentSearches() {
    const container = document.getElementById("recentList");
    if (!container) return;
    
    const recent = JSON.parse(localStorage.getItem('fiyattakip_recent') || '[]');
    
    if (recent.length === 0) {
      container.innerHTML = '<p class="recent-empty">Henüz arama yapılmadı</p>';
      return;
    }
    
    let html = '';
    recent.forEach(query => {
      html += `
        <div class="recent-item" onclick="app.handleRecentSearch('${query.replace(/'/g, "\\'")}')">
          <span><i class="fas fa-search"></i> ${query}</span>
          <button class="recent-remove" onclick="event.stopPropagation(); app.removeRecentSearch('${query.replace(/'/g, "\\'")}')">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
    });
    
    container.innerHTML = html;
  }

  handleRecentSearch(query) {
    const input = document.getElementById('searchInput');
    if (input) input.value = query;
    this.performSearch(query);
  }

  removeRecentSearch(query) {
    let recent = JSON.parse(localStorage.getItem('fiyattakip_recent') || '[]');
    recent = recent.filter(q => q !== query);
    localStorage.setItem('fiyattakip_recent', JSON.stringify(recent));
    this.renderRecentSearches();
  }

  setTheme(newTheme) {
    this.theme = newTheme;
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }

  initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    this.setTheme(savedTheme);
    
    // Toggle switch
    const darkModeToggle = document.getElementById('darkMode');
    if (darkModeToggle) {
      darkModeToggle.checked = savedTheme === 'dark';
      darkModeToggle.addEventListener('change', (e) => {
        this.setTheme(e.target.checked ? 'dark' : 'light');
      });
    }
  }
}

const app = new AppState();

// ========== SEARCH FUNCTIONS ==========
async function performSearch(query) {
  if (!query || query.trim() === '') {
    app.showToast('Lütfen bir şey yazın', 'error');
    return;
  }

  const mode = app.searchMode;
  app.saveRecentSearch(query);
  
  if (mode === 'price' || mode === 'ai') {
    await fetchPrices(query);
  } else {
    // Link mode
    showSearchResults(query);
  }
}

async function fetchPrices(query) {
  const container = document.getElementById('searchResults');
  if (!container) return;
  
  container.innerHTML = `
    <div class="loading">
      <p>Fiyatlar çekiliyor...</p>
    </div>
  `;
  
  try {
    app.showToast('Fiyatlar çekiliyor...', 'info');
    
    // Burada API çağrısı yapılacak
    // Örnek veri kullanıyoruz
    setTimeout(() => {
      const sampleData = {
        fiyatlar: [
          { urun: `${query} - Pro Model`, fiyat: '12.999 TL', site: 'Trendyol', link: 'https://trendyol.com/urun' },
          { urun: `${query} - Standard`, fiyat: '10.499 TL', site: 'Hepsiburada', link: 'https://hepsiburada.com/urun' },
          { urun: `${query} - Lite`, fiyat: '8.999 TL', site: 'n11', link: 'https://n11.com/urun' },
          { urun: `${query} - Premium`, fiyat: '15.499 TL', site: 'Amazon', link: 'https://amazon.com.tr/urun' },
        ]
      };
      
      renderPriceResults(sampleData);
    }, 1000);
    
  } catch (error) {
    console.error('Fiyat çekme hatası:', error);
    app.showToast('Fiyatlar çekilemedi', 'error');
    container.innerHTML = `
      <div class="error-state">
        <p>Fiyatlar çekilemedi. Link moduna geçiliyor...</p>
        <button class="btnPrimary" onclick="showSearchResults('${query.replace(/'/g, "\\'")}')">Link Modunda Göster</button>
      </div>
    `;
  }
}

function renderPriceResults(data) {
  const container = document.getElementById('searchResults');
  if (!container) return;
  
  if (!data.fiyatlar || data.fiyatlar.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Ürün bulunamadı</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  
  // En ucuz banner
  const cheapest = data.fiyatlar[0];
  html += `
    <div class="cheapest-banner">
      <div class="banner-header">
        <span class="cheapest-badge">🥇 EN UCUZ</span>
        <span class="site-badge">${cheapest.site}</span>
      </div>
      <div class="product-info">
        <h4>${cheapest.urun}</h4>
        <div class="product-price">${cheapest.fiyat}</div>
        <div class="product-actions">
          <button class="btnPrimary sm" onclick="window.open('${cheapest.link}', '_blank')">Ürüne Git</button>
          <button class="btnGhost sm" onclick="copyToClipboard('${cheapest.link}')">⧉ Kopyala</button>
          <button class="btnGhost sm btn-compare" 
                  data-title="${cheapest.urun}"
                  data-price="${cheapest.fiyat}"
                  data-site="${cheapest.site}"
                  data-link="${cheapest.link}">⚖️ Karşılaştır</button>
        </div>
      </div>
    </div>
  `;
  
  // Diğer ürünler
  html += '<div class="other-products">';
  data.fiyatlar.slice(1).forEach(product => {
    html += `
      <div class="product-card">
        <div class="product-header">
          <span class="product-site">${product.site}</span>
          <button class="btn-compare xs"
                  data-title="${product.urun}"
                  data-price="${product.fiyat}"
                  data-site="${product.site}"
                  data-link="${product.link}">⚖️</button>
        </div>
        <div class="product-title">${product.urun}</div>
        <div class="product-price">${product.fiyat}</div>
        <div class="product-actions">
          <button class="btnGhost xs" onclick="window.open('${product.link}', '_blank')">Aç</button>
          <button class="btnGhost xs" onclick="copyToClipboard('${product.link}')">⧉</button>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  container.innerHTML = html;
  setupCompareButtons();
}

function showSearchResults(query) {
  const container = document.getElementById('searchResults');
  if (!container) return;
  
  let html = '<div class="site-list">';
  
  SITES.forEach(site => {
    const url = site.build(query);
    html += `
      <div class="site-card">
        <div class="site-info">
          <h4>${site.name}</h4>
          <p>${query}</p>
        </div>
        <div class="site-actions">
          <button class="btnPrimary sm" onclick="window.open('${url}', '_blank')">Aç</button>
          <button class="btnGhost sm" onclick="copyToClipboard('${url}')">⧉ Kopyala</button>
          <button class="btnGhost sm btn-compare"
                  data-title="${query}"
                  data-site="${site.name}"
                  data-link="${url}">⚖️</button>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
  setupCompareButtons();
}

// ========== FAVORITES ==========
async function loadFavorites() {
  if (!app.currentUser) {
    app.favorites = [];
    return;
  }
  
  try {
    const favsRef = collection(db, "users", app.currentUser.uid, "favorites");
    const snapshot = await getDocs(favsRef);
    app.favorites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderFavorites();
  } catch (error) {
    console.error('Favoriler yüklenemedi:', error);
    app.favorites = [];
  }
}

function renderFavorites() {
  const container = document.getElementById('favoritesList');
  if (!container) return;
  
  if (app.favorites.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Henüz favori ürününüz yok</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  app.favorites.forEach(fav => {
    html += `
      <div class="favorite-card">
        <div class="favorite-info">
          <div class="fav-site">${fav.siteName || fav.site || 'Site'}</div>
          <div class="fav-title">${fav.query || fav.title || 'Ürün'}</div>
          ${fav.price ? `<div class="fav-price">${fav.price}</div>` : ''}
        </div>
        <div class="favorite-actions">
          <button class="btnGhost sm" onclick="window.open('${fav.url || ''}', '_blank')">Aç</button>
          <button class="btnGhost sm btn-compare"
                  data-title="${fav.query || fav.title || 'Ürün'}"
                  data-price="${fav.price || ''}"
                  data-site="${fav.siteName || fav.site || ''}"
                  data-link="${fav.url || ''}">⚖️</button>
          <button class="btnGhost sm" onclick="removeFavorite('${fav.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  setupCompareButtons();
}

async function removeFavorite(favId) {
  if (!app.currentUser) return;
  
  try {
    const favRef = doc(db, "users", app.currentUser.uid, "favorites", favId);
    await deleteDoc(favRef);
    await loadFavorites();
    app.showToast('Favoriden çıkarıldı', 'success');
  } catch (error) {
    console.error('Favori silme hatası:', error);
    app.showToast('Favori silinemedi', 'error');
  }
}

// ========== AUTH FUNCTIONS ==========
function openLoginModal() {
  document.getElementById('loginModal').classList.add('show');
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('show');
}

async function handleEmailLogin(isRegister) {
  const email = isRegister ? 
    document.getElementById('registerEmail').value :
    document.getElementById('loginEmail').value;
  
  const password = isRegister ? 
    document.getElementById('registerPassword').value :
    document.getElementById('loginPassword').value;
  
  if (!email || !password) {
    app.showToast('E-posta ve şifre girin', 'error');
    return;
  }
  
  if (isRegister) {
    const password2 = document.getElementById('registerPassword2').value;
    if (password !== password2) {
      app.showToast('Şifreler uyuşmuyor', 'error');
      return;
    }
    
    if (password.length < 6) {
      app.showToast('Şifre en az 6 karakter olmalı', 'error');
      return;
    }
  }
  
  try {
    if (isRegister) {
      await createUserWithEmailAndPassword(auth, email, password);
      app.showToast('Kayıt başarılı!', 'success');
      // Giriş formuna geç
      switchAuthTab('login');
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      app.showToast('Giriş başarılı!', 'success');
      closeLoginModal();
    }
  } catch (error) {
    console.error('Auth error:', error);
    
    const errorMessages = {
      'auth/email-already-in-use': 'Bu e-posta zaten kullanımda',
      'auth/invalid-email': 'Geçersiz e-posta',
      'auth/weak-password': 'Şifre çok zayıf',
      'auth/wrong-password': 'Hatalı şifre',
      'auth/user-not-found': 'Kullanıcı bulunamadı'
    };
    
    app.showToast(errorMessages[error.code] || 'Bir hata oluştu', 'error');
  }
}

async function handleGoogleLogin() {
  try {
    await signInWithPopup(auth, googleProvider);
    app.showToast('Google ile giriş başarılı!', 'success');
    closeLoginModal();
  } catch (error) {
    console.error('Google login error:', error);
    app.showToast('Google ile giriş başarısız', 'error');
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
    app.showToast('Çıkış yapıldı', 'info');
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// ========== COMPARE FUNCTIONS ==========
function setupCompareButtons() {
  document.querySelectorAll('.btn-compare').forEach(btn => {
    const title = btn.getAttribute('data-title');
    const price = btn.getAttribute('data-price');
    const site = btn.getAttribute('data-site');
    const link = btn.getAttribute('data-link');
    
    const product = { title, price, site, link };
    
    // Check if already in compare
    const isInCompare = app.compareItems.some(item => item.link === link);
    btn.classList.toggle('active', isInCompare);
    btn.innerHTML = isInCompare ? '✓' : (btn.classList.contains('xs') ? '⚖️' : '⚖️ Karşılaştır');
    
    btn.onclick = (e) => {
      e.stopPropagation();
      const added = app.addToCompare(product, app.currentSearch);
      if (added) {
        app.showToast(`${title.substring(0, 30)}... karşılaştırmaya eklendi`, 'success');
        btn.classList.add('active');
        btn.innerHTML = '✓';
      } else {
        btn.classList.remove('active');
        btn.innerHTML = btn.classList.contains('xs') ? '⚖️' : '⚖️ Karşılaştır';
      }
    };
  });
}

function openCompareModal() {
  renderCompareList();
  document.getElementById('compareModal').classList.add('show');
}

function closeCompareModal() {
  document.getElementById('compareModal').classList.remove('show');
}

function renderCompareList() {
  const container = document.getElementById('compareList');
  if (!container) return;
  
  if (app.compareItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Karşılaştırma listesi boş</p>
        <p class="small">Ürünlerdeki ⚖️ butonuna tıklayın</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  app.compareItems.forEach(item => {
    html += `
      <div class="compare-item">
        <div class="compare-info">
          <div class="compare-title">${item.title.substring(0, 40)}${item.title.length > 40 ? '...' : ''}</div>
          <div class="compare-site">${item.site}</div>
          <div class="compare-price">${item.price}</div>
        </div>
        <div class="compare-actions">
          <button class="btnGhost xs" onclick="window.open('${item.link}', '_blank')">Aç</button>
          <button class="btnGhost xs" onclick="app.removeFromCompare('${item.id}'); renderCompareList();">✕</button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

async function runAICompare() {
  if (app.compareItems.length < 2) {
    app.showToast('En az 2 ürün gerekli', 'error');
    return;
  }
  
  app.showToast('AI karşılaştırma yapılıyor...', 'info');
  
  try {
    const response = await fetch(`${API_URL}/ai/yorum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalQuery: `${app.compareItems.length} ürün karşılaştırması`,
        site: 'Çoklu Karşılaştırma',
        price: app.compareItems.map(item => item.price).join(', ')
      })
    });
    
    const data = await response.json();
    
    document.getElementById('aiContent').innerHTML = `
      <h4>🤖 AI Karşılaştırma Analizi</h4>
      <p>${data.yorum.replace(/\n/g, '<br>')}</p>
      <p class="ai-source"><small>Kaynak: ${data.source}</small></p>
    `;
    
    document.getElementById('aiModal').classList.add('show');
    
  } catch (error) {
    console.error('AI compare error:', error);
    app.showToast('AI karşılaştırma başarısız', 'error');
  }
}

function closeAIModal() {
  document.getElementById('aiModal').classList.remove('show');
}

// ========== HELPER FUNCTIONS ==========
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    app.showToast('Kopyalandı!', 'success');
  } catch (error) {
    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    app.showToast('Kopyalandı!', 'success');
  }
}

// ========== UI INITIALIZATION ==========
function initializeUI() {
  // Search button
  document.getElementById('searchBtn').addEventListener('click', () => {
    const query = document.getElementById('searchInput').value.trim();
    performSearch(query);
  });
  
  // Search input enter key
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = e.target.value.trim();
      performSearch(query);
    }
  });
  
  // Quick tags
  document.querySelectorAll('.quick-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const query = tag.getAttribute('data-query');
      document.getElementById('searchInput').value = query;
      performSearch(query);
    });
  });
  
  // Search modes
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      app.searchMode = btn.getAttribute('data-mode');
      localStorage.setItem('searchMode', app.searchMode);
    });
  });
  
  // Camera button
  document.getElementById('cameraBtn').addEventListener('click', cameraSearch);
  document.getElementById('fabCamera').addEventListener('click', cameraSearch);
  
  // Auth tabs
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      switchAuthTab(tabName);
    });
  });
  
  // Auth buttons
  document.getElementById('submitLogin').addEventListener('click', () => handleEmailLogin(false));
  document.getElementById('submitRegister').addEventListener('click', () => handleEmailLogin(true));
  document.getElementById('googleLogin').addEventListener('click', handleGoogleLogin);
  document.getElementById('loginBtn').addEventListener('click', openLoginModal);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  
  // Clear results
  document.getElementById('clearResults').addEventListener('click', () => {
    document.getElementById('searchResults').innerHTML = '';
  });
  
  // Refresh favorites
  document.getElementById('refreshFavs').addEventListener('click', loadFavorites);
  
  // Clear cache
  document.getElementById('clearCache').addEventListener('click', () => {
    localStorage.clear();
    app.showToast('Önbellek temizlendi', 'success');
    location.reload();
  });
  
  // Initialize theme
  app.initTheme();
  
  // Initialize compare count
  app.updateCompareCount();
  
  // Load recent searches
  app.renderRecentSearches();
}

function switchAuthTab(tabName) {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
  });
  
  document.getElementById('loginForm').classList.toggle('hidden', tabName !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tabName !== 'register');
}

async function cameraSearch() {
  app.showToast('Kamera özelliği yakında eklenecek', 'info');
  // Kamera implementasyonu buraya gelecek
}

// ========== CHART FUNCTIONS ==========
function loadSampleChart() {
  const ctx = document.getElementById('priceChart');
  if (!ctx) return;
  
  new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'],
      datasets: [{
        label: 'iPhone 15 Fiyat Trendi',
        data: [45999, 44999, 43999, 42999, 41999, 40999],
        borderColor: '#7c5cff',
        backgroundColor: 'rgba(124, 92, 255, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: function(value) {
              return value.toLocaleString() + ' TL';
            }
          }
        }
      }
    }
  });
}

// ========== AUTH STATE LISTENER ==========
onAuthStateChanged(auth, (user) => {
  app.currentUser = user;
  
  if (user) {
    console.log('Kullanıcı giriş yaptı:', user.email);
    loadFavorites();
  } else {
    console.log('Kullanıcı çıkış yaptı');
    app.favorites = [];
    renderFavorites();
  }
});

// ========== APP INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
  console.log('FiyatTakip uygulaması başlatılıyor...');
  
  if (firebaseConfigLooksInvalid()) {
    app.showToast('Firebase konfigürasyonu kontrol edin', 'error');
  }
  
  initializeUI();
  
  // Load sample chart if on graph page
  if (window.location.hash === '#graph' || document.querySelector('#page-graph.active')) {
    setTimeout(loadSampleChart, 1000);
  }
  
  console.log('Uygulama hazır!');
});

// ========== GLOBAL EXPORTS ==========
window.app = app;
window.performSearch = performSearch;
window.openCompareModal = openCompareModal;
window.closeCompareModal = closeCompareModal;
window.closeAIModal = closeAIModal;
window.runAICompare = runAICompare;
window.clearCompareList = () => {
  app.clearCompareItems();
  renderCompareList();
};
window.loadSampleChart = loadSampleChart;
window.copyToClipboard = copyToClipboard;
