import { auth, db, googleProvider, firebaseConfigLooksInvalid } from "./firebase.js";
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
  collection, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  loadAIConfig, hasAIConfig, saveGeminiKey, setSessionPin, clearAI,
  aiSearchLinks, aiImageToText
} from "./ai.js";

/* =========================
   PWA SW
========================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  });
}

/* =========================
   DOM
========================= */
const appMain = document.getElementById("appMain");

const btnInstall = document.getElementById("btnInstall");
const btnBell = document.getElementById("btnBell");
const btnLogout = document.getElementById("btnLogout");

const tabNormal = document.getElementById("tabNormal");
const tabAI = document.getElementById("tabAI");
const tabVision = document.getElementById("tabVision");
const btnAISettings = document.getElementById("btnAISettings");

const panelNormal = document.getElementById("panelNormal");
const panelAI = document.getElementById("panelAI");
const panelVision = document.getElementById("panelVision");

const sitePills = document.getElementById("sitePills");
const qEl = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");
const btnOpenSelected = document.getElementById("btnOpenSelected");
const searchResults = document.getElementById("searchResults");

const aiQuery = document.getElementById("aiQuery");
const btnAISearch = document.getElementById("btnAISearch");
const aiResults = document.getElementById("aiResults");

const visionFile = document.getElementById("visionFile");
const btnVision = document.getElementById("btnVision");
const btnLens = document.getElementById("btnLens");
const visionOut = document.getElementById("visionOut");

const favList = document.getElementById("favList");
const favSort = document.getElementById("favSort");
const btnRefreshFav = document.getElementById("btnRefreshFav");

const toastEl = document.getElementById("toast");

/* Auth modal */
const authWrap = document.getElementById("authWrap");
const authError = document.getElementById("authError");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const pass2Wrap = document.getElementById("pass2Wrap");
const btnAuthMain = document.getElementById("btnAuthMain");
const btnGoogle = document.getElementById("btnGoogle");
const btnClearCache = document.getElementById("btnClearCache");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const pass2El = document.getElementById("pass2");
const togglePw = document.getElementById("togglePw");
const togglePw2 = document.getElementById("togglePw2");

/* AI settings modal */
const aiSetWrap = document.getElementById("aiSetWrap");
const btnCloseAISet = document.getElementById("btnCloseAISet");
const gemKey = document.getElementById("gemKey");
const gemPin = document.getElementById("gemPin");
const rememberPin = document.getElementById("rememberPin");
const btnSaveAI = document.getElementById("btnSaveAI");
const btnClearAI = document.getElementById("btnClearAI");

/* Chart modal */
const chartWrap = document.getElementById("chartWrap");
const btnCloseChart = document.getElementById("btnCloseChart");
const bigTitle = document.getElementById("bigTitle");
const bigCanvas = document.getElementById("bigCanvas");

/* =========================
   State
========================= */
let mode = "login";
let currentUser = null;
let favCache = [];
let deferredPrompt = null;

const SITES = [
  { key:"trendyol", name:"Trendyol", build:(q)=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", build:(q)=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11", name:"N11", build:(q)=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazontr", name:"Amazon TR", build:(q)=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"pazarama", name:"Pazarama", build:(q)=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:(q)=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key:"idefix", name:"idefix", build:(q)=>`https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` },
];

const selectedSites = new Set(SITES.map(s=>s.key));

/* =========================
   Helpers
========================= */
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>toastEl.classList.add("hidden"), 2200);
}

function setAuthError(msg){
  authError.textContent = msg;
  authError.classList.remove("hidden");
}
function clearAuthError(){
  authError.classList.add("hidden");
  authError.textContent = "";
}
function openAuthModal(){ authWrap.classList.remove("hidden"); }
function closeAuthModal(){ authWrap.classList.add("hidden"); }

function openAISet(){ aiSetWrap.classList.remove("hidden"); }
function closeAISet(){ aiSetWrap.classList.add("hidden"); }

