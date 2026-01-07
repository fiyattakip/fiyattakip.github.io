// compare.js - TAM ve ÇALIŞAN Karşılaştırma Sistemi
console.log("✅ Karşılaştırma sistemi yükleniyor...");

// Yardımcı fonksiyon
const $ = (id) => document.getElementById(id);

// Veri
let compareItems = JSON.parse(localStorage.getItem('fiyattakip_compare') || '[]');

// ========== LİNKTEN FİYAT ÇEKME FONKSİYONU ==========
async function fetchPriceFromLink(url) {
  console.log("🔗 Link'ten fiyat çekiliyor:", url);
  
  try {
    // YENİ API URL'Sİ - Render.com'daki
    const API_URL = "https://fiyattakip-api.onrender.com";
    
    console.log(`📡 API'ye istek gönderiliyor: ${API_URL}/fiyat-cek-link`);
    
    const response = await fetch(`${API_URL}/fiyat-cek-link`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ url: url })
    });
    
    console.log("📊 API Yanıt Durumu:", response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log("✅ API Yanıtı:", data);
      
      if (data.success) {
        return {
          success: true,
          title: data.urun || "Linkten gelen ürün",
          price: data.fiyat || "₺???",
          site: data.site || "Bilinmeyen",
          link: data.link || url
        };
      } else {
        console.warn("⚠️ API başarısız:", data.error);
      }
    } else {
      console.warn("⚠️ API hatası:", response.status);
    }
    
    // Fallback: Eğer API çalışmazsa
    throw new Error("API fiyat çekemedi");
    
  } catch (error) {
    console.error("❌ Link fiyat hatası:", error);
    
    // Fallback: URL'den site adını çıkar
    let site = "Link";
    try {
      const urlObj = new URL(url);
      site = urlObj.hostname.replace('www.', '').split('.')[0];
      site = site.charAt(0).toUpperCase() + site.slice(1);
    } catch(e) {
      console.log("URL parse hatası:", e);
    }
    
    return {
      success: false,
      title: "Linkten gelen ürün",
      price: "₺???",
      site: site,
      link: url,
      error: error.message
    };
  }
}

// ========== MODAL KONTROLLERİ ==========
function openCompareModal() {
  console.log("Modal açılıyor...");
  const modal = $("compareModal");
  if (modal) {
    modal.classList.add("show");
    document.body.classList.add("modalOpen");
    renderCompareList();
    updateCompareCounter();
  }
}

function closeCompareModal() {
  console.log("Modal kapatılıyor...");
  const modal = $("compareModal");
  if (modal) {
    modal.classList.remove("show");
    document.body.classList.remove("modalOpen");
  }
}

// ========== SAYAÇ GÜNCELLE ==========
function updateCompareCounter() {
  const count = compareItems.length;
  const counter1 = $("compareCount");
  const counter2 = $("compareCountModal");
  
  if (counter1) counter1.textContent = count;
  if (counter2) counter2.textContent = count;
}

// ========== ÜRÜN EKLE ==========
function addToCompare(product, query = "") {
  console.log("Ürün ekleniyor:", product);
  
  if (compareItems.length >= 5) {
    showMessage("Maksimum 5 ürün karşılaştırabilirsiniz", "warning");
    return;
  }
  
  // Aynı ürün kontrolü
  if (compareItems.some(item => item.link === product.link)) {
    showMessage("Bu ürün zaten listede", "info");
    return;
  }
  
  const newItem = {
    id: 'cmp_' + Date.now(),
    title: product.title || product.urun || "",
    price: product.price || product.fiyat || "",
    site: product.site || "",
    link: product.link || "",
    query: query
  };
  
  compareItems.push(newItem);
  localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
  
  updateCompareCounter();
  renderCompareList();
  updateCompareButtonStates();
  
  showMessage(`"${newItem.title.substring(0,20)}..." eklendi`, "success");
}

// ========== MESAJ GÖSTER ==========
function showMessage(msg, type = "info") {
  console.log(`[${type.toUpperCase()}] ${msg}`);
  
  // Ana uygulamanın toast fonksiyonunu kullan
  if (window.toast && typeof window.toast === "function") {
    window.toast(msg, type);
  } else {
    // Fallback alert
    alert(msg);
  }
}

