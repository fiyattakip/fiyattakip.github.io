// app.js (FULL - güncel)
// - AI tam entegre (metin + görsel/kamera + yorum butonları)
// - Oturum hatırla (PIN RAM'de)
// - Cache temizleme butonu (SW + storage)
// - Google login redirect/popup daha stabil

import { auth, db, googleProvider } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signInWithPopup,
  getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc,
  serverTimestamp, updateDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ AI module
import {
  hasAIConfig,
  saveAIConfigEncrypted,
  runAI,
  runAIVision,
  setSessionPin,
  getSessionPin
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

const authWrap = document.getElementById("authWrap");
const authError = document.getElementById("authError");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const pass2Wrap = document.getElementById("pass2Wrap");
const btnAuthMain = document.getElementById("btnAuthMain");
const btnGoogle = document.getElementById("btnGoogle");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const pass2El = document.getElementById("pass2");
const togglePw = document.getElementById("togglePw");
const togglePw2 = document.getElementById("togglePw2");

const btnLogout = document.getElementById("btnLogout");
const btnBell = document.getElementById("btnBell");
const btnAI = document.getElementById("btnAI"); // topbardaki AI ikon butonu

const sitePills = document.getElementById("sitePills");
const qEl = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");
const btnOpenSelected = document.getElementById("btnOpenSelected");
const searchResults = document.getElementById("searchResults");

const favList = document.getElementById("favList");
const favSort = document.getElementById("favSort");
const btnRefreshFav = document.getElementById("btnRefreshFav");

const toast = document.getElementById("toast");

const chartWrap = document.getElementById("chartWrap");
const btnCloseChart = document.getElementById("btnCloseChart");
const bigTitle = document.getElementById("bigTitle");
const bigCanvas = document.getElementById("bigCanvas");

/* =========================
   State
========================= */
let mode = "login"; // login | register
let currentUser = null;
let favCache = [];  // loaded favorites
let notifLog = [];  // local notif history

// siteler
const SITES = [
  { key:"trendyol", name:"Trendyol", build:(q)=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}&sst=PRICE_BY_ASC` },
  { key:"hepsiburada", name:"Hepsiburada", build:(q)=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}&sorting=priceAsc` },
  { key:"n11", name:"N11", build:(q)=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}&srt=PRICE_LOW` },
  { key:"amazontr", name:"Amazon TR", build:(q)=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}&s=price-asc-rank` },
  { key:"pazarama", name:"Pazarama", build:(q)=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}&sort=price_asc` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:(q)=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}&orderby=price_asc` },
  { key:"idefix", name:"idefix", build:(q)=>`https://www.idefix.com/arama/?q=${encodeURIComponent(q)}&s=price-asc` },
];

const selectedSites = new Set(SITES.map(s=>s.key)); // default all

/* =========================
   Helpers
========================= */
function showToast(msg){
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>toast.classList.add("hidden"), 2400);
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

function nowISO(){ return new Date().toISOString(); }

function safeNum(v){
  const n = Number(String(v).replace(/[^\d.,]/g,"").replace(",","."));
  return Number.isFinite(n) ? n : null;
}

