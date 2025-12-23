// app.js (FULL) — Favori ekleme DÜZELTİLDİ
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
const btnAI = document.getElementById("btnAI");

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
let notifLog = [];  // local notification log

const SITES = [
  { key:"trendyol", name:"Trendyol", build:(q)=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", build:(q)=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11", name:"N11", build:(q)=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazontr", name:"Amazon TR", build:(q)=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"pazarama", name:"Pazarama", build:(q)=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:(q)=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key:"idefix", name:"idefix", build:(q)=>`https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` },
];

const selectedSites = new Set(SITES.map(s=>s.key)); // default all selected

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

function safeNum(v){
  const n = Number(String(v).replace(/[^\d.,]/g,"").replace(",","."));
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
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
    });
    sitePills.appendChild(pill);
  }
}

/* =========================
   Firestore: Favorites
========================= */
function favDocId(siteKey, queryText){
  return `${siteKey}__${String(queryText||"").trim().toLowerCase()}`
    .replace(/[^\w\-_.]+/g,"_")
    .slice(0, 180);
}

async function addFavorite(queryText, site, url){
  if (!currentUser) {
    showToast("Favori için giriş yapmalısın.");
    return;
  }

  const q = String(queryText || "").trim();
  if (!q) { showToast("Arama boş olamaz."); return; }
  if (!site?.key || !site?.name) { showToast("Site bilgisi eksik."); return; }

  const id = favDocId(site.key, q);
  const ref = doc(db, "users", currentUser.uid, "favorites", id);

  const snap = await getDoc(ref);
  if (snap.exists()){
    showToast("Zaten favoride.");
    return;
  }

  await setDoc(ref, {
    query: q,
    queryLower: q.toLowerCase(),
    siteKey: site.key,
    siteName: site.name,
    url,
    createdAt: serverTimestamp(),

    // worker/cron için takip alanları
    lastPrice: null,
    history: [],                 // [{t: ISO, p: number}]
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastError: null,

    // retry mantığı
    nextTryAt: Date.now() + 15_000,
    retryCount: 0,

    // AI (sonradan doldurulur)
    aiComment: null,
    aiCommentUpdatedAt: null
  }, { merge:false });

  showToast("Favoriye eklendi.");
}

async function removeFavorite(siteKey, queryText){
  if (!currentUser) return;
  const id = favDocId(siteKey, queryText);
  await deleteDoc(doc(db, "users", currentUser.uid, "favorites", id));
  showToast("Favoriden kaldırıldı.");
}

async function addPriceToFavorite(favId, price){
  if (!currentUser) return;

  const ref = doc(db, "users", currentUser.uid, "favorites", favId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const d = snap.data();
  const history = Array.isArray(d.history) ? d.history.slice() : [];
  history.push({ t: nowISO(), p: price });

  await updateDoc(ref, {
    lastPrice: price,
    history,
    lastSuccessAt: Date.now(),
    lastCheckedAt: Date.now(),
    lastError: null,
    retryCount: 0,
    nextTryAt: Date.now() + 20 * 60 * 1000 // 20dk sonra
  });
}

async function loadFavorites(){
  if (!currentUser) return;

  const sort = favSort.value;

  const qy = query(collection(db, "users", currentUser.uid, "favorites"), orderBy("queryLower", "asc"));
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

      lastError: d.lastError ?? null,
      lastCheckedAt: d.lastCheckedAt ?? null
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
   %10 drop check (bildirim demo)
========================= */
function checkDropsOnLoad(){
  for (const f of favCache){
    const h = f.history || [];
    if (h.length < 2) continue;
    const prev = h[h.length-2]?.p;
    const last = h[h.length-1]?.p;
    if (prev == null || last == null || prev <= 0) continue;

    const diff = (prev - last) / prev * 100;
    if (diff >= 10){
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
  const labels = h.map(x=> new Date(x.t).toLocaleString("tr-TR"));
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
        pointRadius: 2
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

    const warn = f.lastError ? `⚠ ${escapeHtml(String(f.lastError).slice(0,60))}` : "";
    const checked = f.lastCheckedAt ? new Date(f.lastCheckedAt).toLocaleString("tr-TR") : "—";

    el.innerHTML = `
      <div class="favTop">
        <div>
          <div class="favName">${escapeHtml(f.query)}</div>
          <div class="favMeta">${escapeHtml(f.siteName)} • Son kontrol: ${escapeHtml(checked)} ${warn ? " • " + warn : ""}</div>
        </div>
        <div class="favPrice">${priceText}</div>
      </div>

      <div class="favBtns">
        <button class="btnOpen">${escapeHtml(f.siteName)} Aç</button>
        <button class="btnCopy">Copy Link</button>
        <button class="btnAddPrice">Fiyat ekle</button>
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

    // Add price (elle girme) — sen istemiyorsan bunu kaldırabiliriz
    el.querySelector(".btnAddPrice").addEventListener("click", async ()=>{
      const v = prompt("Fiyat (₺) gir:", f.lastPrice ?? "");
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
   Search rows
========================= */
function renderSearchRows(queryText){
  const q = String(queryText||"").trim();
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
        <button class="btnFav ${favOn ? "on":""}">
          <svg class="miniIco" viewBox="0 0 24 24"><path d="M12 21s-7-4.35-9.5-8.5C.3 8.5 2.7 5 6.5 5c2 0 3.2 1 3.9 2 .7-1 1.9-2 3.9-2C18.1 5 20.5 8.5 21.5 12.5 19 16.65 12 21 12 21Z"/></svg>
          ${favOn ? "Favoride":"Favori Ekle"}
        </button>
      </div>
    `;

    item.querySelector(".btnOpen").addEventListener("click", ()=>{
      window.open(r.url, "_blank", "noopener");
    });

    // ✅ FAVORI CLICK (DÜZELTİLDİ)
    item.querySelector(".btnFav").addEventListener("click", async ()=>{
      if (!currentUser) {
        showToast("Favori eklemek için giriş yapmalısın.");
        return;
      }

      try{
        if (favOn){
          await removeFavorite(r.site.key, q);
        } else {
          await addFavorite(q, r.site, r.url);
        }

        await loadFavorites();
        renderSearchRows(qEl.value);
      }catch(e){
        showToast("Favori hatası: " + (e?.message || e));
      }
    });

    searchResults.appendChild(item);
  }
}

/* =========================
   Open Selected Sites
========================= */
function openSelectedSites(queryText){
  const q = String(queryText||"").trim();
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
   AI button (demo)
========================= */
function getAISettings(){
  try { return JSON.parse(localStorage.getItem("fiyattakip_ai")||"{}"); } catch { return {}; }
}
function setAISettings(obj){
  localStorage.setItem("fiyattakip_ai", JSON.stringify(obj));
}

btnAI?.addEventListener("click", ()=>{
  const s = getAISettings();
  const key = prompt("Gemini API Key (cihazında saklanır):", s.key || "");
  if (!key) { showToast("API key girilmedi."); return; }
  setAISettings({ key });
  showToast("AI ayarları kaydedildi.");
});

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
getRedirectResult(auth).catch(()=>{});

/* =========================
   Main UI events
========================= */
renderSitePills();

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
   Auth state
========================= */
loadNotifLog();
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
    return "Google giriş hatası: unauthorized-domain. Firebase → Authentication → Settings → Authorized domains kısmına siteni ekle.";
  }
  if (msg.includes("auth/api-key-not-valid")){
    return "Firebase: api-key-not-valid. Yanlış projeye ait config veya eski cache olabilir. sw.js cache version artırıp site verisini temizle.";
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