// ========== LİSTEYİ GÖSTER ==========
function renderCompareList() {
  const container = $("compareListContainer");
  if (!container) return;
  
  if (compareItems.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,0.7);">
        <div style="font-size:48px;margin-bottom:15px;opacity:0.5;">⚖️</div>
        <h3 style="color:white;margin-bottom:10px;">Karşılaştırma Listesi Boş</h3>
        <p>Ürünlerdeki "⚖️ Karşılaştır" butonuna tıklayın.</p>
      </div>
    `;
    return;
  }
  
  let html = '<div style="display:flex;flex-direction:column;gap:10px;">';
  
  compareItems.forEach(item => {
    html += `
      <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px;border:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div style="flex:1;">
            <div style="font-weight:bold;font-size:14px;">${item.title.substring(0,40)}${item.title.length > 40 ? '...' : ''}</div>
            <div style="display:flex;gap:10px;margin-top:5px;font-size:12px;color:rgba(255,255,255,0.7);">
              <span>${item.site}</span>
              <span style="color:#36d399;font-weight:bold;">${item.price}</span>
            </div>
          </div>
          <button onclick="removeCompareItem('${item.id}')" style="background:none;border:none;color:#ff4757;cursor:pointer;padding:5px;font-size:16px;">✕</button>
        </div>
        <div style="display:flex;gap:5px;margin-top:8px;">
          <button onclick="window.open('${item.link}', '_blank')" style="padding:5px 10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;cursor:pointer;font-size:12px;flex:1;">Ürüne Git</button>
          <button onclick="copyToClipboard('${item.link}')" style="padding:5px 10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;cursor:pointer;font-size:12px;">⧉</button>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// ========== ÜRÜN SİL ==========
function removeCompareItem(itemId) {
  compareItems = compareItems.filter(item => item.id !== itemId);
  localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
  updateCompareCounter();
  renderCompareList();
  updateCompareButtonStates();
  showMessage("Ürün listeden çıkarıldı", "info");
}

// ========== LİSTEMİ TEMİZLE ==========
function clearCompareList() {
  if (compareItems.length === 0) return;
  
  if (confirm(`${compareItems.length} ürünü silmek istiyor musunuz?`)) {
    compareItems = [];
    localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
    updateCompareCounter();
    renderCompareList();
    updateCompareButtonStates();
    showMessage("Liste temizlendi", "success");
  }
}

// ========== ÜRÜN KARTLARINA BUTON EKLE ==========
function addCompareButtons() {
  console.log("Karşılaştırma butonları ekleniyor...");
  
  // 1. EN UCUZ BANNER (Büyük buton)
  document.querySelectorAll('.cheapestBanner').forEach(banner => {
    const actions = banner.querySelector('.productActions');
    if (!actions || actions.querySelector('.btnCompare')) return;
    
    const title = banner.querySelector('.productTitle')?.textContent || '';
    const price = banner.querySelector('.productPrice')?.textContent || '';
    const site = banner.querySelector('.siteTag')?.textContent || '';
    
    // Linki BUL
    let link = '';
    
    // Yöntem 1: onclick attribute'dan al
    const openBtn = banner.querySelector('.btnPrimary[onclick]');
    if (openBtn) {
      const onclickAttr = openBtn.getAttribute('onclick');
      if (onclickAttr) {
        const match = onclickAttr.match(/window\.open\('([^']+)'/);
        if (match) link = match[1];
      }
    }
    
    if (!link) {
      console.log("Banner için link bulunamadı");
      return;
    }
    
    console.log("Banner link bulundu:", link);
    
    // Buton oluştur
    const compareBtn = document.createElement('button');
    compareBtn.className = 'btnCompare btnGhost sm';
    compareBtn.innerHTML = '⚖️ Karşılaştır';
    compareBtn.setAttribute('data-compare-url', link);
    
    compareBtn.onclick = function(e) {
      e.stopPropagation();
      const product = {
        title: title,
        price: price,
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
  
  // 2. DİĞER ÜRÜN KARTLARI (Küçük buton)
  document.querySelectorAll('.productCard').forEach((card, index) => {
    const actions = card.querySelector('.productActions');
    if (!actions) return;
    
    // Buton zaten var mı?
    if (actions.querySelector('.btnCompare')) return;
    
    const title = card.querySelector('.productName')?.textContent || '';
    const price = card.querySelector('.productPrice')?.textContent || '';
    const site = card.querySelector('.productSite')?.textContent || '';
    
    // Linki BUL
    let link = '';
    
    // Yöntem 1: onclick attribute
    const openBtns = card.querySelectorAll('.btnGhost[onclick]');
    for (const btn of openBtns) {
      const onclickAttr = btn.getAttribute('onclick');
      if (onclickAttr && onclickAttr.includes('window.open')) {
        const match = onclickAttr.match(/window\.open\('([^']+)'/);
        if (match) {
          link = match[1];
          break;
        }
      }
    }
    
    if (!link) {
      console.log(`Ürün ${index} için link bulunamadı`);
      return;
    }
    
    console.log(`Ürün ${index} link bulundu:`, link);
    
    // Küçük karşılaştırma butonu oluştur
    const compareBtn = document.createElement('button');
    compareBtn.className = 'btnCompare btnGhost xs';
    compareBtn.innerHTML = '⚖️';
    compareBtn.title = 'Karşılaştırmaya ekle';
    compareBtn.setAttribute('data-compare-url', link);
    
    compareBtn.onclick = function(e) {
      e.stopPropagation();
      const product = {
        title: title,
        price: price,
        site: site,
        link: link
      };
      addToCompare(product, window.currentSearch || '');
    };
    
    // Butonu ekle
    actions.appendChild(compareBtn);
  });
  
  // 3. NORMAL ARAMA SONUÇLARI (Site kartları)
  document.querySelectorAll('.cardBox .rowLine').forEach(card => {
    const actions = card.querySelector('.actions');
    if (!actions || actions.querySelector('.btnCompare')) return;
    
    const title = card.querySelector('.sub')?.textContent || '';
    const site = card.querySelector('.ttl')?.textContent || '';
    
    // Linki data attribute'dan al
    let link = '';
    const copyBtn = actions.querySelector('[data-copy-url]');
    if (copyBtn) {
      link = copyBtn.getAttribute('data-copy-url') || '';
    }
    
    if (!link) return;
    
    const compareBtn = document.createElement('button');
    compareBtn.className = 'btnCompare btnGhost sm';
    compareBtn.innerHTML = '⚖️';
    compareBtn.title = 'Karşılaştırmaya ekle';
    compareBtn.setAttribute('data-compare-url', link);
    
    compareBtn.onclick = function(e) {
      e.stopPropagation();
      const product = {
        title: title,
        price: "Fiyat bilgisi yok",
        site: site,
        link: link
      };
      addToCompare(product, title);
    };
    
    actions.appendChild(compareBtn);
  });
  
  // Buton durumlarını güncelle
  updateCompareButtonStates();
}

// ========== BUTON DURUMLARINI GÜNCELLE ==========
function updateCompareButtonStates() {
  document.querySelectorAll('.btnCompare').forEach(btn => {
    const url = btn.getAttribute('data-compare-url');
    const isInCompare = compareItems.some(item => item.link === url);
    
    if (isInCompare) {
      btn.innerHTML = btn.classList.contains('xs') ? '✓' : '✓ Eklendi';
      btn.classList.add('added');
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.classList.contains('xs') ? '⚖️' : '⚖️ Karşılaştır';
      btn.classList.remove('added');
      btn.disabled = false;
    }
  });
}

// ========== EVENT KURULUMU ==========
function setupEvents() {
  console.log("Event'ler kuruluyor...");
  
  // 1. KAPATMA BUTONU
  const closeBtn = $("closeCompareBtn");
  if (closeBtn) {
    closeBtn.onclick = closeCompareModal;
    console.log("✅ Kapatma butonu bağlandı");
  } else {
    console.error("❌ Kapatma butonu bulunamadı! ID: closeCompareBtn");
  }
  
  // 2. BACKDROP KAPATMA
  const backdrop = $("compareBackdrop");
  if (backdrop) {
    backdrop.onclick = closeCompareModal;
    console.log("✅ Backdrop bağlandı");
  }
  
  // 3. MANUEL EKLEME PANELİ
  const addBtn = $("addManualBtn");
  const manualPanel = $("manualPanel");
  const closeManualBtn = $("closeManualBtn");
  
  if (addBtn && manualPanel) {
    addBtn.onclick = function() {
      console.log("➕ Manuel ekle butonuna tıklandı");
      manualPanel.style.display = manualPanel.style.display === 'none' ? 'block' : 'none';
      if (manualPanel.style.display === 'block') {
        const input = $("manualInput");
        if (input) input.focus();
      }
    };
    console.log("✅ Manuel ekle butonu bağlandı");
  } else {
    console.error("❌ Manuel ekle butonu veya panel bulunamadı!");
  }
  
  if (closeManualBtn && manualPanel) {
    closeManualBtn.onclick = function() {
      manualPanel.style.display = 'none';
    };
  }
  
  // 4. TEMİZLE BUTONU
  const clearBtn = $("clearCompareBtn");
  if (clearBtn) {
    clearBtn.onclick = clearCompareList;
    console.log("✅ Temizle butonu bağlandı");
  }
  
  // 5. LİNKTEN GETİR BUTONU - YENİ FONKSİYON
  const fetchBtn = $("fetchLinkBtn");
  const manualInput = $("manualInput");
  
  if (fetchBtn && manualInput) {
    fetchBtn.onclick = async function() {
      console.log("🔗 Linkten getir butonuna tıklandı");
      const url = manualInput.value.trim();
      
      if (!url) {
        showMessage("Link girin", "error");
        return;
      }
      
      // URL kontrolü
      if (!url.startsWith('http')) {
        showMessage("Geçerli bir link girin (https:// ile başlamalı)", "error");
        return;
      }
      
      showMessage("Link analiz ediliyor ve fiyat çekiliyor...", "info");
      
      try {
        // Loading göster
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = '⏳...';
        
        // Link'ten fiyat çek
        const productData = await fetchPriceFromLink(url);
        console.log("📦 Link'ten gelen ürün verisi:", productData);
        
        const product = {
          title: productData.title,
          price: productData.price,
          site: productData.site,
          link: productData.link
        };
        
        addToCompare(product, "link-ekle");
        manualInput.value = "";
        manualPanel.style.display = "none";
        
      } catch (error) {
        console.error("Link işleme hatası:", error);
        showMessage("Fiyat çekilemedi, manuel ekleniyor...", "warning");
        
        // Fallback: Manuel ekle
        let site = "Link";
        try {
          const urlObj = new URL(url);
          site = urlObj.hostname.replace('www.', '').split('.')[0];
          site = site.charAt(0).toUpperCase() + site.slice(1);
        } catch(e) {
          console.log("URL parse hatası:", e);
        }
        
        const product = {
          title: "Linkten gelen ürün",
          price: "₺???",
          site: site,
          link: url
        };
        
        addToCompare(product, "manuel");
        manualInput.value = "";
        manualPanel.style.display = "none";
        
      } finally {
        // Butonu eski haline getir
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = '🔗 Linkten Getir';
      }
    };
    console.log("✅ Linkten getir butonu bağlandı");
  } else {
    console.error("❌ Linkten getir butonu veya input bulunamadı!");
  }
  
  // 6. BUL VE EŞLEŞTİR BUTONU
  const searchBtn = $("searchMatchBtn");
  if (searchBtn && manualInput) {
    searchBtn.onclick = function() {
      console.log("🔍 Bul ve eşleştir butonuna tıklandı");
      const query = manualInput.value.trim();
      if (!query) {
        showMessage("Aranacak kelime girin", "error");
        return;
      }
      
      showMessage(`"${query}" aranıyor...`, "info");
      
      // Arama yap
      if (window.fiyatAra) {
        window.fiyatAra(query);
      } else if (window.doNormalSearch) {
        window.doNormalSearch(query);
      }
      
      manualInput.value = "";
      manualPanel.style.display = "none";
      closeCompareModal();
    };
    console.log("✅ Bul ve eşleştir butonu bağlandı");
  }
  
  // 7. AI KARŞILAŞTIRMA BUTONU
  const aiBtn = $("aiCompareBtn");
  if (aiBtn) {
    aiBtn.onclick = async function() {
      console.log("🤖 AI karşılaştırma butonuna tıklandı");
      
      if (compareItems.length < 2) {
        showMessage("En az 2 ürün gerekli", "error");
        return;
      }
      
      showMessage("🤖 AI karşılaştırma yapılıyor...", "info");
      
      try {
        const API_URL = localStorage.getItem('fiyattakip_api_url') || "https://fiyattakip-api.onrender.com";
        
        const response = await fetch(`${API_URL}/ai/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            products: compareItems,
            timestamp: new Date().toISOString()
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          
          const aiPanel = $("aiResultPanel");
          const aiContent = $("aiContent");
          
          if (aiPanel && aiContent) {
            aiContent.innerHTML = `
              <div style="color:rgba(255,255,255,0.9);font-size:14px;line-height:1.5;">
                <div style="margin-bottom:10px;padding:10px;background:rgba(124,92,255,0.1);border-radius:8px;">
                  <strong>${data.analysis?.split('\n')[0] || 'AI Karşılaştırma'}</strong>
                </div>
                <div style="white-space:pre-line;">${data.analysis || 'Analiz yapıldı.'}</div>
                ${data.recommendation ? `
                  <div style="margin-top:10px;padding:10px;background:rgba(54,211,153,0.1);border-radius:8px;">
                    <strong>🏆 Öneri:</strong> ${data.recommendation}
                  </div>
                ` : ''}
              </div>
            `;
            aiPanel.style.display = "block";
            aiPanel.scrollIntoView({ behavior: 'smooth' });
          }
          
          showMessage("AI karşılaştırma tamamlandı", "success");
          
        } else {
          throw new Error("AI servisi yanıt vermedi");
        }
        
      } catch (error) {
        console.error("AI karşılaştırma hatası:", error);
        
        // Fallback AI
        const aiPanel = $("aiResultPanel");
        const aiContent = $("aiContent");
        
        if (aiPanel && aiContent) {
          aiContent.innerHTML = `
            <div style="color:rgba(255,255,255,0.9);font-size:14px;line-height:1.5;">
              <p><strong>${compareItems.length} Ürün Karşılaştırma Analizi</strong></p>
              <ul style="padding-left:20px;">
                <li>En ucuz: ${compareItems[0]?.site || ''} - ${compareItems[0]?.price || ''}</li>
                <li>Fiyat aralığı geniş</li>
                <li>Öneri: Bütçenize uygun olanı seçin</li>
              </ul>
            </div>
          `;
          aiPanel.style.display = "block";
        }
        
        showMessage("AI servisi geçici olarak kullanılamıyor", "warning");
      }
    };
    console.log("✅ AI karşılaştırma butonu bağlandı");
  }
  
  // 8. AI PANEL KAPATMA BUTONU
  const closeAiBtn = $("closeAiBtn");
  const aiPanel = $("aiResultPanel");
  if (closeAiBtn && aiPanel) {
    closeAiBtn.onclick = function() {
      aiPanel.style.display = "none";
    };
    console.log("✅ AI panel kapatma butonu bağlandı");
  }
  
  console.log("✅ Tüm event'ler kuruldu");
}

// ========== KOPYALAMA FONKSİYONU ==========
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showMessage("Link kopyalandı", "success");
  }).catch(err => {
    console.error('Kopyalama hatası:', err);
    showMessage("Kopyalama başarısız", "error");
  });
}

// ========== BAŞLATMA ==========
document.addEventListener('DOMContentLoaded', function() {
  console.log("🚀 Karşılaştırma sistemi başlatılıyor...");
  
  // Event'leri kur
  setTimeout(() => {
    setupEvents();
  }, 500);
  
  // Sayacı güncelle
  updateCompareCounter();
  
  // Butonları ekle (her 2 saniyede bir)
  setTimeout(addCompareButtons, 1000);
  setInterval(addCompareButtons, 2000);
  
  // Arama yapıldığında buton ekle
  if (window.fiyatAra) {
    const originalFiyatAra = window.fiyatAra;
    window.fiyatAra = function(...args) {
      const result = originalFiyatAra.apply(this, args);
      setTimeout(addCompareButtons, 1500);
      return result;
    };
  }
  
  console.log("✅ Karşılaştırma sistemi hazır");
});

// ========== GLOBAL FONKSİYONLAR ==========
window.openCompareModal = openCompareModal;
window.closeCompareModal = closeCompareModal;
window.addToCompare = addToCompare;
window.removeCompareItem = removeCompareItem;
window.clearCompareList = clearCompareList;
window.copyToClipboard = copyToClipboard;

console.log("✅ compare.js yüklendi ve hazır");