function favDocId(siteKey, queryText){
  return `${siteKey}__${queryText.trim().toLowerCase()}`.replace(/[^\w\-_.]+/g,"_");
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

/* =========================
   Notifications
========================= */
function loadNotifLog(){
  try { notifLog = JSON.parse(localStorage.getItem("fiyattakip_notifs")||"[]"); } catch { notifLog=[]; }
}
function pushNotif(title, body){
  const item = { t: Date.now(), title, body };
  notifLog.unshift(item);
  notifLog = notifLog.slice(0, 30);
  localStorage.setItem("fiyattakip_notifs", JSON.stringify(notifLog));
}

async function ensureNotifPermission(){
  if (!("Notification" in window)) {
    showToast("Tarayıcı bildirim desteklemiyor.");
    return false;
  }
  if (Notification.permission === "granted") return true;
  const res = await Notification.requestPermission();
  return res === "granted";
}

function fireBrowserNotif(title, body){
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try { new Notification(title, { body }); } catch {}
}

/* =========================
   Service Worker Cache Clean Button
   - topbara otomatik "Cache Temizle" ekler
========================= */
function injectCacheClearButton(){
  const topActions = document.querySelector(".topActions");
  if (!topActions) return;
  if (document.getElementById("btnCacheClear")) return;

  const btn = document.createElement("button");
  btn.id = "btnCacheClear";
  btn.className = "btnGhost";
  btn.title = "Cache/Storage temizle (yenileme gerekebilir)";
  btn.textContent = "Cache Temizle";

  btn.addEventListener("click", async ()=>{
    try{
      showToast("Temizleniyor...");
      // caches
      if ("caches" in window){
        const keys = await caches.keys();
        await Promise.all(keys.map(k=>caches.delete(k)));
      }
      // localStorage (kritik ayarları bırakmak istersen burayı filtreleyebilirsin)
      // Sadece SW/AI ile ilgili anahtarları temizleyelim:
      const keys = Object.keys(localStorage);
      for (const k of keys){
        if (k.startsWith("fiyattakip_")) localStorage.removeItem(k);
      }
      // SW unregister
      if ("serviceWorker" in navigator){
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=>r.unregister()));
      }
      showToast("Temizlendi. Sayfa yenileniyor...");
      await sleep(600);
      location.reload();
    }catch(e){
      console.error(e);
      alert("Cache temizleme hatası:\n" + (e?.message || e));
    }
  });

  topActions.prepend(btn);
}

/* =========================
   UI: Sites
========================= */
function renderSitePills(){
  sitePills.innerHTML = "";
  for (const s of SITES){
    const pill = document.createElement("div");
    pill.className = "sitePill" + (selectedSites.has(s.key) ? " active":"");
    pill.innerHTML = `<span class="dot"></span> ${s.name}`;
    pill.addEventListener("click", ()=>{
      if (selectedSites.has(s.key)) selectedSites.delete(s.key);
      else selectedSites.add(s.key);
      renderSitePills();
      // arama varsa canlı güncelle
      if (qEl.value.trim()) renderSearchRows(qEl.value.trim());
    });
    sitePills.appendChild(pill);
  }
}

