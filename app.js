// app.js - Fiyat Takip Uygulaması v3.1
import { auth, googleProvider } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore();
const $ = (id) => document.getElementById(id);

// API KONFİG
const DEFAULT_API_URL = "https://fiyattakip-api.onrender.com/api";
let API_URL = localStorage.getItem('fiyattakip_api_url') || DEFAULT_API_URL;

// DEĞİŞKENLER
let currentPage = 1, currentSort = 'asc', currentSearch = '', totalPages = 1;
let favCache = [], sepetItems = JSON.parse(localStorage.getItem('fiyattakip_sepet') || '[]');

// TOAST
function toast(msg, type = 'info'){
  const t = $("toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.add("hidden"), 2200);
}

// SAYFA GEÇİŞ
function showPage(key){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  const page = document.querySelector(`#page-${CSS.escape(key)}`);
  if (page) page.classList.add("active");
  const tab = document.querySelector(`.tab[data-page="${CSS.escape(key)}"]`);
  if (tab) tab.classList.add("active");
  
  // Sayfa özel işlemler
  if (key === 'favs') renderFavoritesPage(window.currentUser?.uid);
  if (key === 'sepet') renderSepetPage();
  if (key === 'grafik') renderGrafikPage();
  if (key === 'home') renderRecentSearches();
}

// ==================== SEPET İŞLEMLERİ ====================

// SEPETE EKLE (Linklerden)
function addToSepet(urunBilgisi) {
  if (!urunBilgisi) return;
  
  const sepetItem = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    urun: urunBilgisi.urun || urunBilgisi.title || 'Ürün',
    site: urunBilgisi.site || 'Manuel',
    fiyat: urunBilgisi.fiyat || '0 TL',
    numericPrice: urunBilgisi.numericPrice || parseInt(urunBilgisi.fiyat?.replace(/[^\d]/g, '')) || 0,
    link: urunBilgisi.link || '#',
    tip: 'otomatik',
    tarih: new Date().toISOString(),
    kategori: urunBilgisi.kategori || 'genel'
  };
  
  sepetItems.push(sepetItem);
  localStorage.setItem('fiyattakip_sepet', JSON.stringify(sepetItems));
  updateSepetCount();
  
  // API'ye de gönder (opsiyonel)
  try {
    fetch(`${API_URL}/sepet-ekle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urunAdi: sepetItem.urun,
        site: sepetItem.site,
        fiyat: sepetItem.fiyat,
        link: sepetItem.link,
        tip: 'otomatik'
      })
    }).catch(e => console.log('API hatası (önemsiz):', e));
  } catch (e) {}
  
  toast(`"${sepetItem.urun.substring(0, 30)}" sepete eklendi 🛒`, 'success');
}

// SEPETTEN ÇIKAR
function removeFromSepet(id) {
  sepetItems = sepetItems.filter(item => item.id !== id);
  localStorage.setItem('fiyattakip_sepet', JSON.stringify(sepetItems));
  updateSepetCount();
  if (currentPage === 'sepet') renderSepetPage();
  toast('Sepetten çıkarıldı', 'info');
}

// SEPET SAYISI GÜNCELLE
function updateSepetCount() {
  const count = sepetItems.length;
  const badge = document.querySelector('.sepetBadge');
  if (badge) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

// MANUEL FİYAT EKLEME MODALI
function openManualPriceModal() {
  const modal = document.createElement('div');
  modal.className = 'modalWrap show';
  modal.innerHTML = `
    <div class="modalBack" onclick="this.closest('.modalWrap').remove()"></div>
    <div class="modalCard" style="max-width: 500px">
      <div class="modalTop">
        <div class="modalTitle">📝 Manuel Ürün Ekle</div>
        <button class="iconBtn" onclick="this.closest('.modalWrap').remove()">✕</button>
      </div>
      <div class="modalBody">
        <div class="formGroup">
          <label>Ürün Adı *</label>
          <input id="manualProduct" class="input" placeholder="Örn: iPhone 13 128GB" autofocus>
        </div>
        <div class="formGroup">
          <label>Site (opsiyonel)</label>
          <select id="manualSite" class="input">
            <option value="">Manuel</option>
            <option value="Trendyol">Trendyol</option>
            <option value="Hepsiburada">Hepsiburada</option>
            <option value="n11">n11</option>
            <option value="Amazon TR">Amazon TR</option>
            <option value="Pazarama">Pazarama</option>
            <option value="ÇiçekSepeti">ÇiçekSepeti</option>
          </select>
        </div>
        <div class="formGroup">
          <label>Fiyat (TL) *</label>
          <input id="manualPrice" class="input" placeholder="Örn: 21999" type="number" min="1">
        </div>
        <div class="formGroup">
          <label>Kategori (opsiyonel)</label>
          <select id="manualKategori" class="input">
            <option value="genel">Genel</option>
            <option value="telefon">Telefon</option>
            <option value="tablet">Tablet</option>
            <option value="laptop">Laptop</option>
            <option value="televizyon">Televizyon</option>
            <option value="kulaklık">Kulaklık</option>
            <option value="oyun">Oyun</option>
          </select>
        </div>
        <div class="formGroup">
          <label>Link (opsiyonel)</label>
          <input id="manualLink" class="input" placeholder="https://...">
        </div>
        <div class="row" style="margin-top:20px;gap:10px">
          <button class="btnGhost" onclick="this.closest('.modalWrap').remove()">İptal</button>
          <button class="btnPrimary" onclick="saveManualPrice()">Sepete Ekle</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('manualProduct')?.focus();
}

function saveManualPrice() {
  const urun = document.getElementById('manualProduct')?.value?.trim();
  const site = document.getElementById('manualSite')?.value?.trim() || 'Manuel';
  const fiyat = document.getElementById('manualPrice')?.value?.trim();
  const kategori = document.getElementById('manualKategori')?.value?.trim() || 'genel';
  const link = document.getElementById('manualLink')?.value?.trim() || '#';
  
  if (!urun || !fiyat) {
    toast('Ürün adı ve fiyat gerekli', 'error');
    return;
  }
  
  const numericPrice = parseInt(fiyat) || 0;
  if (numericPrice <= 0) {
    toast('Geçerli bir fiyat girin', 'error');
    return;
  }
  
  const sepetItem = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    urun: urun,
    site: site,
    fiyat: `${numericPrice.toLocaleString('tr-TR')} TL`,
    numericPrice: numericPrice,
    link: link,
    tip: 'manuel',
    kategori: kategori,
    tarih: new Date().toISOString()
  };
  
  sepetItems.push(sepetItem);
  localStorage.setItem('fiyattakip_sepet', JSON.stringify(sepetItems));
  updateSepetCount();
  
  // API'ye gönder
  try {
    fetch(`${API_URL}/sepet-ekle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urunAdi: urun,
        site: site,
        fiyat: numericPrice,
        link: link,
        tip: 'manuel'
      })
    });
  } catch (e) {}
  
  document.querySelector('.modalWrap')?.remove();
  toast(`"${urun.substring(0, 30)}" sepete eklendi 📝`, 'success');
  
  if (currentPage === 'sepet') renderSepetPage();
}

// SEPET SAYFASI RENDER
function renderSepetPage() {
  const container = $("#sepetList");
  if (!container) return;
  
  if (sepetItems.length === 0) {
    container.innerHTML = `
      <div class="emptyState">
        <div class="emptyIcon">🛒</div>
        <h3>Sepet Boş</h3>
        <p>Favorilerden veya manuel olarak ürün ekleyin</p>
        <div class="row" style="gap:10px;margin-top:20px;justify-content:center">
          <button class="btnPrimary" onclick="openManualPriceModal()">📝 Manuel Ekle</button>
          <button class="btnGhost" onclick="showPage('home')">🏠 Alışverişe Başla</button>
        </div>
      </div>
    `;
    return;
  }
  
  // Toplam hesaplamalar
  const toplamFiyat = sepetItems.reduce((sum, item) => sum + (item.numericPrice || 0), 0);
  const ortalamaFiyat = Math.round(toplamFiyat / sepetItems.length);
  const enUcuz = Math.min(...sepetItems.map(item => item.numericPrice || 0));
  const enPahali = Math.max(...sepetItems.map(item => item.numericPrice || 0));
  
  let html = `
    <div class="sepetHeader">
      <div class="sepetStats">
        <div class="stat">
          <div class="statLabel">Toplam Ürün</div>
          <div class="statValue">${sepetItems.length}</div>
        </div>
        <div class="stat">
          <div class="statLabel">Toplam Fiyat</div>
          <div class="statValue">${toplamFiyat.toLocaleString('tr-TR')} TL</div>
        </div>
        <div class="stat">
          <div class="statLabel">Ortalama</div>
          <div class="statValue">${ortalamaFiyat.toLocaleString('tr-TR')} TL</div>
        </div>
      </div>
      
      <div class="sepetActions">
        <button class="btnGhost sm" onclick="openManualPriceModal()">+ Manuel Ekle</button>
        <button class="btnGhost sm" onclick="sortSepet('asc')">⬆️ Ucuz</button>
        <button class="btnGhost sm" onclick="sortSepet('desc')">⬇️ Pahalı</button>
        <button class="btnGhost sm" onclick="sortSepet('date')">📅 Tarih</button>
        <button class="btnGhost sm error" onclick="clearSepet()" title="Sepeti Temizle">🗑️</button>
      </div>
    </div>
    
    <div class="priceRange">
      <div class="rangeItem">
        <span class="rangeLabel">En Ucuz:</span>
        <span class="rangeValue success">${enUcuz.toLocaleString('tr-TR')} TL</span>
      </div>
      <div class="rangeItem">
        <span class="rangeLabel">En Pahalı:</span>
        <span class="rangeValue error">${enPahali.toLocaleString('tr-TR')} TL</span>
      </div>
      <div class="rangeItem">
        <span class="rangeLabel">Fiyat Farkı:</span>
        <span class="rangeValue">${(enPahali - enUcuz).toLocaleString('tr-TR')} TL</span>
      </div>
    </div>
    
    <div class="sepetItems">
  `;
  
  // Ürün listesi
  sepetItems.forEach((item, index) => {
    html += `
      <div class="sepetItem cardBox">
        <div class="sepetItemHeader">
          <div class="sepetItemInfo">
            <div class="sepetMeta">
              <span class="sepetSite">${item.site}</span>
              ${item.tip === 'manuel' ? '<span class="manualBadge">📝 Manuel</span>' : '<span class="autoBadge">🛒 Otomatik</span>'}
              ${item.kategori && item.kategori !== 'genel' ? `<span class="kategoriBadge">${item.kategori}</span>` : ''}
            </div>
            <div class="sepetProduct">${item.urun}</div>
            <div class="sepetPrice">${item.fiyat}</div>
          </div>
          <div class="sepetItemActions">
            ${item.link !== '#' ? `<button class="btnGhost xs" onclick="window.open('${item.link}', '_blank')" title="Ürünü Aç">🔗</button>` : ''}
            <button class="btnGhost xs error" onclick="removeFromSepet('${item.id}')" title="Sepetten Çıkar">🗑️</button>
          </div>
        </div>
        <div class="sepetFooter">
          <small>${new Date(item.tarih).toLocaleDateString('tr-TR')} • ${new Date(item.tarih).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</small>
          <small>#${index + 1}</small>
        </div>
      </div>
    `;
  });
  
  html += `
    </div>
    
    <div class="sepetFooterActions">
      <button class="btnPrimary" onclick="showPage('grafik')">📊 Grafiği Gör</button>
      <button class="btnGhost" onclick="exportSepet()">📥 Dışa Aktar</button>
    </div>
  `;
  
  container.innerHTML = html;
}

// SEPET SIRALAMA
function sortSepet(type) {
  switch(type) {
    case 'asc':
      sepetItems.sort((a, b) => (a.numericPrice || 0) - (b.numericPrice || 0));
      toast('En ucuza göre sıralandı', 'info');
      break;
    case 'desc':
      sepetItems.sort((a, b) => (b.numericPrice || 0) - (a.numericPrice || 0));
      toast('En pahalıya göre sıralandı', 'info');
      break;
    case 'date':
      sepetItems.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
      toast('Tarihe göre sıralandı', 'info');
      break;
  }
  
  localStorage.setItem('fiyattakip_sepet', JSON.stringify(sepetItems));
  renderSepetPage();
}

// SEPETİ TEMİZLE
function clearSepet() {
  if (sepetItems.length === 0) return;
  
  if (confirm(`${sepetItems.length} ürünü sepetten çıkarmak istiyor musunuz? Bu işlem geri alınamaz.`)) {
    sepetItems = [];
    localStorage.setItem('fiyattakip_sepet', JSON.stringify(sepetItems));
    updateSepetCount();
    renderSepetPage();
    toast('Sepet temizlendi', 'info');
  }
}

// SEPETİ DIŞA AKTAR
function exportSepet() {
  if (sepetItems.length === 0) {
    toast('Sepet boş', 'error');
    return;
  }
  
  const exportData = {
    tarih: new Date().toLocaleString('tr-TR'),
    toplamUrun: sepetItems.length,
    toplamFiyat: sepetItems.reduce((sum, item) => sum + (item.numericPrice || 0), 0),
    urunler: sepetItems.map(item => ({
      ürün: item.urun,
      site: item.site,
      fiyat: item.fiyat,
      link: item.link,
      tarih: item.tarih
    }))
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fiyattakip-sepet-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  toast('Sepet dışa aktarıldı', 'success');
}

// ==================== GRAFİK SAYFASI ====================

function renderGrafikPage() {
  const container = $("#grafikList");
  if (!container) return;
  
  if (sepetItems.length === 0) {
    container.innerHTML = `
      <div class="emptyState">
        <div class="emptyIcon">📊</div>
        <h3>Grafik Verisi Yok</h3>
        <p>Sepete ürün ekleyerek grafik oluşturabilirsiniz</p>
        <div class="row" style="gap:10px;margin-top:20px;justify-content:center">
          <button class="btnPrimary" onclick="showPage('sepet')">🛒 Sepete Git</button>
          <button class="btnGhost" onclick="showPage('home')">🏠 Alışverişe Başla</button>
        </div>
      </div>
    `;
    return;
  }
  
  // Kategori analizi
  const kategoriAnaliz = {};
  sepetItems.forEach(item => {
    const kategori = item.kategori || 'Diğer';
    if (!kategoriAnaliz[kategori]) {
      kategoriAnaliz[kategori] = { toplam: 0, adet: 0, urunler: [] };
    }
    kategoriAnaliz[kategori].toplam += item.numericPrice || 0;
    kategoriAnaliz[kategori].adet += 1;
    kategoriAnaliz[kategori].urunler.push(item.urun);
  });
  
  // Fiyat aralıkları analizi
  const fiyatAraliklari = [
    { aralik: '0-500 TL', min: 0, max: 500, sayi: 0, renk: '#36d399' },
    { aralik: '501-2000 TL', min: 501, max: 2000, sayi: 0, renk: '#4b3fd6' },
    { aralik: '2001-5000 TL', min: 2001, max: 5000, sayi: 0, renk: '#7c5cff' },
    { aralik: '5001-10000 TL', min: 5001, max: 10000, sayi: 0, renk: '#ff6b6b' },
    { aralik: '10000+ TL', min: 10001, max: Infinity, sayi: 0, renk: '#ff4757' }
  ];
  
  sepetItems.forEach(item => {
    const fiyat = item.numericPrice || 0;
    for (const aralik of fiyatAraliklari) {
      if (fiyat >= aralik.min && fiyat <= aralik.max) {
        aralik.sayi++;
        break;
      }
    }
  });
  
  // Site analizi
  const siteAnaliz = {};
  sepetItems.forEach(item => {
    const site = item.site || 'Manuel';
    if (!siteAnaliz[site]) {
      siteAnaliz[site] = { sayi: 0, toplam: 0 };
    }
    siteAnaliz[site].sayi++;
    siteAnaliz[site].toplam += item.numericPrice || 0;
  });
  
  // Toplam hesaplamalar
  const toplamFiyat = sepetItems.reduce((sum, item) => sum + (item.numericPrice || 0), 0);
  const ortalamaFiyat = Math.round(toplamFiyat / sepetItems.length);
  
  let html = `
    <div class="grafikHeader">
      <h3>📊 Sepet Analizi</h3>
      <div class="grafikStats">
        <div class="stat">
          <div class="statLabel">Toplam Ürün</div>
          <div class="statValue">${sepetItems.length}</div>
        </div>
        <div class="stat">
          <div class="statLabel">Toplam Değer</div>
          <div class="statValue">${toplamFiyat.toLocaleString('tr-TR')} TL</div>
        </div>
        <div class="stat">
          <div class="statLabel">Ortalama</div>
          <div class="statValue">${ortalamaFiyat.toLocaleString('tr-TR')} TL</div>
        </div>
      </div>
    </div>
    
    <div class="grafikSection">
      <h4>🏷️ Kategori Dağılımı</h4>
      <div class="kategoriList">
  `;
  
  // Kategoriler
  Object.entries(kategoriAnaliz).forEach(([kategori, data]) => {
    const yuzde = Math.round((data.adet / sepetItems.length) * 100);
    const ortalama = Math.round(data.toplam / data.adet);
    
    html += `
      <div class="kategoriItem">
        <div class="kategoriHeader">
          <span class="kategoriAd">${kategori}</span>
          <span class="kategoriYuzde">%${yuzde}</span>
        </div>
        <div class="kategoriBar">
          <div class="kategoriBarFill" style="width: ${yuzde}%; background: ${getRandomColor()}"></div>
        </div>
        <div class="kategoriDetay">
          <small>${data.adet} ürün • ${data.toplam.toLocaleString('tr-TR')} TL • Ort: ${ortalama.toLocaleString('tr-TR')} TL</small>
        </div>
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
    
    <div class="grafikSection">
      <h4>💰 Fiyat Aralıkları</h4>
      <div class="fiyatAraliklari">
  `;
  
  // Fiyat aralıkları
  fiyatAraliklari.forEach(aralik => {
    if (aralik.sayi > 0) {
      const yuzde = Math.round((aralik.sayi / sepetItems.length) * 100);
      html += `
        <div class="fiyatAralik">
          <div class="fiyatAralikHeader">
            <span class="aralikAd">${aralik.aralik}</span>
            <span class="aralikSayi">${aralik.sayi} ürün</span>
          </div>
          <div class="fiyatAralikBar">
            <div class="aralikBarFill" style="width: ${yuzde}%; background: ${aralik.renk}"></div>
          </div>
          <div class="fiyatAralikYuzde">%${yuzde}</div>
        </div>
      `;
    }
  });
  
  html += `
      </div>
    </div>
    
    <div class="grafikSection">
      <h4>🏬 Site Dağılımı</h4>
      <div class="siteList">
  `;
  
  // Siteler
  Object.entries(siteAnaliz).forEach(([site, data]) => {
    const yuzde = Math.round((data.sayi / sepetItems.length) * 100);
    html += `
      <div class="siteItem">
        <span class="siteAd">${site}</span>
        <span class="siteSayi">${data.sayi} ürün</span>
        <span class="siteYuzde">%${yuzde}</span>
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
    
    <div class="grafikActions">
      <button class="btnPrimary" onclick="showPage('sepet')">🛒 Sepete Dön</button>
      <button class="btnGhost" onclick="refreshGrafik()">🔄 Yenile</button>
    </div>
  `;
  
  container.innerHTML = html;
}

function getRandomColor() {
  const colors = ['#36d399', '#4b3fd6', '#7c5cff', '#ff6b6b', '#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#ff6348'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function refreshGrafik() {
  renderGrafikPage();
  toast('Grafik yenilendi', 'info');
}

// ==================== FİYAT ARAMA VE ÜRÜN KARTLARI ====================

// FİYAT SONUÇLARINI GÖSTER (Sepet butonlu)
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
      <span class="kategoriTag">${data.tespitEdilenKategori || 'Genel'}</span>
    </div>
  `;
  
  // En ucuz ürün banner'ı
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
            <button class="btnSepeteEkle sm" data-urun='${JSON.stringify(cheapest).replace(/'/g, "&apos;")}'>🛒 Sepete Ekle</button>
          </div>
        </div>
      </div>
    `;
  }

  // Diğer ürünler
  html += '<div class="productList">';
  
  data.fiyatlar.forEach((product, index) => {
    if (index === 0) return;
    if (index >= 4) return;
    
    html += `
      <div class="productCard">
        <div class="productRow">
          <div class="productMeta">
            <span class="productSite">${product.site}</span>
            ${product.kategori ? `<span class="productKategori">${product.kategori}</span>` : ''}
          </div>
          <div class="productName">${product.urun}</div>
          <div class="productPriceRow">
            <span class="productPrice">${product.fiyat}</span>
            <div class="productActions">
              <button class="btnGhost xs" onclick="window.open('${product.link}', '_blank')">Aç</button>
              <button class="btnGhost xs" onclick="copyToClipboard('${product.link}')">⧉</button>
              <button class="btnSepeteEkle xs" data-urun='${JSON.stringify(product).replace(/'/g, "&apos;")}'>🛒</button>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
  
  // Sepet butonlarına event ekle
  container.querySelectorAll('.btnSepeteEkle').forEach(btn => {
    btn.addEventListener('click', function() {
      const urunData = JSON.parse(this.getAttribute('data-urun').replace(/&apos;/g, "'"));
      addToSepet(urunData);
    });
  });
}

