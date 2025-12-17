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
  loadAIConfig, hasAIConfig,
  saveAIConfigEncrypted, clearAIConfig,
  runAI, setSessionPin, getSessionPin
} from "./ai.js";

/* PWA SW */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  });
}

/* DOM */
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

/* Chart Modal */
const chartWrap = document.getElementById("chartWrap");
const btnCloseChart = document.getElementById("btnCloseChart");
const bigTitle = document.getElementById("bigTitle");
const bigCanvas = document.getElementById("bigCanvas");

/* AI Modal */
const aiWrap = document.getElementById("aiWrap");
const btnCloseAI = document.getElementById("btnCloseAI");
const aiProvider = document.getElementById("aiProvider");
const aiModel = document.getElementById("aiModel");
const aiKey = document.getElementById("aiKey");
const aiPin = document.getElementById("aiPin");
const aiRememberPin = document.getElementById("aiRememberPin");
const btnSaveAI = document.getElementById("btnSaveAI");
const btnClearAI = document.getElementById("btnClearAI");
const aiStatus = document.getElementById("aiStatus");
const aiPrompt = document.getElementById("aiPrompt");
const btnRunAI = document.getElementById("btnRunAI");
const btnUseAIText = document.getElementById("btnUseAIText");
const aiOut = document.getElementById("aiOut");

/* State */
let mode = "login";
let currentUser = null;
let favCache = [];
let notifLog = [];

/* Sites */
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

/* Helpers */
function showToast(msg){
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>toast.classList.add("hidden"), 2200);
}
function setAuthError(msg){ authError.textContent = msg; authError.classList.remove("hidden"); }
function clearAuthError(){ authError.classList.add("hidden"); authError.textContent = ""; }
function openAuthModal(){ authWrap.classList.remove("hidden"); }
function closeAuthModal(){ authWrap.classList.add("hidden"); }

function openAIModal(){ aiWrap.classList.remove("hidden"); }
function closeAIModal(){ aiWrap.classList.add("hidden"); }

function isMobile(){ return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

function fmtTRY(n){
  if (n == null || Number.isNaN(Number(n))) return "Fiyat yok";
  try { return new Intl.NumberFormat("tr-TR", { style:"currency", currency:"TRY", maximumFractionDigits:0 }).format(Number(n)); }
  catch { return `${Number(n)} ₺`; }
}
function nowISO(){ return new Date().toISOString(); }
function safeNum(v){
  const n = Number(String(v).replace(/[^\d.,]/g,"").replace(",","."));
  return Number.isFinite(n) ? n : null;
}
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function favDocId(siteKey, queryText){
  return `${siteKey}__${queryText.trim().toLowerCase()}`.replace(/[^\w\-_.]+/g,"_");
}

/* Notifications */
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

/* UI: Sites */
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

/* Search rows */
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
    return { site:s, url:s.build(q), fav: existing || null, lastPrice: existing?.lastPrice ?? null };
  });

  rows.sort((a,b)=>{
    const ap=a.lastPrice, bp=b.lastPrice;
    if (ap==null && bp==null) return a.site.name.localeCompare(b.site.name);
    if (ap==null) return 1;
    if (bp==null) return -1;
    return ap - bp; // ucuzdan
  });

  searchResults.className = "listBox";
  searchResults.innerHTML = "";

  for (const r of rows){
    const item = document.createElement("div");
    item.className = "item";

    const priceHtml = (r.lastPrice!=null)
      ? `<div class="pricePill"><span>Son</span> ${fmtTRY(r.lastPrice)}</div>` : "";

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

    item.querySelector(".btnFav").addEventListener("click", async ()=>{
      if (!currentUser) return;

      if (favOn) await removeFavorite(r.site.key, q);
      else await addFavorite(r.site.key, r.site.name, q, r.url);

      await loadFavorites();
      renderSearchRows(qEl.value);
    });

    searchResults.appendChild(item);
  }
}

/* Firestore: Favorites */
function favCol(){ return collection(db, "users", currentUser.uid, "favorites"); }

async function addFavorite(siteKey, siteName, queryText, url){
  const id = favDocId(siteKey, queryText);
  const ref = doc(db, "users", currentUser.uid, "favorites", id);

  const existing = await getDoc(ref);
  if (existing.exists()){ showToast("Zaten favoride."); return; }

  await setDoc(ref, {
    siteKey, siteName,
    query: queryText.trim(),
    queryLower: queryText.trim().toLowerCase(),
    url,
    createdAt: serverTimestamp(),
    lastPrice: null,
    history: []
  }, { merge:false });

  showToast("Favoriye eklendi.");
}

