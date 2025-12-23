import { auth, db, googleProvider } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query as fsQuery,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  aiTextSearch,
  aiVisionDetect,
  hasAIConfig,
  loadAIConfig,
  saveAIConfigEncrypted,
  clearAIConfig,
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
   Helpers
========================= */
const $ = (id) => document.getElementById(id);

function show(el){ if (el) el.classList.remove("hidden"); }
function hide(el){ if (el) el.classList.add("hidden"); }

let toastTimer = null;
function showToast(msg){
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.style.display="none"; }, 2200);
}

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function encQ(s){ return encodeURIComponent(String(s||"").trim()); }
function openUrl(url){ window.open(url, "_blank", "noopener,noreferrer"); }

function isMobile(){
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function nowISO(){
  const d = new Date();
  return d.toISOString().slice(0,19).replace("T"," ");
}

function fmtTRY(n){
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("tr-TR", { style:"currency", currency:"TRY" });
}

function parsePriceMaybe(x){
  // "12.345,67" / "12345.67" vb.
  if (x == null) return null;
  const s = String(x).trim();
  if (!s) return null;
  let t = s.replace(/[^\d.,-]/g, "");
  if (t.includes(",") && t.includes(".")) {
    // tr gibi: 12.345,67 -> 12345.67
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(",") && !t.includes(".")) {
    // 123,45 -> 123.45
    t = t.replace(",", ".");
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function msToText(v){
  if (!v) return "—";
  try{
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("tr-TR");
  }catch{ return "—"; }
}

/* =========================
   DOM
========================= */
// Main wrappers
const appMain = $("appMain");
const authWrap = $("authWrap");
const authError = $("authError");

// Auth
const tabLogin = $("tabLogin");
const tabRegister = $("tabRegister");
const pass2Wrap = $("pass2Wrap");
const btnAuthMain = $("btnAuthMain");
const btnGoogle = $("btnGoogle");
const btnAuthCacheClear = $("btnAuthCacheClear");

const emailEl = $("email");
const passEl = $("pass");
const pass2El = $("pass2");
const togglePw = $("togglePw");
const togglePw2 = $("togglePw2");

// Top buttons
const btnLogout = $("btnLogout");
const btnBell = $("btnBell");
const btnCacheClear = $("btnCacheClear");
const btnInstall = $("btnInstall");

// Tabs
const tabNormal = $("tabNormal");
const tabAIText = $("tabAIText");
const tabAIVisual = $("tabAIVisual");
const panelNormal = $("panelNormal");
const panelAIText = $("panelAIText");
const panelAIVisual = $("panelAIVisual");

// Normal search
const sitePills = $("sitePills");
const qEl = $("q");
const btnSearch = $("btnSearch");
const btnClear = $("btnClear");
const btnOpenSelected = $("btnOpenSelected");
const searchResults = $("searchResults");

// AI text
const aiQ = $("aiQ");
const btnAISearch = $("btnAISearch");
const btnAISettings = $("btnAISettings");
const btnAISettings2 = $("btnAISettings2");
const aiResults = $("aiResults");

// AI visual
const imgPicker = $("imgPicker");
const btnAIVision = $("btnAIVision");
const aiVisionBox = $("aiVisionBox");

// Favorites
const favList = $("favList");
const favSort = $("favSort");
const btnRefreshFav = $("btnRefreshFav");

// AI settings modal
const aiWrap = $("aiWrap");      // (bazı sürümlerde aiModal olabilir)
const aiModal = $("aiModal");    // iki id’yi de destekleyelim
const btnCloseAI = $("btnCloseAI") || $("closeAi");
const aiKey = $("aiKey") || $("gemKey");
const aiPin = $("aiPin") || $("gemPin");
const aiRemember = $("aiRemember") || $("rememberPin");
const btnSaveAI = $("btnSaveAI") || $("saveAi");
const btnClearAI = $("btnClearAI") || $("clearAi");
const aiInfo = $("aiInfo") || $("aiSavedNote");

// Graph modal
const chartWrap = $("chartWrap") || $("graphModal");
const btnCloseChart = $("btnCloseChart") || $("closeGraph");
const bigTitle = $("bigTitle") || $("graphTitle");
const bigCanvas = $("bigCanvas") || $("graphCanvas");
const graphHint = $("graphHint");

/* =========================
   State
========================= */
let mode = "login";         // auth mode: login/register
let currentUser = null;
let favCache = [];
let deferredPrompt = null;

/* =========================
   Sites
   NOT: Sıralama artık fiyat değil, “alakalı ürün gelsin” mantığı için
   biz linki direkt site aramasına yönlendiriyoruz. Gerçek ürün sıralaması
   site içinde zaten “alakaya göre” gelir.
========================= */
const SITES = [
  { key:"trendyol",    name:"Trendyol",     build:(q)=>`https://www.trendyol.com/sr?q=${encQ(q)}` },
  { key:"hepsiburada", name:"Hepsiburada",  build:(q)=>`https://www.hepsiburada.com/ara?q=${encQ(q)}` },
  { key:"n11",         name:"N11",          build:(q)=>`https://www.n11.com/arama?q=${encQ(q)}` },
  { key:"amazon",      name:"Amazon TR",    build:(q)=>`https://www.amazon.com.tr/s?k=${encQ(q)}` },
  { key:"pazarama",    name:"Pazarama",     build:(q)=>`https://www.pazarama.com/arama?q=${encQ(q)}` },
  // Çiçeksepeti & idefix bazen açmıyor demiştin → daha “genel” arama url’i
  { key:"ciceksepeti", name:"ÇiçekSepeti",  build:(q)=>`https://www.ciceksepeti.com/arama?query=${encQ(q)}` },
  { key:"idefix",      name:"idefix",       build:(q)=>`https://www.idefix.com/arama/?q=${encQ(q)}` }
];

/* =========================
   Install button
========================= */
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  if (btnInstall) btnInstall.style.display = "";
});
if (btnInstall){
  btnInstall.addEventListener("click", async ()=>{
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(()=>{});
    deferredPrompt = null;
    btnInstall.style.display = "none";
  });
}

/* =========================
   Tabs UI
========================= */
function setTab(tab){
  // tab: "normal" | "aiText" | "aiVisual"
  const isN = tab === "normal";
  const isA = tab === "aiText";
  const isV = tab === "aiVisual";

  if (tabNormal) tabNormal.classList.toggle("active", isN);
  if (tabAIText) tabAIText.classList.toggle("active", isA);
  if (tabAIVisual) tabAIVisual.classList.toggle("active", isV);

  if (panelNormal) panelNormal.classList.toggle("hidden", !isN);
  if (panelAIText) panelAIText.classList.toggle("hidden", !isA);
  if (panelAIVisual) panelAIVisual.classList.toggle("hidden", !isV);
}

if (tabNormal) tabNormal.addEventListener("click", ()=>setTab("normal"));
if (tabAIText) tabAIText.addEventListener("click", ()=>setTab("aiText"));
if (tabAIVisual) tabAIVisual.addEventListener("click", ()=>setTab("aiVisual"));

/* =========================
   Selected sites pills
========================= */
function getSelectedSiteKeys(){
  const actives = Array.from(sitePills?.querySelectorAll(".pill.active") || []);
  if (!actives.length) return SITES.map(s=>s.key);
  return actives.map(p=>p.dataset.site).filter(Boolean);
}

function renderSitePills(){
  if (!sitePills) return;
  sitePills.innerHTML = "";
  for (const s of SITES){
    const b = document.createElement("button");
    b.className = "pill active";
    b.dataset.site = s.key;
    b.textContent = s.name;
    b.addEventListener("click", ()=>{
      b.classList.toggle("active");
    });
    sitePills.appendChild(b);
  }
}

/* =========================
   Auth UI
========================= */
function clearAuthError(){ if (authError) authError.textContent = ""; }
function setAuthError(msg){ if (authError) authError.textContent = msg; }

function prettyAuthError(e){
  const code = String(e?.code || "");
  if (code.includes("auth/invalid-email")) return "Email hatalı.";
  if (code.includes("auth/wrong-password")) return "Şifre yanlış.";
  if (code.includes("auth/weak-password")) return "Şifre çok zayıf (en az 6).";
  if (code.includes("auth/email-already-in-use")) return "Bu email zaten kayıtlı.";
  if (code.includes("auth/popup-closed-by-user")) return "Popup kapatıldı.";
  return String(e?.message || e || "Giriş hatası");
}

function setAuthMode(m){
  mode = m;
  clearAuthError();
  if (tabLogin) tabLogin.classList.toggle("active", m==="login");
  if (tabRegister) tabRegister.classList.toggle("active", m==="register");
  if (pass2Wrap) pass2Wrap.classList.toggle("hidden", m!=="register");
  if (btnAuthMain) btnAuthMain.textContent = (m==="register") ? "Hesap Oluştur" : "Giriş Yap";
}

if (tabLogin) tabLogin.addEventListener("click", ()=>setAuthMode("login"));
if (tabRegister) tabRegister.addEventListener("click", ()=>setAuthMode("register"));

if (togglePw) togglePw.addEventListener("click", ()=>{ if (passEl) passEl.type = (passEl.type==="password") ? "text" : "password"; });
if (togglePw2) togglePw2.addEventListener("click", ()=>{ if (pass2El) pass2El.type = (pass2El.type==="password") ? "text" : "password"; });

function openAuth(){
  if (!authWrap) return;
  authWrap.classList.remove("hidden");
}
function closeAuth(){
  if (!authWrap) return;
  authWrap.classList.add("hidden");
}

if (btnAuthMain){
  btnAuthMain.addEventListener("click", async ()=>{
    clearAuthError();
    const email = (emailEl?.value || "").trim();
    const pass = passEl?.value || "";

    try{
      if (mode === "register"){
        const pass2 = pass2El?.value || "";
        if (pass !== pass2) return setAuthError("Şifreler aynı değil.");
        await createUserWithEmailAndPassword(auth, email, pass);
        showToast("Hesap oluşturuldu ✅");
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
        showToast("Giriş başarılı ✅");
      }
    }catch(e){
      setAuthError(prettyAuthError(e));
    }
  });
}

if (btnGoogle){
  btnGoogle.addEventListener("click", async ()=>{
    clearAuthError();
    try{
      if (isMobile()) await signInWithRedirect(auth, googleProvider);
      else await signInWithPopup(auth, googleProvider);
    }catch(e){
      setAuthError(prettyAuthError(e));
    }
  });
}

/* Cache clear (auth ekranında) */
async function clearAllCaches(){
  try{
    // uygulama cache + localstorage
    const keep = new Set(["fiyattakip_ai_cfg_v4", "fiyattakip_ai_cfg_v5"]);
    for (const k of Object.keys(localStorage)){
      if (k.startsWith("fiyattakip_") && !keep.has(k)) localStorage.removeItem(k);
    }
    if ("caches" in window){
      const names = await caches.keys();
      await Promise.all(names.map(n=>caches.delete(n)));
    }
    showToast("Önbellek temizlendi.");
  }catch{
    showToast("Önbellek temizleme hatası.");
  }
}

if (btnAuthCacheClear) btnAuthCacheClear.addEventListener("click", clearAllCaches);
if (btnCacheClear) btnCacheClear.addEventListener("click", clearAllCaches);

/* =========================
   AI Settings Modal
========================= */
function getAIModalEl(){ return aiWrap || aiModal; }

function openAIModal(){
  const m = getAIModalEl();
  if (!m) return;

  // mevcut cfg varsa göster
  const cfg = loadAIConfig?.();
  if (aiKey) aiKey.value = cfg?.encApiKey ? "" : (aiKey.value || "");
  // pin kullanıcı girecek; sadece "remember" açıksa session’a yazıyoruz
  if (aiPin) aiPin.value = "";
  if (aiRemember) aiRemember.checked = !!getSessionPin?.();

  if (aiInfo){
    aiInfo.textContent = hasAIConfig()
      ? "AI key kayıtlı. PIN doğruysa AI çalışır."
      : "AI key gir → Kaydet.";
  }
  m.style.display = "";
}

function closeAIModal(){
  const m = getAIModalEl();
  if (!m) return;
  m.style.display = "none";
}

if (btnAISettings) btnAISettings.addEventListener("click", openAIModal);
if (btnAISettings2) btnAISettings2.addEventListener("click", openAIModal);
if (btnCloseAI) btnCloseAI.addEventListener("click", closeAIModal);

if (btnSaveAI){
  btnSaveAI.addEventListener("click", async ()=>{
    try{
      const key = (aiKey?.value || "").trim();
      const pin = (aiPin?.value || "").trim();
      const rememberPin = !!aiRemember?.checked;

      if (!key) throw new Error("API Key boş olamaz.");
      if (!pin || pin.length < 3) throw new Error("PIN en az 3 haneli olsun.");

      await saveAIConfigEncrypted({ apiKey:key, pin, rememberPin });
      if (rememberPin) setSessionPin(pin);

      if (aiInfo) aiInfo.textContent = "Kaydedildi ✅";
      showToast("AI ayarları kaydedildi ✅");

      // SENİN İSTEDİĞİN: Kaydet deyince X'e basmadan kapansın
      setTimeout(closeAIModal, 250);
    }catch(e){
      if (aiInfo) aiInfo.textContent = String(e?.message || e);
      showToast(String(e?.message || e));
    }
  });
}

if (btnClearAI){
  btnClearAI.addEventListener("click", ()=>{
    clearAIConfig();
    if (aiKey) aiKey.value = "";
    if (aiPin) aiPin.value = "";
    if (aiRemember) aiRemember.checked = false;
    if (aiInfo) aiInfo.textContent = "AI key silindi.";
    showToast("AI key silindi.");
  });
}

async function ensureAIConfig(){
  if (hasAIConfig()) return true;
  openAIModal();
  throw new Error("AI key kayıtlı değil. AI Ayarları’ndan gir.");
}

/* =========================
   Normal Search
========================= */
function buildSiteRow(site, q){
  const url = site.build(q);
  const logged = !!currentUser;

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <div class="rowLeft">
      <div class="rowTitle">${esc(site.name)}</div>
      <div class="rowSub">${esc(q)}</div>
    </div>
    <div class="rowRight">
      <button class="btnGhost sm btnCopy">Copy Link</button>
      <button class="btnPrimary sm btnOpen">Aç</button>
      <button class="btnGhost sm btnFav">${logged ? "Favoriye ekle" : "Favori (giriş)"}</button>
    </div>
  `;

  row.querySelector(".btnOpen").addEventListener("click", ()=> openUrl(url));
  row.querySelector(".btnCopy").addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(url);
      showToast("Link kopyalandı ✅");
    }catch{
      showToast("Kopyalama engellendi.");
    }
  });

  row.querySelector(".btnFav").addEventListener("click", async ()=>{
    if (!currentUser){
      showToast("Favori için giriş yap.");
      openAuth();
      return;
    }
    await addFavorite(site.key, site.name, q, url);
  });

  return row;
}

function renderSearchRows(q){
  if (!searchResults) return;
  const queryText = String(q||"").trim();
  if (!queryText){
    searchResults.className = "listBox emptyBox";
    searchResults.textContent = "Ürün yaz.";
    return;
  }
  searchResults.className = "listBox";
  searchResults.innerHTML = "";

  const selected = new Set(getSelectedSiteKeys());
  const sites = SITES.filter(s=>selected.has(s.key));

  for (const site of sites){
    searchResults.appendChild(buildSiteRow(site, queryText));
  }
}

if (btnSearch) btnSearch.addEventListener("click", ()=> renderSearchRows(qEl?.value || ""));
if (qEl) qEl.addEventListener("keydown", (e)=>{ if (e.key==="Enter") renderSearchRows(qEl.value); });

if (btnClear) btnClear.addEventListener("click", ()=>{
  if (qEl) qEl.value = "";
  if (searchResults){
    searchResults.className = "listBox emptyBox";
    searchResults.textContent = "Arama yapılmadı.";
  }
});

if (btnOpenSelected) btnOpenSelected.addEventListener("click", ()=>{
  const q = (qEl?.value || "").trim();
  if (!q) return;
  const selected = new Set(getSelectedSiteKeys());
  const sites = SITES.filter(s=>selected.has(s.key));
  for (const s of sites){
    openUrl(s.build(q));
  }
});

/* =========================
   Favorites (Firestore)
========================= */
function favDocId(siteKey, q){
  return (siteKey + "__" + String(q||"").trim().toLowerCase())
    .replace(/\s+/g,"_")
    .replace(/[^\w\-_.]/g,"")
    .slice(0, 180);
}

async function loadFavorites(){
  if (!currentUser){
    favCache = [];
    renderFavorites();
    return;
  }
  try{
    const ref = collection(db, "users", currentUser.uid, "favorites");
    const snap = await getDocs(fsQuery(ref, orderBy("createdAt","desc")));
    favCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  }catch(e){
    showToast("Favori okuma hata: " + (e?.message || e));
    favCache = [];
  }
  renderFavorites();
}

async function addFavorite(siteKey, siteName, q, url, extra = {}){
  if (!currentUser) return;

  const id = favDocId(siteKey, q);
  try{
    const ref = doc(db, "users", currentUser.uid, "favorites", id);
    await setDoc(ref, {
      siteKey,
      siteName,
      query: String(q||"").trim(),
      url,
      createdAt: serverTimestamp(),
      lastCheckedAt: null,
      lastPrice: null,
      lastError: null,
      priceHistory: [],
      aiComment: extra.aiComment ?? null,
      aiCommentUpdatedAt: extra.aiComment ? serverTimestamp() : null
    }, { merge:true });

    showToast("Favoriye eklendi ✅");
    await loadFavorites();
  }catch(e){
    showToast("Favori ekleme hata: " + (e?.message || e));
  }
}

async function deleteFavorite(id){
  if (!currentUser) return;
  try{
    await deleteDoc(doc(db, "users", currentUser.uid, "favorites", id));
    showToast("Silindi ✅");
    await loadFavorites();
  }catch(e){
    showToast("Silme hata: " + (e?.message || e));
  }
}

function sortFavorites(arr){
  const v = favSort?.value || "newest";
  const a = [...arr];

  if (v === "price_asc"){
    a.sort((x,y)=>(Number(x.lastPrice??1e18) - Number(y.lastPrice??1e18)));
  } else if (v === "price_desc"){
    a.sort((x,y)=>(Number(y.lastPrice??-1) - Number(x.lastPrice??-1)));
  } else if (v === "site"){
    a.sort((x,y)=>String(x.siteName||"").localeCompare(String(y.siteName||""), "tr"));
  } else {
    // newest (createdAt serverTimestamp ise client’ta yok olabilir → fallback id)
    a.sort((x,y)=>String(y.id).localeCompare(String(x.id)));
  }
  return a;
}

function drawSimpleChart(canvas, points){
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  // background
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(0,0,w,h);

  if (!points || points.length < 2){
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.font = "16px system-ui";
    ctx.fillText("Grafik için yeterli veri yok.", 20, 40);
    return;
  }

  const xs = points.map(p=>p.t);
  const ys = points.map(p=>p.p);

  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 40;

  const x0 = pad, y0 = h-pad, x1 = w-pad, y1 = pad;

  const normX = (t)=> {
    const minX = xs[0], maxX = xs[xs.length-1];
    if (maxX === minX) return x0;
    return x0 + ( (t-minX) / (maxX-minX) ) * (x1-x0);
  };
  const normY = (p)=>{
    if (maxY === minY) return (y0+y1)/2;
    return y0 - ( (p-minY) / (maxY-minY) ) * (y0-y1);
  };

  // axes
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0,y1); ctx.lineTo(x0,y0); ctx.lineTo(x1,y0);
  ctx.stroke();

  // line
  ctx.strokeStyle = "rgba(30,64,175,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((pt, i)=>{
    const x = normX(pt.t);
    const y = normY(pt.p);
    if (i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // last point dot
  const last = points[points.length-1];
  ctx.fillStyle = "rgba(220,38,38,0.9)";
  ctx.beginPath();
  ctx.arc(normX(last.t), normY(last.p), 4, 0, Math.PI*2);
  ctx.fill();

  // labels
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.font = "14px system-ui";
  ctx.fillText(`Min: ${fmtTRY(minY)}`, 20, 20);
  ctx.fillText(`Max: ${fmtTRY(maxY)}`, 140, 20);
}

function openChart(f){
  const wrap = chartWrap;
  if (!wrap) return;

  const title = `${f.query || ""} • ${f.siteName || ""}`;
  if (bigTitle) bigTitle.textContent = title;

  // priceHistory formatı:
  // [{t:ms, p:number}] veya [{time, price}] veya ["2025-..", 123]
  const ph = Array.isArray(f.priceHistory) ? f.priceHistory : [];
  const points = [];
  for (const it of ph){
    if (it && typeof it === "object"){
      const t = it.t ?? it.time ?? it.at ?? null;
      const p = it.p ?? it.price ?? it.value ?? null;
      const tt = (typeof t === "number") ? t : (t ? new Date(t).getTime() : null);
      const pp = parsePriceMaybe(p);
      if (tt && pp != null) points.push({ t:tt, p:pp });
    } else if (Array.isArray(it) && it.length >= 2){
      const tt = new Date(it[0]).getTime();
      const pp = parsePriceMaybe(it[1]);
      if (tt && pp != null) points.push({ t:tt, p:pp });
    }
  }
  points.sort((a,b)=>a.t-b.t);

  if (bigCanvas) drawSimpleChart(bigCanvas, points);

  if (graphHint){
    graphHint.textContent = points.length
      ? `Nokta: ${points.length} • Son: ${fmtTRY(points[points.length-1].p)}`
      : "Grafik verisi yok (worker henüz fiyat yazmamış olabilir).";
  }

  wrap.style.display = "";
}

function closeChart(){
  if (!chartWrap) return;
  chartWrap.style.display = "none";
}

if (btnCloseChart) btnCloseChart.addEventListener("click", closeChart);

async function makeAICommentForFavorite(f){
  try{
    await ensureAIConfig();
    const prompt =
`Kullanıcı bir ürünü takip ediyor.
Site: ${f.siteName}
Arama ifadesi: ${f.query}
Son fiyat: ${f.lastPrice ?? "bilinmiyor"}
Kısa ve faydalı 2-3 cümle yorum yaz:
- dikkat edilmesi gerekenler (garanti, satıcı, model uyuşması)
- varsa alternatif öneri
Sadece düz metin döndür.`;

    // pin sormasın: session pin varsa ai.js onu kullansın
    const text = await aiTextSearch({ query: "YORUM:" + prompt, pin: null, commentOnly: true })
      .catch(async ()=> {
        // bazı ai.js sürümlerinde commentOnly yok; fallback:
        const out = await aiTextSearch({ query: prompt, pin:null });
        return (typeof out === "string") ? out : (out?.[0]?.reason || out?.[0]?.comment || "");
      });

    const comment = (typeof text === "string") ? text : String(text||"").trim();
    if (!comment) throw new Error("AI yorum üretemedi.");

    await updateDoc(doc(db, "users", currentUser.uid, "favorites", f.id), {
      aiComment: comment,
      aiCommentUpdatedAt: serverTimestamp()
    });
    showToast("AI yorum güncellendi ✅");
    await loadFavorites();
  }catch(e){
    showToast("AI hata: " + (e?.message || e));
  }
}

function renderFavorites(){
  if (!favList) return;

  if (!currentUser){
    favList.className = "favList emptyBox";
    favList.textContent = "Favoriler için giriş yap.";
    return;
  }

  const list = sortFavorites(favCache);
  if (!list.length){
    favList.className = "favList emptyBox";
    favList.textContent = "Favori yok.";
    return;
  }

  favList.className = "favList";
  favList.innerHTML = "";

  for (const f of list){
    const priceText = (f.lastPrice != null) ? fmtTRY(f.lastPrice) : "Fiyat yok";
    const status = f.lastError
      ? `<span class="badgeErr">⚠️ ${esc(f.lastError)}</span>`
      : `<span class="badgeOk">✅ OK</span>`;

    const el = document.createElement("div");
    el.className = "favItem";
    el.innerHTML = `
      <div class="favTop">
        <div>
          <div class="favName">${esc(f.query || "")}</div>
          <div class="favMeta">${esc(f.siteName || "")} • Son kontrol: ${esc(msToText(f.lastCheckedAt))}</div>
        </div>
        <div class="favPrice">${esc(priceText)}</div>
      </div>

      <div class="favMid">
        ${status}
      </div>

      <div class="favActions">
        <button class="btnOpen sm btnGo">Siteyi Aç</button>
        <button class="btnGhost sm btnCopy">Copy Link</button>
        <button class="btnGhost sm btnGraph">Grafik</button>
        <button class="btnGhost sm btnAI">AI Yorum</button>
        <button class="btnDelete sm btnDel">Sil</button>
      </div>

      <div class="favAI ${f.aiComment ? "" : "hidden"}">
        <div class="aiBubble">${esc(f.aiComment || "")}</div>
      </div>
    `;

    el.querySelector(".btnGo").addEventListener("click", ()=>{
      if (f.url) openUrl(f.url);
      else openUrl((SITES.find(s=>s.key===f.siteKey)?.build(f.query)) || "#");
    });

    el.querySelector(".btnCopy").addEventListener("click", async ()=>{
      const url = f.url || (SITES.find(s=>s.key===f.siteKey)?.build(f.query)) || "";
      try{
        await navigator.clipboard.writeText(url);
        showToast("Link kopyalandı ✅");
      }catch{ showToast("Kopyalama engellendi."); }
    });

    el.querySelector(".btnGraph").addEventListener("click", ()=> openChart(f));
    el.querySelector(".btnAI").addEventListener("click", ()=> makeAICommentForFavorite(f));
    el.querySelector(".btnDel").addEventListener("click", ()=>{
      if (!confirm("Favoriyi silmek istiyor musun?")) return;
      deleteFavorite(f.id);
    });

    favList.appendChild(el);
  }
}

if (favSort) favSort.addEventListener("change", renderFavorites);
if (btnRefreshFav) btnRefreshFav.addEventListener("click", loadFavorites);

/* =========================
   AI Text Search (site öneri + yorum + favori)
========================= */
function findSiteByName(name){
  const n = String(name||"").toLowerCase();
  return SITES.find(s=>s.name.toLowerCase()===n)
    || SITES.find(s=>s.key===n)
    || null;
}

if (btnAISearch){
  btnAISearch.addEventListener("click", async ()=>{
    try{
      await ensureAIConfig();
      const q = (aiQ?.value || "").trim();
      if (!q) return;

      aiResults.className = "listBox";
      aiResults.innerHTML = `<div class="emptyBox">AI düşünüyor...</div>`;

      // pin null → ai.js session pin kullanmalı (sürekli pin sormasın)
      const out = await aiTextSearch({ query:q, pin:null });

      aiResults.innerHTML = "";

      if (!Array.isArray(out) || !out.length){
        aiResults.className = "listBox emptyBox";
        aiResults.textContent = "AI sonuç üretemedi.";
        return;
      }

      for (const r of out){
        const site = findSiteByName(r.site) || SITES.find(s=>s.name===r.site) || null;
        const queryText = String(r.query || q).trim();
        const reason = r.reason || r.comment || "";

        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <div class="rowLeft">
            <div class="rowTitle">${esc(site?.name || r.site || "Site")}</div>
            <div class="rowSub">${esc(queryText)}</div>
            ${reason ? `<div class="aiBubble" style="margin-top:8px">${esc(reason)}</div>` : ""}
          </div>
          <div class="rowRight">
            <button class="btnPrimary sm btnGo">Ara</button>
            <button class="btnGhost sm btnFav">${currentUser ? "Favoriye ekle" : "Favori (giriş)"}</button>
            <button class="btnGhost sm btnComment">AI Yorum</button>
          </div>
        `;

        row.querySelector(".btnGo").addEventListener("click", ()=>{
          // SENİN ŞİKAYET: tıklayınca normal aramaya yönlendiriyor, aramıyor gibi.
          // Burada normal sekmeye geçip o site linkini direkt açıyoruz.
          setTab("normal");
          qEl.value = queryText;
          renderSearchRows(queryText);
          if (site) openUrl(site.build(queryText));
        });

        row.querySelector(".btnFav").addEventListener("click", async ()=>{
          if (!currentUser){
            showToast("Favori için giriş yap.");
            openAuth();
            return;
          }
          const url = site ? site.build(queryText) : "";
          await addFavorite(site?.key || "site", site?.name || r.site || "Site", queryText, url, {
            aiComment: reason || null
          });
        });

        row.querySelector(".btnComment").addEventListener("click", async ()=>{
          try{
            await ensureAIConfig();
            const prompt =
`Şu arama için kısa ürün yorumu yaz:
Arama: "${queryText}"
Site: "${site?.name || r.site}"
2-3 cümle, pratik tavsiye ver.`;
            const tmp = await aiTextSearch({ query: prompt, pin:null });
            const text = (typeof tmp === "string") ? tmp : (tmp?.[0]?.reason || tmp?.[0]?.comment || "");
            if (!text) throw new Error("AI yorum üretemedi.");
            showToast("AI yorum üretildi ✅");
            // UI’de göster
            const bubble = row.querySelector(".aiBubble");
            if (bubble) bubble.textContent = text;
          }catch(e){
            showToast("AI hata: " + (e?.message || e));
          }
        });

        aiResults.appendChild(row);
      }

    }catch(e){
      aiResults.className = "listBox emptyBox";
      aiResults.textContent = String(e?.message || e || "AI hata");
    }
  });
}