function isMobile(){
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function fmtTRY(n){
  if (n == null || Number.isNaN(Number(n))) return "Fiyat yok";
  try {
    return new Intl.NumberFormat("tr-TR", { style:"currency", currency:"TRY", maximumFractionDigits:0 }).format(Number(n));
  } catch {
    return `${Number(n)} ₺`;
  }
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function favDocId(siteKey, queryText){
  return `${siteKey}__${queryText.trim().toLowerCase()}`.replace(/[^\w\-_.]+/g,"_");
}

async function ensureNotifPermission(){
  if (!("Notification" in window)) { toast("Bildirim desteklenmiyor."); return false; }
  if (Notification.permission === "granted") return true;
  const res = await Notification.requestPermission();
  return res === "granted";
}

/* =========================
   Cache clean (Login ekranında)
========================= */
async function clearAllCaches(){
  try{
    // localStorage (bizim app keyleri)
    const keys = Object.keys(localStorage);
    for (const k of keys){
      if (k.startsWith("fiyattakip_")) localStorage.removeItem(k);
    }
    // caches
    if ("caches" in window){
      const names = await caches.keys();
      await Promise.all(names.map(n=>caches.delete(n)));
    }
    toast("Önbellek temizlendi.");
  }catch{
    toast("Önbellek temizleme hatası.");
  }
}

/* =========================
   PWA Install
========================= */
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  btnInstall.classList.remove("hidden");
});
btnInstall.addEventListener("click", async ()=>{
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(()=>{});
  deferredPrompt = null;
  btnInstall.classList.add("hidden");
});

/* =========================
   UI: Mode tabs
========================= */
function setModeTab(which){
  tabNormal.classList.toggle("active", which==="normal");
  tabAI.classList.toggle("active", which==="ai");
  tabVision.classList.toggle("active", which==="vision");

  panelNormal.classList.toggle("hidden", which!=="normal");
  panelAI.classList.toggle("hidden", which!=="ai");
  panelVision.classList.toggle("hidden", which!=="vision");
}

tabNormal.addEventListener("click", ()=>setModeTab("normal"));
tabAI.addEventListener("click", ()=>setModeTab("ai"));
tabVision.addEventListener("click", ()=>setModeTab("vision"));

/* =========================
   UI: Sites
========================= */
function renderSitePills(){
  sitePills.innerHTML = "";
  for (const s of SITES){
    const pill = document.createElement("div");
    pill.className = "sitePill" + (selectedSites.has(s.key) ? " active":"");
    pill.innerHTML = `<span class="dot"></span> ${escapeHtml(s.name)}`;
    pill.addEventListener("click", ()=>{
      if (selectedSites.has(s.key)) selectedSites.delete(s.key);
      else selectedSites.add(s.key);
      renderSitePills();
    });
    sitePills.appendChild(pill);
  }
}

/* =========================
   Firestore paths
========================= */
function favCol(){
  return collection(db, "users", currentUser.uid, "favorites");
}

/* =========================
   Favorites CRUD
========================= */
async function addFavorite(siteKey, siteName, queryText, url){
  const id = favDocId(siteKey, queryText);
  const ref = doc(db, "users", currentUser.uid, "favorites", id);

  const snap = await getDoc(ref);
  if (snap.exists()){
    toast("Zaten favoride.");
    return;
  }

  const data = {
    siteKey,
    siteName,
    query: queryText.trim(),
    queryLower: queryText.trim().toLowerCase(),
    url,
    createdAt: serverTimestamp(),

    // Worker/Action bunları doldurur:
    lastPrice: null,
    lastCheckedAt: null,
    status: "new",         // new | ok | blocked | error
    history: []            // [{t: ms, p: number}]
  };

  await setDoc(ref, data, { merge:false });
  toast("Favoriye eklendi.");
}

async function removeFavorite(siteKey, queryText){
  const id = favDocId(siteKey, queryText);
  const ref = doc(db, "users", currentUser.uid, "favorites", id);
  await deleteDoc(ref);
  toast("Favoriden kaldırıldı.");
}

async function requestInstantRetry(favId){
  // Worker bunu izleyebilir: retryAt güncellenince anında dene
  const ref = doc(db, "users", currentUser.uid, "favorites", favId);
  await updateDoc(ref, {
    retryAt: Date.now()
  });
  toast("Tekrar deneme istendi.");
}

