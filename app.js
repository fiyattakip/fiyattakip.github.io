import { auth, db, googleProvider } from "./firebase.js";
import { runAI, hasAIConfig, saveAIConfigEncrypted, exportEncryptedConfigBlob, importEncryptedConfigBlob } from "./ai.js";

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

const APP_VERSION = "v1.0.1-final";

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

const btnSettings = document.getElementById("btnSettings");
const settingsWrap = document.getElementById("settingsWrap");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const appVersionEl = document.getElementById("appVersion");
const btnClearCache = document.getElementById("btnClearCache");
const btnExportJSON = document.getElementById("btnExportJSON");
const btnImportJSON = document.getElementById("btnImportJSON");
const fileImportJSON = document.getElementById("fileImportJSON");
const btnAISettings = document.getElementById("btnAISettings");
const btnAICloudBackup = document.getElementById("btnAICloudBackup");
const btnAICloudRestore = document.getElementById("btnAICloudRestore");

const sitePills = document.getElementById("sitePills");
const qEl = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");
const btnOpenSelected = document.getElementById("btnOpenSelected");
const searchResults = document.getElementById("searchResults");

const btnAISearchText = document.getElementById("btnAISearchText");
const btnAISearchCam = document.getElementById("btnAISearchCam");
const btnAISearchGallery = document.getElementById("btnAISearchGallery");
const fileCam = document.getElementById("fileCam");
const fileGallery = document.getElementById("fileGallery");

const favList = document.getElementById("favList");
const favSort = document.getElementById("favSort");
const btnRefreshFav = document.getElementById("btnRefreshFav");

const toast = document.getElementById("toast");

const chartWrap = document.getElementById("chartWrap");
const btnCloseChart = document.getElementById("btnCloseChart");
const bigTitle = document.getElementById("bigTitle");
const bigCanvas = document.getElementById("bigCanvas");

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
  try { return new Intl.NumberFormat("tr-TR", { style:"currency", currency:"TRY", maximumFractionDigits:0 }).format(Number(n)); }
  catch { return `${Number(n)} ₺`; }
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

/* Notification log */
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

/* UI: site pills */
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

/* Firestore refs */
function favCol(){ return collection(db, "users", currentUser.uid, "favorites"); }
function userSettingsDoc(){ return doc(db, "users", currentUser.uid, "settings", "private"); }