/* =========================
   AI UI Inject (normal aramanın ÜSTÜNE)
   - Metin AI arama
   - Görsel/Kamera AI arama
========================= */
function injectAISectionAboveSearch(){
  const searchCard = qEl?.closest(".card");
  if (!searchCard) return;
  if (document.getElementById("aiSearchBox")) return;

  const box = document.createElement("div");
  box.id = "aiSearchBox";
  box.style.marginBottom = "14px";
  box.style.padding = "14px";
  box.style.borderRadius = "18px";
  box.style.border = "1px dashed rgba(15,23,42,.16)";
  box.style.background = "rgba(255,255,255,.68)";

  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div style="font-weight:950;font-size:16px;">AI Arama</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="btnAISetup" class="btnGhost" type="button">AI Ayarları</button>
        <button id="btnAIClear" class="btnGhost" type="button">AI Sıfırla</button>
      </div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
      <button id="btnAITextSearch" class="btnPrimary" type="button" style="height:44px;border-radius:16px;min-width:140px;">AI Metin Ara</button>
      <label class="btnOpen" style="height:44px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;">
        AI Görsel/Kamera
        <input id="aiImageInput" type="file" accept="image/*" capture="environment" style="display:none;" />
      </label>
    </div>

    <div id="aiOut" style="margin-top:10px;color:#334155;font-weight:800;"></div>
  `;

  // searchRow'un üstüne ekle
  const firstChild = searchCard.firstElementChild;
  searchCard.insertBefore(box, firstChild);

  // handlers
  const out = box.querySelector("#aiOut");
  const btnSetup = box.querySelector("#btnAISetup");
  const btnClear = box.querySelector("#btnAIClear");
  const btnText = box.querySelector("#btnAITextSearch");
  const inpImg = box.querySelector("#aiImageInput");

  btnSetup.addEventListener("click", async ()=>{
    try{
      // key kayıtlı değilse kurulum
      if (!hasAIConfig()){
        const apiKey = prompt("Gemini API Key (cihazında ŞİFRELİ saklanır):");
        if (!apiKey) return;

        const pin = prompt("PIN/Şifre belirle (bu PIN kaydedilmez):");
        if (!pin) return;

        const remember = confirm("Oturum hatırla? (Sayfa kapanana kadar tekrar sormaz)");
        await saveAIConfigEncrypted({ apiKey, pin, rememberPin: remember });

        if (remember) setSessionPin(pin);
        showToast("AI ayarları kaydedildi.");
        out.textContent = "✅ AI hazır.";
        return;
      }

      // key var: pin'i bu oturumda hatırla
      const rememberNow = confirm("Bu oturumda PIN hatırlansın mı?");
      if (rememberNow){
        const pin = prompt("PIN/Şifre:");
        if (!pin) return;
        setSessionPin(pin);
        showToast("PIN oturumda hatırlandı.");
        out.textContent = "✅ PIN oturumda.";
      } else {
        showToast("Tamam. AI çalışırken PIN sorabilir.");
      }
    }catch(e){
      console.error(e);
      alert("AI Ayar hatası:\n" + (e?.message || e));
    }
  });

  btnClear.addEventListener("click", ()=>{
    // ai.js içinde clear fonksiyonunu export etmedik; sadece storage keyini silmek yeterli
    localStorage.removeItem("fiyattakip_ai_cfg_v3");
    localStorage.removeItem("fiyattakip_ai_cfg_v2");
    showToast("AI sıfırlandı.");
    out.textContent = "AI ayarları silindi.";
  });

  btnText.addEventListener("click", async ()=>{
    try{
      if (!currentUser){ showToast("Önce giriş yap."); return; }

      const q = qEl.value.trim();
      const promptText = prompt(
        "AI Metin Arama (ürün önerisi / yorum):",
        q ? `Şu ürünü kısaca değerlendir ve alınır mı söyle: ${q}` : "Ne arıyorsun? Kısa yaz."
      );
      if (!promptText) return;

      let pin = getSessionPin();
      if (!pin){
        pin = prompt("PIN/Şifre (AI):");
        if (!pin) return;
      }

      out.textContent = "⏳ AI çalışıyor...";
      const ans = await runAI({ prompt: promptText, pin, timeoutMs: 45000 });
      out.textContent = ans || "AI boş cevap döndü.";
    }catch(e){
      console.error(e);
      out.textContent = "";
      alert("AI hata:\n" + (e?.message || e));
    }
  });

  inpImg.addEventListener("change", async ()=>{
    try{
      if (!currentUser){ showToast("Önce giriş yap."); inpImg.value=""; return; }
      const file = inpImg.files?.[0];
      if (!file) return;

      let pin = getSessionPin();
      if (!pin){
        pin = prompt("PIN/Şifre (AI):");
        if (!pin) { inpImg.value=""; return; }
      }

      out.textContent = "⏳ Görsel analiz ediliyor...";

      // base64
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

      const promptText = "Bu görseldeki ürünü tanımla, ne olduğunu söyle ve Türkiye'de hangi kategoride aranır? 5 madde öneri ver.";

      const ans = await runAIVision({
        prompt: promptText,
        imageBase64: b64,
        mimeType: file.type || "image/jpeg",
        pin
      });

      out.textContent = ans || "AI boş cevap döndü.";
    }catch(e){
      console.error(e);
      alert("AI Görsel hata:\n" + (e?.message || e));
    }finally{
      inpImg.value = "";
    }
  });
}

/* =========================
   Search rows (normal arama)
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

  rows.sort((a,b)=>{
    const ap = a.lastPrice, bp = b.lastPrice;
    if (ap == null && bp == null) return a.site.name.localeCompare(b.site.name);
    if (ap == null) return 1;
    if (bp == null) return -1;
    return ap - bp; // ucuzdan
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
        <div class="siteName">${r.site.name}</div>
        <div class="queryText">${escapeHtml(q)}</div>
      </div>

      <div class="itemRight">
        ${priceHtml}
        <button class="btnOpen" type="button">Aç</button>

        <button class="btnFav ${favOn ? "on":""}" type="button">
          <svg class="miniIco" viewBox="0 0 24 24"><path d="M12 21s-7-4.35-9.5-8.5C.3 8.5 2.7 5 6.5 5c2 0 3.2 1 3.9 2 .7-1 1.9-2 3.9-2C18.1 5 20.5 8.5 21.5 12.5 19 16.65 12 21 12 21Z"/></svg>
          ${favOn ? "Favoride":"Favori Ekle"}
        </button>

        <button class="btnGhost btnAIReview" type="button" title="AI yorum">
          AI Yorum
        </button>
      </div>
    `;

    item.querySelector(".btnOpen").addEventListener("click", ()=>{
      window.open(r.url, "_blank", "noopener");
    });

    item.querySelector(".btnFav").addEventListener("click", async ()=>{
      if (!currentUser) return;

      if (favOn){
        await removeFavorite(r.site.key, q);
      } else {
        await addFavorite(r.site.key, r.site.name, q, r.url);
      }
      await loadFavorites();
      renderSearchRows(qEl.value);
    });

    item.querySelector(".btnAIReview").addEventListener("click", async ()=>{
      try{
        if (!currentUser){ showToast("Önce giriş yap."); return; }
        if (!hasAIConfig()){ showToast("AI Ayarları'ndan key gir."); return; }

        let pin = getSessionPin();
        if (!pin){
          pin = prompt("PIN/Şifre (AI):");
          if (!pin) return;
        }

        showToast("AI yorum alınıyor...");
        const promptText =
          `Ürün: "${q}"\nSite: ${r.site.name}\n` +
          `Kısa değerlendirme yap: alınır mı, dikkat edilmesi gerekenler, alternatifler. 5 madde.`

        const ans = await runAI({ prompt: promptText, pin, timeoutMs: 45000 });
        alert(ans || "AI boş cevap döndü.");
      }catch(e){
        console.error(e);
        alert("AI hata:\n" + (e?.message || e));
      }
    });

    searchResults.appendChild(item);
  }
}

