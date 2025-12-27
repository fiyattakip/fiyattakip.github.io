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

import { runAI, runAIVision, hasAIConfig, saveAIConfigEncrypted, setSessionPin } from "./ai.js";

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
const toast = document.getElementById("toast");

/* Top buttons */
const btnLogout = document.getElementById("btnLogout");
const btnBell = document.getElementById("btnBell");
const btnCacheClear = document.getElementById("btnCacheClear");
const btnInstall = document.getElementById("btnInstall");

/* Auth */
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

/* Search tabs */
const tabNormal = document.getElementById("tabNormal");
const tabAIText = document.getElementById("tabAIText");
const tabAIVisual = document.getElementById("tabAIVisual");
const panelNormal = document.getElementById("panelNormal");
const panelAIText = document.getElementById("panelAIText");
const panelAIVisual = document.getElementById("panelAIVisual");

/* Normal search */
const sitePills = document.getElementById("sitePills");
const qEl = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");
const btnOpenSelected = document.getElementById("btnOpenSelected");
const searchResults = document.getElementById("searchResults");

/* AI text */
const aiQ = document.getElementById("aiQ");
const btnAISearch = document.getElementById("btnAISearch");
const btnAISettings = document.getElementById("btnAISettings");
const btnAISettings2 = document.getElementById("btnAISettings2");
const aiResults = document.getElementById("aiResults");

/* AI visual */
const imgPicker = document.getElementById("imgPicker");
const btnAIVision = document.getElementById("btnAIVision");
const aiVisionBox = document.getElementById("aiVisionBox");

/* Favorites */
const favList = document.getElementById("favList");
const favSort = document.getElementById("favSort");
const btnRefreshFav = document.getElementById("btnRefreshFav");
const btnBackup = document.getElementById("btnBackup");
const btnRestore = document.getElementById("btnRestore");

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
let notifLog = [];

let bigChart = null;
const chartMap = new Map();

const CHECK_EVERY_MIN = 20;          // istek: 20 dk
const MAX_RETRY = 3;                 // akıllı retry
const RETRY_BASE_SEC = 20;           // 20s, 40s, 60s...
const DROP_NOTIFY_PCT = 10;          // %10 ve üzeri düşüş

/* =========================
   Sites
========================= */
const SITES = [
  { key:"trendyol", name:"Trendyol", build:(q)=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}&sst=PRICE_BY_ASC` },
  { key:"hepsiburada", name:"Hepsiburada", build:(q)=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}&sorting=priceAsc` },
  { key:"n11", name:"N11", build:(q)=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}&srt=PRICE_LOW` },
  { key:"amazontr", name:"Amazon TR", build:(q)=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}&s=price-asc-rank` },
  { key:"pazarama", name:"Pazarama", build:(q)=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}&sort=price_asc` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:(q)=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}&orderby=price_asc` },
  { key:"idefix", name:"idefix", build:(q)=>`https://www.idefix.com/arama/?q=${encodeURIComponent(q)}&s=price-asc` },
];
const selectedSites = new Set(SITES.map(s=>s.key));

/* =========================
   Helpers
========================= */
function showToast(msg){
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>toast.classList.add("hidden"), 2200);
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
  if (!("Notification" in window)) { showToast("Tarayıcı bildirim desteklemiyor."); return false; }
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
   UI: Tabs
========================= */
function setSearchTab(tab){
  const all = [tabNormal, tabAIText, tabAIVisual];
  all.forEach(b=>b.classList.remove("active"));
  panelNormal.classList.add("hidden");
  panelAIText.classList.add("hidden");
  panelAIVisual.classList.add("hidden");

  if (tab === "normal"){
    tabNormal.classList.add("active");
    panelNormal.classList.remove("hidden");
  } else if (tab === "aiText"){
    tabAIText.classList.add("active");
    panelAIText.classList.remove("hidden");
  } else {
    tabAIVisual.classList.add("active");
    panelAIVisual.classList.remove("hidden");
  }
}
tabNormal.addEventListener("click", ()=>setSearchTab("normal"));
tabAIText.addEventListener("click", ()=>setSearchTab("aiText"));
tabAIVisual.addEventListener("click", ()=>setSearchTab("aiVisual"));

