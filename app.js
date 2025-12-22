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
  collection, doc, setDoc, getDocs, deleteDoc,
  serverTimestamp, updateDoc, query as fsQuery, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  aiTextSearch,
  aiVisionDetect,
  hasAIConfig,
  saveAIConfigEncrypted,
  clearAIConfig,
  setSessionPin
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
const btnAuthCacheClear = document.getElementById("btnAuthCacheClear");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const pass2El = document.getElementById("pass2");
const togglePw = document.getElementById("togglePw");
const togglePw2 = document.getElementById("togglePw2");

/* Tabs */
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

/* Chart modal */
const chartWrap = document.getElementById("chartWrap");
const btnCloseChart = document.getElementById("btnCloseChart");
const bigTitle = document.getElementById("bigTitle");
const bigCanvas = document.getElementById("bigCanvas");
let bigChart = null;

/* AI modal */
const aiWrap = document.getElementById("aiWrap");
const btnCloseAI = document.getElementById("btnCloseAI");
const aiKey = document.getElementById("aiKey");
const aiPin = document.getElementById("aiPin");
const aiRemember = document.getElementById("aiRemember");
const btnSaveAI = document.getElementById("btnSaveAI");
const btnClearAI = document.getElementById("btnClearAI");
const aiMsg = document.getElementById("aiMsg");