/* =========================
   Firestore: Favorites
========================= */
function favCol(){
  return collection(db, "users", currentUser.uid, "favorites");
}

async function addFavorite(siteKey, siteName, queryText, url){
  const id = favDocId(siteKey, queryText);
  const ref = doc(db, "users", currentUser.uid, "favorites", id);

  const existing = await getDoc(ref);
  if (existing.exists()){
    showToast("Zaten favoride.");
    return;
  }

  const data = {
    siteKey,
    siteName,
    query: queryText.trim(),
    queryLower: queryText.trim().toLowerCase(),
    url,
    createdAt: serverTimestamp(),
    lastPrice: null,
    history: [] // [{t: ISO, p: number}]
  };

  await setDoc(ref, data, { merge:false });
  showToast("Favoriye eklendi.");
}

async function removeFavorite(siteKey, queryText){
  const id = favDocId(siteKey, queryText);
  const ref = doc(db, "users", currentUser.uid, "favorites", id);
  await deleteDoc(ref);
  showToast("Favoriden kaldırıldı.");
}

async function addPriceToFavorite(favId, price){
  const ref = doc(db, "users", currentUser.uid, "favorites", favId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const d = snap.data();
  const history = Array.isArray(d.history) ? d.history.slice() : [];
  history.push({ t: nowISO(), p: price });

  await updateDoc(ref, {
    lastPrice: price,
    history
  });
}

async function loadFavorites(){
  if (!currentUser) return;

  const sort = favSort.value;

  const qy = query(favCol(), orderBy("queryLower", "asc"));
  const snaps = await getDocs(qy);

  favCache = snaps.docs.map(docu=>{
    const d = docu.data();
    return {
      id: docu.id,
      siteKey: d.siteKey,
      siteName: d.siteName,
      query: d.query,
      queryLower: d.queryLower,
      url: d.url,
      lastPrice: d.lastPrice ?? null,
      history: Array.isArray(d.history) ? d.history : [],
      createdAtMs: d.createdAt?.toMillis?.() ?? 0
    };
  });

  // Sort
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
    if (sort==="newest"){
      return b.createdAtMs - a.createdAtMs;
    }
    if (sort==="site"){
      const s = a.siteName.localeCompare(b.siteName);
      if (s!==0) return s;
      return a.queryLower.localeCompare(b.queryLower);
    }
    return 0;
  });

  renderFavorites();
  checkDropsOnLoad();
}