/* =========================
   UI: Sites pills
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
    });
    sitePills.appendChild(pill);
  }
}

/* =========================
   Firestore helpers
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
    history: [],             // [{t,p}]
    status: "idle",          // idle | ok | fail
    lastCheckAt: null,
    nextCheckAt: null,
    retryCount: 0,
    lastError: null,
    aiNote: null             // favori için AI yorum
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

async function patchFav(favId, patch){
  const ref = doc(db, "users", currentUser.uid, "favorites", favId);
  await updateDoc(ref, patch);
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
      createdAtMs: d.createdAt?.toMillis?.() ?? 0,
      status: d.status || "idle",
      lastCheckAt: d.lastCheckAt || null,
      nextCheckAt: d.nextCheckAt || null,
      retryCount: d.retryCount || 0,
      lastError: d.lastError || null,
      aiNote: d.aiNote || null
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
}

/* =========================
   Price Fetching (best-effort)
   - Browserda CORS yüzünden çoğu site engeller.
   - Bu fonksiyon "deneme" yapar.
   - Fail olursa kullanıcıya "linki aç" bildirimi verir.
========================= */
async function tryFetchPriceFromUrl(url){
  // Tarayıcı cross-origin HTML çekemez -> çoğu zaman FAIL.
  // Yine de deniyoruz: bazı sitelerde (nadiren) CORS açılırsa çalışır.
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 15000);
  try{
    const res = await fetch(url, {
      method:"GET",
      mode:"cors",
      credentials:"omit",
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const price = parsePriceHeuristic(html);
    if (price == null) throw new Error("Fiyat bulunamadı");
    return price;
  } finally {
    clearTimeout(t);
  }
}

function parsePriceHeuristic(html){
  // Basit: "₺" veya "TL" geçen fiyatı yakala
  // (Siteye göre selector ile yapmak daha doğru olur; burada genel)
  const text = String(html);
  const m = text.match(/([0-9]{1,3}(\.[0-9]{3})*|[0-9]+)(,[0-9]{1,2})?\s*(₺|TL)/i);
  if (!m) return null;
  const raw = m[0]
    .replace(/₺|TL/gi,"")
    .trim()
    .replace(/\./g,"")
    .replace(",",".")
    .replace(/[^\d.]/g,"");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/* =========================
   Scheduling
========================= */
function msFromMin(min){ return min * 60 * 1000; }
function msFromSec(sec){ return sec * 1000; }

function nextCheckIsoFromNow(ms){
  return new Date(Date.now() + ms).toISOString();
}

async function scheduleNext(fav, ok){
  if (ok){
    await patchFav(fav.id, {
      status: "ok",
      retryCount: 0,
      lastError: null,
      lastCheckAt: nowISO(),
      nextCheckAt: nextCheckIsoFromNow(msFromMin(CHECK_EVERY_MIN))
    });
  } else {
    const rc = Math.min((fav.retryCount||0) + 1, MAX_RETRY);
    const delay = msFromSec(RETRY_BASE_SEC * rc); // 20s, 40s, 60s
    await patchFav(fav.id, {
      status: "fail",
      retryCount: rc,
      lastCheckAt: nowISO(),
      nextCheckAt: nextCheckIsoFromNow(delay)
    });
  }
}

function shouldRunNow(fav){
  if (!fav.nextCheckAt) return true;
  const t = Date.parse(fav.nextCheckAt);
  return Number.isFinite(t) ? Date.now() >= t : true;
}

/* =========================
   Drop check & update history
========================= */
async function applyNewPriceAndNotify(fav, newPrice){
  const prev = fav.lastPrice;
  const history = Array.isArray(fav.history) ? fav.history.slice() : [];
  history.push({ t: nowISO(), p: newPrice });

  // history çok büyümesin diye 200 ile sınırla
  const trimmed = history.slice(-200);

  await patchFav(fav.id, {
    lastPrice: newPrice,
    history: trimmed
  });

  if (prev != null && prev > 0){
    const diffPct = ((prev - newPrice) / prev) * 100;
    if (diffPct >= DROP_NOTIFY_PCT){
      const title = `${fav.siteName}: %${diffPct.toFixed(1)} düşüş`;
      const body = `${fav.query} → ${fmtTRY(prev)} → ${fmtTRY(newPrice)}`;
      pushNotif(title, body);
      fireBrowserNotif(title, body);
    }
  }
}

/* =========================
   Background loop (app açıkken çalışır)
========================= */
let loopTimer = null;

async function priceLoopTick(){
  if (!currentUser) return;

  // Favorileri her tickte DB'den çekmeyelim: cache kullan
  // Ama status/nextCheck değiştiyse de güncellensin diye arada yenileyelim:
  await loadFavorites();

  for (const fav of favCache){
    if (!shouldRunNow(fav)) continue;

    try{
      // fiyat dene
      const price = await tryFetchPriceFromUrl(fav.url);

      await applyNewPriceAndNotify(fav, price);
      await scheduleNext(fav, true);
    } catch (e){
      const msg = String(e?.message || e || "çekilemedi");
      await patchFav(fav.id, { lastError: msg });

      // kullanıcıya "linki aç" öner
      const title = `${fav.siteName}: çekim başarısız`;
      const body = `“${fav.query}” için linki açıp tekrar dene.`;
      pushNotif(title, body);
      fireBrowserNotif(title, body);

      await scheduleNext(fav, false);
    }
  }

  // UI yenile
  await loadFavorites();
}

function startLoop(){
  stopLoop();
  // 30sn istemiştin ama riskli; 20 dk hedef zaten.
  // Yine de "tick" küçük: 20sn'de bir kontrol edip zamanı gelenleri çalıştırıyor.
  loopTimer = setInterval(()=>priceLoopTick().catch(()=>{}), 20000);
}
function stopLoop(){
  if (loopTimer){
    clearInterval(loopTimer);
    loopTimer = null;
  }
}

/* =========================
   Charts
========================= */
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
  if (bigChart){ bigChart.destroy(); bigChart = null; }
  bigChart = buildChart(bigCanvas, fav);
}
btnCloseChart.addEventListener("click", ()=>{
  chartWrap.classList.add("hidden");
  if (bigChart){ bigChart.destroy(); bigChart = null; }
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
    const stat = f.status === "ok" ? "✅" : (f.status === "fail" ? "⚠️" : "⏳");
    const nextTxt = f.nextCheckAt ? new Date(f.nextCheckAt).toLocaleTimeString("tr-TR", {hour:"2-digit", minute:"2-digit"}) : "-";

    el.innerHTML = `
      <div class="favTop">
        <div>
          <div class="favName">${escapeHtml(f.query)}</div>
          <div class="favMeta">${escapeHtml(f.siteName)} • ${stat} • Sonraki: ${escapeHtml(nextTxt)} • Link gizli</div>
          ${f.lastError ? `<div class="favMeta">Hata: ${escapeHtml(f.lastError)}</div>` : ``}
          ${f.aiNote ? `<div class="favMeta"><b>AI:</b> ${escapeHtml(f.aiNote)}</div>` : ``}
        </div>
        <div class="favPrice">${priceText}</div>
      </div>

      <div class="favBtns">
        <button class="btnOpen">${escapeHtml(f.siteName)} Aç</button>
        <button class="btnCopy">Copy Link</button>
        <button class="btnTryNow">Tekrar Dene (Şimdi)</button>
        <button class="btnAINote">AI Yorum</button>
        <button class="btnDelete">Sil</button>
      </div>

      <div class="chartBox">
        <div class="chartArea"></div>
        <button class="btnBig">Grafiği büyüt</button>
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

    // Try Now (anında dene)
    el.querySelector(".btnTryNow").addEventListener("click", async ()=>{
      showToast("Şimdi deneniyor...");
      try{
        const price = await tryFetchPriceFromUrl(f.url);
        await applyNewPriceAndNotify(f, price);
        await patchFav(f.id, {
          status:"ok",
          retryCount:0,
          lastError:null,
          lastCheckAt: nowISO(),
          nextCheckAt: nextCheckIsoFromNow(msFromMin(CHECK_EVERY_MIN))
        });
        await loadFavorites();
        showToast("Fiyat güncellendi.");
      } catch (e){
        const msg = String(e?.message || e || "çekilemedi");
        await patchFav(f.id, { status:"fail", lastError: msg });
        await loadFavorites();
        showToast("Çekilemedi. Linki açıp tekrar dene.");
      }
    });

    // AI Note for favorite
    el.querySelector(".btnAINote").addEventListener("click", async ()=>{
      try{
        await openAISettingsIfNeeded();
        const pin = await askPinMaybe();
        const prompt = `
Sen bir alışveriş danışmanısın.
Ürün: ${f.query}
Site: ${f.siteName}
Kısa şekilde (maks 2-3 cümle) şunu yaz:
- Bu ürünü alırken dikkat edilecek 2 şey
- Fiyat/performans yorumu (genel)
Türkçe yaz.
        `.trim();
        const text = await runAI({ prompt, pin, provider:"gemini", model:"gemini-1.5-flash" });
        const short = text.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,3).join(" ");
        await patchFav(f.id, { aiNote: short });
        await loadFavorites();
        showToast("AI yorum eklendi.");
      } catch (e){
        showToast(String(e?.message || e || "AI hata"));
      }
    });

    // Delete
    el.querySelector(".btnDelete").addEventListener("click", async ()=>{
      if (!confirm("Favoriyi silmek istiyor musun?")) return;
      await deleteDoc(doc(db, "users", currentUser.uid, "favorites", f.id));
      await loadFavorites();
    });

    // Chart
    const chartArea = el.querySelector(".chartArea");
    const h = f.history || [];
    if (h.length < 2){
      chartArea.innerHTML = `<div class="chartHint">Grafik için en az 2 otomatik fiyat kaydı olmalı.</div>`;
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
   Normal Search rows
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
    return { site:s, url:s.build(q), fav:existing||null, lastPrice: existing?.lastPrice ?? null };
  });

  // En uygun fiyatlı en üst (varsa)
  rows.sort((a,b)=>{
    const ap = a.lastPrice, bp = b.lastPrice;
    if (ap == null && bp == null) return a.site.name.localeCompare(b.site.name);
    if (ap == null) return 1;
    if (bp == null) return -1;
    return ap - bp;
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
        <button class="btnOpen">Aç</button>

        <button class="btnGhost btnAIComment">AI Yorum</button>

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
      if (!currentUser) return;

      if (favOn){
        await removeFavorite(r.site.key, q);
      } else {
        await addFavorite(r.site.key, r.site.name, q, r.url);
      }
      await loadFavorites();
      renderSearchRows(qEl.value);
    });

    item.querySelector(".btnAIComment").addEventListener("click", async ()=>{
      try{
        await openAISettingsIfNeeded();
        const pin = await askPinMaybe();
        const prompt = `
Sen alışveriş danışmanısın.
Arama: ${q}
Site: ${r.site.name}
Kısa (maks 2-3 cümle) öneri ver:
- Bu aramada hangi özelliklere bakmalı?
- Bu sitede fiyat/kalite açısından dikkat noktası.
Türkçe yaz.
        `.trim();
        const text = await runAI({ prompt, pin, provider:"gemini", model:"gemini-1.5-flash" });
        alert(text);
      } catch(e){
        alert(String(e?.message || e || "AI hata"));
      }
    });

    searchResults.appendChild(item);
  }
}

/* =========================
   Open selected sites
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
   AI settings UI
========================= */
async function openAISettingsIfNeeded(){
  const cfgOk = hasAIConfig();
  if (cfgOk) return;

  const apiKey = prompt("Gemini API Key (Google AI Studio):");
  if (!apiKey) throw new Error("API key girilmedi.");
  const pin = prompt("PIN belirle (anahtar şifreli saklanacak):");
  if (!pin) throw new Error("PIN girilmedi.");

  const remember = confirm("Bu oturum PIN'i hatırlansın mı? (Sayfa kapanınca gider)");
  await saveAIConfigEncrypted({ provider:"gemini", model:"gemini-1.5-flash", apiKey, pin, rememberPin: remember });
  if (remember) setSessionPin(pin);
  showToast("AI ayarları kaydedildi.");
}

async function askPinMaybe(){
  // sessionPin varsa ai.js kendi kullanır; yoksa sor
  const use = confirm("PIN oturumda hatırlanıyor mu? (Hayır dersen soracağım)");
  if (use) return null;
  const pin = prompt("PIN gir:");
  if (!pin) throw new Error("PIN gerekli.");
  return pin;
}

/* =========================
   AI Text Search
========================= */
function parseAIJsonList(text){
  // AI bazen JSON yerine açıklama döner; en güvenlisi: URL ve isim yakala
  // Ama kullanıcı için liste çıkarıyoruz:
  const lines = text.split("\n").map(s=>s.trim()).filter(Boolean);
  const out = [];
  for (const ln of lines){
    const u = ln.match(/https?:\/\/[^\s)]+/i)?.[0];
    if (u){
      out.push({ product: ln.replace(u,"").replace(/[-–•]+/g," ").trim() || "Ürün", url:u });
    }
  }
  return out.slice(0, 20);
}

btnAISearch.addEventListener("click", async ()=>{
  try{
    await openAISettingsIfNeeded();
    const pin = await askPinMaybe();
    const q = aiQ.value.trim();
    if (!q) return;

    aiResults.className = "listBox";
    aiResults.innerHTML = `<div class="emptyBox">AI düşünüyor...</div>`;

    const prompt = `
Kullanıcı Türkiye'de alışveriş yapacak.
İstek: "${q}"
Aşağıdaki sitelerden link öner (mümkünse):
Trendyol, Hepsiburada, N11, Amazon TR, Pazarama, ÇiçekSepeti, idefix.
Çıktı formatı:
- Ürün adı — URL
Her satır tek öneri.
    `.trim();

    const text = await runAI({ prompt, pin, provider:"gemini", model:"gemini-1.5-flash" });
    const items = parseAIJsonList(text);

    if (!items.length){
      aiResults.className = "listBox emptyBox";
      aiResults.textContent = "AI sonuç bulamadı. Daha net yaz (örn: 'DDR4 8GB 3200 CL16').";
      return;
    }

    aiResults.className = "listBox";
    aiResults.innerHTML = "";
    for (const it of items){
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="itemLeft">
          <div class="siteName">AI Öneri</div>
          <div class="queryText">${escapeHtml(it.product)}</div>
        </div>
        <div class="itemRight">
          <button class="btnOpen">Aç</button>
          <button class="btnFav">Favori Ekle</button>
        </div>
      `;
      row.querySelector(".btnOpen").addEventListener("click", ()=>window.open(it.url, "_blank", "noopener"));

      row.querySelector(".btnFav").addEventListener("click", async ()=>{
        // siteKey bilinmiyor; "ai" key ile kaydediyoruz
        await addFavorite("ai", "AI", it.product, it.url);
        await loadFavorites();
        showToast("Favoriye eklendi.");
      });

      aiResults.appendChild(row);
    }
  } catch(e){
    aiResults.className = "listBox emptyBox";
    aiResults.textContent = String(e?.message || e || "AI hata");
  }
});