/* =========================
   Load favorites (stable)
========================= */
async function loadFavorites(){
  if (!currentUser) return;

  const sort = favSort.value;
  const qy = query(favCol(), orderBy("queryLower", "asc"));
  const snaps = await getDocs(qy);

  favCache = snaps.docs.map(d=>{
    const x = d.data();
    return {
      id: d.id,
      siteKey: x.siteKey,
      siteName: x.siteName,
      query: x.query,
      queryLower: x.queryLower,
      url: x.url,
      lastPrice: x.lastPrice ?? null,
      status: x.status || "ok",
      lastCheckedAt: x.lastCheckedAt ?? null,
      history: Array.isArray(x.history) ? x.history : [],
      createdAtMs: x.createdAt?.toMillis?.() ?? 0
    };
  });

  favCache.sort((a,b)=>{
    if (sort==="price_asc"){
      if (a.lastPrice==null && b.lastPrice==null) return a.siteName.localeCompare(b.siteName);
      if (a.lastPrice==null) return 1;
      if (b.lastPrice==null) return -1;
      return a.lastPrice - b.lastPrice;
    }
    if (sort==="price_desc"){
      if (a.lastPrice==null && b.lastPrice==null) return a.siteName.localeCompare(b.siteName);
      if (a.lastPrice==null) return 1;
      if (b.lastPrice==null) return -1;
      return b.lastPrice - a.lastPrice;
    }
    if (sort==="site"){
      const s = a.siteName.localeCompare(b.siteName);
      if (s!==0) return s;
      return a.queryLower.localeCompare(b.queryLower);
    }
    // newest
    return b.createdAtMs - a.createdAtMs;
  });

  renderFavorites();
}

/* =========================
   Search rows (Normal)
========================= */
function renderSearchRows(queryText){
  const q = queryText.trim();
  if (!q){
    searchResults.className = "listBox emptyBox";
    searchResults.textContent = "Henüz arama yapılmadı.";
    return;
  }

  const selected = SITES.filter(s=>selectedSites.has(s.key));
  const rows = selected.map(s=>{
    const existing = favCache.find(f=>f.siteKey===s.key && f.queryLower===q.toLowerCase());
    return {
      site:s,
      url:s.build(q),
      fav: existing || null,
      lastPrice: existing?.lastPrice ?? null
    };
  });

  // sadece UI için: son fiyatı olanı yukarı al
  rows.sort((a,b)=>{
    const ap=a.lastPrice, bp=b.lastPrice;
    if (ap==null && bp==null) return a.site.name.localeCompare(b.site.name);
    if (ap==null) return 1;
    if (bp==null) return -1;
    return ap-bp;
  });

  searchResults.className = "listBox";
  searchResults.innerHTML = "";

  for (const r of rows){
    const item = document.createElement("div");
    item.className = "item";

    const priceHtml = (r.lastPrice!=null)
      ? `<div class="pricePill"><span>Son</span> ${fmtTRY(r.lastPrice)}</div>`
      : "";

    const favOn = !!r.fav;

    item.innerHTML = `
      <div class="itemLeft">
        <div class="siteName">${escapeHtml(r.site.name)}</div>
        <div class="queryText">${escapeHtml(q)}</div>
      </div>

      <div class="itemRight">
        ${priceHtml}
        <button class="btnOpen">Aç</button>
        <button class="btnFav ${favOn ? "on":""}">
          <svg class="miniIco" viewBox="0 0 24 24"><path d="M12 21s-7-4.35-9.5-8.5C.3 8.5 2.7 5 6.5 5c2 0 3.2 1 3.9 2 .7-1 1.9-2 3.9-2C18.1 5 20.5 8.5 21.5 12.5 19 16.65 12 21 12 21Z"/></svg>
          ${favOn ? "Favoride":"Favori Ekle"}
        </button>
      </div>
    `;

    item.querySelector(".btnOpen").addEventListener("click", ()=>{
      window.open(r.url, "_blank", "noopener");
    });

    item.querySelector(".btnFav").addEventListener("click", async ()=>{
      if (!currentUser){
        toast("Favori için giriş yapmalısın.");
        return;
      }
      if (favOn){
        await removeFavorite(r.site.key, q);
      } else {
        await addFavorite(r.site.key, r.site.name, q, r.url);
      }
      await loadFavorites();
      renderSearchRows(qEl.value);
    });

    searchResults.appendChild(item);
  }
}

/* =========================
   Charts
========================= */
const chartMap = new Map();
let bigChart = null;

function buildChart(canvas, fav){
  const h = fav.history || [];
  const labels = h.map(x=> new Date(x.t).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit" }));
  const data = h.map(x=> x.p);

  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Fiyat (₺)",
        data,
        tension: 0.25,
        pointRadius: 3
      }]
    },
    options: {
      responsive:true,
      plugins:{ legend:{ display:false } },
      scales:{ x:{ ticks:{ maxRotation:0 } }, y:{ beginAtZero:false } }
    }
  });
}

