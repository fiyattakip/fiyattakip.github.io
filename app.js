// Fiyat Takip Uygulaması v4.0 - TÜM ÖZELLİKLER
const $ = id => document.getElementById(id);
const DEFAULT_API_URL = "https://fiyattakip-api.onrender.com/api";
let API_URL = localStorage.getItem('fiyattakip_api_url') || DEFAULT_API_URL;

// ==================== DEĞİŞKENLER ====================
let currentPage = 1;
let currentSort = 'asc';
let currentSearch = '';
let totalPages = 1;
let sepetItems = JSON.parse(localStorage.getItem('fiyattakip_sepet') || '[]');
let otomatikTamamlamaTimer = null;

// ==================== TOAST MESAJ ====================
function toast(msg, type = 'info') {
  const t = $("toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2200);
}

// ==================== SAYFA GEÇİŞİ ====================
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
  if (key === 'sepet') renderSepetPage();
  if (key === 'grafik') renderGrafikPage();
  if (key === 'favs') renderFavoritesPage();
  if (key === 'fiyat-dususleri') renderFiyatDususleri();
}

// ==================== ARAMA MODU ====================
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

function getSearchMode() { 
  return localStorage.getItem("searchMode") || "fiyat"; 
}

// ==================== OTOMATİK TAMAMLAMA ====================
function initOtomatikTamamlama() {
  const input = $("qNormal");
  const suggestions = $("suggestions");
  
  if (!input || !suggestions) return;
  
  input.addEventListener('input', function() {
    const query = this.value.trim();
    
    clearTimeout(otomatikTamamlamaTimer);
    
    if (query.length < 2) {
      suggestions.innerHTML = '';
      suggestions.classList.remove('show');
      return;
    }
    
    otomatikTamamlamaTimer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_URL}/otomatik-tamamlama?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.sonuclar && data.sonuclar.length > 0) {
          let html = '';
          data.sonuclar.forEach(s => {
            html += `
              <div class="suggestion-item" onclick="selectSuggestion('${s.text.replace(/'/g, "\\'")}')">
                <div class="suggestion-text">
                  <span class="suggestion-icon">${s.tip === 'model' ? '📱' : '💡'}</span>
                  <span>${s.text}</span>
                </div>
                <span class="suggestion-category">${s.kategori}</span>
              </div>
            `;
          });
          
          suggestions.innerHTML = html;
          suggestions.classList.add('show');
        } else {
          suggestions.classList.remove('show');
        }
      } catch (error) {
        console.error('Otomatik tamamlama hatası:', error);
        suggestions.classList.remove('show');
      }
    }, 300);
  });
  
  // Input dışına tıklayınca gizle
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !suggestions.contains(e.target)) {
      suggestions.classList.remove('show');
    }
  });
}

function selectSuggestion(text) {
  $("qNormal").value = text;
  $("suggestions").classList.remove('show');
  $("qNormal").focus();
}

// ==================== FIYAT ARAMA ====================
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
  
  // Otomatik tamamlamayı gizle
  $("suggestions").classList.remove('show');
  
  // Son aramaya kaydet
  saveRecentSearch(query);
  
  try {
    toast("Fiyatlar çekiliyor...", "info");
    
    const mode = getSearchMode();
    const useAI = mode === 'ai';
    
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
      
      toast(`${data.fiyatlar?.length || 0} ürün bulundu`, "success");
      
      // AI moduysa AI yorum da al
      if (useAI && data.fiyatlar && data.fiyatlar.length > 0) {
        setTimeout(() => getAIYorum(query, data.fiyatlar), 500);
      }
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

// ==================== AI YORUM ====================
async function getAIYorum(urun, fiyatlar) {
  try {
    const response = await fetch(`${API_URL}/ai-yorum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urun, fiyatlar })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showAIYorumModal(data.aiYorum, urun);
    }
  } catch (error) {
    console.error("AI yorum hatası:", error);
  }
}

function showAIYorumModal(yorum, urun) {
  const modal = document.createElement('div');
  modal.className = 'modalWrap show';
  modal.innerHTML = `
    <div class="modalBack" onclick="this.closest('.modalWrap').remove()"></div>
    <div class="modalCard" style="max-width: 500px">
      <div class="modalTop">
        <div class="modalTitle">🤖 AI Analizi</div>
        <button class="iconBtn" onclick="this.closest('.modalWrap').remove()">✕</button>
      </div>
      <div class="modalBody">
        <div class="aiYorumCard">
          <div class="aiYorumHeader">
            <span class="aiYorumIcon">🤖</span>
            <h4>${urun}</h4>
          </div>
          <div class="aiYorumText">
            ${yorum}
          </div>
          <div class="aiYorumFooter">
            <small>Gerçek zamanlı AI analizi</small>
          </div>
        </div>
        <div class="modalFooter">
          <button class="btnPrimary" onclick="this.closest('.modalWrap').remove()">Tamam</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// ==================== FİYAT SONUÇLARI ====================
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
    <div class="searchHeader">
      <div class="searchInfo">
        <span class="searchQuery">"${data.query}"</span>
        <span class="searchCount">${data.fiyatlar.length} ürün</span>
        ${data.kategori ? `<span class="kategoriTag">${data.kategori}</span>` : ''}
      </div>
      <div class="searchActions">
        <button class="btnGhost sm" onclick="showPage('home')">
          <span>🏠</span> Yeni Arama
        </button>
      </div>
    </div>
    
    <div class="sortControls">
      <button class="sortBtn ${currentSort === 'asc' ? 'active' : ''}" onclick="changeSort('asc')">
        ⬆️ En Düşük Fiyat
      </button>
      <button class="sortBtn ${currentSort === 'desc' ? 'active' : ''}" onclick="changeSort('desc')">
        ⬇️ En Yüksek Fiyat
      </button>
      <div class="pageInfoMini">Sayfa ${currentPage}/${totalPages}</div>
    </div>
  `;
  
  // En ucuz ürün (Özel banner)
  if (data.fiyatlar.length > 0) {
    const cheapest = data.fiyatlar[0];
    html += `
      <div class="cheapestBanner">
        <div class="bannerHeader">
          <div class="bannerBadges">
            <span class="badge">🥇 EN UCUZ</span>
            <span class="siteTag">${cheapest.site}</span>
            ${data.enUcuzFiyat ? `<span class="priceBadge">${data.enUcuzFiyat.toLocaleString('tr-TR')} TL</span>` : ''}
          </div>
        </div>
        <div class="productInfo">
          <div class="productTitle">${cheapest.urun}</div>
          <div class="productPrice">${cheapest.fiyat}</div>
          <div class="productActions">
            <button class="btnPrimary sm" onclick="window.open('${cheapest.link}', '_blank')">
              <span>🔗</span> Ürüne Git
            </button>
            <button class="btnGhost sm" onclick="copyToClipboard('${cheapest.link}')">
              <span>⧉</span> Kopyala
            </button>
            <button class="btnSepeteEkle sm" data-urun='${JSON.stringify(cheapest).replace(/'/g, "&apos;")}'>
              <span>🛒</span> Sepete Ekle
            </button>
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
          <div class="productMeta">
            <span class="productSite">${product.site}</span>
            ${product.kategori ? `<span class="productKategori">${product.kategori}</span>` : ''}
          </div>
          <div class="productName">${product.urun}</div>
          <div class="productPriceRow">
            <span class="productPrice">${product.fiyat}</span>
            <div class="productActions">
              <button class="btnGhost xs" onclick="window.open('${product.link}', '_blank')" title="Ürünü Aç">
                <span>🔗</span>
              </button>
              <button class="btnGhost xs" onclick="copyToClipboard('${product.link}')" title="Kopyala">
                <span>⧉</span>
              </button>
              <button class="btnSepeteEkle xs" data-urun='${JSON.stringify(product).replace(/'/g, "&apos;")}' title="Sepete Ekle">
                <span>🛒</span>
              </button>
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