// NORMAL ARAMA SAYFASINDAKİ ÜRÜNLERE SEPET BUTONU EKLE
function renderSiteList(container, query){
  if (!container) return;
  const q = String(query||"").trim();
  if (!q){
    container.innerHTML = `<div class="cardBox"><b>Bir şey yaz.</b></div>`;
    return;
  }

  container.innerHTML = "";
  const SITES = [
    { key:"trendyol", name:"Trendyol", build:q=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
    { key:"hepsiburada", name:"Hepsiburada", build:q=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
    { key:"n11", name:"N11", build:q=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
    { key:"amazontr", name:"Amazon TR", build:q=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
    { key:"pazarama", name:"Pazarama", build:q=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
    { key:"ciceksepeti", name:"ÇiçekSepeti", build:q=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  ];
  
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
          <button class="btnSepeteEkle sm" type="button" data-urun='${JSON.stringify({urun: q, site: s.name, fiyat: "Fiyat bilgisi yok", link: url, kategori: "genel"}).replace(/'/g, "&apos;")}'>🛒</button>
        </div>
      </div>
    `;
    card.querySelector(".btnOpen")?.addEventListener("click", ()=> window.open(url, "_blank", "noopener"));
    card.querySelector(".btnSepeteEkle")?.addEventListener("click", function() {
      const urunData = JSON.parse(this.getAttribute('data-urun').replace(/&apos;/g, "'"));
      addToSepet(urunData);
    });
    container.appendChild(card);
  }
}

// ==================== AI YORUM DÜZELTMESİ ====================

async function getAiCommentForFavorite(favorite) {
  try {
    toast("🤖 AI analiz yapıyor...", "info");
    
    const response = await fetch(`${API_URL}/ai-yorum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urun: favorite.query || favorite.urun || favorite.urunAdi || 'Ürün',
        fiyatlar: [{
          site: favorite.siteName || favorite.site || 'Site',
          fiyat: favorite.fiyat || "Fiyat bilgisi yok",
          urun: favorite.urun || favorite.query || 'Ürün'
        }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`AI servisi hatası: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'AI yorum yapılamadı');
    }
    
    // AI yorum modalı göster
    const modal = document.createElement('div');
    modal.className = 'aiModal show';
    modal.innerHTML = `
      <div class="modalBack" onclick="this.remove()"></div>
      <div class="modalCard" style="max-width: 500px">
        <div class="modalTop">
          <div class="modalTitle">🤖 AI Analizi</div>
          <button class="iconBtn" onclick="this.closest('.aiModal').remove()">✕</button>
        </div>
        <div class="modalBody">
          <div class="aiProductCard">
            <div class="aiProductHeader">
              <strong>${favorite.query || favorite.urun || favorite.urunAdi || 'Ürün'}</strong>
              <small>${favorite.siteName || favorite.site || 'Site'}</small>
            </div>
            <div class="aiPrice">${favorite.fiyat || 'Fiyat bilgisi yok'}</div>
          </div>
          
          <div class="aiCommentBox">
            <div class="aiCommentHeader">AI Yorumu:</div>
            <div class="aiCommentText">${data.aiYorum || "AI yorum yapamadı."}</div>
          </div>
          
          ${data.detay ? `
            <div class="aiDetails">
              <h4>📊 Detaylı Analiz</h4>
              <div class="aiDetailGrid">
                <div class="aiDetailItem">
                  <div class="aiDetailLabel">En Ucuz Fiyat</div>
                  <div class="aiDetailValue success">${data.detay.enUcuzFiyat || 'N/A'}</div>
                </div>
                <div class="aiDetailItem">
                  <div class="aiDetailLabel">En Pahalı Fiyat</div>
                  <div class="aiDetailValue error">${data.detay.enPahaliFiyat || 'N/A'}</div>
                </div>
                <div class="aiDetailItem">
                  <div class="aiDetailLabel">Ortalama Fiyat</div>
                  <div class="aiDetailValue">${data.detay.ortalamaFiyat || 'N/A'}</div>
                </div>
                ${data.detay.farkYuzde ? `
                <div class="aiDetailItem">
                  <div class="aiDetailLabel">Fiyat Farkı</div>
                  <div class="aiDetailValue">${data.detay.farkYuzde || 'N/A'}</div>
                </div>
                ` : ''}
                <div class="aiDetailItem">
                  <div class="aiDetailLabel">Karşılaştırılan Site</div>
                  <div class="aiDetailValue">${data.detay.siteSayisi || '1'}</div>
                </div>
              </div>
            </div>
          ` : ''}
          
          <div class="aiTimestamp">
            <small>Analiz tarihi: ${new Date(data.timestamp || new Date()).toLocaleString('tr-TR')}</small>
          </div>
          
          <div class="modalFooter">
            <button class="btnPrimary" onclick="this.closest('.aiModal').remove()">Tamam</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
  } catch (error) {
    console.error("AI yorum hatası:", error);
    
    // Hata durumunda basit bir modal göster
    const modal = document.createElement('div');
    modal.className = 'aiModal show';
    modal.innerHTML = `
      <div class="modalBack" onclick="this.remove()"></div>
      <div class="modalCard">
        <div class="modalTop">
          <div class="modalTitle">⚠️ AI Servisi</div>
          <button class="iconBtn" onclick="this.closest('.aiModal').remove()">✕</button>
        </div>
        <div class="modalBody">
          <div class="errorState">
            <div class="errorIcon">🤖</div>
            <h3>AI Servisi Kullanılamıyor</h3>
            <p>${error.message || 'Gemini AI servisine bağlanılamadı.'}</p>
            <p class="miniHint">API anahtarını kontrol edin veya daha sonra tekrar deneyin.</p>
          </div>
          <div class="modalFooter">
            <button class="btnPrimary" onclick="this.closest('.aiModal').remove()">Tamam</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }
}

// ==================== TABBAR DÜZENLEMESİ ====================

function addSepetToTabbar() {
  const tabbar = document.querySelector('.tabbar');
  if (!tabbar) return;
  
  // Mevcut tabları kontrol et
  const tabs = tabbar.querySelectorAll('.tab');
  
  // Sepet tab'ını ekle (Grafik ve Favoriler arasında)
  const favTab = tabbar.querySelector('.tab[data-page="favs"]');
  const settingsTab = tabbar.querySelector('.tab[data-page="settings"]');
  
  if (favTab && settingsTab) {
    // Sepet tab'ını oluştur
    const sepetTab = document.createElement('button');
    sepetTab.className = 'tab';
    sepetTab.setAttribute('data-page', 'sepet');
    sepetTab.innerHTML = `
      <span class="ico">🛒</span>
      <span class="lbl">Sepet</span>
      <span class="sepetBadge" style="display:none"></span>
    `;
    sepetTab.onclick = () => showPage('sepet');
    
    // Favoriler ve Ayarlar arasına ekle
    favTab.parentNode.insertBefore(sepetTab, settingsTab);
  }
  
  updateSepetCount();
}

function addGrafikToTabbar() {
  const tabbar = document.querySelector('.tabbar');
  if (!tabbar) return;
  
  // Sepet tab'ından sonra grafik tab'ını ekle
  const sepetTab = tabbar.querySelector('.tab[data-page="sepet"]');
  const favTab = tabbar.querySelector('.tab[data-page="favs"]');
  
  if (sepetTab && favTab) {
    // Grafik tab'ını oluştur
    const grafikTab = document.createElement('button');
    grafikTab.className = 'tab';
    grafikTab.setAttribute('data-page', 'grafik');
    grafikTab.innerHTML = `
      <span class="ico">📊</span>
      <span class="lbl">Grafik</span>
    `;
    grafikTab.onclick = () => showPage('grafik');
    
    // Sepet ve Favoriler arasına ekle
    sepetTab.parentNode.insertBefore(grafikTab, favTab);
  }
}

// ==================== UYGULAMA BAŞLANGICI ====================

window.addEventListener("DOMContentLoaded", () => {
  // UI bağlantılarını kur
  wireUI();
  
  // Başlangıç işlemleri
  renderRecentSearches();
  addCameraButton();
  addSepetToTabbar();
  addGrafikToTabbar();
  updateSepetCount();
  
  // Eksik sayfaları ekle
  const pagesContainer = document.querySelector('.pages');
  if (pagesContainer) {
    // Sepet sayfası
    if (!document.querySelector('#page-sepet')) {
      const sepetPage = document.createElement('section');
      sepetPage.id = 'page-sepet';
      sepetPage.className = 'page';
      sepetPage.innerHTML = `
        <div class="pageHead">
          <div class="pageTitle">🛒 Sepetim</div>
          <button class="btnGhost" onclick="clearSepet()">Temizle</button>
        </div>
        <div id="sepetList" class="list"></div>
      `;
      pagesContainer.appendChild(sepetPage);
    }
    
    // Grafik sayfası
    if (!document.querySelector('#page-grafik')) {
      const grafikPage = document.createElement('section');
      grafikPage.id = 'page-grafik';
      grafikPage.className = 'page';
      grafikPage.innerHTML = `
        <div class="pageHead">
          <div class="pageTitle">📊 Grafik Analiz</div>
          <button class="btnGhost" onclick="refreshGrafik()">Yenile</button>
        </div>
        <div id="grafikList" class="list"></div>
      `;
      pagesContainer.appendChild(grafikPage);
    }
  }
  
  // Auth state change
  onAuthStateChanged(auth, async (user) => {
    window.currentUser = user || null;
    setAuthedUI(!!user);
    if (user){ 
      try{ 
        await loadFavorites(user.uid); 
        renderFavoritesPage(user.uid); 
      } catch(e){ 
        console.error(e); 
      } 
    }
  });
  
  // Başlangıçta sepet ve grafik sayfalarını render et
  if (document.querySelector('#page-sepet')) {
    renderSepetPage();
  }
  if (document.querySelector('#page-grafik')) {
    renderGrafikPage();
  }
});

// ==================== GLOBAL FONKSİYONLAR ====================

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
window.addToSepet = addToSepet;
window.removeFromSepet = removeFromSepet;
window.openManualPriceModal = openManualPriceModal;
window.sortSepet = sortSepet;
window.clearSepet = clearSepet;
window.exportSepet = exportSepet;
window.renderGrafikPage = renderGrafikPage;
window.refreshGrafik = refreshGrafik;