/* =========================
   % drop check (demo)
========================= */
function checkDropsOnLoad(){
  for (const f of favCache){
    const h = f.history || [];
    if (h.length < 2) continue;
    const prev = h[h.length-2]?.p;
    const last = h[h.length-1]?.p;
    if (prev == null || last == null) continue;

    const diff = (prev - last) / prev * 100;
    if (diff >= 10){ // ✅ yüzde 10 ve üzeri
      const title = `${f.siteName}: %${diff.toFixed(1)} düşüş`;
      const body = `${f.query} → ${fmtTRY(prev)} → ${fmtTRY(last)}`;
      pushNotif(title, body);
      fireBrowserNotif(title, body);
    }
  }
}

/* =========================
   Charts
========================= */
const chartMap = new Map(); // favId -> Chart instance
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
      scales:{
        x:{ ticks:{ maxRotation:0 } },
        y:{ beginAtZero:false }
      }
    }
  });
}

function openBigChart(fav){
  bigTitle.textContent = `${fav.siteName} • ${fav.query}`;
  chartWrap.classList.remove("hidden");

  if (bigChart){
    bigChart.destroy();
    bigChart = null;
  }
  bigChart = buildChart(bigCanvas, fav);
}

btnCloseChart.addEventListener("click", ()=>{
  chartWrap.classList.add("hidden");
  if (bigChart){
    bigChart.destroy();
    bigChart = null;
  }
});