function openBigChart(fav){
  bigTitle.textContent = `${fav.siteName} • ${fav.query}`;
  chartWrap.classList.remove("hidden");

  if (bigChart){ bigChart.destroy(); bigChart=null; }
  bigChart = buildChart(bigCanvas, fav);
}

btnCloseChart.addEventListener("click", ()=>{
  chartWrap.classList.add("hidden");
  if (bigChart){ bigChart.destroy(); bigChart=null; }
});

/* =========================
   Favorites UI
========================= */
function renderFavorites(){
  if (!favCache.length){
    favList.className = "favList emptyBox";
    favList.textContent = "Favori yok.";
    return;
  }

  favList.className = "favList";
  favList.innerHTML = "";

  for (const f of favCache){
    const el = document.createElement("div");
    el.className = "favItem";

    const priceText = f.lastPrice != null ? fmtTRY(f.lastPrice) : "Fiyat yok";
    const statusBadge = (f.status && f.status !== "ok")
      ? ` <span style="margin-left:8px;color:#7a5b00;font-weight:900;">⚠ ${escapeHtml(f.status)}</span>`
      : "";

    el.innerHTML = `
      <div class="favTop">
        <div>
          <div class="favName">${escapeHtml(f.query)}${statusBadge}</div>
          <div class="favMeta">${escapeHtml(f.siteName)}</div>
        </div>
        <div class="favPrice">${priceText}</div>
      </div>

      <div class="favBtns">
        <button class="btnAction btnOpen">Siteyi Aç</button>
        <button class="btnCopy">Copy Link</button>
        <button class="btnWarn btnRetry">Şimdi tekrar dene</button>
        <button class="btnAction btnDel">Sil</button>
      </div>

      <div class="chartBox">
        <div class="chartArea"></div>
        <button class="btnBig">Grafiği büyüt</button>
      </div>
    `;

    el.querySelector(".btnOpen").addEventListener("click", ()=>{
      window.open(f.url, "_blank", "noopener");
    });

    el.querySelector(".btnCopy").addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(f.url);
        toast("Link kopyalandı.");
      }catch{
        prompt("Link kopyala:", f.url);
      }
    });

    el.querySelector(".btnRetry").addEventListener("click", async ()=>{
      // kullanıcı linke bakacak, sonra worker anında denesin
      window.open(f.url, "_blank", "noopener");
      await requestInstantRetry(f.id);
    });

    el.querySelector(".btnDel").addEventListener("click", async ()=>{
      if (!confirm("Favoriyi silmek istiyor musun?")) return;
      await deleteDoc(doc(db, "users", currentUser.uid, "favorites", f.id));
      await loadFavorites();
    });

    const chartArea = el.querySelector(".chartArea");
    const h = f.history || [];
    if (h.length < 2){
      chartArea.innerHTML = `<div class="chartHint">Grafik için en az 2 fiyat kaydı gerekir. (Worker history doldurmalı)</div>`;
    } else {
      const canvas = document.createElement("canvas");
      canvas.height = 120;
      chartArea.appendChild(canvas);

      if (chartMap.has(f.id)){
        try { chartMap.get(f.id).destroy(); } catch {}
        chartMap.delete(f.id);
      }
      const ch = buildChart(canvas, f);
      chartMap.set(f.id, ch);
    }

    el.querySelector(".btnBig").addEventListener("click", ()=>{
      if ((f.history||[]).length < 2){
        toast("Grafik için en az 2 fiyat lazım.");
        return;
      }
      openBigChart(f);
    });

    favList.appendChild(el);
  }
}

/* =========================
   Open selected sites
========================= */
function openSelectedSites(queryText){
  const q = queryText.trim();
  if (!q) return;
  const selected = SITES.filter(s=>selectedSites.has(s.key));
  for (const s of selected){
    window.open(s.build(q), "_blank", "noopener");
  }
}

/* =========================
   AI UI
========================= */
btnAISettings.addEventListener("click", ()=>{
  const cfg = loadAIConfig();
  gemKey.value = ""; // güvenlik için boş aç
  gemPin.value = "";
  rememberPin.checked = false;
  openAISet();
});

btnCloseAISet.addEventListener("click", ()=>closeAISet());