// ==================== SEPET İŞLEMLERİ ====================
function addToSepet(urunBilgisi) {
  const sepetItem = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    urun: urunBilgisi.urun || 'Ürün',
    site: urunBilgisi.site || 'Manuel',
    fiyat: urunBilgisi.fiyat || '0 TL',
    numericPrice: urunBilgisi.numericPrice || parseInt(urunBilgisi.fiyat?.replace(/\D/g, '')) || 0,
    link: urunBilgisi.link || '#',
    kategori: urunBilgisi.kategori || 'genel',
    tip: 'otomatik',
    tarih: new Date().toISOString()
  };
  
  sepetItems.push(sepetItem);
  localStorage.setItem('fiyattakip_sepet', JSON.stringify(sepetItems));
  updateSepetCount();
  
  // API'ye kaydet
  try {
    fetch(`${API_URL}/sepet-ekle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sepetItem)
    });
  } catch (e) {}
  
  // AI yorum al
  setTimeout(() => getAIYorumSepet(sepetItem), 300);
  
  toast(`"${sepetItem.urun.substring(0, 30)}" sepete eklendi 🛒`, 'success');
}

async function getAIYorumSepet(sepetUrunu) {
  try {
    const response = await fetch(`${API_URL}/ai-yorum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sepetUrunu })
    });
    
    const data = await response.json();
    
    if (data.success) {
      toast(`AI yorum: ${data.aiYorum.substring(0, 60)}...`, 'info');
    }
  } catch (error) {
    console.error('Sepet AI hatası:', error);
  }
}