async function removeFavorite(siteKey, queryText){
  const id = favDocId(siteKey, queryText);
  await deleteDoc(doc(db, "users", currentUser.uid, "favorites", id));
  showToast("Favoriden kaldırıldı.");
}

async function addPriceToFavorite(favId, price){
  const ref = doc(db, "users", currentUser.uid, "favorites", favId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const d = snap.data();
  const history = Array.isArray(d.history) ? d.history.slice() : [];
  history.push({ t: nowISO(), p: price });

  await updateDoc(ref, { lastPrice: price, history });
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
    if (sort==="newest") return b.createdAtMs - a.createdAtMs;
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

/* %5 drop check */
function checkDropsOnLoad(){
  for (const f of favCache){
    const h = f.history || [];
    if (h.length < 2) continue;
    const prev = h[h.length-2]?.p;
    const last = h[h.length-1]?.p;
    if (prev == null || last == null) continue;

    const diff = (prev - last) / prev * 100;
    if (diff >= 5){
      const title = `${f.siteName}: %${diff.toFixed(1)} düşüş`;
      const body = `${f.query} → ${fmtTRY(prev)} → ${fmtTRY(last)}`;
      pushNotif(title, body);
      fireBrowserNotif(title, body);
    }
  }
}

/* Charts */
const chartMap = new Map();
let bigChart = null;

function buildChart(canvas, fav){
  const h = fav.history || [];
  const labels = h.map(x=> new Date(x.t).toLocaleDateString("tr-TR"));
  const data = h.map(x=> x.p);
  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label:"Fiyat (₺)", data, tension:0.25, pointRadius:3 }] },
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

/* Favorites UI */
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

    el.querySelector(".btnOpen").addEventListener("click", ()=> window.open(f.url, "_blank", "noopener"));

    el.querySelector(".btnCopy").addEventListener("click", async ()=>{
      try{ await navigator.clipboard.writeText(f.url); showToast("Link kopyalandı."); }
      catch{ prompt("Link kopyala:", f.url); }
    });

    el.querySelector(".btnAddPrice").addEventListener("click", async ()=>{
      const v = prompt("Fiyat (₺) gir:", f.lastPrice ?? "");
      if (v == null) return;
      const p = safeNum(v);
      if (p == null){ showToast("Geçersiz fiyat."); return; }
      await addPriceToFavorite(f.id, p);
      await loadFavorites();
      showToast("Fiyat eklendi.");
    });

    el.querySelector(".btnDelete").addEventListener("click", async ()=>{
      if (!confirm("Favoriyi silmek istiyor musun?")) return;
      await deleteDoc(doc(db, "users", currentUser.uid, "favorites", f.id));
      await loadFavorites();
    });

    const chartArea = el.querySelector(".chartArea");
    const h = f.history || [];
    if (h.length < 2){
      chartArea.innerHTML = `<div class="chartHint">Grafik için en az 2 fiyat kaydı gir.</div>`;
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

/* Open Selected Sites */
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

  for (const r of rows) window.open(r.url, "_blank", "noopener");
}

/* AUTH UI */
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

togglePw.addEventListener("click", ()=> passEl.type = (passEl.type==="password") ? "text" : "password");
togglePw2.addEventListener("click", ()=> pass2El.type = (pass2El.type==="password") ? "text" : "password");

