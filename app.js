import { auth, db, messaging, functions, googleProvider } from "./firebase.js";
import {
  setSessionPin, clearSessionPin, loadAIConfig, hasAIConfig,
  saveAIConfigEncrypted, clearAIConfig, aiTextSearch, aiVisionDetect, getSessionPin
} from "./ai.js";

import {
  onAuthStateChanged, signOut, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signInWithRedirect, signInWithPopup, getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc,
  serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { getToken } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

/* SW */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
    try { await navigator.serviceWorker.register("./firebase-messaging-sw.js"); } catch {}
  });
}

/* DOM */
const appMain = document.getElementById("appMain");
const toast = document.getElementById("toast");

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

const btnAISettings = document.getElementById("btnAISettings");
const aiWrap = document.getElementById("aiWrap");
const btnCloseAI = document.getElementById("btnCloseAI");
const aiProvider = document.getElementById("aiProvider");
const aiModel = document.getElementById("aiModel");
const aiKey = document.getElementById("aiKey");
const aiPin = document.getElementById("aiPin");
const aiRemember = document.getElementById("aiRemember");
const btnSaveAI = document.getElementById("btnSaveAI");
const btnClearAI = document.getElementById("btnClearAI");
const aiMsg = document.getElementById("aiMsg");

const sitePills = document.getElementById("sitePills");
const qEl = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");
const btnOpenSelected = document.getElementById("btnOpenSelected");
const searchResults = document.getElementById("searchResults");

const aiQ = document.getElementById("aiQ");
const btnAISearch = document.getElementById("btnAISearch");
const aiResults = document.getElementById("aiResults");

const imgFile = document.getElementById("imgFile");
const btnVisual = document.getElementById("btnVisual");
const visualResults = document.getElementById("visualResults");

const favList = document.getElementById("favList");
const favSort = document.getElementById("favSort");
const btnRefreshFav = document.getElementById("btnRefreshFav");
const btnClearCache = document.getElementById("btnClearCache");

/* Tabs */
const tabBtns = Array.from(document.querySelectorAll(".tabBtn"));
const panels = {
  normal: document.getElementById("tab_normal"),
  ai: document.getElementById("tab_ai"),
  visual: document.getElementById("tab_visual")
};
tabBtns.forEach(b=>{
  b.addEventListener("click", ()=>{
    tabBtns.forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    const t = b.dataset.tab;
    Object.keys(panels).forEach(k=>panels[k].classList.toggle("hidden", k!==t));
  });
});

/* State */
let mode = "login";
let currentUser = null;
let favCache = [];

const SITES = [
  { key:"trendyol", name:"Trendyol", build:(q)=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}&sst=PRICE_BY_ASC` },
  { key:"hepsiburada", name:"Hepsiburada", build:(q)=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}&sorting=priceAsc` },
  { key:"n11", name:"N11", build:(q)=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}&srt=PRICE_LOW` },
  { key:"amazontr", name:"Amazon TR", build:(q)=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}&s=price-asc-rank` },
  { key:"pazarama", name:"Pazarama", build:(q)=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}&sort=price_asc` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:(q)=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}&orderby=price_asc` },
  { key:"idefix", name:"idefix", build:(q)=>`https://www.idefix.com/arama/?q=${encodeURIComponent(q)}&s=price-asc` }
];

const selectedSites = new Set(SITES.map(s=>s.key));

/* Helpers */
function showToast(msg){
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>toast.classList.add("hidden"), 2200);
}
function openAuthModal(){ authWrap.classList.remove("hidden"); }
function closeAuthModal(){ authWrap.classList.add("hidden"); }
function setAuthError(msg){ authError.textContent = msg; authError.classList.remove("hidden"); }
function clearAuthError(){ authError.classList.add("hidden"); authError.textContent=""; }
function isMobile(){ return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function fmtTRY(n){
  if (n == null || Number.isNaN(Number(n))) return "Fiyat yok";
  try { return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:0}).format(Number(n)); }
  catch { return `${Number(n)} ₺`; }
}
function favDocId(siteKey, queryText){
  return `${siteKey}__${queryText.trim().toLowerCase()}`.replace(/[^\w\-_.]+/g,"_");
}

/* UI pills */
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
renderSitePills();

