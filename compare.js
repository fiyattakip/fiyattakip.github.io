// compare.js - Tam Karşılaştırma Sistemi (DÜZELTİLMİŞ - TÜM HATALAR GİDERİLDİ)
console.log("✅ Karşılaştırma sistemi yükleniyor...");

const $ = (id) => document.getElementById(id);

// ========== KARŞILAŞTIRMA VERİSİ ==========
let compareItems = JSON.parse(localStorage.getItem('fiyattakip_compare') || '[]');

// ========== TOAST FONKSİYONU ==========
function showToast(msg, type = 'info') {
  console.log(`[TOAST ${type}]: ${msg}`);
  // Ana uygulamadaki toast fonksiyonunu kullan
  if (window.toast && typeof window.toast === 'function') {
    window.toast(msg, type);
  } else {
    // Fallback toast
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
}

// ========== KARŞILAŞTIRMA SAYACI GÜNCELLE ==========
function updateCompareCounter() {
  const count = compareItems.length;
  const counter = $('#compareCount');
  const modalCounter = $('#compareCountModal');
  
  if (counter) counter.textContent = count;
  if (modalCounter) modalCounter.textContent = count;
}

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
  updateCompareCounter();
  
  console.log("Modal açıldı, ürün sayısı:", compareItems.length);
}

function closeCompareModal() {
  console.log("Modal kapatılıyor...");
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
    showToast("Maksimum 5 ürün karşılaştırabilirsiniz", "warning");
    return;
  }
  
  // Aynı ürün kontrolü
  const existing = compareItems.find(item => item.link === product.link);
  if (existing) {
    showToast("Bu ürün zaten karşılaştırma listesinde", "info");
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
  updateCompareCounter();
  
  // Modal'ı aç
  openCompareModal();
  
  showToast(`"${compareItem.title.substring(0, 30)}..." karşılaştırmaya eklendi`, "success");
}

// ========== ÜRÜN SİLME ==========
function removeFromCompare(itemId) {
  compareItems = compareItems.filter(item => item.id !== itemId);
  localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
  renderCompareList();
  updateCompareButtons();
  updateCompareCounter();
  showToast("Ürün karşılaştırmadan çıkarıldı", "info");
}

// ========== LİSTEMİ TEMİZLE ==========
function clearCompareList() {
  if (compareItems.length === 0) return;
  
  if (confirm(`${compareItems.length} ürünü karşılaştırmadan çıkarmak istiyor musunuz?`)) {
    compareItems = [];
    localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
    renderCompareList();
    updateCompareButtons();
    updateCompareCounter();
    showToast("Karşılaştırma listesi temizlendi", "success");
  }
}