/* =========================
   AI Visual (ürün foto + metin) + Lens alternatif
========================= */
function lensUploadUrl(){
  return "https://lens.google.com/upload";
}

if (btnAIVision){
  btnAIVision.addEventListener("click", async ()=>{
    try{
      const file = imgPicker?.files?.[0];
      if (!file){
        aiVisionBox.className = "listBox emptyBox";
        aiVisionBox.textContent = "Önce görsel seç.";
        return;
      }

      aiVisionBox.className = "listBox";
      aiVisionBox.innerHTML = `<div class="emptyBox">Analiz ediliyor...</div>`;

      // AI yoksa direkt Lens
      if (!hasAIConfig()){
        aiVisionBox.className = "listBox";
        aiVisionBox.innerHTML = `
          <div class="row">
            <div class="rowLeft">
              <div class="rowTitle">AI yok</div>
              <div class="rowSub">AI key kayıtlı değil. Google Lens kullan.</div>
            </div>
            <div class="rowRight">
              <button class="btnPrimary sm btnLens">Google Lens</button>
            </div>
          </div>
        `;
        aiVisionBox.querySelector(".btnLens").addEventListener("click", ()=> openUrl(lensUploadUrl()));
        return;
      }

      await ensureAIConfig();

      // Kritik: recursive tetik yok → sadece 1 kez çalışır
      const res = await aiVisionDetect({ file, pin:null }); // {product, search, notes}
      const searchText = String(res?.search || "").trim();

      const thumb = URL.createObjectURL(file);

      aiVisionBox.className = "listBox";
      aiVisionBox.innerHTML = `
        <div class="row">
          <div class="rowLeft">
            <div class="aiCard">
              <img class="aiThumb" src="${thumb}" alt="ürün">
              <div>
                <div class="rowTitle">${esc(res?.product || "Ürün")}</div>
                <div class="rowSub"><b>Arama:</b> ${esc(searchText || "—")}</div>
                ${res?.notes ? `<div class="aiBubble" style="margin-top:8px">${esc(res.notes)}</div>` : ""}
              </div>
            </div>
          </div>
          <div class="rowRight">
            <button class="btnPrimary sm btnShop">Google Alışveriş</button>
            <button class="btnGhost sm btnLens">Google Lens</button>
            <button class="btnGhost sm btnToNormal">Normal’e aktar</button>
            <button class="btnGhost sm btnFav">${currentUser ? "Favoriye ekle" : "Favori (giriş)"}</button>
          </div>
        </div>
      `;

      // Memory leak önle
      setTimeout(()=>{ try{ URL.revokeObjectURL(thumb); }catch{} }, 8000);

      const gShop = searchText
        ? `https://www.google.com/search?tbm=shop&q=${encQ(searchText)}`
        : `https://www.google.com/search?tbm=shop&q=${encQ(res?.product || "")}`;

      aiVisionBox.querySelector(".btnShop").addEventListener("click", ()=> openUrl(gShop));
      aiVisionBox.querySelector(".btnLens").addEventListener("click", ()=> openUrl(lensUploadUrl()));

      aiVisionBox.querySelector(".btnToNormal").addEventListener("click", ()=>{
        const q = searchText || String(res?.product || "").trim();
        if (!q) return;
        setTab("normal");
        qEl.value = q;
        renderSearchRows(q);
      });

      aiVisionBox.querySelector(".btnFav").addEventListener("click", async ()=>{
        const q = searchText || String(res?.product || "").trim();
        if (!q){
          showToast("Çıkan arama metni yok.");
          return;
        }
        if (!currentUser){
          showToast("Favori için giriş yap.");
          openAuth();
          return;
        }
        // Görselde arama: Google shopping url’i favoriye kaydetmek daha mantıklı
        await addFavorite("google", "Google Shopping", q, gShop, { aiComment: res?.notes || null });
      });

      if (!searchText){
        // çıkaramadıysa Lens’i daha vurgulu göster
        showToast("AI metin çıkaramadı. Lens deneyin.");
      }

    }catch(e){
      aiVisionBox.className = "listBox emptyBox";
      aiVisionBox.textContent = "Hata: " + (e?.message || e || "Görsel analiz başarısız");
    }
  });
}