/* =========================
   Favorites UI
   - AI Yorum butonu eklendi
   - (Not: otomatik fiyat çekme tarayıcı kısıtları nedeniyle burada yok;
     fiyat geçmişi için şimdilik "Fiyat yapıştır" kullanılabilir.)
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

    el.innerHTML = `
      <div class="favTop">
        <div>
          <div class="favName">${escapeHtml(f.query)}</div>
          <div class="favMeta">${escapeHtml(f.siteName)} • Link gizli</div>
        </div>
        <div class="favPrice">${priceText}</div>
      </div>

      <div class="favBtns">
        <button class="btnOpen" type="button">${escapeHtml(f.siteName)} Aç</button>
        <button class="btnCopy" type="button">Copy Link</button>
        <button class="btnGhost btnFavAI" type="button">AI Yorum</button>
        <button class="btnAddPrice" type="button">Fiyat Yapıştır</button>
        <button class="btnDelete" type="button">Sil</button>
      </div>

      <div class="chartBox">
        <div class="chartArea"></div>
        <button class="btnBig" type="button">Grafiği büyüt</button>
      </div>
    `;

    // Open
    el.querySelector(".btnOpen").addEventListener("click", ()=>{
      window.open(f.url, "_blank", "noopener");
    });

    // Copy
    el.querySelector(".btnCopy").addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(f.url);
        showToast("Link kopyalandı.");
      }catch{
        prompt("Link kopyala:", f.url);
      }
    });

    // AI Review
    el.querySelector(".btnFavAI").addEventListener("click", async ()=>{
      try{
        if (!hasAIConfig()){ showToast("AI Ayarları'ndan key gir."); return; }
        let pin = getSessionPin();
        if (!pin){
          pin = prompt("PIN/Şifre (AI):");
          if (!pin) return;
        }
        showToast("AI yorum alınıyor...");
        const promptText =
          `Ürün: "${f.query}"\nSite: ${f.siteName}\n` +
          `Kısa değerlendirme yap: kalite, muadil, alınır mı, dikkat edilmesi gerekenler. 6 madde.`;
        const ans = await runAI({ prompt: promptText, pin, timeoutMs: 45000 });
        alert(ans || "AI boş cevap döndü.");
      }catch(e){
        console.error(e);
        alert("AI hata:\n" + (e?.message || e));
      }
    });

    // Price paste (geçici çözüm)
    el.querySelector(".btnAddPrice").addEventListener("click", async ()=>{
      const v = prompt("Fiyat (₺) gir (kopyaladığın fiyatı yapıştır):", f.lastPrice ?? "");
      if (v == null) return;
      const p = safeNum(v);
      if (p == null) { showToast("Geçersiz fiyat."); return; }
      await addPriceToFavorite(f.id, p);
      await loadFavorites();
      showToast("Fiyat eklendi.");
    });

    // Delete
    el.querySelector(".btnDelete").addEventListener("click", async ()=>{
      if (!confirm("Favoriyi silmek istiyor musun?")) return;
      await deleteDoc(doc(db, "users", currentUser.uid, "favorites", f.id));
      await loadFavorites();
    });

    // Chart render
    const chartArea = el.querySelector(".chartArea");
    const h = f.history || [];
    if (h.length < 2){
      chartArea.innerHTML = `<div class="chartHint">Grafik için en az 2 fiyat kaydı lazım.</div>`;
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
        showToast("Grafik için en az 2 fiyat lazım.");
        return;
      }
      openBigChart(f);
    });

    favList.appendChild(el);
  }
}

/* =========================
   Open Selected Sites
========================= */
function openSelectedSites(queryText){
  const q = queryText.trim();
  if (!q) return;

  const selected = SITES.filter(s=>selectedSites.has(s.key));

  const rows = selected.map(s=>{
    const existing = favCache.find(f=>f.siteKey===s.key && f.queryLower===q.toLowerCase());
    return { site:s, url:s.build(q), lastPrice: existing?.lastPrice ?? null };
  });

  rows.sort((a,b)=>{
    const ap=a.lastPrice, bp=b.lastPrice;
    if (ap==null && bp==null) return 0;
    if (ap==null) return 1;
    if (bp==null) return -1;
    return ap-bp;
  });

  for (const r of rows){
    window.open(r.url, "_blank", "noopener");
  }
}