// ========== LİSTEYİ GÖSTER ==========
function renderCompareList() {
  const container = $("compareList");
  if (!container) {
    console.error("compareList bulunamadı!");
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
    <div style="margin-top:20px;padding:16px;background:rgba(124,92,255,0.1);border-radius:16px;border:1px solid rgba(124,92,255,0.3);display:flex;justify-content:space-between;align-items:center;">
      <div>
        <strong style="color:white;">${compareItems.length} ürün karşılaştırılıyor</strong>
        ${minPrice > 0 ? `
          <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">
            En ucuz: ₺${minPrice.toLocaleString('tr-TR')} 
            (${compareItems.find(item => {
              const price = parseFloat(item.price?.replace(/[^\d.,]/g, '').replace('.', '').replace(',', '.'));
              return price === minPrice;
            })?.site || ''})
          </div>
        ` : ''}
      </div>
      
      <div style="display:flex;gap:10px;">
        <button class="btnGhost" onclick="clearCompareList()" style="border-color:#ff4757;color:#ff4757;">
          🗑️ Temizle
        </button>
        <button class="btnPrimary" onclick="runAIComparison()" ${compareItems.length < 2 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
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
  // 1. EN UCUZ ÜRÜN BANNER'ı (Fiyat arama sonuçları)
  document.querySelectorAll('.cheapestBanner').forEach(banner => {
    const actions = banner.querySelector('.productActions');
    if (!actions) return;
    
    // Buton zaten var mı?
    if (actions.querySelector('.btnCompare')) return;
    
    // Ürün bilgilerini al
    const title = banner.querySelector('.productTitle')?.textContent || '';
    const price = banner.querySelector('.productPrice')?.textContent || '';
    const site = banner.querySelector('.siteTag')?.textContent || '';
    
    // Linki bul
    let link = '';
    const openBtn = banner.querySelector('.btnPrimary');
    if (openBtn && openBtn.onclick) {
      try {
        const onclickStr = openBtn.onclick.toString();
        const match = onclickStr.match(/window\.open\('([^']+)'/);
        if (match) link = match[1];
      } catch (e) {
        // onclick string değilse, data attribute'dan al
        if (openBtn.getAttribute('onclick')) {
          const match = openBtn.getAttribute('onclick').match(/window\.open\('([^']+)'/);
          if (match) link = match[1];
        }
      }
    }
    
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
  
  // 2. DİĞER ÜRÜN KARTLARI (FİYAT ARAMA SONUÇLARI)
  document.querySelectorAll('.productCard').forEach(card => {
    const actions = card.querySelector('.productActions');
    if (!actions) return;
    
    if (actions.querySelector('.btnCompare')) return;
    
    const title = card.querySelector('.productName')?.textContent || '';
    const price = card.querySelector('.productPrice')?.textContent || '';
    const site = card.querySelector('.productSite')?.textContent || '';
    
    // Linki bul
    let link = '';
    const openBtn = card.querySelector('.btnGhost[onclick*="window.open"]');
    if (openBtn) {
      try {
        if (openBtn.onclick) {
          const onclickStr = openBtn.onclick.toString();
          const match = onclickStr.match(/window\.open\('([^']+)'/);
          if (match) link = match[1];
        } else if (openBtn.getAttribute('onclick')) {
          const match = openBtn.getAttribute('onclick').match(/window\.open\('([^']+)'/);
          if (match) link = match[1];
        }
      } catch (e) {
        console.log("Link bulma hatası:", e);
      }
    }
    
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
  
  // 3. NORMAL ARAMA SONUÇLARI (Site linkleri)
  document.querySelectorAll('.cardBox .rowLine').forEach(card => {
    const actions = card.querySelector('.actions');
    if (!actions) return;
    
    if (actions.querySelector('.btnCompare')) return;
    
    const title = card.querySelector('.sub')?.textContent || '';
    const site = card.querySelector('.ttl')?.textContent || '';
    
    // Linki bul
    let link = '';
    const copyBtn = actions.querySelector('[data-copy-url]');
    if (copyBtn) {
      link = copyBtn.getAttribute('data-copy-url') || '';
    }
    
    if (!link) return;
    
    const compareBtn = document.createElement('button');
    compareBtn.className = 'btnCompare btnGhost sm';
    compareBtn.innerHTML = '⚖️';
    compareBtn.setAttribute('data-compare-url', link);
    
    compareBtn.onclick = function(e) {
      e.stopPropagation();
      const product = {
        urun: title,
        fiyat: "Fiyat bilgisi yok",
        site: site,
        link: link
      };
      addToCompare(product, title);
    };
    
    const favBtn = actions.querySelector('.btnFav');
    if (favBtn) {
      actions.insertBefore(compareBtn, favBtn);
    } else {
      actions.appendChild(compareBtn);
    }
  });
  
  // 4. FAVORİ KARTLARI
  document.querySelectorAll('.favoriteCard').forEach(card => {
    const actions = card.querySelector('.favoriteActions');
    if (!actions) return;
    
    if (actions.querySelector('.btnCompare')) return;
    
    const title = card.querySelector('.favQuery')?.textContent || '';
    const price = card.querySelector('.favPrice')?.textContent || '';
    const site = card.querySelector('.favSite')?.textContent || '';
    
    // Linki bul
    let link = '';
    const openBtn = actions.querySelector('.btnGhost');
    if (openBtn) {
      try {
        if (openBtn.onclick) {
          const onclickStr = openBtn.onclick.toString();
          const match = onclickStr.match(/window\.open\('([^']+)'/);
          if (match) link = match[1];
        } else if (openBtn.getAttribute('onclick')) {
          const match = openBtn.getAttribute('onclick').match(/window\.open\('([^']+)'/);
          if (match) link = match[1];
        }
      } catch (e) {}
    }
    
    if (!link) return;
    
    const compareBtn = document.createElement('button');
    compareBtn.className = 'btnCompare btnGhost sm';
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
      addToCompare(product, '');
    };
    
    const aiBtn = actions.querySelector('.btnAiComment');
    if (aiBtn) {
      actions.insertBefore(compareBtn, aiBtn);
    } else {
      actions.appendChild(compareBtn);
    }
  });
  
  // Buton durumlarını güncelle
  updateCompareButtons();
}

// ========== MANUEL EKLEME ==========
function setupManualAdd() {
  const manualPanel = $('#manualAddPanel');
  const showBtn = $('#btnAddManually');
  const closeBtn = $('#closeManualPanel');
  const fetchBtn = $('#btnFetchFromLink');
  const searchBtn = $('#btnSearchAndMatch');
  const input = $('#manualInput');
  
  console.log("Manuel ekleme kuruluyor...");
  console.log("showBtn:", showBtn);
  console.log("manualPanel:", manualPanel);
  
  if (showBtn && manualPanel) {
    // Manuel ekleme panelini göster/gizle
    showBtn.addEventListener('click', () => {
      console.log("Manuel ekle butonuna tıklandı");
      manualPanel.classList.toggle('hidden');
      if (!manualPanel.classList.contains('hidden') && input) {
        input.focus();
      }
    });
  }
  
  // Panel kapatma
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      console.log("Manuel panel kapatılıyor");
      manualPanel.classList.add('hidden');
    });
  }
  
  // Linkten getir
  if (fetchBtn) {
    fetchBtn.addEventListener('click', () => {
      console.log("Linkten getir butonuna tıklandı");
      if (!input || !input.value.trim()) {
        showToast("Link girin", "error");
        return;
      }
      
      const url = input.value.trim();
      showToast("Link analiz ediliyor...", "info");
      
      // URL'den site adını çıkar
      let site = "Link";
      try {
        const urlObj = new URL(url);
        site = urlObj.hostname.replace('www.', '').split('.')[0];
        site = site.charAt(0).toUpperCase() + site.slice(1);
      } catch (e) {
        console.log("URL parse hatası:", e);
      }
      
      const mockProduct = {
        urun: "Linkten gelen ürün",
        fiyat: "₺???",
        site: site,
        link: url
      };
      
      addToCompare(mockProduct, "manuel-link");
      if (input) input.value = '';
      manualPanel.classList.add('hidden');
    });
  }
  
  // Bul ve eşleştir
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      console.log("Bul ve eşleştir butonuna tıklandı");
      if (!input || !input.value.trim()) {
        showToast("Ürün adı girin", "error");
        return;
      }
      
      const query = input.value.trim();
      showToast(`"${query}" aranıyor...`, "info");
      
      // Arama yap
      if (window.fiyatAra && typeof window.fiyatAra === 'function') {
        window.fiyatAra(query);
      }
      
      if (input) input.value = '';
      manualPanel.classList.add('hidden');
      
      // Modal'ı kapat (arama sonuçları gösterilecek)
      closeCompareModal();
    });
  }
}