function renderSepetPage() {
  const container = $("#sepetList");
  if (!container) return;
  
  if (sepetItems.length === 0) {
    container.innerHTML = `
      <div class="emptyState">
        <div class="emptyIcon">🛒</div>
        <h3>Sepet Boş</h3>
        <p>Ürün arayıp sepete ekleyin</p>
        <button class="btnPrimary" onclick="showPage('home')">🏠 Alışverişe Başla</button>
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
      <h3>🛒 Sepetim (${sepetItems.length} ürün)</h3>
      <div class="sepetHeaderActions">
        <button class="btnGhost sm" onclick="sortSepet('date')">📅 Tarih</button>
        <button class="btnGhost sm" onclick="sortSepet('price-asc')">⬆️ Ucuz</button>
        <button class="btnGhost sm" onclick="sortSepet('price-desc')">⬇️ Pahalı</button>
        <button class="btnGhost sm error" onclick="clearSepet()" title="Sepeti Temizle">🗑️</button>
      </div>
    </div>
    
    <div class="sepetStats">
      <div class="stat">
        <div class="statLabel">Toplam Değer</div>
        <div class="statValue">${toplamFiyat.toLocaleString('tr-TR')} TL</div>
      </div>
      <div class="stat">
        <div class="statLabel">Ortalama Fiyat</div>
        <div class="statValue">${ortalamaFiyat.toLocaleString('tr-TR')} TL</div>
      </div>
      <div class="stat">
        <div class="statLabel">Ürün Sayısı</div>
        <div class="statValue">${sepetItems.length}</div>
      </div>
    </div>
    
    <div class="priceRangeInfo">
      <div class="rangeItem">
        <span class="rangeLabel">En Ucuz:</span>
        <span class="rangeValue success">${enUcuz.toLocaleString('tr-TR')} TL</span>
      </div>
      <div class="rangeItem">
        <span class="rangeLabel">En Pahalı:</span>
        <span class="rangeValue error">${enPahali.toLocaleString('tr-TR')} TL</span>
      </div>
      <div class="rangeItem">
        <span class="rangeLabel">Fiyat Aralığı:</span>
        <span class="rangeValue">${(enPahali - enUcuz).toLocaleString('tr-TR')} TL</span>
      </div>
    </div>
    
    <div class="sepetItems">
  `;
  
  // Ürün listesi (tarihe göre sıralı)
  const sortedItems = [...sepetItems].sort((a, b) => 
    new Date(b.tarih) - new Date(a.tarih)
  );
  
  sortedItems.forEach((item, index) => {
    html += `
      <div class="sepetItem cardBox">
        <div class="sepetItemHeader">
          <div class="sepetItemInfo">
            <div class="sepetMeta">
              <span class="sepetSite">${item.site}</span>
              <span class="sepetKategori">${item.kategori}</span>
              <span class="sepetTip">${item.tip === 'manuel' ? '📝 Manuel' : '🛒 Otomatik'}</span>
            </div>
            <div class="sepetProduct">${item.urun}</div>
            <div class="sepetPrice">${item.fiyat}</div>
          </div>
          <div class="sepetItemActions">
            ${item.link !== '#' ? `
              <button class="btnGhost xs" onclick="window.open('${item.link}', '_blank')" title="Ürünü Aç">
                🔗
              </button>
            ` : ''}
            <button class="btnGhost xs" onclick="getAIYorumSepet(${JSON.stringify(item).replace(/'/g, "&apos;")})" title="AI Analiz">
              🤖
            </button>
            <button class="btnGhost xs error" onclick="removeFromSepet('${item.id}')" title="Kaldır">
              🗑️
            </button>
          </div>
        </div>
        <div class="sepetFooter">
          <small>${new Date(item.tarih).toLocaleDateString('tr-TR')} ${new Date(item.tarih).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</small>
          <small>#${index + 1}</small>
        </div>
      </div>
    `;
  });
  
  html += `
    </div>
    
    <div class="sepetActions">
      <button class="btnPrimary" onclick="showPage('grafik')">
        📊 Grafiği Gör
      </button>
      <button class="btnGhost" onclick="exportSepet()">
        📥 Dışa Aktar
      </button>
    </div>
  `;
  
  container.innerHTML = html;
}

function removeFromSepet(id) {
  sepetItems = sepetItems.filter(item => item.id !== id);
  localStorage.setItem('fiyattakip_sepet', JSON.stringify(sepetItems));
  updateSepetCount();
  renderSepetPage();
  toast('Sepetten kaldırıldı', 'info');
}

function sortSepet(type) {
  switch(type) {
    case 'date':
      sepetItems.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
      toast('Tarihe göre sıralandı', 'info');
      break;
    case 'price-asc':
      sepetItems.sort((a, b) => (a.numericPrice || 0) - (b.numericPrice || 0));
      toast('En ucuza göre sıralandı', 'info');
      break;
    case 'price-desc':
      sepetItems.sort((a, b) => (b.numericPrice || 0) - (a.numericPrice || 0));
      toast('En pahalıya göre sıralandı', 'info');
      break;
  }
  
  localStorage.setItem('fiyattakip_sepet', JSON.stringify(sepetItems));
  renderSepetPage();
}

function clearSepet() {
  if (sepetItems.length === 0) return;
  
  if (confirm(`${sepetItems.length} ürünü sepetten çıkarmak istiyor musunuz?`)) {
    sepetItems = [];
    localStorage.setItem('fiyattakip_sepet', JSON.stringify(sepetItems));
    updateSepetCount();
    renderSepetPage();
    toast('Sepet temizlendi', 'info');
  }
}

function updateSepetCount() {
  const count = sepetItems.length;
  const badge = document.querySelector('.sepetBadge');
  if (badge) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

// ==================== GRAFİK SAYFASI ====================
async function renderGrafikPage() {
  const container = $("#grafikList");
  if (!container) return;
  
  container.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Grafik verileri yükleniyor...</p>
    </div>
  `;
  
  try {
    const response = await fetch(`${API_URL}/grafik`);
    const data = await response.json();
    
    if (!data.success || !data.grafik) {
      throw new Error('Grafik verisi alınamadı');
    }
    
    const grafik = data.grafik;
    
    let html = `
      <div class="grafikHeader">
        <h3>📊 Sepet Analizi</h3>
        <div class="grafikStats">
          <div class="stat">
            <div class="statLabel">Toplam Ürün</div>
            <div class="statValue">${grafik.istatistikler.toplamUrun}</div>
          </div>
          <div class="stat">
            <div class="statLabel">Toplam Değer</div>
            <div class="statValue">${grafik.istatistikler.toplamFiyat.toLocaleString('tr-TR')} TL</div>
          </div>
          <div class="stat">
            <div class="statLabel">Ortalama</div>
            <div class="statValue">${grafik.istatistikler.ortalamaFiyat.toLocaleString('tr-TR')} TL</div>
          </div>
        </div>
      </div>
    `;
    
    // Kategori dağılımı
    if (grafik.kategoriler.length > 0) {
      html += `
        <div class="grafikSection">
          <h4>🏷️ Kategori Dağılımı</h4>
          <div class="kategoriList">
      `;
      
      grafik.kategoriler.forEach(kat => {
        const yuzde = Math.round((kat.adet / grafik.istatistikler.toplamUrun) * 100);
        html += `
          <div class="kategoriItem">
            <div class="kategoriHeader">
              <span class="kategoriAd">${kat.kategori}</span>
              <span class="kategoriYuzde">%${yuzde}</span>
            </div>
            <div class="kategoriBar">
              <div class="kategoriBarFill" style="width: ${yuzde}%; background: ${kat.renk || '#7c5cff'}"></div>
            </div>
            <div class="kategoriDetay">
              <small>${kat.adet} ürün • ${kat.toplam.toLocaleString('tr-TR')} TL • Ort: ${kat.ortalama.toLocaleString('tr-TR')} TL</small>
            </div>
          </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
    }
    
    // Fiyat geçmişi
    if (grafik.fiyatGecmisi.length > 0) {
      html += `
        <div class="grafikSection">
          <h4>📅 Son 7 Gün</h4>
          <div class="fiyatGecmisi">
      `;
      
      grafik.fiyatGecmisi.forEach(gun => {
        if (gun.urunSayisi > 0) {
          html += `
            <div class="gunItem">
              <div class="gunHeader">
                <span class="gunAd">${gun.gun}</span>
                <span class="gunTarih">${gun.tarih.split('-')[2]}/${gun.tarih.split('-')[1]}</span>
              </div>
              <div class="gunDetay">
                <div class="gunStat">
                  <span class="gunStatLabel">Ürün:</span>
                  <span class="gunStatValue">${gun.urunSayisi}</span>
                </div>
                <div class="gunStat">
                  <span class="gunStatLabel">Toplam:</span>
                  <span class="gunStatValue">${gun.toplamFiyat.toLocaleString('tr-TR')} TL</span>
                </div>
                <div class="gunStat">
                  <span class="gunStatLabel">Ortalama:</span>
                  <span class="gunStatValue">${gun.ortalamaFiyat.toLocaleString('tr-TR')} TL</span>
                </div>
              </div>
            </div>
          `;
        }
      });
      
      html += `
          </div>
        </div>
      `;
    }
    
    // Sepet trendi
    if (grafik.sepetTrend.length > 0) {
      html += `
        <div class="grafikSection">
          <h4>📈 Sepet Trendi</h4>
          <div class="trendInfo">
            <p>Son ${grafik.sepetTrend.length} günde sepete eklenen ürünlerin fiyat trendi</p>
          </div>
          <div class="trendList">
      `;
      
      const maxFiyat = Math.max(...grafik.sepetTrend.map(t => t.toplam));
      
      grafik.sepetTrend.forEach(trend => {
        const yuzde = maxFiyat > 0 ? Math.round((trend.toplam / maxFiyat) * 100) : 0;
        html += `
          <div class="trendItem">
            <div class="trendHeader">
              <span class="trendTarih">${trend.tarih.split('-')[2]}/${trend.tarih.split('-')[1]}</span>
              <span class="trendToplam">${trend.toplam.toLocaleString('tr-TR')} TL</span>
            </div>
            <div class="trendBar">
              <div class="trendBarFill" style="width: ${yuzde}%; background: ${yuzde > 70 ? '#36d399' : yuzde > 30 ? '#7c5cff' : '#ff6b6b'}"></div>
            </div>
            <div class="trendDetay">
              <small>${trend.adet} ürün • Ort: ${trend.ortalama.toLocaleString('tr-TR')} TL</small>
            </div>
          </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
    }
    
    // Grafik butonları
    html += `
      <div class="grafikActions">
        <button class="btnPrimary" onclick="showPage('sepet')">
          🛒 Sepete Dön
        </button>
        <button class="btnGhost" onclick="showPage('fiyat-dususleri')">
          🔔 Fiyat Düşüşleri
        </button>
        <button class="btnGhost" onclick="refreshGrafik()">
          🔄 Yenile
        </button>
      </div>
    `;
    
    container.innerHTML = html;
    
  } catch (error) {
    console.error('Grafik hatası:', error);
    container.innerHTML = `
      <div class="errorState">
        <div class="errorIcon">📊</div>
        <h3>Grafik Yüklenemedi</h3>
        <p>${error.message}</p>
        <button class="btnPrimary" onclick="showPage('sepet')">Sepete Dön</button>
      </div>
    `;
  }
}

async function refreshGrafik() {
  toast('Grafik yenileniyor...', 'info');
  await renderGrafikPage();
}

// ==================== FİYAT DÜŞÜŞLERİ ====================
async function renderFiyatDususleri() {
  const container = $("#fiyatDususList");
  if (!container) return;
  
  container.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Fiyat düşüşleri kontrol ediliyor...</p>
    </div>
  `;
  
  try {
    const response = await fetch(`${API_URL}/fiyat-dususleri`);
    const data = await response.json();
    
    if (!data.success || !data.dususler || data.dususler.length === 0) {
      container.innerHTML = `
        <div class="emptyState">
          <div class="emptyIcon">📉</div>
          <h3>Fiyat Düşüşü Yok</h3>
          <p>Şu anda takip edilen ürünlerde fiyat düşüşü yok</p>
          <button class="btnPrimary" onclick="showPage('home')">🏠 Ürün Ara</button>
        </div>
      `;
      return;
    }
    
    let html = `
      <div class="dususHeader">
        <h3>📉 Fiyat Düşüşleri (${data.dususler.length})</h3>
        <p class="dususSub">Takip edilen ürünlerdeki en son fiyat düşüşleri</p>
      </div>
      
      <div class="dususList">
    `;
    
    data.dususler.forEach((dusus, index) => {
      const tarih = new Date(dusus.tarih);
      const tarihStr = `${tarih.getDate().toString().padStart(2, '0')}.${(tarih.getMonth() + 1).toString().padStart(2, '0')} ${tarih.getHours().toString().padStart(2, '0')}:${tarih.getMinutes().toString().padStart(2, '0')}`;
      
      html += `
        <div class="dususItem cardBox ${index < 3 ? 'highlight' : ''}">
          <div class="dususHeaderRow">
            <span class="dususUrun">${dusus.urun}</span>
            <span class="dususYuzde error">-%${dusus.dususYuzdesi}</span>
          </div>
          
          <div class="dususFiyatlar">
            <div class="fiyatEski">
              <span class="fiyatLabel">Eski:</span>
              <span class="fiyatValue">${dusus.oncekiFiyat.toLocaleString
                                         ('tr-TR')} TL</span>
            </div>
            <div class="fiyatYeni">
              <span class="fiyatLabel">Yeni:</span>
              <span class="fiyatValue success">${dusus.yeniFiyat.toLocaleString('tr-TR')} TL</span>
            </div>
          </div>
          
          <div class="dususDetay">
            <span class="dususSite">${dusus.site}</span>
            <span class="dususTarih">${tarihStr}</span>
          </div>
          
          <div class="dususActions">
            <button class="btnGhost xs" onclick="fiyatAra('${dusus.urun.replace(/'/g, "\\'")}')">
              🔍 Tekrar Ara
            </button>
            <button class="btnPrimary xs" onclick="addToSepet(${JSON.stringify({
              urun: dusus.urun,
              site: dusus.site,
              fiyat: dusus.yeniFiyat + ' TL',
              numericPrice: dusus.yeniFiyat,
              kategori: 'fiyat-dususu',
              link: '#'
            })})">
              🛒 Sepete Ekle
            </button>
          </div>
        </div>
      `;
    });
    
    html += `
      </div>
      
      <div class="dususInfo">
        <small>⚠️ Fiyat düşüşleri sadece daha önce aranan ürünler için takip edilir</small>
      </div>
    `;
    
    container.innerHTML = html;
    
  } catch (error) {
    console.error('Fiyat düşüş hatası:', error);
    container.innerHTML = `
      <div class="errorState">
        <div class="errorIcon">📉</div>
        <h3>Fiyat Düşüşleri Alınamadı</h3>
        <p>${error.message}</p>
        <button class="btnPrimary" onclick="showPage('home')">Ana Sayfa</button>
      </div>
    `;
  }
}

// ==================== FAVORİLER ====================
function renderFavoritesPage() {
  const container = $("#favList");
  if (!container) return;
  
  const favorites = JSON.parse(localStorage.getItem('fiyattakip_favs') || '[]');
  
  if (favorites.length === 0) {
    container.innerHTML = `
      <div class="emptyState">
        <div class="emptyIcon">⭐</div>
        <h3>Favori Yok</h3>
        <p>Sık aradığınız ürünleri favorilere ekleyin</p>
        <button class="btnPrimary" onclick="showPage('home')">🏠 Ürün Ara</button>
      </div>
    `;
    return;
  }
  
  let html = `
    <div class="favHeader">
      <h3>⭐ Favoriler (${favorites.length})</h3>
      <button class="btnGhost sm" onclick="clearFavorites()">🗑️ Temizle</button>
    </div>
    
    <div class="favList">
  `;
  
  favorites.forEach((fav, index) => {
    const tarih = new Date(fav.tarih);
    const tarihStr = `${tarih.getDate().toString().padStart(2, '0')}.${(tarih.getMonth() + 1).toString().padStart(2, '0')}`;
    
    html += `
      <div class="favItem cardBox">
        <div class="favContent">
          <div class="favQuery">${fav.query}</div>
          <div class="favMeta">
            <span class="favTarih">${tarihStr}</span>
            <span class="favCount">${fav.count || 1} kez</span>
            ${fav.kategori ? `<span class="favKategori">${fav.kategori}</span>` : ''}
          </div>
        </div>
        <div class="favActions">
          <button class="btnGhost xs" onclick="fiyatAra('${fav.query.replace(/'/g, "\\'")}')">
            🔍 Ara
          </button>
          <button class="btnGhost xs" onclick="removeFromFavorites(${index})">
            🗑️
          </button>
        </div>
      </div>
    `;
  });
  
  html += `
    </div>
    
    <div class="favInfo">
      <small>Favoriler sadece bu cihazda saklanır</small>
    </div>
  `;
  
  container.innerHTML = html;
}

function addToFavorites(query, kategori) {
  let favorites = JSON.parse(localStorage.getItem('fiyattakip_favs') || '[]');
  
  // Var mı kontrol et
  const existingIndex = favorites.findIndex(f => f.query.toLowerCase() === query.toLowerCase());
  
  if (existingIndex !== -1) {
    // Güncelle
    favorites[existingIndex].count = (favorites[existingIndex].count || 1) + 1;
    favorites[existingIndex].tarih = new Date().toISOString();
    toast('Favori güncellendi', 'info');
  } else {
    // Yeni ekle
    favorites.unshift({
      query: query,
      kategori: kategori || 'genel',
      count: 1,
      tarih: new Date().toISOString()
    });
    
    // En fazla 20 favori
    if (favorites.length > 20) {
      favorites = favorites.slice(0, 20);
    }
    
    toast('Favorilere eklendi ⭐', 'success');
  }
  
  localStorage.setItem('fiyattakip_favs', JSON.stringify(favorites));
}

function removeFromFavorites(index) {
  let favorites = JSON.parse(localStorage.getItem('fiyattakip_favs') || '[]');
  
  if (index >= 0 && index < favorites.length) {
    favorites.splice(index, 1);
    localStorage.setItem('fiyattakip_favs', JSON.stringify(favorites));
    renderFavoritesPage();
    toast('Favoriden kaldırıldı', 'info');
  }
}

function clearFavorites() {
  if (confirm('Tüm favorileri temizlemek istiyor musunuz?')) {
    localStorage.removeItem('fiyattakip_favs');
    renderFavoritesPage();
    toast('Favoriler temizlendi', 'info');
  }
}

// ==================== SON ARAMALAR ====================
function saveRecentSearch(query) {
  let recent = JSON.parse(localStorage.getItem('fiyattakip_recent') || '[]');
  
  // Aynı sorguyu kaldır
  recent = recent.filter(r => r.query.toLowerCase() !== query.toLowerCase());
  
  // Başa ekle
  recent.unshift({
    query: query,
    tarih: new Date().toISOString()
  });
  
  // En fazla 10
  if (recent.length > 10) {
    recent = recent.slice(0, 10);
  }
  
  localStorage.setItem('fiyattakip_recent', JSON.stringify(recent));
  renderRecentSearches();
}

function renderRecentSearches() {
  const container = $("#recentSearches");
  if (!container) return;
  
  const recent = JSON.parse(localStorage.getItem('fiyattakip_recent') || '[]');
  
  if (recent.length === 0) {
    container.innerHTML = `
      <div class="recentEmpty">
        <p>Son arama yok</p>
        <small>Ürün aramaya başlayın</small>
      </div>
    `;
    return;
  }
  
  let html = `
    <div class="recentHeader">
      <h4>🔍 Son Aramalar</h4>
      <button class="btnGhost xs" onclick="clearRecentSearches()">Temizle</button>
    </div>
    
    <div class="recentList">
  `;
  
  recent.forEach((item, index) => {
    const tarih = new Date(item.tarih);
    const saat = `${tarih.getHours().toString().padStart(2, '0')}:${tarih.getMinutes().toString().padStart(2, '0')}`;
    
    html += `
      <div class="recentItem" onclick="fiyatAra('${item.query.replace(/'/g, "\\'")}')">
        <span class="recentQuery">${item.query}</span>
        <span class="recentTime">${saat}</span>
      </div>
    `;
  });
  
  html += `</div>`;
  container.innerHTML = html;
}

function clearRecentSearches() {
  if (confirm('Son aramaları temizlemek istiyor musunuz?')) {
    localStorage.removeItem('fiyattakip_recent');
    renderRecentSearches();
    toast('Son aramalar temizlendi', 'info');
  }
}

// ==================== KAMERA ====================
async function initCamera() {
  try {
    const video = $("#cameraVideo");
    const preview = $("#cameraPreview");
    
    if (!video) {
      toast('Video elementi bulunamadı', 'error');
      return;
    }
    
    // Kamera izinleri
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    
    video.srcObject = stream;
    video.play();
    
    toast('Kamera açıldı 📷', 'success');
    
    // Kamera butonlarını aktif et
    $("captureBtn")?.classList.remove("hidden");
    $("switchCameraBtn")?.classList.remove("hidden");
    $("closeCameraBtn")?.classList.remove("hidden");
    
  } catch (error) {
    console.error('Kamera hatası:', error);
    
    let errorMsg = 'Kamera açılamadı';
    if (error.name === 'NotAllowedError') {
      errorMsg = 'Kamera izni verilmedi';
    } else if (error.name === 'NotFoundError') {
      errorMsg = 'Kamera bulunamadı';
    } else if (error.name === 'NotSupportedError') {
      errorMsg = 'Tarayıcı kamera desteklemiyor';
    }
    
    toast(errorMsg, 'error');
    
    // Kamera sayfasını boş göster
    const cameraPage = $("#page-camera");
    if (cameraPage) {
      cameraPage.innerHTML = `
        <div class="emptyState">
          <div class="emptyIcon">📷</div>
          <h3>Kamera Kullanılamıyor</h3>
          <p>${errorMsg}</p>
          <div class="cameraAltActions">
            <button class="btnPrimary" onclick="showPage('home')">
              🏠 Ana Sayfa
            </button>
            <button class="btnGhost" onclick="showManualUpload()">
              📤 Manuel Yükle
            </button>
          </div>
        </div>
      `;
    }
  }
}

function captureImage() {
  const video = $("#cameraVideo");
  const preview = $("#cameraPreview");
  const canvas = $("#cameraCanvas");
  
  if (!video || !canvas) return;
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Data URL al
  const imageData = canvas.toDataURL('image/jpeg', 0.8);
  
  // Preview göster
  if (preview) {
    preview.src = imageData;
    preview.classList.remove("hidden");
  }
  
  // Video'yu durdur
  video.pause();
  video.srcObject?.getTracks().forEach(track => track.stop());
  
  toast('Fotoğraf çekildi 📸', 'success');
  
  // Analiz et butonunu göster
  $("analyzeImageBtn")?.classList.remove("hidden");
}

function switchCamera() {
  // Kamera değiştirme işlemi
  toast('Kamera değiştiriliyor...', 'info');
  
  // Mevcut stream'i durdur
  const video = $("#cameraVideo");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }
  
  // Yeni kamera aç
  setTimeout(() => initCamera(), 300);
}

function closeCamera() {
  const video = $("#cameraVideo");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }
  
  showPage('home');
}

function showManualUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = event.target.result;
        analyzeImage(imageData);
      };
      reader.readAsDataURL(file);
    }
  };
  
  input.click();
}

