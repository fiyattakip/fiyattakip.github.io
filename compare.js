// compare.js - Tam Karşılaştırma Sistemi
console.log("✅ Karşılaştırma sistemi yükleniyor...");

const $ = (id) => document.getElementById(id);

// ========== KARŞILAŞTIRMA VERİSİ ==========
let compareItems = JSON.parse(localStorage.getItem('fiyattakip_compare') || '[]');

// ========== MODAL İŞLEMLERİ ==========
function openCompareModal() {
  console.log("Karşılaştırma modalı açılıyor...");
  const modal = $("compareModal");
  if (!modal) {
    console.error("compareModal bulunamadı!");
    return;
  }
  
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modalOpen");
  
  renderCompareList();
  
  console.log("Modal açıldı, ürün sayısı:", compareItems.length);
}

function closeCompareModal() {
  const modal = $("compareModal");
  if (!modal) return;
  
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modalOpen");
}

// ========== ÜRÜN EKLEME ==========
function addToCompare(product, query = "") {
  console.log("Ürün ekleniyor:", product);
  
  if (compareItems.length >= 5) {
    toast("Maksimum 5 ürün karşılaştırabilirsiniz", "warning");
    return;
  }
  
  // Aynı ürün kontrolü
  const existing = compareItems.find(item => item.link === product.link);
  if (existing) {
    toast("Bu ürün zaten karşılaştırma listesinde", "info");
    return;
  }
  
  const compareItem = {
    id: 'compare_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    title: product.urun || product.title || "",
    price: product.fiyat || "",
    site: product.site || "",
    link: product.link || "",
    query: query,
    addedAt: Date.now()
  };
  
  compareItems.push(compareItem);
  localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
  
  // UI güncelle
  updateCompareButtons();
  
  // Modal'ı aç
  openCompareModal();
  
  toast(`"${compareItem.title.substring(0, 30)}..." karşılaştırmaya eklendi`, "success");
}

// ========== ÜRÜN SİLME ==========
function removeFromCompare(itemId) {
  compareItems = compareItems.filter(item => item.id !== itemId);
  localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
  renderCompareList();
  updateCompareButtons();
  toast("Ürün karşılaştırmadan çıkarıldı", "info");
}

// ========== LİSTEMİ TEMİZLE ==========
function clearCompareList() {
  if (compareItems.length === 0) return;
  
  if (confirm(`${compareItems.length} ürünü karşılaştırmadan çıkarmak istiyor musunuz?`)) {
    compareItems = [];
    localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
    renderCompareList();
    updateCompareButtons();
    toast("Karşılaştırma listesi temizlendi", "success");
  }
}