btnAuthMain.addEventListener("click", async ()=>{
  clearAuthError();
  const email = emailEl.value.trim();
  const pass = passEl.value;

  try{
    if (mode==="register"){
      const pass2 = pass2El.value;
      if (pass !== pass2){ setAuthError("Şifreler aynı değil."); return; }
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

/* Redirect result */
getRedirectResult(auth).catch(()=>{});

/* Main UI events */
renderSitePills();

btnSearch.addEventListener("click", ()=> renderSearchRows(qEl.value));
qEl.addEventListener("keydown", (e)=>{ if (e.key==="Enter"){ e.preventDefault(); btnSearch.click(); } });

btnClear.addEventListener("click", ()=>{
  qEl.value = "";
  searchResults.className = "listBox emptyBox";
  searchResults.textContent = "Henüz arama yapılmadı.";
});

btnOpenSelected.addEventListener("click", ()=> openSelectedSites(qEl.value));
favSort.addEventListener("change", ()=> loadFavorites());
btnRefreshFav.addEventListener("click", ()=> loadFavorites());

btnBell.addEventListener("click", async ()=>{
  const ok = await ensureNotifPermission();
  showToast(ok ? "Bildirimler açık." : "Bildirim izni verilmedi.");
});

/* AI Modal wiring */
function fillAIUIFromConfig(){
  const cfg = loadAIConfig();
  aiProvider.value = cfg.provider || "openai";
  aiModel.value = cfg.model || (cfg.provider==="gemini" ? "gemini-1.5-flash" : "gpt-4.1-mini");
  aiKey.value = "";
  aiPin.value = "";
  aiRememberPin.checked = !!getSessionPin();
  aiOut.textContent = "—";
  aiStatus.textContent = hasAIConfig() ? "AI ayarları kayıtlı. Çalıştırmak için PIN girmen yeter." : "AI ayarları yok. Key + PIN ile kaydet.";
}

btnAI.addEventListener("click", ()=>{
  fillAIUIFromConfig();
  openAIModal();
});

btnCloseAI.addEventListener("click", ()=> closeAIModal());

btnSaveAI.addEventListener("click", async ()=>{
  aiStatus.textContent = "";
  try{
    const provider = aiProvider.value;
    const model = aiModel.value.trim() || (provider==="gemini" ? "gemini-1.5-flash" : "gpt-4.1-mini");
    const key = aiKey.value.trim();
    const pin = aiPin.value;
    const remember = aiRememberPin.checked;

    await saveAIConfigEncrypted({ provider, model, apiKey:key, pin, rememberPin: remember });
    aiKey.value = ""; aiPin.value = "";
    aiStatus.textContent = "Kaydedildi. (Key şifreli saklandı.)";
    showToast("AI ayarları kaydedildi.");
  }catch(e){
    aiStatus.textContent = e?.message || String(e);
  }
});

btnClearAI.addEventListener("click", ()=>{
  if (!confirm("AI ayarlarını silmek istiyor musun?")) return;
  clearAIConfig();
  fillAIUIFromConfig();
  showToast("AI ayarları silindi.");
});

btnRunAI.addEventListener("click", async ()=>{
  aiStatus.textContent = "";
  aiOut.textContent = "Çalışıyor...";
  try{
    const cfg = loadAIConfig();
    const provider = aiProvider.value || cfg.provider;
    const model = (aiModel.value.trim() || cfg.model);

    // PIN: önce input, yoksa oturumda varsa kullan
    let pin = aiPin.value;
    if (!pin && getSessionPin()) pin = null; // runAI session pin’i kullanacak
    if (!pin && !getSessionPin()){
      // Kullanıcı PIN girmediyse sor
      const asked = prompt("PIN / Şifre gir (AI anahtarı çözmek için):");
      if (!asked) throw new Error("PIN girilmedi.");
      pin = asked;
      if (aiRememberPin.checked) setSessionPin(pin);
    } else {
      if (aiRememberPin.checked && pin) setSessionPin(pin);
    }

    const q = qEl.value.trim();
    const userPrompt = (aiPrompt.value.trim())
      ? aiPrompt.value.trim()
      : `Ürün: ${q || "—"}
Görev: Bu ürünü aramak için en iyi 6-10 anahtar kelime öner. Kısa madde madde yaz. Türkçe.`;

    const out = await runAI({ prompt: userPrompt, pin, provider, model });
    aiOut.textContent = out;
    aiStatus.textContent = "Tamam.";
  }catch(e){
    aiOut.textContent = "—";
    aiStatus.textContent = e?.message || String(e);
  }
});

btnUseAIText.addEventListener("click", ()=>{
  const t = aiOut.textContent.trim();
  if (!t || t==="—") { showToast("Kullanılacak AI sonucu yok."); return; }
  // En basit: ilk satırı/öneriyi aramaya yaz
  const first = t.split("\n").map(x=>x.replace(/^[-•\d.\)\s]+/,"").trim()).find(Boolean);
  if (!first){ showToast("AI sonucu okunamadı."); return; }
  qEl.value = first;
  closeAIModal();
  renderSearchRows(qEl.value);
  showToast("AI önerisi aramaya yazıldı.");
});

/* Auth state: giriş yokken içerik görünmesin */
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

function prettyAuthError(e){
  const msg = String(e?.message || e || "");

  if (msg.includes("auth/unauthorized-domain")){
    return "Google giriş hatası: unauthorized-domain. Firebase → Authentication → Settings → Authorized domains kısmına fiyattakip.github.io ekle.";
  }
  if (msg.includes("auth/api-key-not-valid")){
    return "Firebase: api-key-not-valid. Eski cache olabilir. sw.js CACHE_VERSION artır + site verisini temizle.";
  }
  if (msg.includes("auth/invalid-credential")) return "Hatalı giriş bilgisi.";
  if (msg.includes("auth/email-already-in-use")) return "Bu email zaten kayıtlı.";
  if (msg.includes("auth/weak-password")) return "Şifre çok zayıf. Daha güçlü bir şifre gir.";
  return "Hata: " + msg;
    }
