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

import {
  loadAIConfig, hasAIConfig, saveAIConfigEncrypted, clearAIConfig,
  getSessionPin, setSessionPin, clearSessionPin,
  runTextAI, runVisionAI
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
   Install prompt
========================= */
let deferredPrompt = null;
const btnInstall = document.getElementById("btnInstall");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  btnInstall.style.display = "inline-flex";
});

btnInstall.addEventListener("click", async ()=>{
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(()=>{});
  deferredPrompt = null;
  btnInstall.style.display = "none";
});

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
const btnCleanCache = document.getElementById("btnCleanCache");

const btnLogout = document.getElementById("btnLogout");
const btnBell = document.getElementById("btnBell");

const tabNormal = document.getElementById("tabNormal");
const tabAI = document.getElementById("tabAI");
const tabVision = document.getElementById("tabVision");

const panelNormal = document.getElementById("panelNormal");
const panelAI = document.getElementById("panelAI");
const panelVision = document.getElementById("panelVision");

const sitePills = document.getElementById("sitePills");
const qEl = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");
const btnOpenSelected = document.getElementById("btnOpenSelected");
const searchResults = document.getElementById("searchResults");

const aiQ = document.getElementById("aiQ");
const btnAISearch = document.getElementById("btnAISearch");
const btnAIClear = document.getElementById("btnAIClear");
const aiResults = document.getElementById("aiResults");

const imgFile = document.getElementById("imgFile");
const btnVisionRun = document.getElementById("btnVisionRun");
const btnVisionLens = document.getElementById("btnVisionLens");
const btnVisionClear = document.getElementById("btnVisionClear");
const visionOut = document.getElementById("visionOut");
const visionHint = document.getElementById("visionHint");

const favList = document.getElementById("favList");
const favSort = document.getElementById("favSort");
const btnRefreshFav = document.getElementById("btnRefreshFav");

const toast = document.getElementById("toast");

const chartWrap = document.getElementById("chartWrap");
const btnCloseChart = document.getElementById("btnCloseChart");
const bigTitle = document.getElementById("bigTitle");
const bigCanvas = document.getElementById("bigCanvas");

/* AI settings modal */
const btnAISettings = document.getElementById("btnAISettings");
const aiWrap = document.getElementById("aiWrap");
const btnAIClose = document.getElementById("btnAIClose");
const aiKeyEl = document.getElementById("aiKey");
const aiPinEl = document.getElementById("aiPin");
const aiRememberEl = document.getElementById("aiRemember");
const btnAISave = document.getElementById("btnAISave");
const btnAIClearCfg = document.getElementById("btnAIClearCfg");
const aiMsg = document.getElementById("aiMsg");

/* =========================
   State
========================= */
let mode = "login"; // login | register
let currentUser = null;
let favCache = [];

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