/* =========================
   Utils
========================= */
function showToast(msg){
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(()=>toast.classList.add("hidden"), 2200);
}
function isMobile(){
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function openAuthModal(){ authWrap.classList.remove("hidden"); }
function closeAuthModal(){ authWrap.classList.add("hidden"); }

function openAIModal(){ aiWrap.classList.remove("hidden"); aiMsg.textContent = ""; }
function closeAIModal(){ aiWrap.classList.add("hidden"); }

function setTab(which){
  const map = {
    normal:[tabNormal,panelNormal],
    ai:[tabAIText,panelAIText],
    visual:[tabAIVisual,panelAIVisual]
  };
  for (const k of Object.keys(map)){
    map[k][0].classList.toggle("active", k===which);
    map[k][1].classList.toggle("hidden", k!==which);
  }
}

async function hardClear(){
  // 1) storage
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
  // 2) caches
  if (window.caches){
    try{
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    } catch {}
  }
  showToast("Cache temizlendi. Yenileniyor...");
  setTimeout(()=>location.reload(), 600);
}

function fmtTRY(n){
  if (n==null || Number.isNaN(n)) return "-";
  try { return new Intl.NumberFormat("tr-TR", { style:"currency", currency:"TRY" }).format(n); }
  catch { return String(n); }
}

/* =========================
   Sites
========================= */
const SITES = [
  { key:"trendyol",   name:"Trendyol",    build:(q)=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hb",         name:"Hepsiburada", build:(q)=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11",        name:"N11",         build:(q)=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazon",     name:"Amazon TR",   build:(q)=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"pazarama",   name:"Pazarama",    build:(q)=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key:"cicek",      name:"ÇiçekSepeti", build:(q)=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key:"idefix",     name:"idefix",      build:(q)=>`https://www.idefix.com/search/?q=${encodeURIComponent(q)}` }
];

const selectedSites = new Set(SITES.map(s=>s.key));

function renderSitePills(){
  sitePills.innerHTML = "";
  for (const s of SITES){
    const pill = document.createElement("label");
    pill.className = "sitePill on";
    pill.innerHTML = `<input type="checkbox" checked /> <span>${s.name}</span>`;
    const cb = pill.querySelector("input");
    cb.addEventListener("change", ()=>{
      if (cb.checked) selectedSites.add(s.key);
      else selectedSites.delete(s.key);
      pill.classList.toggle("on", cb.checked);
    });
    sitePills.appendChild(pill);
  }
}
renderSitePills();

/* =========================
   Search results UI
========================= */
let currentUser = null;
let favCache = [];

function renderSearchRows(q){
  const queryText = q.trim();
  if (!queryText){
    searchResults.className = "listBox emptyBox";
    searchResults.textContent = "Arama boş.";
    return;
  }

  searchResults.className = "listBox";
  searchResults.innerHTML = "";

  const rows = SITES
    .filter(s=>selectedSites.has(s.key))
    .map(s=>{
      const existing = favCache.find(f=>f.siteKey===s.key && f.queryLower===queryText.toLowerCase());
      return { site:s, url:s.build(queryText), lastPrice: existing?.lastPrice ?? null, existing };
    });

  rows.sort((a,b)=>{
    const ap=a.lastPrice, bp=b.lastPrice;
    if (ap==null && bp==null) return 0;
    if (ap==null) return 1;
    if (bp==null) return -1;
    return ap-bp;
  });

  for (const r of rows){
    const item = document.createElement("div");
    item.className = "row";

    const left = document.createElement("div");
    left.className = "rowLeft";
    left.innerHTML = `
      <div class="rowTitle">${r.site.name}</div>
      <div class="rowSub">${queryText}</div>
    `;

    const right = document.createElement("div");
    right.className = "rowRight";
    right.innerHTML = `
      <span class="badge ${r.lastPrice==null ? "" : "ok"}">${r.lastPrice==null ? "Fiyat: -" : ("Fiyat: " + fmtTRY(r.lastPrice))}</span>
      <button class="btnGhost sm btnOpen">Siteyi Aç</button>
      <button class="btnPrimary sm btnFav">${r.existing ? "Favoride" : "Favori +"}</button>
    `;

    right.querySelector(".btnOpen").addEventListener("click", ()=>{
      window.open(r.url, "_blank", "noopener");
    });

    right.querySelector(".btnFav").addEventListener("click", async ()=>{
      if (!currentUser){ showToast("Giriş gerekli."); return; }
      await addFavorite(queryText, r.site, r.url);
      await loadFavorites();
      renderSearchRows(queryText);
      showToast("Favoriye eklendi.");
    });

    item.appendChild(left);
    item.appendChild(right);
    searchResults.appendChild(item);
  }
}

/* =========================
   Favorites DB
========================= */
const DROP_NOTIFY_PCT = 10;     // %10
const CHECK_MIN_MS = 20 * 60 * 1000; // 20dk
const HISTORY_MAX = 40;

function favCol(){
  return collection(db, "users", currentUser.uid, "favorites");
}

async function loadFavorites(){
  if (!currentUser) { favCache=[]; return; }
  const q = fsQuery(favCol(), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  favCache = snap.docs.map(d=>({ id:d.id, ...d.data() }))
    .map(x=>({
      ...x,
      queryLower: (x.query||"").toLowerCase(),
      lastPrice: x.lastPrice ?? null,
      history: Array.isArray(x.history) ? x.history : []
    }));

  renderFavorites();
}

function sortFavs(list){
  const v = favSort.value;
  const copy = [...list];
  if (v==="price_asc") copy.sort((a,b)=> (a.lastPrice??Infinity) - (b.lastPrice??Infinity));
  if (v==="price_desc") copy.sort((a,b)=> (b.lastPrice??-Infinity) - (a.lastPrice??-Infinity));
  if (v==="site") copy.sort((a,b)=> String(a.siteName||"").localeCompare(String(b.siteName||""), "tr"));
  if (v==="newest") copy.sort((a,b)=> (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  return copy;
}

function renderFavorites(){
  if (!favCache.length){
    favList.className = "favList emptyBox";
    favList.textContent = "Favori yok.";
    return;
  }

  favList.className = "favList";
  favList.innerHTML = "";

  const list = sortFavs(favCache);

  for (const fav of list){
    const item = document.createElement("div");
    item.className = "row";

    const left = document.createElement("div");
    left.className = "rowLeft";
    left.innerHTML = `
      <div class="rowTitle">${fav.query}</div>
      <div class="rowSub">${fav.siteName} · Hata: ${fav.lastError ? fav.lastError : "0"}</div>
    `;

    const right = document.createElement("div");
    right.className = "rowRight";
    right.innerHTML = `
      <span class="badge ${fav.lastError ? "err" : "ok"}">${fav.lastPrice==null ? "Fiyat: -" : fmtTRY(fav.lastPrice)}</span>
      <button class="btnGhost sm btnOpen">Siteyi Aç</button>
      <button class="btnGhost sm btnRetry">Tekrar dene</button>
      <button class="btnGhost sm btnChart">Grafik</button>
      <button class="btnDanger sm btnDel">Sil</button>
    `;

    right.querySelector(".btnOpen").addEventListener("click", ()=>{
      window.open(fav.url, "_blank", "noopener");
    });

    right.querySelector(".btnRetry").addEventListener("click", async ()=>{
      await retryFetch(fav);
    });

    right.querySelector(".btnChart").addEventListener("click", ()=>{
      openBigChart(fav);
    });

    right.querySelector(".btnDel").addEventListener("click", async ()=>{
      await deleteDoc(doc(db, "users", currentUser.uid, "favorites", fav.id));
      await loadFavorites();
      showToast("Silindi.");
    });

    item.appendChild(left);
    item.appendChild(right);
    favList.appendChild(item);
  }
}

async function addFavorite(queryText, site, url){
  const id = `${site.key}_${queryText.toLowerCase().replace(/\s+/g," ").trim()}`.slice(0,180);
  const ref = doc(db, "users", currentUser.uid, "favorites", id);

  await setDoc(ref, {
    query: queryText.trim(),
    siteKey: site.key,
    siteName: site.name,
    url,
    createdAt: serverTimestamp(),
    lastPrice: null,
    lastCheckedAt: null,
    nextCheckAt: Date.now() + 5000,
    lastError: "",
    history: []
  }, { merge:true });
}

/* =========================
   Price fetch (CORS: çoğu sitede engel olabilir)
========================= */
async function tryFetchPriceFromUrl(url){
  // Not: Çoğu e-ticaret CORS/anti-bot yüzünden engeller.
  // Burada "en azından dene" mantığı var. Engel olursa hata yazıp kullanıcıya "Link Aç" der.
  const res = await fetch(url, { method:"GET", mode:"cors", credentials:"omit" });
  const html = await res.text();

  // basit fiyat yakalama (çok değişken!)
  const m = html.match(/(\d{1,3}(\.\d{3})*|\d+)(,\d{2})?\s*TL/i);
  if (!m) throw new Error("Fiyat bulunamadı / engel.");
  const raw = m[0].replace(/[^\d,]/g,"").replace(/\./g,"");
  const val = Number(raw.replace(",", "."));
  if (!Number.isFinite(val)) throw new Error("Fiyat parse edilemedi.");
  return val;
}

function shouldRunNow(fav){
  const next = fav.nextCheckAt || 0;
  return Date.now() >= next;
}

async function patchFav(id, data){
  const ref = doc(db, "users", currentUser.uid, "favorites", id);
  await updateDoc(ref, data);
}

async function scheduleNext(fav, ok){
  const base = CHECK_MIN_MS;
  const jitter = Math.floor(Math.random()*60_000);
  const next = Date.now() + base + jitter;
  await patchFav(fav.id, { nextCheckAt: next, lastCheckedAt: Date.now(), lastError: ok ? "" : (fav.lastError||"") });
}

async function applyNewPriceAndNotify(fav, newPrice){
  const prev = fav.lastPrice ?? null;

  const history = Array.isArray(fav.history) ? [...fav.history] : [];
  history.unshift({ t: Date.now(), p: newPrice });
  history.splice(HISTORY_MAX);

  await patchFav(fav.id, { lastPrice: newPrice, history, lastError:"" });

  if (prev != null && prev > 0){
    const diffPct = ((prev - newPrice) / prev) * 100;
    if (diffPct >= DROP_NOTIFY_PCT){
      const title = `${fav.siteName}: %${diffPct.toFixed(1)} düşüş`;
      const body = `${fav.query} → ${fmtTRY(prev)} → ${fmtTRY(newPrice)}`;
      fireBrowserNotif(title, body);
    }
  }
}

function fireBrowserNotif(title, body){
  try{
    if (Notification.permission === "granted"){
      new Notification(title, { body });
    }
  }catch{}
}

async function retryFetch(fav){
  try{
    const price = await tryFetchPriceFromUrl(fav.url);
    await applyNewPriceAndNotify(fav, price);
    await scheduleNext(fav, true);
    showToast("Fiyat güncellendi.");
  }catch(e){
    const msg = String(e?.message || e || "çekilemedi");
    await patchFav(fav.id, { lastError: msg });
    await scheduleNext(fav, false);
    showToast("Engel / hata: Link Aç → Tekrar dene");
  } finally {
    await loadFavorites();
  }
}

/* =========================
   Background loop (app açıkken)
========================= */
let loopTimer = null;

async function priceLoopTick(){
  if (!currentUser) return;

  await loadFavorites();

  for (const fav of favCache){
    if (!shouldRunNow(fav)) continue;
    try{
      const price = await tryFetchPriceFromUrl(fav.url);
      await applyNewPriceAndNotify(fav, price);
      await scheduleNext(fav, true);
    } catch (e){
      const msg = String(e?.message || e || "çekilemedi");
      await patchFav(fav.id, { lastError: msg });
      await scheduleNext(fav, false);

      fireBrowserNotif(`${fav.siteName}: çekim başarısız`, `“${fav.query}” için linki açıp tekrar dene.`);
    }
  }

  await loadFavorites();
}

function startLoop(){
  stopLoop();
  loopTimer = setInterval(()=>priceLoopTick().catch(()=>{}), 20000);
}
function stopLoop(){
  if (loopTimer){ clearInterval(loopTimer); loopTimer=null; }
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
  if (bigChart){ bigChart.destroy(); bigChart=null; }
  bigChart = buildChart(bigCanvas, fav);
}
btnCloseChart.addEventListener("click", ()=>{
  chartWrap.classList.add("hidden");
  if (bigChart){ bigChart.destroy(); bigChart=null; }
});

/* =========================
   Notifications
========================= */
btnBell.addEventListener("click", async ()=>{
  try{
    const p = await Notification.requestPermission();
    if (p === "granted") showToast("Bildirimler açık.");
    else showToast("Bildirim izni verilmedi.");
  }catch{
    showToast("Bildirim desteklenmiyor.");
  }
});

/* =========================
   Cache clear
========================= */
btnCacheClear.addEventListener("click", hardClear);
btnAuthCacheClear.addEventListener("click", hardClear);

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
   Auth UI
========================= */
let mode = "login";

function clearAuthError(){
  authError.classList.add("hidden");
  authError.textContent = "";
}
function setAuthError(msg){
  authError.textContent = msg;
  authError.classList.remove("hidden");
}
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

function setMode(m){
  mode = m;
  tabLogin.classList.toggle("active", m==="login");
  tabRegister.classList.toggle("active", m==="register");
  pass2Wrap.classList.toggle("hidden", m!=="register");
  btnAuthMain.textContent = (m==="register") ? "Kayıt Ol" : "Giriş Yap";
}
tabLogin.addEventListener("click", ()=>setMode("login"));
tabRegister.addEventListener("click", ()=>setMode("register"));

togglePw.addEventListener("click", ()=>{ passEl.type = passEl.type==="password" ? "text" : "password"; });
togglePw2.addEventListener("click", ()=>{ pass2El.type = pass2El.type==="password" ? "text" : "password"; });

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

// Redirect dönüşünde login ekranında takılma ihtimaline karşı:
getRedirectResult(auth).catch(()=>{});

/* =========================
   Auth state
========================= */
appMain.classList.add("hidden");
openAuthModal();
setMode("login");
setTab("normal");

onAuthStateChanged(auth, async (user)=>{
  currentUser = user || null;

  if (currentUser){
    closeAuthModal();
    appMain.classList.remove("hidden");
    await loadFavorites();
    startLoop();
    if (qEl.value.trim()) renderSearchRows(qEl.value.trim());
  } else {
    stopLoop();
    appMain.classList.add("hidden");
    openAuthModal();
  }
});

btnLogout.addEventListener("click", async ()=>{
  try{ await signOut(auth); }catch{}
});

/* =========================
   Normal search
========================= */
btnSearch.addEventListener("click", ()=>{
  renderSearchRows(qEl.value);
});
qEl.addEventListener("keydown", (e)=>{
  if (e.key==="Enter") renderSearchRows(qEl.value);
});
btnClear.addEventListener("click", ()=>{
  qEl.value = "";
  searchResults.className = "listBox emptyBox";
  searchResults.textContent = "Henüz arama yapılmadı.";
});
btnOpenSelected.addEventListener("click", ()=>{
  const q = qEl.value.trim();
  if (!q) return;
  for (const s of SITES.filter(x=>selectedSites.has(x.key))){
    window.open(s.build(q), "_blank", "noopener");
  }
});

/* =========================
   Tabs
========================= */
tabNormal.addEventListener("click", ()=>setTab("normal"));
tabAIText.addEventListener("click", ()=>setTab("ai"));
tabAIVisual.addEventListener("click", ()=>setTab("visual"));

/* =========================
   AI Settings (modal)
========================= */
btnAISettings.addEventListener("click", openAIModal);
btnAISettings2.addEventListener("click", openAIModal);
btnCloseAI.addEventListener("click", closeAIModal);

btnSaveAI.addEventListener("click", async ()=>{
  try{
    aiMsg.textContent = "Kaydediliyor...";
    await saveAIConfigEncrypted({
      apiKey: aiKey.value.trim(),
      pin: aiPin.value.trim(),
      rememberPin: !!aiRemember.checked
    });
    if (aiRemember.checked) setSessionPin(aiPin.value.trim());
    aiMsg.textContent = "Kaydedildi ✅";
    showToast("AI ayarları kaydedildi.");
    setTimeout(closeAIModal, 400);
  }catch(e){
    aiMsg.textContent = String(e?.message || e || "AI ayar hatası");
  }
});

btnClearAI.addEventListener("click", ()=>{
  clearAIConfig();
  aiKey.value = "";
  aiPin.value = "";
  aiRemember.checked = false;
  aiMsg.textContent = "Sıfırlandı.";
  showToast("AI ayarları sıfırlandı.");
});

async function ensureAIConfig(){
  if (hasAIConfig()) return true;
  openAIModal();
  throw new Error("AI key kayıtlı değil. AI Ayar’dan kaydet.");
}

/* =========================
   AI Text Search (SAĞLAM)
========================= */
btnAISearch.addEventListener("click", async ()=>{
  try{
    await ensureAIConfig();
    const q = aiQ.value.trim();
    if (!q) return;

    aiResults.className = "listBox";
    aiResults.innerHTML = `<div class="emptyBox">AI düşünüyor...</div>`;

    const out = await aiTextSearch({ query:q, pin:null });

    // UI: site bazlı öneri → tıkla normal aramaya aktar
    aiResults.innerHTML = "";
    for (const r of out){
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="rowLeft">
          <div class="rowTitle">${r.site}</div>
          <div class="rowSub">${r.query}</div>
          <div class="rowSub" style="margin-top:6px">${r.reason || ""}</div>
        </div>
        <div class="rowRight">
          <button class="btnPrimary sm">Ara</button>
        </div>
      `;
      row.querySelector("button").addEventListener("click", ()=>{
        setTab("normal");
        qEl.value = r.query || q;
        renderSearchRows(qEl.value);
      });
      aiResults.appendChild(row);
    }

    if (!out.length){
      aiResults.className = "listBox emptyBox";
      aiResults.textContent = "AI sonuç üretmedi.";
    }
  }catch(e){
    aiResults.className = "listBox emptyBox";
    aiResults.textContent = String(e?.message || e || "AI hata");
  }
});

/* =========================
   AI Visual Search (ÜRÜN FOTO + METİN)
========================= */
btnAIVision.addEventListener("click", async ()=>{
  try{
    await ensureAIConfig();

    const file = imgPicker.files?.[0];
    if (!file){
      aiVisionBox.className = "listBox emptyBox";
      aiVisionBox.textContent = "Önce görsel seç.";
      return;
    }

    aiVisionBox.className = "listBox";
    aiVisionBox.innerHTML = `<div class="emptyBox">Görsel analiz ediliyor...</div>`;

    const res = await aiVisionDetect({ file, pin:null });

    // thumbnail
    const url = URL.createObjectURL(file);

    aiVisionBox.innerHTML = "";
    const card = document.createElement("div");
    card.className = "row";
    card.innerHTML = `
      <div class="aiCard">
        <img class="aiThumb" src="${url}" alt="ürün">
        <div>
          <div class="rowTitle">${res.product || "Ürün"}</div>
          <div class="rowSub"><b>Arama:</b> ${res.search || ""}</div>
          <div class="rowSub" style="margin-top:8px">${res.notes ? res.notes : ""}</div>
        </div>
      </div>
      <div class="rowRight">
        <button class="btnPrimary sm">Normal Aramada Aç</button>
      </div>
    `;

    card.querySelector("button").addEventListener("click", ()=>{
      setTab("normal");
      qEl.value = res.search || "";
      renderSearchRows(qEl.value);
    });

    aiVisionBox.appendChild(card);

  }catch(e){
    aiVisionBox.className = "listBox emptyBox";
    aiVisionBox.textContent = String(e?.message || e || "Görsel AI hata");
  }
});

/* =========================
   Favorites controls
========================= */
favSort.addEventListener("change", renderFavorites);
btnRefreshFav.addEventListener("click", loadFavorites);