/* =========================
   Top buttons
========================= */
if (btnLogout){
  btnLogout.addEventListener("click", async ()=>{
    await signOut(auth).catch(()=>{});
  });
}
if (btnBell){
  btnBell.addEventListener("click", ()=>{
    showToast("Bildirim: Worker + FCM tarafı hazırsa burada açılır.");
  });
}

/* =========================
   Auth state gate
   - SENİN İSTEDİĞİN: giriş yoksa ana arayüz görünmesin.
========================= */
onAuthStateChanged(auth, async (u)=>{
  currentUser = u || null;

  if (!u){
    // login gate
    if (appMain) appMain.style.display = "none";
    openAuth();
    renderFavorites();
  } else {
    closeAuth();
    if (appMain) appMain.style.display = "";
    await loadFavorites();
  }
  // arama ekranındaki favori buton yazılarını da güncelle
  if (qEl?.value) renderSearchRows(qEl.value);
});

/* =========================
   Init
========================= */
(function init(){
  renderSitePills();
  setAuthMode("login");
  setTab("normal");

  if (searchResults){
    searchResults.className = "listBox emptyBox";
    searchResults.textContent = "Arama yapılmadı.";
  }
  if (aiResults){
    aiResults.className = "listBox emptyBox";
    aiResults.textContent = "AI arama yapılmadı.";
  }
  if (aiVisionBox){
    aiVisionBox.className = "listBox emptyBox";
    aiVisionBox.textContent = "Görsel analiz yapılmadı.";
  }

  // AI modal kapalı başlasın (hangi id varsa)
  const m = getAIModalEl();
  if (m) m.style.display = "none";
  if (chartWrap) chartWrap.style.display = "none";

  // PIN’i her seferinde sormasın: session pin varsa zaten hatırlanır
  const sp = getSessionPin?.();
  if (sp && aiRemember) aiRemember.checked = true;

  // Not: “Takip: GitHub Worker + Firestore” gibi yazılar HTML’deyse,
  // bunu index.html’den kaldırmalısın. (app.js tarafında yazdırmıyorum.)
})();