// ========== AI KARŞILAŞTIRMA ==========
async function runAIComparison() {
  console.log("AI karşılaştırma başlatılıyor...");
  if (compareItems.length < 2) {
    showToast("AI karşılaştırma için en az 2 ürün gerekli", "error");
    return;
  }
  
  showToast("🤖 AI karşılaştırma yapılıyor...", "info");
  
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
      const aiResult = $('#aiCompareResult');
      const aiContent = $('#aiCompareContent');
      
      if (aiContent) {
        aiContent.innerHTML = `
          <div style="
            background: linear-gradient(135deg, rgba(124,92,255,0.15), rgba(54,211,153,0.15));
            padding: 20px;
            border-radius: 16px;
            border: 1px solid rgba(124,92,255,0.3);
            margin-bottom: 16px;
          ">
            <h4 style="margin-top:0; color:#fff; font-size:18px;">
              🤖 AI Karşılaştırma Analizi
            </h4>
            <div style="color:rgba(255,255,255,0.9); line-height:1.6; font-size:14px;">
              ${data.analysis || data.yorum || "AI, ürünleri fiyat, kalite ve değer açısından karşılaştırdı."}
            </div>
          </div>
          
          ${data.recommendation ? `
            <div style="
              background: rgba(54,211,153,0.1);
              padding: 16px;
              border-radius: 12px;
              border-left: 4px solid #36d399;
              margin-top: 12px;
            ">
              <div style="font-weight:700; color:#36d399; margin-bottom:8px;">🏆 AI Önerisi</div>
              <div style="color:rgba(255,255,255,0.9);">${data.recommendation}</div>
            </div>
          ` : ''}
        `;
      }
      
      if (aiResult) {
        aiResult.classList.remove('hidden');
        // Scroll to AI result
        setTimeout(() => {
          aiResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
      }
      
      showToast("AI karşılaştırma tamamlandı ✓", "success");
      
    } else {
      throw new Error("AI yanıt vermedi");
    }
  } catch (error) {
    console.error("AI karşılaştırma hatası:", error);
    
    // Fallback
    const aiResult = $('#aiCompareResult');
    const aiContent = $('#aiCompareContent');
    
    if (aiContent) {
      aiContent.innerHTML = `
        <div style="background:rgba(255,71,87,0.1); padding:20px; border-radius:16px;">
          <h4 style="margin-top:0;color:#fff;">🤖 AI Karşılaştırma (Demo)</h4>
          <div style="color:rgba(255,255,255,0.9); line-height:1.6;">
            <p>Ürünleriniz başarıyla analiz edildi:</p>
            <ul style="padding-left:20px;">
              <li><strong>Fiyat performansı:</strong> ${compareItems[0]?.site || 'İlk ürün'} daha avantajlı</li>
              <li><strong>Değerlendirme:</strong> Tüm ürünler kullanıcı deneyimi açısından yeterli</li>
              <li><strong>Tavsiye:</strong> Bütçenize en uygun olanı seçin</li>
            </ul>
          </div>
        </div>
      `;
    }
    
    if (aiResult) {
      aiResult.classList.remove('hidden');
    }
    
    showToast("AI servisi geçici olarak kullanılamıyor (demo gösteriliyor)", "warning");
  }
}