/* =========================
   Auth UI events
========================= */
function setMode(m){
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

tabLogin.addEventListener("click", ()=>setMode("login"));
tabRegister.addEventListener("click", ()=>setMode("register"));

togglePw.addEventListener("click", ()=>{
  passEl.type = (passEl.type==="password") ? "text" : "password";
});
togglePw2.addEventListener("click", ()=>{
  pass2El.type = (pass2El.type==="password") ? "text" : "password";
});

btnAuthMain.addEventListener("click", async ()=>{
  clearAuthError();
  const email = emailEl.value.trim();
  const pass = passEl.value;

  try{
    if (mode==="register"){
      const pass2 = pass2El.value;
      if (pass !== pass2) {
        setAuthError("Şifreler aynı değil.");
        return;
      }
      await createUserWithEmailAndPassword(auth, email, pass);
      showToast("Hesap oluşturuldu.");
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      showToast("Giriş başarılı.");
    }
  }catch(e){
    setAuthError(prettyAuthError(e));
  }
});

btnGoogle.addEventListener("click", async ()=>{
  clearAuthError();
  try{
    // Mobilde popup yerine redirect daha sağlam
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
    showToast("Çıkış yapıldı.");
  }catch{}
});

/* Redirect result catch */
getRedirectResult(auth).then((res)=>{
  // bazen redirect dönüşünde UI takılı kalabiliyor: auth state zaten değişecektir
}).catch(()=>{});

/* =========================
   Topbar AI icon (setup / quick run)
========================= */
btnAI.addEventListener("click", async ()=>{
  try{
    if (!currentUser){ showToast("Önce giriş yap."); return; }

    // hızlı ayar/çalıştır menüsü
    const action = prompt("AI Menüsü:\n1) AI Ayarları\n2) AI Metin Çalıştır\n3) PIN Hatırla\nSeçim (1/2/3):", "2");
    if (!action) return;

    if (action === "1"){
      if (!hasAIConfig()){
        const apiKey = prompt("Gemini API Key:");
        if (!apiKey) return;
        const pin = prompt("PIN/Şifre belirle:");
        if (!pin) return;
        const remember = confirm("Oturum hatırla?");
        await saveAIConfigEncrypted({ apiKey, pin, rememberPin: remember });
        if (remember) setSessionPin(pin);
        showToast("AI ayarları kaydedildi.");
        return;
      } else {
        showToast("AI zaten kayıtlı. PIN hatırlatmak için 3 seç.");
        return;
      }
    }

    if (action === "3"){
      const pin = prompt("PIN/Şifre:");
      if (!pin) return;
      setSessionPin(pin);
      showToast("PIN oturumda hatırlandı.");
      return;
    }

    // action 2
    if (!hasAIConfig()){ showToast("Önce AI ayarları (1)"); return; }

    let pin = getSessionPin();
    if (!pin){
      pin = prompt("PIN/Şifre (AI):");
      if (!pin) return;
    }

    const q = qEl.value.trim();
    const promptText = prompt("AI metin:", q ? `Bu ürünü kısaca değerlendir: ${q}` : "Kısa bir soru yaz");
    if (!promptText) return;

    showToast("AI çalışıyor...");
    const ans = await runAI({ prompt: promptText, pin, timeoutMs: 45000 });
    alert(ans || "AI boş cevap döndü.");
  }catch(e){
    console.error(e);
    alert("AI hata:\n" + (e?.message || e));
  }
});

/* =========================
   Main UI events
========================= */
renderSitePills();
injectCacheClearButton();
injectAISectionAboveSearch();

btnSearch.addEventListener("click", async ()=>{
  const q = qEl.value.trim();
  renderSearchRows(q);
});

qEl.addEventListener("keydown", (e)=>{
  if (e.key==="Enter"){
    e.preventDefault();
    btnSearch.click();
  }
});

btnClear.addEventListener("click", ()=>{
  qEl.value = "";
  searchResults.className = "listBox emptyBox";
  searchResults.textContent = "Henüz arama yapılmadı.";
});

btnOpenSelected.addEventListener("click", ()=>{
  openSelectedSites(qEl.value);
});

favSort.addEventListener("change", ()=>loadFavorites());
btnRefreshFav.addEventListener("click", ()=>loadFavorites());

btnBell.addEventListener("click", async ()=>{
  const ok = await ensureNotifPermission();
  if (ok) showToast("Bildirimler açık.");
  else showToast("Bildirim izni verilmedi.");
});

/* =========================
   Auth state: içerik gizleme
========================= */
loadNotifLog();

// ilk anda içerik görünmesin
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
   Auth error text
========================= */
function prettyAuthError(e){
  const msg = String(e?.message || e || "");

  if (msg.includes("auth/unauthorized-domain")){
    return "Google giriş hatası: unauthorized-domain. Firebase → Authentication → Settings → Authorized domains kısmına domain'ini ekle (örn: fiyattakip.github.io).";
  }
  if (msg.includes("auth/api-key-not-valid")){
    return "Firebase: api-key-not-valid. Yanlış config olabilir veya eski cache. Cache Temizle'ye basıp tekrar dene.";
  }
  if (msg.includes("auth/invalid-credential")){
    return "Hatalı giriş bilgisi.";
  }
  if (msg.includes("auth/email-already-in-use")){
    return "Bu email zaten kayıtlı.";
  }
  if (msg.includes("auth/weak-password")){
    return "Şifre çok zayıf. Daha güçlü bir şifre gir.";
  }
  return "Hata: " + msg;
}
