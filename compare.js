// compare.js - KESİN ÇALIŞAN Karşılaştırma Sistemi
console.log("✅ Karşılaştırma sistemi yükleniyor...");

// Yardımcı fonksiyon
const $ = (id) => document.getElementById(id);

// Veri
let compareItems = JSON.parse(localStorage.getItem('fiyattakip_compare') || '[]');

// ========== ÇOK BASİT MODAL KONTROLLERİ ==========
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
    alert("Maksimum 5 ürün karşılaştırabilirsiniz");
    return;
  }
  
  // Aynı ürün kontrolü
  if (compareItems.some(item => item.link === product.link)) {
    alert("Bu ürün zaten listede");
    return;
  }
  
  const newItem = {
    id: 'cmp_' + Date.now(),
    title: product.urun || product.title || "",
    price: product.fiyat || "",
    site: product.site || "",
    link: product.link || "",
    query: query
  };
  
  compareItems.push(newItem);
  localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
  
  updateCompareCounter();
  renderCompareList();
  
  // Butonları güncelle
  document.querySelectorAll('.btnCompare').forEach(btn => {
    const url = btn.getAttribute('data-compare-url');
    if (url === product.link) {
      btn.innerHTML = '✓ Eklendi';
      btn.disabled = true;
    }
  });
  
  alert(`"${newItem.title.substring(0,20)}..." eklendi`);
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
              <span style="color:#36d399;">${item.price}</span>
            </div>
          </div>
          <button onclick="removeCompareItem('${item.id}')" style="background:none;border:none;color:#ff4757;cursor:pointer;padding:5px;">✕</button>
        </div>
        <div style="display:flex;gap:5px;margin-top:8px;">
          <button onclick="window.open('${item.link}', '_blank')" style="padding:5px 10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;cursor:pointer;font-size:12px;">Aç</button>
          <button onclick="navigator.clipboard.writeText('${item.link}')" style="padding:5px 10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;cursor:pointer;font-size:12px;">⧉</button>
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
}

// ========== LİSTEMİ TEMİZLE ==========
function clearCompareList() {
  if (compareItems.length === 0) return;
  
  if (confirm(`${compareItems.length} ürünü silmek istiyor musunuz?`)) {
    compareItems = [];
    localStorage.setItem('fiyattakip_compare', JSON.stringify(compareItems));
    updateCompareCounter();
    renderCompareList();
    alert("Liste temizlendi");
  }
}

// ========== EVENT KURULUMU ==========
function setupEvents() {
  console.log("Event'ler kuruluyor...");
  
  // 1. KAPATMA BUTONU - KESİN ÇALIŞACAK
  const closeBtn = $("closeCompareBtn");
  if (closeBtn) {
    closeBtn.onclick = closeCompareModal;
    console.log("Kapatma butonu bağlandı");
  } else {
    console.error("Kapatma butonu bulunamadı!");
  }
  
  // 2. BACKDROP KAPATMA
  const backdrop = $("compareBackdrop");
  if (backdrop) {
    backdrop.onclick = closeCompareModal;
    console.log("Backdrop bağlandı");
  }
  
  // 3. MANUEL EKLEME PANELİ
  const addBtn = $("addManualBtn");
  const manualPanel = $("manualPanel");
  const closeManualBtn = $("closeManualBtn");
  
  if (addBtn && manualPanel) {
    addBtn.onclick = function() {
      manualPanel.style.display = manualPanel.style.display === 'none' ? 'block' : 'none';
    };
    console.log("Manuel ekle butonu bağlandı");
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
    console.log("Temizle butonu bağlandı");
  }
  
  // 5. LİNKTEN GETİR
  const fetchBtn = $("fetchLinkBtn");
  const manualInput = $("manualInput");
  
  if (fetchBtn && manualInput) {
    fetchBtn.onclick = function() {
      const url = manualInput.value.trim();
      if (!url) {
        alert("Link girin");
        return;
      }
      
      // Site adını çıkar
      let site = "Link";
      try {
        const urlObj = new URL(url);
        site = urlObj.hostname.replace('www.', '').split('.')[0];
      } catch(e) {}
      
      const product = {
        title: "Linkten gelen ürün",
        price: "₺???",
        site: site,
        link: url
      };
      
      addToCompare(product, "manuel");
      manualInput.value = "";
      manualPanel.style.display = "none";
    };
  }
  
  // 6. BUL VE EŞLEŞTİR
  const searchBtn = $("searchMatchBtn");
  if (searchBtn && manualInput) {
    searchBtn.onclick = function() {
      const query = manualInput.value.trim();
      if (!query) {
        alert("Aranacak kelime girin");
        return;
      }
      
      // Arama yap
      if (window.fiyatAra) {
        window.fiyatAra(query);
      }
      
      manualInput.value = "";
      manualPanel.style.display = "none";
      closeCompareModal();
    };
  }
  
  // 7. AI KARŞILAŞTIRMA
  const aiBtn = $("aiCompareBtn");
  if (aiBtn) {
    aiBtn.onclick = function() {
      if (compareItems.length < 2) {
        alert("En az 2 ürün gerekli");
        return;
      }
      
      const aiPanel = $("aiResultPanel");
      const aiContent = $("aiContent");
      
      if (aiPanel && aiContent) {
        aiContent.innerHTML = `
          <div style="color:rgba(255,255,255,0.9);font-size:14px;line-height:1.5;">
            <p><strong>${compareItems.length} ürün karşılaştırıldı:</strong></p>
            <ul style="padding-left:20px;">
              <li>En ucuz: ${compareItems[0]?.site || ''} - ${compareItems[0]?.price || ''}</li>
              <li>Fiyat aralığı geniş</li>
              <li>Öneri: Bütçenize uygun olanı seçin</li>
            </ul>
          </div>
        `;
        aiPanel.style.display = "block";
      }
    };
  }
  
  // 8. AI PANEL KAPATMA
  const closeAiBtn = $("closeAiBtn");
  const aiPanel = $("aiResultPanel");
  if (closeAiBtn && aiPanel) {
    closeAiBtn.onclick = function() {
      aiPanel.style.display = "none";
    };
  }
  
  console.log("Tüm event'ler kuruldu");
}

