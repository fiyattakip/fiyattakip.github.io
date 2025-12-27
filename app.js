function normalizeUrl(raw){
  try{
    const u = new URL(raw);
    // strip tracking params
    const drop = new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid","yclid","mc_eid","ref","referrer","source","spm"]);
    [...u.searchParams.keys()].forEach(k=>{ if(drop.has(k)) u.searchParams.delete(k); });
    u.hash = "";
    // normalize protocol+host+pathname (remove trailing slash)
    let path = u.pathname.replace(/\/$/,"");
    return (u.origin + path + (u.searchParams.toString()?("?"+u.searchParams.toString()):"")).toLowerCase();
  }catch{
    return String(raw||"").trim().toLowerCase();
  }
}

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
const DEFAULT_API_URL = "https://fiyattakip-api.onrender.com/api/fiyat-cek";
let API_URL = localStorage.getItem('fiyattakip_api_url') || DEFAULT_API_URL;

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

// ========== LOGIN MODAL ==========
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

// ========== SITELER (Link-only) ==========
const SITES = [
  { key:"trendyol", name:"Trendyol", build:q=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", build:q=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11", name:"N11", build:q=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazontr", name:"Amazon TR", build:q=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"pazarama", name:"Pazarama", build:q=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:q=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key:"idefix", name:"idefix", build:q=>`https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` },
];

// ========== FAVORILER ==========
let favCache = [];

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

function renderFavoritesPage(uid){
  const list = $("favList");
  if (!list) return;
  list.innerHTML = "";
  if (!favCache.length){
    list.innerHTML = `<div class="emptyState">Favori yok.</div>`;
    return;
  }
  for (const it of favCache){
    const card = document.createElement("div");
    card.className = "cardBox";
    card.innerHTML = `
      <div class="rowLine">
        <div>
          <div class="ttl">${it.siteName || "Favori"}</div>
          <div class="sub">${it.query || ""}</div>
        </div>
        <div class="actions">
          <button class="btnPrimary sm" type="button" data-open-url="${it.url||""}">Aç</button>
          <button class="btnGhost sm btnFav isFav" type="button" data-fav-url="${it.url||""}">❤️</button>
        </div>
      </div>
    `;
    card.querySelector("[data-open-url]")?.addEventListener("click", ()=>{
      if (it.url) window.open(it.url, "_blank", "noopener");
    });
    card.querySelector("[data-fav-url]")?.addEventListener("click", async ()=>{
      await toggleFavorite(uid, { url: it.url, siteKey: it.siteKey||"", siteName: it.siteName||"", query: it.query||"" });
      renderFavoritesPage(uid);
    });
    list.appendChild(card);
  }
  applyFavUI();
}

// ========== NORMAL ARAMA (Link-only) ==========
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

// ========== FIYAT ARAMA (Render API) ==========
async function fiyatAra(query) {
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
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urun: query })
    });

    if (!response.ok) {
      throw new Error(`API hatası: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      renderFiyatSonuclari(data);
      toast(`${data.fiyatlar?.length || 0} ürün bulundu`, "success");
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
        <p>Link moduna geçiliyor...</p>
      </div>
    `;
    // Fallback: normal arama
    setTimeout(() => {
      renderSiteList(container, query);
    }, 2000);
  }
}

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
  
  // En ucuz ürün banner'ı
  const cheapest = data.fiyatlar[0];
  html += `
    <div class="cheapestBanner">
      <div class="bannerHeader">
        <span class="badge">🏆 EN UCUZ</span>
        <span class="siteTag">${cheapest.site}</span>
      </div>
      <div class="productInfo">
        <div class="productTitle">${cheapest.urun}</div>
        <div class="productPrice">${cheapest.fiyat}</div>
        <div class="productActions">
          <button class="btnPrimary sm" onclick="window.open('${cheapest.link}', '_blank')">Ürüne Git</button>
          <button class="btnGhost sm btnFav" 
                  data-fav-url="${cheapest.link}" 
                  data-site-key="${cheapest.site.toLowerCase()}" 
                  data-site-name="${cheapest.site}" 
                  data-query="${data.query}">🤍</button>
        </div>
      </div>
    </div>
  `;

  // Diğer ürünler
  html += '<div class="productList">';
  
  data.fiyatlar.forEach((product, index) => {
    if (index === 0) return; // En ucuz zaten gösterildi
    
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

// ========== AUTH İŞLEMLERİ ==========
window.currentUser = null;

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
      // AI modu - önce AI ile optimize et, sonra fiyat ara
      toast("AI ile optimize ediliyor...", "info");
      // AI fonksiyonu yoksa normal fiyat ara
      await fiyatAra(query);
    } else {
      // Normal link modu
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

  // Favori butonları
  document.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("[data-fav-url]");
    if (!btn) return;
    
    const url = btn.getAttribute("data-fav-url") || "";
    const siteKey = btn.getAttribute("data-site-key") || "";
    const siteName = btn.getAttribute("data-site-name") || "";
    const query = btn.getAttribute("data-query") || "";
    
    if (!window.currentUser) {
      openLogin();
      return;
    }
    
    await toggleFavorite(window.currentUser.uid, { url, siteKey, siteName, query });
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