btnAISettings.addEventListener("click", ()=>openAISettingsIfNeeded().catch(e=>showToast(e.message||"AI hata")));
btnAISettings2.addEventListener("click", ()=>openAISettingsIfNeeded().catch(e=>showToast(e.message||"AI hata")));

/* =========================
   AI Visual
========================= */
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> {
      const dataUrl = String(reader.result||"");
      const b64 = dataUrl.split(",")[1] || "";
      resolve(b64);
    };
    reader.onerror = ()=>reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

btnAIVision.addEventListener("click", async ()=>{
  try{
    await openAISettingsIfNeeded();
    const pin = await askPinMaybe();

    const file = imgPicker.files?.[0];
    if (!file){
      aiVisionBox.className = "listBox emptyBox";
      aiVisionBox.textContent = "Önce bir görsel seç.";
      return;
    }

    aiVisionBox.className = "listBox";
    aiVisionBox.innerHTML = `<div class="emptyBox">Görsel analiz ediliyor...</div>`;

    const b64 = await fileToBase64(file);
    const prompt = `
Bu görseldeki ürünü tanımla.
1) Ürünün kısa adı
2) Arama için 3 anahtar kelime
3) Türkiye'de alışveriş için 1 cümle öneri
Sonuç Türkçe olsun.
    `.trim();

    const text = await runAIVision({ prompt, pin, imageBase64: b64, mimeType: file.type || "image/jpeg", model:"gemini-1.5-flash" });

    aiVisionBox.className = "listBox";
    aiVisionBox.innerHTML = `
      <div class="item">
        <div class="itemLeft">
          <div class="siteName">AI Görsel</div>
          <div class="queryText">${escapeHtml(text)}</div>
        </div>
        <div class="itemRight">
          <button class="btnGhost" id="btnUseAsQuery">Normal Aramada Kullan</button>
        </div>
      </div>
    `;

    aiVisionBox.querySelector("#btnUseAsQuery").addEventListener("click", ()=>{
      setSearchTab("normal");
      qEl.value = text.split("\n")[0].slice(0, 60);
      renderSearchRows(qEl.value);
    });

  } catch(e){
    aiVisionBox.className = "listBox emptyBox";
    aiVisionBox.textContent = String(e?.message || e || "AI hata");
  }
});