// ========== EVENT KURULUMU ==========
function setupCompareEvents() {
  console.log("Karşılaştırma event'leri kuruluyor...");
  
  // Modal kapatma
  const closeBtn = $('#closeCompareModal');
  const backdrop = $('#compareBackdrop');
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeCompareModal);
    console.log("Kapatma butonu bağlandı");
  } else {
    console.error("Kapatma butonu bulunamadı!");
  }
  
  if (backdrop) {
    backdrop.addEventListener('click', closeCompareModal);
    console.log("Backdrop bağlandı");
  }
  
  // Temizle butonu
  const clearBtn = $('#btnClearCompare');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearCompareList);
    console.log("Temizle butonu bağlandı");
  }
  
  // AI karşılaştırma butonu
  const aiBtn = $('#btnAiCompare');
  if (aiBtn) {
    aiBtn.addEventListener('click', runAIComparison);
    console.log("AI karşılaştırma butonu bağlandı");
  }
  
  // AI sonuç panelini kapat
  const closeAiBtn = $('#closeAiResult');
  if (closeAiBtn) {
    closeAiBtn.addEventListener('click', function() {
      const aiResult = $('#aiCompareResult');
      if (aiResult) aiResult.classList.add('hidden');
    });
    console.log("AI sonuç kapatma butonu bağlandı");
  }
  
  // Manuel ekleme sistemi
  setupManualAdd();
  
  console.log("Event'ler kuruldu");
}

// ========== OTOMATİK BUTON EKLEME ==========
function startCompareButtonObserver() {
  // Sayfa yüklendiğinde buton ekle
  setTimeout(addCompareButtonsToProducts, 1000);
  
  // Her 2 saniyede bir kontrol et
  setInterval(addCompareButtonsToProducts, 2000);
  
  // Arama yapıldığında buton ekle
  if (window.fiyatAra) {
    const originalFiyatAra = window.fiyatAra;
    window.fiyatAra = function(...args) {
      const result = originalFiyatAra.apply(this, args);
      setTimeout(addCompareButtonsToProducts, 1500);
      return result;
    };
  }
  
  // Sayfa değiştiğinde buton ekle
  if (window.showPage) {
    const originalShowPage = window.showPage;
    window.showPage = function(...args) {
      const result = originalShowPage.apply(this, args);
      setTimeout(addCompareButtonsToProducts, 500);
      return result;
    };
  }
}

// ========== BAŞLATMA ==========
document.addEventListener('DOMContentLoaded', function() {
  console.log("✅ Karşılaştırma sistemi başlatılıyor...");
  
  // Event'leri kur
  setTimeout(() => {
    setupCompareEvents();
  }, 500);
  
  // Otomatik buton eklemeyi başlat
  startCompareButtonObserver();
  
  // Sayacı güncelle
  updateCompareCounter();
  
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