// ========== LİSTEYİ GÖSTER ==========
function renderCompareList() {
  const container = $("compareListModal");
  if (!container) {
    console.error("compareListModal bulunamadı!");
    return;
  }

  if (compareItems.length === 0) {
    container.innerHTML = `
      <div class="emptyCompareState">
        <div class="emptyIcon">⚖️</div>
        <h3>Karşılaştırma Listesi Boş</h3>
        <p>Ürünlerdeki "⚖️ Karşılaştır" butonuna tıklayarak ürün ekleyin.</p>
      </div>
    `;
    return;
  }

  // Fiyatları parse et
  const itemsWithPrices = compareItems.map(item => {
    const priceText = item.price || "";
    // ₺4.699,99 -> 4699.99
    const priceNum = parseFloat(
      priceText
        .replace(/[^\d.,]/g, '')
        .replace('.', '')
        .replace(',', '.')
    );
    return { 
      ...item, 
      priceNum: isNaN(priceNum) ? 0 : priceNum,
      displayPrice: priceText || "Fiyat bilgisi yok"
    };
  });

  // Fiyat analizi
  const validPrices = itemsWithPrices
    .map(p => p.priceNum)
    .filter(p => p > 0);
  
  const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
  const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 0;

  let html = `
    <div class="compareStats">
      <div class="statCard">
        <div class="statLabel">Karşılaştırılan</div>
        <div class="statValue" style="color: #7c5cff;">${compareItems.length}</div>
        <div class="miniHint">ürün</div>
      </div>
      
      <div class="statCard">
        <div class="statLabel">En Düşük</div>
        <div class="statValue" style="color: #36d399;">
          ${minPrice > 0 ? '₺' + minPrice.toLocaleString('tr-TR') : 'N/A'}
        </div>
        <div class="miniHint">fiyat</div>
      </div>
      
      <div class="statCard">
        <div class="statLabel">En Yüksek</div>
        <div class="statValue" style="color: #ff4757;">
          ${maxPrice > 0 ? '₺' + maxPrice.toLocaleString('tr-TR') : 'N/A'}
        </div>
        <div class="miniHint">fiyat</div>
      </div>
    </div>
    
    <div class="compareTable">
      <!-- Tablo Başlıkları -->
      <div class="compareHeaders">
        <div class="headerCell">Özellik</div>
        ${compareItems.map(item => `
          <div class="headerCell">${item.site}</div>
        `).join('')}
      </div>
      
      <!-- Ürün Adı Satırı -->
      <div class="compareRow">
        <div class="rowLabel">Ürün Adı</div>
        ${compareItems.map(item => `
          <div class="rowCell">
            <strong>${item.title.substring(0, 40)}${item.title.length > 40 ? '...' : ''}</strong>
          </div>
        `).join('')}
      </div>
      
      <!-- Fiyat Satırı -->
      <div class="compareRow">
        <div class="rowLabel">Fiyat</div>
        ${itemsWithPrices.map(item => {
          let priceClass = '';
          if (item.priceNum === minPrice && item.priceNum > 0) {
            priceClass = 'price-low';
          } else if (item.priceNum === maxPrice && item.priceNum > 0) {
            priceClass = 'price-high';
          }
          
          return `<div class="rowCell ${priceClass}"><strong>${item.displayPrice}</strong></div>`;
        }).join('')}
      </div>
      
      <!-- Site Satırı -->
      <div class="compareRow">
        <div class="rowLabel">Site</div>
        ${compareItems.map(item => `
          <div class="rowCell">
            <span class="siteBadge">${item.site}</span>
          </div>
        `).join('')}
      </div>
      
      <!-- Eylemler Satırı -->
      <div class="compareRow">
        <div class="rowLabel">Eylemler</div>
        ${compareItems.map(item => `
          <div class="rowCell">
            <button class="btnGhost xs" onclick="window.open('${item.link}', '_blank')">Aç</button>
            <button class="btnGhost xs" onclick="copyToClipboard('${item.link}')">⧉</button>
            <button class="btnGhost xs" onclick="removeFromCompare('${item.id}')" style="color: #ff4757;">✕</button>
          </div>
        `).join('')}
      </div>
    </div>
    
    <!-- Kontrol Panel -->
    <div class="compareControls">
      <div>
        <strong>${compareItems.length} ürün karşılaştırılıyor</strong>
        ${minPrice > 0 ? `
          <div class="priceHint">
            En ucuz: ₺${minPrice.toLocaleString('tr-TR')} 
            (${compareItems.find(item => {
              const price = parseFloat(item.price?.replace(/[^\d.,]/g, '').replace('.', '').replace(',', '.'));
              return price === minPrice;
            })?.site || ''})
          </div>
        ` : ''}
      </div>
      
      <div class="controlButtons">
        <button class="btnGhost" onclick="clearCompareList()" style="color: #ff4757;">
          🗑️ Temizle
        </button>
        <button class="btnPrimary" onclick="runAIComparison()" ${compareItems.length < 2 ? 'disabled' : ''}>
          🤖 AI Karşılaştır
        </button>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

// ========== BUTON GÜNCELLEME ==========
function updateCompareButtons() {
  document.querySelectorAll('.btnCompare').forEach(btn => {
    const url = btn.getAttribute('data-compare-url');
    const isInCompare = compareItems.some(item => item.link === url);
    
    if (isInCompare) {
      btn.innerHTML = '✓ Eklendi';
      btn.classList.add('added');
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.classList.contains('xs') ? '⚖️' : '⚖️ Karşılaştır';
      btn.classList.remove('added');
      btn.disabled = false;
    }
  });
}

// ========== ÜRÜN KARTLARINA BUTON EKLE ==========
function addCompareButtonsToProducts() {
  console.log("Ürün kartlarına buton ekleniyor...");
  
  // 1. EN UCUZ ÜRÜN BANNER'ı
  document.querySelectorAll('.cheapestBanner').forEach(banner => {
    const actions = banner.querySelector('.productActions');
    if (!actions) return;
    
    // Buton zaten var mı?
    if (actions.querySelector('.btnCompare')) return;
    
    // Ürün bilgilerini al
    const title = banner.querySelector('.productTitle')?.textContent || '';
    const price = banner.querySelector('.productPrice')?.textContent || '';
    const site = banner.querySelector('.siteTag')?.textContent || '';
    const link = banner.querySelector('.btnPrimary')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || '';
    
    if (!link) return;
    
    // Karşılaştırma butonunu oluştur
    const compareBtn = document.createElement('button');
    compareBtn.className = 'btnCompare btnGhost sm';
    compareBtn.innerHTML = '⚖️ Karşılaştır';
    compareBtn.setAttribute('data-compare-url', link);
    
    // Tıklama event'i
    compareBtn.onclick = function(e) {
      e.stopPropagation();
      const product = {
        urun: title,
        fiyat: price,
        site: site,
        link: link
      };
      addToCompare(product, window.currentSearch || '');
    };
    
    // Favori butonundan önce ekle
    const favBtn = actions.querySelector('.btnFav');
    if (favBtn) {
      actions.insertBefore(compareBtn, favBtn);
    } else {
      actions.appendChild(compareBtn);
    }
  });
  
  // 2. DİĞER ÜRÜN KARTLARI
  document.querySelectorAll('.productCard').forEach(card => {
    const actions = card.querySelector('.productActions');
    if (!actions) return;
    
    if (actions.querySelector('.btnCompare')) return;
    
    const title = card.querySelector('.productName')?.textContent || '';
    const price = card.querySelector('.productPrice')?.textContent || '';
    const site = card.querySelector('.productSite')?.textContent || '';
    const link = card.querySelector('.btnGhost[onclick*="window.open"]')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || '';
    
    if (!link) return;
    
    const compareBtn = document.createElement('button');
    compareBtn.className = 'btnCompare btnGhost xs';
    compareBtn.innerHTML = '⚖️';
    compareBtn.setAttribute('data-compare-url', link);
    
    compareBtn.onclick = function(e) {
      e.stopPropagation();
      const product = {
        urun: title,
        fiyat: price,
        site: site,
        link: link
      };
      addToCompare(product, window.currentSearch || '');
    };
    
    const favBtn = actions.querySelector('.btnFav');
    if (favBtn) {
      actions.insertBefore(compareBtn, favBtn);
    } else {
      actions.appendChild(compareBtn);
    }
  });
  
  // Buton durumlarını güncelle
  updateCompareButtons();
}

// ========== AI KARŞILAŞTIRMA ==========
async function runAIComparison() {
  if (compareItems.length < 2) {
    toast("AI karşılaştırma için en az 2 ürün gerekli", "error");
    return;
  }
  
  toast("🤖 AI karşılaştırma yapılıyor...", "info");
  
  try {
    const API_BASE = "https://fiyattakip-api.onrender.com";
    const response = await fetch(`${API_BASE}/ai/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        products: compareItems,
        timestamp: new Date().toISOString()
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // AI sonuçlarını göster
      const aiResult = document.createElement('div');
      aiResult.className = 'aiCompareResult';
      aiResult.innerHTML = `
        <div class="aiResultHeader">
          <h4>🤖 AI Karşılaştırma Analizi</h4>
          <button class="closeAiResult" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
        <div class="aiResultContent">
          ${data.analysis || data.yorum || "AI, ürünleri fiyat, kalite ve değer açısından karşılaştırdı."}
        </div>
        ${data.recommendation ? `
          <div class="aiRecommendation">
            <strong>🏆 AI Önerisi:</strong> ${data.recommendation}
          </div>
        ` : ''}
      `;
      
      // Modal içine ekle
      const container = $("compareListModal");
      if (container) {
        container.appendChild(aiResult);
        aiResult.scrollIntoView({ behavior: 'smooth' });
      }
      
      toast("AI karşılaştırma tamamlandı ✓", "success");
      
    } else {
      throw new Error("AI yanıt vermedi");
    }
  } catch (error) {
    console.error("AI karşılaştırma hatası:", error);
    
    // Fallback
    const aiResult = document.createElement('div');
    aiResult.className = 'aiCompareResult';
    aiResult.innerHTML = `
      <div class="aiResultHeader">
        <h4>🤖 AI Karşılaştırma (Demo)</h4>
      </div>
      <div class="aiResultContent">
        <p>Ürünleriniz başarıyla analiz edildi:</p>
        <ul>
          <li><strong>Fiyat performansı:</strong> ${compareItems[0]?.site || 'İlk ürün'} daha avantajlı</li>
          <li><strong>Değerlendirme:</strong> Tüm ürünler kullanıcı deneyimi açısından yeterli</li>
          <li><strong>Tavsiye:</strong> Bütçenize en uygun olanı seçin</li>
        </ul>
      </div>
    `;
    
    const container = $("compareListModal");
    if (container) {
      container.appendChild(aiResult);
    }
    
    toast("AI servisi geçici olarak kullanılamıyor (demo gösteriliyor)", "warning");
  }
}