async function analyzeImage(imageData) {
  toast('Resim analiz ediliyor...', 'info');
  
  // Burada gerçek bir API çağrısı yapılmalı
  // Şimdilik demo
  setTimeout(() => {
    const fakeProducts = ['iPhone 15 Pro', 'Samsung Galaxy S24', 'AirPods Pro', 'MacBook Air'];
    const randomProduct = fakeProducts[Math.floor(Math.random() * fakeProducts.length)];
    
    toast(`Resimde "${randomProduct}" tespit edildi`, 'success');
    fiyatAra(randomProduct);
  }, 1500);
}

// ==================== YARDIMCI FONKSİYONLAR ====================
function changeSort(sort) {
  currentSort = sort;
  fiyatAra(currentSearch, currentPage, sort);
}

function changePage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  fiyatAra(currentSearch, page, currentSort);
}

function updatePaginationControls() {
  const container = $("paginationControls");
  if (!container) return;
  
  let html = `
    <button class="pageBtn ${currentPage === 1 ? 'disabled' : ''}" onclick="changePage(${currentPage - 1})">
      ◀
    </button>
  `;
  
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  
  for (let i = start; i <= end; i++) {
    html += `
      <button class="pageBtn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">
        ${i}
      </button>
    `;
  }
  
  html += `
    <button class="pageBtn ${currentPage === totalPages ? 'disabled' : ''}" onclick="changePage(${currentPage + 1})">
      ▶
    </button>
  `;
  
  container.innerHTML = html;
}