btnSaveAI.addEventListener("click", async ()=>{
  try{
    await saveGeminiKey({
      apiKey: gemKey.value.trim(),
      pin: gemPin.value,
      rememberPin: rememberPin.checked
    });
    if (rememberPin.checked) setSessionPin(gemPin.value);
    toast("AI ayarları kaydedildi.");
    closeAISet(); // ✅ OK deyince kapanır
  }catch(e){
    toast("AI kaydetme hata: " + (e?.message || e));
  }
});

btnClearAI.addEventListener("click", ()=>{
  clearAI();
  toast("AI ayarları sıfırlandı.");
  closeAISet();
});

btnAISearch.addEventListener("click", async ()=>{
  const q = aiQuery.value.trim();
  if (!q){ toast("AI arama için yazı gir."); return; }
  if (!hasAIConfig()){ toast("Önce AI Ayarları'ndan key gir."); return; }

  aiResults.className = "listBox";
  aiResults.innerHTML = `<div class="emptyBox">Düşünüyor...</div>`;

  try{
    // PIN sor (oturum hatırla açıksa sessionPin kullanır, istemez)
    const pin = prompt("PIN:", "");
    if (pin == null) return;

    const raw = await aiSearchLinks({ query: q, pin });
    let arr;
    try{ arr = JSON.parse(raw); }catch{ arr = []; }

    if (!Array.isArray(arr) || !arr.length){
      aiResults.className = "listBox emptyBox";
      aiResults.textContent = "AI sonuç üretemedi.";
      return;
    }

    aiResults.innerHTML = "";
    for (const r of arr){
      const site = (r.site || "Site");
      const url = (r.url || "#");
      const why = (r.why || "");

      const box = document.createElement("div");
      box.className = "item";
      box.innerHTML = `
        <div class="itemLeft">
          <div class="siteName">${escapeHtml(site)}</div>
          <div class="queryText">${escapeHtml(why)}</div>
        </div>
        <div class="itemRight">
          <button class="btnOpen">Aç</button>
          <button class="btnFav">Favori Ekle</button>
        </div>
      `;

      box.querySelector(".btnOpen").addEventListener("click", ()=>window.open(url,"_blank","noopener"));

      box.querySelector(".btnFav").addEventListener("click", async ()=>{
        if (!currentUser){ toast("Favori için giriş yap."); return; }
        const siteObj = SITES.find(s=>site.toLowerCase().includes(s.name.toLowerCase())) || null;
        const siteKey = siteObj?.key || "ai";
        const siteName = siteObj?.name || site;
        await addFavorite(siteKey, siteName, q, url);
        await loadFavorites();
      });

      aiResults.appendChild(box);
    }

  }catch(e){
    aiResults.className = "listBox emptyBox";
    aiResults.textContent = "AI sonuç üretemedi.";
  }
});

/* Vision: image -> text -> fill AI query */
btnLens.addEventListener("click", ()=>{
  window.open("https://lens.google.com/", "_blank", "noopener");
});

btnVision.addEventListener("click", async ()=>{
  const f = visionFile.files?.[0];
  if (!f){ toast("Önce görsel seç."); return; }
  if (!hasAIConfig()){ toast("Önce AI Ayarları'ndan key gir."); return; }

  visionOut.className = "listBox";
  visionOut.innerHTML = `<div class="emptyBox">Görsel analiz ediliyor...</div>`;

  try{
    const pin = prompt("PIN:", "");
    if (pin == null) return;

    const base64 = await fileToBase64(f);
    const mimeType = f.type || "image/jpeg";
    const text = await aiImageToText({ imageBase64: base64, mimeType, pin });

    visionOut.innerHTML = `
      <div class="emptyBox"><b>Çıkan metin:</b><br>${escapeHtml(text)}</div>
    `;

    // Otomatik AI arama kutusuna bas
    aiQuery.value = text.split("\n").slice(-1)[0].trim() || text.trim();
    setModeTab("ai");
    toast("Metin alındı. AI aramada kullanabilirsin.");

  }catch(e){
    visionOut.className = "listBox emptyBox";
    visionOut.textContent = "Görsel okunamadı. İstersen Lens'e geç.";
  }
});