/* Favorites */
async function addFavorite(siteKey, siteName, queryText, url){
  const id = favDocId(siteKey, queryText);
  const ref = doc(db, "users", currentUser.uid, "favorites", id);

  const existing = await getDoc(ref);
  if (existing.exists()){ showToast("Zaten favoride."); return; }

  const data = {
    siteKey, siteName,
    query: queryText.trim(),
    queryLower: queryText.trim().toLowerCase(),
    url,
    createdAt: serverTimestamp(),
    lastPrice: null,
    history: [],
    aiComment: null,
    aiCommentAt: null
  };

  await setDoc(ref, data, { merge:false });
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
      aiComment: d.aiComment || null,
      aiCommentAt: d.aiCommentAt || null,
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

function checkDropsOnLoad(){
  for (const f of favCache){
    const h = f.history || [];
    if (h.length < 2) continue;
    const prev = h[h.length-2]?.p;
    const last = h[h.length-1]?.p;
    if (prev == null || last == null) continue;

    const diff = (prev - last) / prev * 100;
    if (diff >= 10){
      const title = `${f.siteName}: %${diff.toFixed(1)} düşüş`;
      const body = `${f.query} → ${fmtTRY(prev)} → ${fmtTRY(last)}`;
      pushNotif(title, body);
      fireBrowserNotif(title, body);
    }
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

    item.querySelector(".btnOpen").addEventListener("click", ()=> window.open(r.url, "_blank", "noopener"));

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
    data: { labels, datasets: [{ label: "Fiyat (₺)", data, tension: 0.25, pointRadius: 3 }] },
    options: { responsive:true, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ maxRotation:0 } }, y:{ beginAtZero:false } } }
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
        <button class="btnDelete">Sil</button>
      </div>

      <div class="aiCommentBox">
        <div class="aiCommentTop">
          <div class="setTitle">AI Yorumu</div>
          <button class="btnGhost btnAIComment">AI yorum al</button>
        </div>
        <div class="aiCommentText">${f.aiComment ? escapeHtml(f.aiComment) : "Henüz AI yorumu yok."}</div>
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

    el.querySelector(".btnDelete").addEventListener("click", async ()=>{
      if (!confirm("Favoriyi silmek istiyor musun?")) return;
      await deleteDoc(doc(db, "users", currentUser.uid, "favorites", f.id));
      await loadFavorites();
    });

    el.querySelector(".btnAIComment").addEventListener("click", async ()=>{
      try{
        if (!hasAIConfig()){ showToast("AI key yok. Ayarlar > AI Key kur."); return; }
        const pin = prompt("AI PIN/Şifre:");
        if (!pin) return;

        showToast("AI yorum hazırlanıyor...");
        const promptText =
`Aşağıdaki ürün sorgusu için kısa, tarafsız bir alışveriş yorumu üret:
- Site: ${f.siteName}
- Arama: ${f.query}

İstenen format (max 6 satır):
1) Ürün ne olabilir (tahmin)
2) Nelere dikkat etmeli
3) Fiyat/kalite yorumu (genel)
4) Uygun alternatif anahtar kelimeler`;

        const out = await runAI({ prompt: promptText, pin, provider:"gemini", model:"gemini-1.5-flash" });
        const text = String(out || "").trim().slice(0, 1200);

        await updateDoc(doc(db, "users", currentUser.uid, "favorites", f.id), {
          aiComment: text,
          aiCommentAt: serverTimestamp()
        });

        await loadFavorites();
        showToast("AI yorumu eklendi.");
      }catch(e){
        showToast("AI hata: " + (e?.message || e));
      }
    });

    const chartArea = el.querySelector(".chartArea");
    const h = f.history || [];
    if (h.length < 2){
      chartArea.innerHTML = `<div class="chartHint">Grafik için en az 2 fiyat kaydı gerekir. (Otomatik çekim gelince dolacak)</div>`;
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

/* SETTINGS modal */
function openSettings(){ settingsWrap.classList.remove("hidden"); }
function closeSettings(){ settingsWrap.classList.add("hidden"); }

btnSettings.addEventListener("click", ()=>{
  appVersionEl.textContent = APP_VERSION;
  openSettings();
});
btnCloseSettings.addEventListener("click", closeSettings);

btnClearCache.addEventListener("click", async ()=>{
  try{
    if (navigator.serviceWorker?.controller){
      navigator.serviceWorker.controller.postMessage({ type:"CLEAR_ALL_CACHES" });
      const t = setTimeout(()=>location.reload(), 800);
      navigator.serviceWorker.addEventListener("message", (e)=>{
        if (e?.data?.type === "CACHES_CLEARED"){
          clearTimeout(t);
          location.reload();
        }
      }, { once:true });
    } else {
      location.reload();
    }
  }catch{
    location.reload();
  }
});

/* JSON export/import restore */
btnExportJSON.addEventListener("click", async ()=>{
  try{
    if (!currentUser){ showToast("Giriş gerekli."); return; }
    const snaps = await getDocs(query(favCol(), orderBy("queryLower","asc")));
    const items = snaps.docs.map(d=>({ id:d.id, ...d.data() }));
    const payload = { app:"fiyattakip", version:APP_VERSION, exportedAt:new Date().toISOString(), uid:currentUser.uid, favorites:items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fiyattakip-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("JSON yedek indirildi.");
  }catch(e){
    showToast("Export hata: " + (e?.message || e));
  }
});

btnImportJSON.addEventListener("click", ()=> fileImportJSON.click());
fileImportJSON.addEventListener("change", async ()=>{
  try{
    if (!currentUser){ showToast("Giriş gerekli."); return; }
    const file = fileImportJSON.files?.[0];
    fileImportJSON.value = "";
    if (!file) return;

    const txt = await file.text();
    const data = JSON.parse(txt);

    if (!data || data.app !== "fiyattakip" || !Array.isArray(data.favorites)){
      showToast("Geçersiz yedek dosyası.");
      return;
    }

    if (!confirm("Bu işlem mevcut favorilerini silip yedekten yükler. Devam?")) return;

    const existing = await getDocs(query(favCol(), orderBy("queryLower","asc")));
    for (const d of existing.docs) await deleteDoc(d.ref);

    for (const it of data.favorites){
      const id = it.id || favDocId(it.siteKey || "site", it.query || "query");
      const clean = {
        siteKey: it.siteKey || "",
        siteName: it.siteName || "",
        query: it.query || "",
        queryLower: (it.queryLower || String(it.query||"").toLowerCase()),
        url: it.url || "",
        createdAt: serverTimestamp(),
        lastPrice: it.lastPrice ?? null,
        history: Array.isArray(it.history) ? it.history : [],
        aiComment: it.aiComment || null,
        aiCommentAt: serverTimestamp()
      };
      await setDoc(doc(db, "users", currentUser.uid, "favorites", id), clean, { merge:false });
    }

    await loadFavorites();
    showToast("Geri yükleme tamamlandı.");
  }catch(e){
    showToast("Import hata: " + (e?.message || e));
  }
});

/* AI settings + cloud backup/restore */
btnAISettings.addEventListener("click", async ()=>{
  try{
    const apiKey = prompt("Gemini API Key:");
    if (!apiKey) return;
    const pin = prompt("PIN/Şifre (AI key şifrelenip saklanacak):");
    if (!pin) return;
    const remember = confirm("PIN bu oturum için hatırlansın mı? (Sayfa kapanınca silinir)");
    await saveAIConfigEncrypted({ provider:"gemini", model:"gemini-1.5-flash", apiKey, pin, rememberPin: remember });
    showToast("AI key kaydedildi (şifreli).");
  }catch(e){
    showToast("AI ayar hata: " + (e?.message || e));
  }
});

btnAICloudBackup.addEventListener("click", async ()=>{
  try{
    if (!currentUser){ showToast("Giriş gerekli."); return; }
    const blob = exportEncryptedConfigBlob();
    await setDoc(userSettingsDoc(), { aiBlob: blob, aiBlobAt: serverTimestamp(), appVersion: APP_VERSION }, { merge:true });
    showToast("AI şifreli yedek Cloud’a kaydedildi.");
  }catch(e){
    showToast("Cloud yedek hata: " + (e?.message || e));
  }
});

btnAICloudRestore.addEventListener("click", async ()=>{
  try{
    if (!currentUser){ showToast("Giriş gerekli."); return; }
    const snap = await getDoc(userSettingsDoc());
    if (!snap.exists() || !snap.data()?.aiBlob){ showToast("Cloud’da AI yedeği yok."); return; }
    importEncryptedConfigBlob(snap.data().aiBlob);
    showToast("Cloud AI yedeği cihazına alındı.");
  }catch(e){
    showToast("Cloud restore hata: " + (e?.message || e));
  }
});

/* AI SEARCH */
async function aiSearchText(){
  try{
    if (!hasAIConfig()){ showToast("AI key yok. Ayarlar > AI Key kur."); return; }
    const pin = prompt("AI PIN/Şifre:");
    if (!pin) return;

    const q = qEl.value.trim() || prompt("AI arama için ürün yaz:");
    if (!q) return;

    showToast("AI arama yapılıyor...");
    const promptText =
`Türkiye e-ticaret için ürün arama önerisi üret.
Kullanıcı araması: "${q}"

Sadece JSON dön:
[
  { "product": "...", "url": "https://www.trendyol.com/sr?q=..." },
  { "product": "...", "url": "https://www.hepsiburada.com/ara?q=..." }
]

Kurallar:
- URL’ler Trendyol/Hepsiburada/N11/AmazonTR/Pazarama/ÇiçekSepeti/idefix arama linkleri olsun.
- Maks 8 sonuç.
- JSON dışında hiçbir şey yazma.`;

    const out = await runAI({ prompt: promptText, pin, provider:"gemini", model:"gemini-1.5-flash" });
    const arr = JSON.parse(String(out||"").trim());

    if (!Array.isArray(arr) || !arr.length){ showToast("AI sonuç yok."); return; }

    searchResults.className = "listBox";
    searchResults.innerHTML = "";

    for (const r of arr.slice(0,8)){
      const name = r?.product || "Ürün";
      const url = r?.url || "";
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="itemLeft">
          <div class="siteName">AI Öneri</div>
          <div class="queryText">${escapeHtml(name)}</div>
        </div>
        <div class="itemRight">
          <button class="btnOpen">Aç</button>
          <button class="btnFav">Favori Ekle</button>
        </div>
      `;
      item.querySelector(".btnOpen").addEventListener("click", ()=>{ if (url) window.open(url, "_blank", "noopener"); });

      item.querySelector(".btnFav").addEventListener("click", async ()=>{
        if (!currentUser){ showToast("Giriş gerekli."); return; }
        if (!url){ showToast("URL yok."); return; }

        const lower = url.toLowerCase();
        let siteKey = "trendyol", siteName = "Trendyol";
        for (const s of SITES){
          if (lower.includes(s.key) || lower.includes(s.name.toLowerCase().replace(" ",""))){
            siteKey = s.key; siteName = s.name; break;
          }
        }

        await addFavorite(siteKey, siteName, name, url);
        await loadFavorites();
      });

      searchResults.appendChild(item);
    }

    showToast("AI sonuçlar hazır.");
  }catch(e){
    showToast("AI arama hata: " + (e?.message || e));
  }
}

/* Kamera/Galeri pratik: kullanıcıdan kısa not aldırır */
async function aiSearchImage(){
  try{
    const note = prompt("Görseldeki ürünü 2-3 kelime ile yaz (ör: 'ddr4 8gb ram'):");
    if (!note) return;
    qEl.value = note;
    await aiSearchText();
  }catch(e){
    showToast("Görsel AI hata: " + (e?.message || e));
  }
}

btnAISearchText.addEventListener("click", aiSearchText);
btnAISearchCam.addEventListener("click", ()=> fileCam.click());
btnAISearchGallery.addEventListener("click", ()=> fileGallery.click());
fileCam.addEventListener("change", async ()=>{ fileCam.value=""; await aiSearchImage(); });
fileGallery.addEventListener("change", async ()=>{ fileGallery.value=""; await aiSearchImage(); });

/* Auth UI */
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

btnBell.addEventListener("click", async ()=>{
  const ok = await ensureNotifPermission();
  if (ok) showToast("Bildirimler açık.");
  else showToast("Bildirim izni verilmedi.");
});

getRedirectResult(auth).catch(()=>{});

/* Main UI events */
renderSitePills();

btnSearch.addEventListener("click", ()=> renderSearchRows(qEl.value.trim()));
qEl.addEventListener("keydown", (e)=>{ if (e.key==="Enter"){ e.preventDefault(); btnSearch.click(); } });

btnClear.addEventListener("click", ()=>{
  qEl.value = "";
  searchResults.className = "listBox emptyBox";
  searchResults.textContent = "Henüz arama yapılmadı.";
});

btnOpenSelected.addEventListener("click", ()=> openSelectedSites(qEl.value));
favSort.addEventListener("change", ()=> loadFavorites());
btnRefreshFav.addEventListener("click", ()=> loadFavorites());

btnAI.addEventListener("click", ()=> openSettings());

/* Auth state: içerik gizleme */
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
    return "Firebase: api-key-not-valid. Cache olabilir. Ayarlar > Cache Temizle yap.";
  }
  if (msg.includes("auth/invalid-credential")) return "Hatalı giriş bilgisi.";
  if (msg.includes("auth/email-already-in-use")) return "Bu email zaten kayıtlı.";
  if (msg.includes("auth/weak-password")) return "Şifre çok zayıf. Daha güçlü bir şifre gir.";
  return "Hata: " + msg;
}