function updateSortControls() {
  // Bu fonksiyon sort butonlarını günceller
  const sortAsc = $("sortAsc");
  const sortDesc = $("sortDesc");
  
  if (sortAsc) sortAsc.classList.toggle('active', currentSort === 'asc');
  if (sortDesc) sortDesc.classList.toggle('active', currentSort === 'desc');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('Kopyalandı ✅', 'success');
  }).catch(err => {
    console.error('Kopyalama hatası:', err);
  });
}

function exportSepet() {
  if (sepetItems.length === 0) {
    toast('Sepet boş', 'error');
    return;
  }
  
  const dataStr = JSON.stringify({
    tarih: new Date().toISOString(),
    toplamUrun: sepetItems.length,
    toplamFiyat: sepetItems.reduce((sum, item) => sum + (item.numericPrice || 0), 0),
    urunler: sepetItems
  }, null, 2);
  
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = `fiyattakip-sepet-${new Date().toISOString().split('T')[0]}.json`;
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
  
  toast('Sepet dışa aktarıldı 📥', 'success');
}

// ==================== AYARLAR ====================
function renderSettingsPage() {
  const container = $("#settingsPage");
  if (!container) return;
  
  const apiUrl = localStorage.getItem('fiyattakip_api_url') || DEFAULT_API_URL;
  const searchMode = getSearchMode();
  
  container.innerHTML = `
    <div class="settingsHeader">
      <h3>⚙️ Ayarlar</h3>
    </div>
    
    <div class="settingsSection">
      <h4>🔗 API Ayarları</h4>
      
      <div class="settingItem">
        <label>API URL</label>
        <div class="inputGroup">
          <input type="text" id="apiUrlInput" value="${apiUrl}" placeholder="API URL">
          <button class="btnGhost sm" onclick="resetApiUrl()">Sıfırla</button>
        </div>
        <small class="settingHint">API sunucusu adresi</small>
      </div>
      
      <div class="settingItem">
        <label>API Test</label>
        <button class="btnPrimary" onclick="testApiConnection()">
          🔗 Bağlantıyı Test Et
        </button>
        <small class="settingHint">API bağlantısını kontrol eder</small>
      </div>
    </div>
    
    <div class="settingsSection">
      <h4>🔍 Arama Modu</h4>
      
      <div class="modeOptions">
        <div class="modeOption ${searchMode === 'normal' ? 'active' : ''}" onclick="setSearchMode('normal')">
          <div class="modeIcon">🔗</div>
          <div class="modeInfo">
            <div class="modeTitle">Normal</div>
            <div class="modeDesc">Sadece link oluşturur</div>
          </div>
        </div>
        
        <div class="modeOption ${searchMode === 'fiyat' ? 'active' : ''}" onclick="setSearchMode('fiyat')">
          <div class="modeIcon">💰</div>
          <div class="modeInfo">
            <div class="modeTitle">Fiyat Karşılaştırma</div>
            <div class="modeDesc">Gerçek fiyatları çeker</div>
          </div>
        </div>
        
        <div class="modeOption ${searchMode === 'ai' ? 'active' : ''}" onclick="setSearchMode('ai')">
          <div class="modeIcon">🤖</div>
          <div class="modeInfo">
            <div class="modeTitle">AI Modu</div>
            <div class="modeDesc">AI ile optimize eder</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="settingsSection">
      <h4>📱 Uygulama</h4>
      
      <div class="settingItem">
        <label>Verileri Temizle</label>
        <div class="settingActions">
          <button class="btnGhost error" onclick="clearAllData()">
            🗑️ Tüm Verileri Temizle
          </button>
        </div>
        <small class="settingHint">Sepet, favoriler, ayarlar sıfırlanır</small>
      </div>
      
      <div class="settingItem">
        <label>Versiyon</label>
        <div class="versionInfo">
          <span class="version">FiyatTakip v4.0</span>
          <small>Son güncelleme: 2024</small>
        </div>
      </div>
    </div>
    
    <div class="settingsFooter">
      <button class="btnPrimary" onclick="saveSettings()">
        💾 Ayarları Kaydet
      </button>
    </div>
  `;
}