/* =========================
   Backup / Restore
========================= */
btnBackup.addEventListener("click", async ()=>{
  if (!currentUser) return;
  await loadFavorites();
  const data = { version: 1, exportedAt: nowISO(), items: favCache };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fiyattakip-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Yedek indirildi.");
});

btnRestore.addEventListener("click", async ()=>{
  if (!currentUser) return;
  const pick = document.createElement("input");
  pick.type = "file";
  pick.accept = "application/json";
  pick.onchange = async ()=>{
    const file = pick.files?.[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    const items = data?.items || [];
    if (!Array.isArray(items) || !items.length){
      showToast("Yedek boş/uyumsuz.");
      return;
    }
    if (!confirm("Yedekten yüklemek mevcut favorilere ekler. Devam?")) return;

    // her item'ı upsert
    for (const it of items){
      const id = it.id || favDocId(it.siteKey||"ai", it.query||"");
      const ref = doc(db, "users", currentUser.uid, "favorites", id);
      await setDoc(ref, {
        siteKey: it.siteKey || "ai",
        siteName: it.siteName || "AI",
        query: it.query || "",
        queryLower: (it.query||"").toLowerCase(),
        url: it.url || "",
        createdAt: serverTimestamp(),
        lastPrice: it.lastPrice ?? null,
        history: Array.isArray(it.history) ? it.history.slice(-200) : [],
        status: it.status || "idle",
        lastCheckAt: it.lastCheckAt || null,
        nextCheckAt: it.nextCheckAt || null,
        retryCount: it.retryCount || 0,
        lastError: it.lastError || null,
        aiNote: it.aiNote || null
      }, { merge:true });
    }
    await loadFavorites();
    showToast("Yedek yüklendi.");
  };
  pick.click();
});

/* =========================
   Main UI events
========================= */
renderSitePills();

btnSearch.addEventListener("click", ()=>{
  renderSearchRows(qEl.value);
});
qEl.addEventListener("keydown", (e)=>{
  if (e.key==="Enter"){ e.preventDefault(); btnSearch.click(); }
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
  showToast(ok ? "Bildirimler açık." : "Bildirim izni verilmedi.");
});

btnCacheClear.addEventListener("click", async ()=>{
  try{
    // cache temizle
    const keys = await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
    // sw unregister
    if (navigator.serviceWorker){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
    showToast("Cache temizlendi. Sayfayı yenile.");
  } catch {
    showToast("Cache temizleme başarısız.");
  }
});

btnLogout.addEventListener("click", async ()=>{
  try{
    await signOut(auth);
    showToast("Çıkış yapıldı.");
  }catch{}
});

/* =========================
   Auth UI
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

togglePw.addEventListener("click", ()=>{ passEl.type = (passEl.type==="password") ? "text" : "password"; });
togglePw2.addEventListener("click", ()=>{ pass2El.type = (pass2El.type==="password") ? "text" : "password"; });

btnAuthMain.addEventListener("click", async ()=>{
  clearAuthError();
  const email = emailEl.value.trim();
  const pass = passEl.value;

  try{
    if (mode==="register"){
      const pass2 = pass2El.value;
      if (pass !== pass2) { setAuthError("Şifreler aynı değil."); return; }
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
    if (isMobile()){
      await signInWithRedirect(auth, googleProvider);
    } else {
      await signInWithPopup(auth, googleProvider);
    }
  }catch(e){
    setAuthError(prettyAuthError(e));
  }
});

// Redirect dönüşünde login ekranında kalma sorununu düzeltmek için:
getRedirectResult(auth).catch(()=>{});

/* =========================
   Install prompt
========================= */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  btnInstall.style.display = "";
});
btnInstall.addEventListener("click", async ()=>{
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(()=>{});
  deferredPrompt = null;
  btnInstall.style.display = "none";
});