function isMobile(){ return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

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

function favDocId(siteKey, url){
  return `${siteKey}__${String(url).trim()}`.replace(/[^\w\-_.:\/?=&]+/g,"_").slice(0, 900);
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
   Tabs
========================= */
function setTab(which){
  tabNormal.classList.toggle("active", which==="normal");
  tabAI.classList.toggle("active", which==="ai");
  tabVision.classList.toggle("active", which==="vision");

  panelNormal.classList.toggle("hidden", which!=="normal");
  panelAI.classList.toggle("hidden", which!=="ai");
  panelVision.classList.toggle("hidden", which!=="vision");
}
tabNormal.addEventListener("click", ()=>setTab("normal"));
tabAI.addEventListener("click", ()=>setTab("ai"));
tabVision.addEventListener("click", ()=>setTab("vision"));

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
   Search rows (normal)
========================= */
function renderSearchRows(queryText){
  const q = queryText.trim();
  if (!q){
    searchResults.className = "listBox emptyBox";
    searchResults.textContent = "Henüz arama yapılmadı.";
    return;
  }

  const selected = SITES.filter(s=>selectedSites.has(s.key));
  const rows = selected.map(s=>({ site:s, url:s.build(q) }));

  searchResults.className = "listBox";
  searchResults.innerHTML = "";

  for (const r of rows){
    const item = document.createElement("div");
    item.className = "item";

    item.innerHTML = `
      <div class="itemLeft">
        <div class="siteName">${r.site.name}</div>
        <div class="queryText">${escapeHtml(q)}</div>
      </div>
      <div class="itemRight">
        <button class="btnOpen">Aç</button>
        <button class="btnFav">Favori (giriş)</button>
      </div>
    `;

    item.querySelector(".btnOpen").addEventListener("click", ()=>{
      window.open(r.url, "_blank", "noopener");
    });

    item.querySelector(".btnFav").addEventListener("click", async ()=>{
      if (!currentUser){
        showToast("Favori için giriş yapmalısın.");
        openAuthModal();
        return;
      }
      // Normal arama satırını favoriye ekleme: ARAMA LİNKİ değil.
      // Burada sadece “arama kaydı” tutulur. Worker bu kaydı kullanarak en alakalı ürünleri bulur.
      await addFavoriteSearchIntent(r.site.key, r.site.name, q);
      await loadFavorites();
    });

    searchResults.appendChild(item);
  }
}

/* =========================
   Firestore: Favorites
   Mantık:
   - Normal aramada favori: {type:"search", query:"...", siteKey:"..."}  (worker bunu gerçek ürüne çevirir)
   - AI aramada favori: {type:"product", url:"...", title:"..."}       (worker direkt url’den fiyat çeker)
========================= */
function favCol(){
  return collection(db, "users", currentUser.uid, "favorites");
}

async function addFavoriteSearchIntent(siteKey, siteName, queryText){
  const id = `search__${siteKey}__${queryText.trim().toLowerCase()}`.replace(/[^\w\-_.]+/g,"_");
  const ref = doc(db, "users", currentUser.uid, "favorites", id);

  const existing = await getDoc(ref);
  if (existing.exists()){
    showToast("Zaten favoride.");
    return;
  }

  await setDoc(ref, {
    type: "search",
    siteKey,
    siteName,
    query: queryText.trim(),
    queryLower: queryText.trim().toLowerCase(),
    createdAt: serverTimestamp(),
    // Worker şu alanları dolduracak:
    resolved: false,
    productTitle: "",
    productUrl: "",
    lastPrice: null,
    history: [] // [{t: ISO, p: number}]
  });

  showToast("Favoriye eklendi. (Worker ürün bulacak)");
}

async function addFavoriteProduct(siteName, siteKey, title, url){
  const id = `product__${favDocId(siteKey, url)}`;
  const ref = doc(db, "users", currentUser.uid, "favorites", id);

  const existing = await getDoc(ref);
  if (existing.exists()){
    showToast("Zaten favoride.");
    return;
  }

  await setDoc(ref, {
    type: "product",
    siteKey,
    siteName,
    productTitle: title.trim(),
    productUrl: url.trim(),
    createdAt: serverTimestamp(),
    resolved: true,
    lastPrice: null,
    history: []
  });

  showToast("Favoriye eklendi.");
}

async function removeFavorite(favId){
  await deleteDoc(doc(db, "users", currentUser.uid, "favorites", favId));
  showToast("Silindi.");
}

async function loadFavorites(){
  if (!currentUser){
    favCache = [];
    favList.className = "favList emptyBox";
    favList.textContent = "Giriş yapınca favoriler görünür.";
    return;
  }

  const sort = favSort.value;
  const qy = query(favCol(), orderBy("createdAt", "desc"));
  const snaps = await getDocs(qy);

  favCache = snaps.docs.map(d=>{
    const x = d.data();
    return {
      id: d.id,
      type: x.type || "product",
      siteKey: x.siteKey || "",
      siteName: x.siteName || "",
      query: x.query || "",
      queryLower: x.queryLower || "",
      resolved: !!x.resolved,
      productTitle: x.productTitle || "",
      productUrl: x.productUrl || "",
      lastPrice: (x.lastPrice ?? null),
      history: Array.isArray(x.history) ? x.history : [],
      createdAtMs: x.createdAt?.toMillis?.() ?? 0
    };
  });

  if (sort === "site"){
    favCache.sort((a,b)=>{
      const s = (a.siteName||"").localeCompare(b.siteName||"");
      if (s!==0) return s;
      return (a.productTitle || a.query).localeCompare(b.productTitle || b.query);
    });
  }

  renderFavorites();
  checkDrops();
}

function checkDrops(){
  for (const f of favCache){
    const h = f.history || [];
    if (h.length < 2) continue;
    const prev = h[h.length-2]?.p;
    const last = h[h.length-1]?.p;
    if (prev == null || last == null || prev <= 0) continue;

    const diff = (prev - last) / prev * 100;
    if (diff >= 10){
      const title = `${f.siteName}: %${diff.toFixed(1)} düşüş`;
      const body = `${(f.productTitle || f.query)} → ${fmtTRY(prev)} → ${fmtTRY(last)}`;
      fireBrowserNotif(title, body);
    }
  }
}

/* =========================
   Charts
========================= */
const chartMap = new Map();
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
  bigTitle.textContent = `${fav.siteName} • ${(fav.productTitle || fav.query)}`;
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
  if (!currentUser){
    favList.className = "favList emptyBox";
    favList.textContent = "Giriş yapınca favoriler görünür.";
    return;
  }
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

    const title = f.type === "search"
      ? (f.resolved ? f.productTitle : `Arama: ${f.query}`)
      : f.productTitle;

    const meta = f.type === "search"
      ? (f.resolved ? "Ürün bulundu" : "Worker ürün arıyor…")
      : "Ürün";

    const priceText = f.lastPrice != null ? fmtTRY(f.lastPrice) : "Fiyat yok";

    el.innerHTML = `
      <div class="favTop">
        <div>
          <div class="favName">${escapeHtml(title)}</div>
          <div class="favMeta">${escapeHtml(f.siteName)} • ${escapeHtml(meta)}</div>
        </div>
        <div class="favPrice">${priceText}</div>
      </div>

      <div class="favBtns">
        <button class="btnOpen">${escapeHtml(f.siteName)} Aç</button>
        <button class="btnDelete">Sil</button>
      </div>

      <div class="chartBox">
        <div class="chartArea"></div>
        <button class="btnBig">Grafiği büyüt</button>
      </div>
    `;

    el.querySelector(".btnOpen").addEventListener("click", ()=>{
      const url = f.resolved ? f.productUrl : (SITES.find(s=>s.key===f.siteKey)?.build(f.query) || "");
      if (!url) { showToast("Link yok."); return; }
      window.open(url, "_blank", "noopener");
    });

    el.querySelector(".btnDelete").addEventListener("click", async ()=>{
      if (!confirm("Silinsin mi?")) return;
      await removeFavorite(f.id);
      await loadFavorites();
    });

    const chartArea = el.querySelector(".chartArea");
    const h = f.history || [];
    if (h.length < 2){
      chartArea.innerHTML = `<div class="chartHint">Grafik için en az 2 fiyat kaydı lazım. (Worker fiyat yazdıkça oluşur)</div>`;
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
      if ((f.history||[]).length < 2){ showToast("Grafik için en az 2 fiyat lazım."); return; }
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
  for (const r of setDedup(selected.map(s=>s.build(q)))){
    window.open(r, "_blank", "noopener");
  }
}
function setDedup(arr){
  const s=new Set(); const out=[];
  for(const x of arr){ if(!s.has(x)){ s.add(x); out.push(x);} }
  return out;
}

/* =========================
   AI Settings Modal
========================= */
function openAIModal(){
  const cfg = loadAIConfig();
  aiKeyEl.value = "";
  aiPinEl.value = "";
  aiRememberEl.checked = !!getSessionPin();
  aiMsg.textContent = hasAIConfig() ? "AI anahtarı kayıtlı (şifreli)." : "AI anahtarı kayıtlı değil.";
  aiWrap.classList.remove("hidden");
}
function closeAIModal(){
  aiWrap.classList.add("hidden");
}

btnAISettings.addEventListener("click", openAIModal);
btnAIClose.addEventListener("click", closeAIModal);

btnAISave.addEventListener("click", async ()=>{
  try{
    aiMsg.textContent = "Kaydediliyor…";
    await saveAIConfigEncrypted({
      apiKey: aiKeyEl.value.trim(),
      pin: aiPinEl.value.trim(),
      rememberPin: aiRememberEl.checked
    });
    aiMsg.textContent = "Kaydedildi ✅";
    // artık OK deyince kapansın
    closeAIModal();
    showToast("AI ayarları kaydedildi.");
  }catch(e){
    aiMsg.textContent = "Hata: " + (e?.message || e);
  }
});

btnAIClearCfg.addEventListener("click", ()=>{
  clearAIConfig();
  clearSessionPin();
  aiMsg.textContent = "AI kaydı silindi.";
  showToast("AI kaydı silindi.");
});

/* =========================
   AI Search
========================= */
async function requireAIReady(){
  if (!hasAIConfig()){
    showToast("Önce AI Ayarları’ndan key gir.");
    openAIModal();
    return false;
  }
  // PIN yoksa sor 1 kere
  if (!getSessionPin()){
    const pin = prompt("AI PIN (oturumu hatırla açık değil):");
    if (!pin) return false;
    setSessionPin(pin);
  }
  return true;
}

btnAISearch.addEventListener("click", async ()=>{
  const q = aiQ.value.trim();
  if (!q){ showToast("Bir şey yaz."); return; }
  if (!await requireAIReady()) return;

  aiResults.className = "listBox";
  aiResults.innerHTML = `<div class="emptyBox">AI düşünüyor…</div>`;

  try{
    const prompt = `
Türkiye e-ticaret sitelerinde "${q}" için en alakalı ürünleri bul.
Sadece bu siteler: Trendyol, Hepsiburada, N11, Amazon TR, Pazarama, ÇiçekSepeti, idefix.
Her sonuç: site adı + ürün başlığı + direkt ürün URL.
    `.trim();

    const arr = await runTextAI({ prompt });
    renderAIResults(arr);
  }catch(e){
    aiResults.className = "listBox emptyBox";
    aiResults.textContent = "AI sonuç üretemedi: " + (e?.message || e);
  }
});

btnAIClear.addEventListener("click", ()=>{
  aiQ.value = "";
  aiResults.className = "listBox emptyBox";
  aiResults.textContent = "Henüz AI arama yapılmadı.";
});

function renderAIResults(arr){
  if (!Array.isArray(arr) || arr.length===0){
    aiResults.className = "listBox emptyBox";
    aiResults.textContent = "Sonuç yok.";
    return;
  }

  aiResults.className = "listBox";
  aiResults.innerHTML = "";

  for (const r of arr.slice(0,8)){
    const site = r.site || "Site";
    const title = r.title || "Ürün";
    const url = r.url || "";
    const note = r.note || "";

    const siteKey = guessSiteKey(site, url);

    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="itemLeft">
        <div class="siteName">${escapeHtml(title)}</div>
        <div class="queryText"><span class="badge">${escapeHtml(site)}</span> ${escapeHtml(note)}</div>
      </div>
      <div class="itemRight">
        <button class="btnOpen">Aç</button>
        <button class="btnFav">Favori (giriş)</button>
      </div>
    `;

    item.querySelector(".btnOpen").addEventListener("click", ()=>{
      if (!url){ showToast("Link yok."); return; }
      window.open(url, "_blank", "noopener");
    });

    item.querySelector(".btnFav").addEventListener("click", async ()=>{
      if (!currentUser){
        showToast("Favori için giriş yapmalısın.");
        openAuthModal();
        return;
      }
      if (!url){ showToast("Link yok."); return; }
      await addFavoriteProduct(site, siteKey, title, url);
      await loadFavorites();
    });

    aiResults.appendChild(item);
  }
}

function guessSiteKey(site, url){
  const s = (site||"").toLowerCase();
  const u = (url||"").toLowerCase();
  if (u.includes("trendyol")) return "trendyol";
  if (u.includes("hepsiburada")) return "hepsiburada";
  if (u.includes("n11")) return "n11";
  if (u.includes("amazon.com.tr")) return "amazontr";
  if (u.includes("pazarama")) return "pazarama";
  if (u.includes("ciceksepeti")) return "ciceksepeti";
  if (u.includes("idefix")) return "idefix";
  if (s.includes("trendyol")) return "trendyol";
  if (s.includes("hepsi")) return "hepsiburada";
  if (s.includes("n11")) return "n11";
  if (s.includes("amazon")) return "amazontr";
  if (s.includes("pazarama")) return "pazarama";
  if (s.includes("çiçek") || s.includes("cicek")) return "ciceksepeti";
  if (s.includes("idefix")) return "idefix";
  return "trendyol";
}

/* =========================
   Vision Search
========================= */
btnVisionRun.addEventListener("click", async ()=>{
  if (!await requireAIReady()) return;

  const f = imgFile.files?.[0];
  if (!f){ showToast("Önce foto seç."); return; }

  visionOut.className = "listBox";
  visionOut.innerHTML = `<div class="emptyBox">Analiz ediliyor…</div>`;

  try{
    const { extractedText, query } = await runVisionAI({ file: f });
    visionHint.textContent = `Bulunan metin: ${query}`;

    // Çıkan metinle AI ürün linki üret
    const prompt = `
Fotoğraftan çıkan ürün/metin: "${query}".
Türkiye e-ticaret sitelerinde en alakalı ürünleri bul:
Trendyol, Hepsiburada, N11, Amazon TR, Pazarama, ÇiçekSepeti, idefix.
Sadece JSON dizi: site,title,url,note.
    `.trim();

    const arr = await runTextAI({ prompt });
    renderVisionResults(extractedText, query, arr);
  }catch(e){
    visionOut.className = "listBox emptyBox";
    visionOut.textContent = "Görsel analiz başarısız: " + (e?.message || e);
  }
});

btnVisionClear.addEventListener("click", ()=>{
  imgFile.value = "";
  visionHint.textContent = "Fotoğraf seç → Analiz → çıkan metinle AI sonuç üret.";
  visionOut.className = "listBox emptyBox";
  visionOut.textContent = "Henüz görsel analiz yapılmadı.";
});

btnVisionLens.addEventListener("click", ()=>{
  // Dosyayı doğrudan lens'e veremiyoruz, bu yüzden kullanıcıya pratik alternatif:
  // Google Lens sayfasını aç (kullanıcı oradan yükler)
  window.open("https://lens.google.com/", "_blank", "noopener");
});

function renderVisionResults(extractedText, query, arr){
  visionOut.className = "listBox";
  visionOut.innerHTML = "";

  const head = document.createElement("div");
  head.className = "emptyBox";
  head.innerHTML = `<b>Çıkan metin:</b> ${escapeHtml(extractedText || query)}`;
  visionOut.appendChild(head);

  if (!Array.isArray(arr) || arr.length===0){
    const e = document.createElement("div");
    e.className = "emptyBox";
    e.textContent = "AI sonuç üretemedi. Google Lens butonunu kullan.";
    visionOut.appendChild(e);
    return;
  }

  // AI sonuçlarını listeler
  for (const r of arr.slice(0,8)){
    const site = r.site || "Site";
    const title = r.title || "Ürün";
    const url = r.url || "";
    const note = r.note || "";
    const siteKey = guessSiteKey(site, url);

    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="itemLeft">
        <div class="siteName">${escapeHtml(title)}</div>
        <div class="queryText"><span class="badge">${escapeHtml(site)}</span> ${escapeHtml(note)}</div>
      </div>
      <div class="itemRight">
        <button class="btnOpen">Aç</button>
        <button class="btnFav">Favori (giriş)</button>
      </div>
    `;

    item.querySelector(".btnOpen").addEventListener("click", ()=>{
      if (!url){ showToast("Link yok."); return; }
      window.open(url, "_blank", "noopener");
    });

    item.querySelector(".btnFav").addEventListener("click", async ()=>{
      if (!currentUser){
        showToast("Favori için giriş yapmalısın.");
        openAuthModal();
        return;
      }
      if (!url){ showToast("Link yok."); return; }
      await addFavoriteProduct(site, siteKey, title, url);
      await loadFavorites();
    });

    visionOut.appendChild(item);
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
    if (isMobile()) await signInWithRedirect(auth, googleProvider);
    else await signInWithPopup(auth, googleProvider);
  }catch(e){
    setAuthError(prettyAuthError(e));
  }
});

btnLogout.addEventListener("click", async ()=>{
  try{ await signOut(auth); showToast("Çıkış yapıldı."); }catch{}
});

/* Redirect result catch */
getRedirectResult(auth).catch(()=>{});

/* Bell */
btnBell.addEventListener("click", async ()=>{
  const ok = await ensureNotifPermission();
  showToast(ok ? "Bildirimler açık." : "Bildirim izni verilmedi.");
});

/* Cache clean (login ekranında) */
btnCleanCache.addEventListener("click", async ()=>{
  try{
    // SW unregister
    if ("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
    // caches clear
    if (window.caches){
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
    showToast("Önbellek temizlendi.");
    // sayfayı yenile
    setTimeout(()=>location.reload(), 600);
  }catch(e){
    showToast("Temizleme hatası.");
  }
});

/* =========================
   Main UI events
========================= */
renderSitePills();

btnSearch.addEventListener("click", ()=>renderSearchRows(qEl.value.trim()));
qEl.addEventListener("keydown", (e)=>{ if (e.key==="Enter"){ e.preventDefault(); btnSearch.click(); } });

btnClear.addEventListener("click", ()=>{
  qEl.value = "";
  searchResults.className = "listBox emptyBox";
  searchResults.textContent = "Henüz arama yapılmadı.";
});

btnOpenSelected.addEventListener("click", ()=>openSelectedSites(qEl.value));
favSort.addEventListener("change", ()=>loadFavorites());
btnRefreshFav.addEventListener("click", ()=>loadFavorites());

/* =========================
   Auth state
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
    await loadFavorites();
  }
});

/* =========================
   Auth error text
========================= */
function prettyAuthError(e){
  const msg = String(e?.message || e || "");
  if (msg.includes("auth/unauthorized-domain")){
    return "Google giriş hatası: Firebase → Authentication → Settings → Authorized domains içine fiyattakip.github.io ekle.";
  }
  if (msg.includes("auth/invalid-credential")) return "Hatalı giriş bilgisi.";
  if (msg.includes("auth/email-already-in-use")) return "Bu email zaten kayıtlı.";
  if (msg.includes("auth/weak-password")) return "Şifre çok zayıf.";
  return "Hata: " + msg;
}