// ========== TOAST FONKSİYONU ==========
function toast(msg, type = 'info') {
  console.log(`[TOAST ${type}]: ${msg}`);
  // Eğer ana uygulamada toast varsa onu kullan
  if (window.toast && typeof window.toast === 'function') {
    window.toast(msg, type);
    return;
  }
  
  // Yoksa basit toast oluştur
  const toastEl = document.createElement('div');
  toastEl.className = `toast ${type}`;
  toastEl.textContent = msg;
  toastEl.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#ff4757' : type === 'success' ? '#36d399' : '#7c5cff'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 9999;
    font-weight: bold;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  
  document.body.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 3000);
}

// ========== EVENT KURULUMU ==========
function setupCompareEvents() {
  console.log("Karşılaştırma event'leri kuruluyor...");
  
  // Banner'a tıklama
  const banner = document.querySelector('.banner');
  if (banner && !banner.onclick) {
    banner.style.cursor = 'pointer';
    banner.onclick = openCompareModal;
  }
  
  // Modal kapatma
  document.getElementById('closeCompare')?.addEventListener('click', closeCompareModal);
  document.getElementById('compareBackdrop')?.addEventListener('click', closeCompareModal);
  
  console.log("Event'ler kuruldu");
}

// ========== OTOMATİK BUTON EKLEME ==========
function startCompareButtonObserver() {
  // Sayfa yüklendiğinde buton ekle
  setTimeout(addCompareButtonsToProducts, 1000);
  
  // Her 2 saniyede bir kontrol et
  setInterval(addCompareButtonsToProducts, 2000);
  
  // Arama yapıldığında buton ekle
  const originalFiyatAra = window.fiyatAra;
  if (originalFiyatAra) {
    window.fiyatAra = function(...args) {
      const result = originalFiyatAra.apply(this, args);
      setTimeout(addCompareButtonsToProducts, 1500);
      return result;
    };
  }
}

// ========== BAŞLATMA ==========
document.addEventListener('DOMContentLoaded', function() {
  console.log("✅ Karşılaştırma sistemi başlatılıyor...");
  
  // Event'leri kur
  setupCompareEvents();
  
  // Otomatik buton eklemeyi başlat
  startCompareButtonObserver();
  
  console.log("✅ Karşılaştırma sistemi hazır");
});

// ========== GLOBAL FONKSİYONLAR ==========
window.addToCompare = addToCompare;
window.removeFromCompare = removeFromCompare;
window.clearCompareList = clearCompareList;
window.openCompareModal = openCompareModal;
window.closeCompareModal = closeCompareModal;
window.runAIComparison = runAIComparison;

console.log("✅ compare.js yüklendi");