/* Notif */
async function ensureNotifPermission(){
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const res = await Notification.requestPermission();
  return res === "granted";
}

/* Firestore */
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
    failCount: 0,
    needsManual: false
  }, { merge:false });

  try{
    const runNow = httpsCallable(functions, "runFavoriteNow");
    await runNow({ favId: id });
  }catch{}

  showToast("Favoriye eklendi.");
}

async function removeFavorite(siteKey, queryText){
  const id = favDocId(siteKey, queryText);
  await deleteDoc(doc(db, "users", currentUser.uid, "favorites", id));
  showToast("Favoriden kaldırıldı.");
}

async function loadFavorites(){
  if (!currentUser) return;

  const sort = favSort.value;
  const qy = query(favCol(), orderBy("queryLower", "asc"));
  const snaps = await getDocs(qy);

  favCache = snaps.docs.map(d=>{
    const x = d.data();
    return {
      id:d.id,
      siteKey:x.siteKey, siteName:x.siteName,
      query:x.query, queryLower:x.queryLower,
      url:x.url,
      lastPrice:x.lastPrice ?? null,
      failCount:x.failCount ?? 0,
      needsManual:!!x.needsManual,
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
    if (sort==="newest") return b.createdAtMs - a.createdAtMs;
    if (sort==="site"){
      const s = a.siteName.localeCompare(b.siteName);
      if (s!==0) return s;
      return a.queryLower.localeCompare(b.queryLower);
    }
    return 0;
  });

  renderFavorites();
}

/* Render search */
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
    return { site:s, url:s.build(q), fav:existing||null, lastPrice:existing?.lastPrice ?? null };
  });

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
    const priceHtml = (r.lastPrice!=null) ? `<div class="pricePill"><span>Son</span> ${fmtTRY(r.lastPrice)}</div>` : "";
    const favOn = !!r.fav;

    item.innerHTML = `
      <div class="itemLeft">
        <div class="siteName">${r.site.name}</div>
        <div class="queryText">${escapeHtml(q)}</div>
      </div>
      <div class="itemRight">
        ${priceHtml}
        <button class="btnOpen">Aç</button>
        <button class="btnFav ${favOn?"on":""}">${favOn?"Favoride":"Favori Ekle"}</button>
      </div>
    `;

    item.querySelector(".btnOpen").addEventListener("click", ()=>window.open(r.url,"_blank","noopener"));
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

/* Render favorites */
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

    const warn = f.needsManual ? ` <span class="muted">⚠ Link açıp tekrar dene</span>` : "";
    el.innerHTML = `
      <div class="favTop">
        <div>
          <div class="favName">${escapeHtml(f.query)}${warn}</div>
          <div class="favMeta">${escapeHtml(f.siteName)} • Hata: ${f.failCount}</div>
        </div>
        <div class="favPrice">${f.lastPrice!=null ? fmtTRY(f.lastPrice) : "Fiyat yok"}</div>
      </div>

      <div class="favBtns">
        <button class="btnOpen">Siteyi Aç</button>
        <button class="btnCopy">Copy Link</button>
        <button class="btnAddPrice">Tekrar dene şimdi</button>
        <button class="btnDelete">Sil</button>
      </div>
    `;

    el.querySelector(".btnOpen").addEventListener("click", ()=>window.open(f.url,"_blank","noopener"));
    el.querySelector(".btnCopy").addEventListener("click", async ()=>{
      try { await navigator.clipboard.writeText(f.url); showToast("Link kopyalandı."); }
      catch { prompt("Link kopyala:", f.url); }
    });

    el.querySelector(".btnAddPrice").addEventListener("click", async ()=>{
      try{
        const runNow = httpsCallable(functions, "runFavoriteNow");
        await runNow({ favId: f.id });
        showToast("Deneme başlatıldı.");
        setTimeout(loadFavorites, 1200);
      }catch{
        showToast("Deneme başarısız.");
      }
    });

    el.querySelector(".btnDelete").addEventListener("click", async ()=>{
      if (!confirm("Silinsin mi?")) return;
      await deleteDoc(doc(db, "users", currentUser.uid, "favorites", f.id));
      await loadFavorites();
    });

    favList.appendChild(el);
  }
}