function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=>{
      const s = String(r.result || "");
      // data:image/...;base64,XXXX
      const idx = s.indexOf("base64,");
      if (idx >= 0) resolve(s.slice(idx + 7));
      else reject(new Error("base64 parse"));
    };
    r.onerror = ()=>reject(new Error("read error"));
    r.readAsDataURL(file);
  });
}

/* =========================
   Auth UI events
========================= */
function setAuthMode(m){
  mode = m;
  clearAuthError();
  if (mode==="login"){
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    pass2Wrap.classList.add("hidden");
    btnAuthMain.textContent = "Giriş Yap";
  } else {
    tabLogin.classList.remove("active");
    tabRegister.classList.add("active");
    pass2Wrap.classList.remove("hidden");
    btnAuthMain.textContent = "Hesap Oluştur";
  }
}

tabLogin.addEventListener("click", ()=>setAuthMode("login"));
tabRegister.addEventListener("click", ()=>setAuthMode("register"));

togglePw.addEventListener("click", ()=>{ passEl.type = (passEl.type==="password") ? "text" : "password"; });
togglePw2.addEventListener("click", ()=>{ pass2El.type = (pass2El.type==="password") ? "text" : "password"; });

btnAuthMain.addEventListener("click", async ()=>{
  clearAuthError();

  if (firebaseConfigLooksInvalid()){
    setAuthError("Firebase config eksik/hatalı.");
    return;
  }

  const email = emailEl.value.trim();
  const pass = passEl.value;

  try{
    if (mode==="register"){
      const pass2 = pass2El.value;
      if (pass !== pass2){
        setAuthError("Şifreler aynı değil.");
        return;
      }
      await createUserWithEmailAndPassword(auth, email, pass);
      toast("Hesap oluşturuldu.");
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Giriş başarılı.");
    }
  }catch(e){
    setAuthError(prettyAuthError(e));
  }
});

btnGoogle.addEventListener("click", async ()=>{
  clearAuthError();
  try{
    if (isMobile()){
      await signInWithRedirect(auth, googleProvider);
    } else {
      await signInWithPopup(auth, googleProvider);
    }
  }catch(e){
    setAuthError(prettyAuthError(e));
  }
});

btnLogout.addEventListener("click", async ()=>{
  try{
    await signOut(auth);
    toast("Çıkış yapıldı.");
  }catch{}
});

btnClearCache.addEventListener("click", clearAllCaches);

/* Redirect result catch */
getRedirectResult(auth).catch(()=>{});

/* =========================
   Main events
========================= */
renderSitePills();
setModeTab("normal");

btnSearch.addEventListener("click", ()=>renderSearchRows(qEl.value));
qEl.addEventListener("keydown", (e)=>{
  if (e.key==="Enter"){ e.preventDefault(); btnSearch.click(); }
});

btnClear.addEventListener("click", ()=>{
  qEl.value = "";
  searchResults.className = "listBox emptyBox";
  searchResults.textContent = "Henüz arama yapılmadı.";
});

btnOpenSelected.addEventListener("click", ()=>openSelectedSites(qEl.value));

favSort.addEventListener("change", ()=>loadFavorites());
btnRefreshFav.addEventListener("click", ()=>loadFavorites());

btnBell.addEventListener("click", async ()=>{
  const ok = await ensureNotifPermission();
  toast(ok ? "Bildirim izni açık." : "Bildirim izni verilmedi.");
});

/* =========================
   Auth state: içerik gizleme
========================= */
appMain.classList.add("hidden");
openAuthModal();

onAuthStateChanged(auth, async (user)=>{
  currentUser = user || null;

  if (currentUser){
    closeAuthModal();
    appMain.classList.remove("hidden");
    await loadFavorites();
    if (qEl.value.trim()) renderSearchRows(qEl.value.trim());
  } else {
    appMain.classList.add("hidden");
    openAuthModal();
  }
});

/* =========================
   Errors
========================= */
function prettyAuthError(e){
  const msg = String(e?.message || e || "");

  if (msg.includes("auth/unauthorized-domain")){
    return "Google giriş hatası: unauthorized-domain. Firebase → Authentication → Settings → Authorized domains kısmına fiyattakip.github.io ekle.";
  }
  if (msg.includes("auth/invalid-credential")) return "Hatalı giriş bilgisi.";
  if (msg.includes("auth/email-already-in-use")) return "Bu email zaten kayıtlı.";
  if (msg.includes("auth/weak-password")) return "Şifre çok zayıf.";
  return "Hata: " + msg;
}