// ========== ÜRÜN KARTLARINA BUTON EKLE ==========
function addCompareButtons() {
  // En ucuz banner
  document.querySelectorAll('.cheapestBanner').forEach(banner => {
    const actions = banner.querySelector('.productActions');
    if (!actions || actions.querySelector('.btnCompare')) return;
    
    const title = banner.querySelector('.productTitle')?.textContent || '';
    const price = banner.querySelector('.productPrice')?.textContent || '';
    const site = banner.querySelector('.siteTag')?.textContent || '';
    
    // Linki bul
    let link = '';
    const openBtn = banner.querySelector('.btnPrimary');
    if (openBtn && openBtn.onclick) {
      const onclickStr = openBtn.onclick.toString();
      const match = onclickStr.match(/window\.open\('([^']+)'/);
      if (match) link = match[1];
    }
    
    if (!link) return;
    
    const compareBtn = document.createElement('button');
    compareBtn.className = 'btnCompare btnGhost sm';
    compareBtn.innerHTML = '⚖️ Karşılaştır';
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
    
    actions.appendChild(compareBtn);
  });
  
  // Diğer ürün kartları
  document.querySelectorAll('.productCard').forEach(card => {
    const actions = card.querySelector('.productActions');
    if (!actions || actions.querySelector('.btnCompare')) return;
    
    const title = card.querySelector('.productName')?.textContent || '';
    const price = card.querySelector('.productPrice')?.textContent || '';
    const site = card.querySelector('.productSite')?.textContent || '';
    
    let link = '';
    const openBtn = card.querySelector('.btnGhost[onclick*="window.open"]');
    if (openBtn && openBtn.onclick) {
      const onclickStr = openBtn.onclick.toString();
      const match = onclickStr.match(/window\.open\('([^']+)'/);
      if (match) link = match[1];
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
    
    actions.appendChild(compareBtn);
  });
}

// ========== BAŞLATMA ==========
document.addEventListener('DOMContentLoaded', function() {
  console.log("Karşılaştırma sistemi başlatılıyor...");
  
  // Event'leri kur
  setupEvents();
  
  // Sayacı güncelle
  updateCompareCounter();
  
  // Butonları ekle (her 2 saniyede bir)
  setTimeout(addCompareButtons, 1000);
  setInterval(addCompareButtons, 2000);
  
  console.log("Karşılaştırma sistemi hazır");
});

// ========== GLOBAL FONKSİYONLAR ==========
window.openCompareModal = openCompareModal;
window.closeCompareModal = closeCompareModal;
window.addToCompare = addToCompare;
window.removeCompareItem = removeCompareItem;
window.clearCompareList = clearCompareList;

console.log("✅ compare.js yüklendi");