/* Open selected */
function openSelectedSites(queryText){
  const q = queryText.trim();
  if (!q) return;
  const selected = SITES.filter(s=>selectedSites.has(s.key));
  selected.forEach(s=>window.open(s.build(q),"_blank","noopener"));
}

/* AI modal */
function openAI(){
  const cfg = loadAIConfig();
  aiProvider.value = cfg.provider;
  aiModel.value = cfg.model || "gemini-2.5-flash";
  aiKey.value = "";
  aiPin.value = "";
  aiRemember.checked = false;
  aiMsg.textContent = hasAIConfig() ? "AI ayarı kayıtlı." : "AI ayarı yok.";
  aiWrap.classList.remove("hidden");
}
function closeAI(){ aiWrap.classList.add("hidden"); }

btnAISettings.addEventListener("click", openAI);
btnCloseAI.addEventListener("click", closeAI);

btnSaveAI.addEventListener("click", async ()=>{
  try{
    await saveAIConfigEncrypted({
      provider: aiProvider.value,
      model: aiModel.value.trim() || "gemini-2.5-flash",
      apiKey: aiKey.value.trim(),
      pin: aiPin.value.trim(),
      rememberPin: aiRemember.checked
    });
    if (aiRemember.checked) setSessionPin(aiPin.value.trim());
    aiMsg.textContent = "Kaydedildi.";
    showToast("AI ayarları kaydedildi.");
  }catch(e){
    aiMsg.textContent = "Hata: " + (e?.message || e);
  }
});

btnClearAI.addEventListener("click", ()=>{
  clearAIConfig();
  clearSessionPin();
  aiMsg.textContent = "Sıfırlandı.";
  showToast("AI ayarları sıfırlandı.");
});

/* AI Search */
btnAISearch.addEventListener("click", async ()=>{
  const q = aiQ.value.trim();
  if (!q){ showToast("Bir şey yaz."); return; }

  aiResults.className = "listBox";
  aiResults.innerHTML = `<div class="emptyBox">AI düşünüyor...</div>`;

  try{
    const pin = getSessionPin() || null; // hatırlıysa null bile olsa decrypt içinde sessionPin kullanır
    const items = await aiTextSearch({ query:q, pin });

    if (!items.length){
      aiResults.innerHTML = `<div class="emptyBox">AI sonuç üretmedi.</div>`;
      return;
    }

    const siteMap = new Map(SITES.map(s=>[s.name, s]));
    aiResults.innerHTML = "";

    for (const it of items){
      const s = siteMap.get(it.site);
      if (!s) continue;

      const queryText = (it.query || q).trim();
      const url = s.build(queryText);

      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="itemLeft">
          <div class="siteName">${escapeHtml(it.site)}</div>
          <div class="queryText">${escapeHtml(queryText)} • <span class="muted">${escapeHtml(it.reason||"")}</span></div>
        </div>
        <div class="itemRight">
          <button class="btnOpen">Aç</button>
          <button class="btnFav">Favori Ekle</button>
        </div>
      `;
      row.querySelector(".btnOpen").addEventListener("click", ()=>window.open(url,"_blank","noopener"));
      row.querySelector(".btnFav").addEventListener("click", async ()=>{
        await addFavorite(s.key, s.name, queryText, url);
        await loadFavorites();
      });

      aiResults.appendChild(row);
    }

  }catch(e){
    aiResults.innerHTML = `<div class="emptyBox">Hata: ${escapeHtml(e?.message || e)}</div>`;
  }
});

/* Visual */
btnVisual.addEventListener("click", async ()=>{
  const file = imgFile.files?.[0];
  if (!file){ showToast("Görsel seç."); return; }

  visualResults.className = "listBox";
  visualResults.innerHTML = `<div class="emptyBox">Analiz ediliyor...</div>`;

  try{
    const pin = getSessionPin() || null;
    const out = await aiVisionDetect({ file, pin });
    const search = out.search || out.product || "ürün";

    const items = await aiTextSearch({ query: search, pin });

    visualResults.innerHTML = `<div class="emptyBox"><b>${escapeHtml(out.product||"Ürün")}</b><br><span class="muted">${escapeHtml(out.notes||"")}</span></div>`;

    const siteMap = new Map(SITES.map(s=>[s.name, s]));
    for (const it of items){
      const s = siteMap.get(it.site);
      if (!s) continue;

      const queryText = (it.query || search).trim();
      const url = s.build(queryText);

      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="itemLeft">
          <div class="siteName">${escapeHtml(it.site)}</div>
          <div class="queryText">${escapeHtml(queryText)}</div>
        </div>
        <div class="itemRight">
          <button class="btnOpen">Aç</button>
          <button class="btnFav">Favori Ekle</button>
        </div>
      `;
      row.querySelector(".btnOpen").addEventListener("click", ()=>window.open(url,"_blank","noopener"));
      row.querySelector(".btnFav").addEventListener("click", async ()=>{
        await addFavorite(s.key, s.name, queryText, url);
        await loadFavorites();
      });

      visualResults.appendChild(row);
    }

  }catch(e){
    visualResults.innerHTML = `<div class="emptyBox">Hata: ${escapeHtml(e?.message || e)}</div>`;
  }
});