/* =========================
   Auth state: içerik gizleme
========================= */
loadNotifLog();
appMain.classList.add("hidden");
openAuthModal();
setSearchTab("normal");

onAuthStateChanged(auth, async (user)=>{
  currentUser = user || null;

  if (currentUser){
    closeAuthModal();
    appMain.classList.remove("hidden");
    await loadFavorites();
    startLoop(); // app açıkken otomatik deneme başlar
    if (qEl.value.trim()) renderSearchRows(qEl.value.trim());
  } else {
    stopLoop();
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
    return "Google giriş hatası: unauthorized-domain. Firebase → Authentication → Settings → Authorized domains kısmına fiyattakip.github.io ekle.";
  }
  if (msg.includes("auth/api-key-not-valid")){
    return "Firebase: api-key-not-valid. Yanlış config veya eski cache olabilir. Cache Temizle'ye bas, yenile.";
  }
  if (msg.includes("auth/invalid-credential")) return "Hatalı giriş bilgisi.";
  if (msg.includes("auth/email-already-in-use")) return "Bu email zaten kayıtlı.";
  if (msg.includes("auth/weak-password")) return "Şifre çok zayıf. Daha güçlü bir şifre gir.";
  return "Hata: " + msg;
}


// ===== AUTH GATE (NO BACKGROUND INTERACTION) =====
firebase.auth().onAuthStateChanged(user => {
  const loginModal = document.getElementById('loginModal');
  const app = document.getElementById('app'); // main wrapper

  if (user) {
    // UNLOCK APP
    if (loginModal) loginModal.classList.remove('show');
    if (app) {
      app.style.display = 'block';
      app.style.pointerEvents = 'auto';
    }

    // ensure a default page is active
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('homePage')?.classList.add('active');

  } else {
    // LOCK APP
    if (loginModal) loginModal.classList.add('show');
    if (app) {
      app.style.display = 'none';
      app.style.pointerEvents = 'none';
    }
  }
});