function saveSettings() {
  const apiUrlInput = $("#apiUrlInput");
  if (apiUrlInput) {
    const newUrl = apiUrlInput.value.trim();
    if (newUrl && newUrl !== API_URL) {
      localStorage.setItem('fiyattakip_api_url', newUrl);
      API_URL = newUrl;
      toast('API URL güncellendi', 'success');
    }
  }
  
  // 2 saniye sonra ana sayfaya dön
  setTimeout(() => showPage('home'), 2000);
}

function resetApiUrl() {
  localStorage.removeItem('fiyattakip_api_url');
  API_URL = DEFAULT_API_URL;
  
  const apiUrlInput = $("#apiUrlInput");
  if (apiUrlInput) {
    apiUrlInput.value = DEFAULT_API_URL;
  }
  
  toast('API URL sıfırlandı', 'info');
}

async function testApiConnection() {
  try {
    toast('API test ediliyor...', 'info');
    
    const response = await fetch(`${API_URL}/health`);
    
    if (response.ok) {
      const data = await response.json();
      toast(`✅ API çalışıyor: ${data.status}`, 'success');
    } else {
      throw new Error(`API hata: ${response.status}`);
    }
  } catch (error) {
    toast(`❌ API bağlantı hatası: ${error.message}`, 'error');
  }
}