/* Normal events */
btnSearch.addEventListener("click", ()=>renderSearchRows(qEl.value));
qEl.addEventListener("keydown", (e)=>{ if (e.key==="Enter"){ e.preventDefault(); btnSearch.click(); }});
btnClear.addEventListener("click", ()=>{
  qEl.value=""; searchResults.className="listBox emptyBox"; searchResults.textContent="Henüz arama yapılmadı.";
});
btnOpenSelected.addEventListener("click", ()=>openSelectedSites(qEl.value));

favSort.addEventListener("change", loadFavorites);
btnRefreshFav.addEventListener("click", loadFavorites);

btnClearCache.addEventListener("click", async ()=>{
  try{
    const keys = await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
    location.reload();
  }catch{
    showToast("Cache temizlenemedi.");
  }
});

btnBell.addEventListener("click", async ()=>{
  const ok = await ensureNotifPermission();
  showToast(ok ? "Bildirim açık." : "Bildirim izni yok.");
});

/* Auth */
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

togglePw.addEventListener("click", ()=>passEl.type = (passEl.type==="password") ? "text":"password");
togglePw2.addEventListener("click", ()=>pass2El.type = (pass2El.type==="password") ? "text":"password");

btnAuthMain.addEventListener("click", async ()=>{
  clearAuthError();
  const email = emailEl.value.trim();
  const pass = passEl.value;

  try{
    if (mode==="register"){
      if (pass !== pass2El.value){ setAuthError("Şifreler aynı değil."); return; }
      await createUserWithEmailAndPassword(auth, email, pass);
      showToast("Hesap oluşturuldu.");
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      showToast("Giriş başarılı.");
    }
  }catch(e){
    setAuthError("Hata: " + (e?.message || e));
  }
});

btnGoogle.addEventListener("click", async ()=>{
  clearAuthError();
  try{
    if (isMobile()) await signInWithRedirect(auth, googleProvider);
    else await signInWithPopup(auth, googleProvider);
  }catch(e){
    setAuthError("Hata: " + (e?.message || e));
  }
});

getRedirectResult(auth).catch(()=>{});

btnLogout.addEventListener("click", async ()=>{
  try{ await signOut(auth); showToast("Çıkış yapıldı."); }catch{}
});

/* FCM token save (VAPID gir) */
async function registerFCM(){
  const VAPID_KEY = "YOUR_VAPID_KEY";
  try{
    const ok = await ensureNotifPermission();
    if (!ok) return;

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return;

    const deviceId = "web_" + Math.random().toString(16).slice(2);
    await setDoc(doc(db, "users", currentUser.uid, "devices", deviceId), {
      fcmToken: token,
      platform: "web",
      updatedAt: serverTimestamp()
    }, { merge:true });
  }catch{}
}

/* Auth state */
appMain.classList.add("hidden");
openAuthModal();

onAuthStateChanged(auth, async (user)=>{
  currentUser = user || null;

  if (currentUser){
    closeAuthModal();
    appMain.classList.remove("hidden");
    await registerFCM();
    await loadFavorites();
    if (qEl.value.trim()) renderSearchRows(qEl.value.trim());
  } else {
    appMain.classList.add("hidden");
    openAuthModal();
  }
});
