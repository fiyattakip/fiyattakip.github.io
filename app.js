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