function clearAllData() {
  if (confirm('TÜM veriler silinecek:\n• Sepet\n• Favoriler\n• Son Aramalar\n• Ayarlar\n\nDevam etmek istiyor musunuz?')) {
    localStorage.clear();
    sepetItems = [];
    updateSepetCount();
    showPage('home');
    toast('Tüm veriler temizlendi', 'info');
  }
}

// ==================== UYGULAMA BAŞLANGICI ====================
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 FiyatTakip v4.0 başlatılıyor...');
  
  // Sayfa yönlendirmeleri
  showPage('home');
  
  // Arama modu
  setSearchMode(getSearchMode());
  
  // Otomatik tamamlama
  initOtomatikTamamlama();
  
  // Sepet sayacı
  updateSepetCount();
  
  // Kamera sayfası için
  const cameraPage = $("#page-camera");
  if (cameraPage) {
    cameraPage.innerHTML = `
      <div class="cameraContainer">
        <div class="cameraHeader">
          <button class="iconBtn" onclick="closeCamera()">✕</button>
          <h4>📷 Kamera ile Tara</h4>
          <button class="iconBtn" onclick="switchCamera()">🔄</button>
        </div>
        
        <div class="cameraView">
          <video id="cameraVideo" autoplay playsinline></video>
          <canvas id="cameraCanvas" class="hidden"></canvas>
          <img id="cameraPreview" class="hidden" alt="Çekilen fotoğraf">
        </div>
        
        <div class="cameraControls">
          <button id="captureBtn" class="cameraBtn primary hidden" onclick="captureImage()">
            📸 Çek
          </button>
          <button id="switchCameraBtn" class="cameraBtn ghost hidden" onclick="switchCamera()">
            🔄 Değiştir
          </button>
          <button id="closeCameraBtn" class="cameraBtn ghost hidden" onclick="closeCamera()">
            ✕ Kapat
          </button>
          <button id="analyzeImageBtn" class="cameraBtn success hidden" onclick="analyzeImage()">
            🤖 Analiz Et
          </button>
        </div>
        
        <div class="cameraAlt">
          <button class="btnGhost" onclick="showManualUpload()">
            📤 Dosya Yükle
          </button>
        </div>
      </div>
    `;
  }
  
  // Event listeners
  const searchForm = $("#searchForm");
  if (searchForm) {
    searchForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const query = $("#qNormal")?.value.trim();
      if (query) {
        fiyatAra(query);
        addToFavorites(query);
      }
    });
  }
  
  // Hızlı arama butonları
  document.querySelectorAll('.quickSearchBtn').forEach(btn => {
    btn.addEventListener('click', function() {
      const query = this.getAttribute('data-query');
      if (query) {
        fiyatAra(query);
      }
    });
  });
  
  // Tab click events
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
      const page = this.getAttribute('data-page');
      if (page) {
        showPage(page);
        
        // Kamera sayfası ise kamerayı başlat
        if (page === 'camera') {
          setTimeout(() => initCamera(), 300);
        }
      }
    });
  });
  
  // Başlangıç toast
  setTimeout(() => {
    if (geminiAI) {
      toast('🤖 AI modu aktif!', 'success');
    }
  }, 1000);
  
  console.log('✅ FiyatTakip başlatıldı');
});

// ==================== GLOBAL DEĞİŞKENLER ====================
window.fiyatAra = fiyatAra;
window.showPage = showPage;
window.setSearchMode = setSearchMode;
window.selectSuggestion = selectSuggestion;
window.changeSort = changeSort;
window.changePage = changePage;
window.copyToClipboard = copyToClipboard;
window.addToSepet = addToSepet;
window.removeFromSepet = removeFromSepet;
window.clearSepet = clearSepet;
window.sortSepet = sortSepet;
window.exportSepet = exportSepet;
window.renderGrafikPage = renderGrafikPage;
window.refreshGrafik = refreshGrafik;
window.renderFiyatDususleri = renderFiyatDususleri;
window.initCamera = initCamera;
window.captureImage = captureImage;
window.switchCamera = switchCamera;
window.closeCamera = closeCamera;
window.showManualUpload = showManualUpload;
window.analyzeImage = analyzeImage;
window.renderSettingsPage = renderSettingsPage;
window.saveSettings = saveSettings;
window.resetApiUrl = resetApiUrl;
window.testApiConnection = testApiConnection;
window.clearAllData = clearAllData;
