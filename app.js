import { auth, db, googleProvider } from "./firebase.js";
import { runAI, hasAIConfig, loadAIConfig, saveAIConfigEncrypted, clearAIConfig, setSessionPin, getSessionPin, clearSessionPin } from "./ai.js";

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
const btnHardRefresh = document.getElementById("btnHardRefresh");

const btnLogout = document.getElementById("btnLogout");
const btnBell = document.getElementById("btnBell");
const btnAISettings = document.getElementById("btnAISettings");

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

// Mode tabs
const modeTabs = Array.from(document.querySelectorAll(".modeTab"));
const normalBox = document.getElementById("normalBox");
const aiBox = document.getElementById("aiBox");
const imgBox = document.getElementById("imgBox");

// AI search / image
const btnAISearch = document.getElementById("btnAISearch");
const aiResults = document.getElementById("aiResults");

const imgFile = document.getElementById("imgFile");
const btnImgSearch = document.getElementById("btnImgSearch");
const imgOut = document.getElementById("imgOut");

// AI Settings modal
const aiWrap = document.getElementById("aiWrap");
const btnCloseAI = document.getElementById("btnCloseAI");
const aiKey = document.getElementById("aiKey");
const aiPin = document.getElementById("aiPin");
const aiRemember = document.getElementById("aiRemember");
const btnSaveAI = document.getElementById("btnSaveAI");
const btnClearAI = document.getElementById("btnClearAI");
const aiInfo = document.getElementById("aiInfo");

/* =========================
   State
========================= */
let mode = "login";
let currentUser = null;
let favCache = [];

const TRACK_INTERVAL_MIN = 20; // worker cron 20 dk gibi
const DROP_THRESHOLD = 10; // %10+

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

function nowMs(){ return Date.now(); }
function msToText(ms){
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleString("tr-TR");
}

/* =========================
   Notifications
========================= */
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
   Mode tabs
========================= */
let currentMode = "normal";
function setModeUI(m){
  currentMode = m;
  modeTabs.forEach(b=>b.classList.toggle("active", b.dataset.mode===m));
  normalBox.classList.toggle("hidden", m!=="normal");
  aiBox.classList.toggle("hidden", m!=="ai");
  imgBox.classList.toggle("hidden", m!=="image");
}
modeTabs.forEach(btn=>{
  btn.addEventListener("click", ()=>setModeUI(btn.dataset.mode));
});

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

    // worker yazacak alanlar:
    lastPrice: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastError: null,
    history: [], // {tMs, p}

    // yarı-otomatik mantık:
    nextTryAt: nowMs(), // ilk cron'da denesin
    lastManualViewedAt: null,

    // AI
    aiComment: null,
    aiCommentUpdatedAt: null
  };

  await setDoc(ref, data, { merge:false });
  showToast("Favoriye eklendi. (Fiyatlar cron ile güncellenecek)");
}

async function removeFavorite(siteKey, queryText){
  const id = favDocId(siteKey, queryText);
  const ref = doc(db, "users", currentUser.uid, "favorites", id);
  await deleteDoc(ref);
  showToast("Favoriden kaldırıldı.");
}

async function markManualView(fav){
  // kullanıcı linke bakınca: nextTryAt'ı “hemen” yap (bir sonraki cron'da denensin)
  const ref = doc(db, "users", currentUser.uid, "favorites", fav.id);
  await updateDoc(ref, {
    lastManualViewedAt: nowMs(),
    nextTryAt: nowMs(),
    lastError: null
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
      lastCheckedAt: d.lastCheckedAt ?? null,
      lastSuccessAt: d.lastSuccessAt ?? null,
      lastError: d.lastError ?? null,
      nextTryAt: d.nextTryAt ?? null,
      history: Array.isArray(d.history) ? d.history : [],
      createdAtMs: d.createdAt?.toMillis?.() ?? 0,
      aiComment: d.aiComment ?? null,
      aiCommentUpdatedAt: d.aiCommentUpdatedAt ?? null
    };
  });

  favCache.sort((a,b)=>{
    if (sort==="price_asc"){
      if (a.lastPrice==null && b.lastPrice==null) return b.createdAtMs - a.createdAtMs;
      if (a.lastPrice==null) return 1;
      if (b.lastPrice==null) return -1;
      return a.lastPrice - b.lastPrice;
    }
    if (sort==="price_desc"){
      if (a.lastPrice==null && b.lastPrice==null) return b.createdAtMs - a.createdAtMs;
      if (a.lastPrice==null) return 1;
      if (b.lastPrice==null) return -1;
      return b.lastPrice - a.lastPrice;
    }
    if (sort==="site"){
      const s = a.siteName.localeCompare(b.siteName);
      if (s!==0) return s;
      return a.queryLower.localeCompare(b.queryLower);
    }
    return b.createdAtMs - a.createdAtMs; // newest
  });

  renderFavorites();
  checkDrops();
}

/* =========================
   Drop check (%10)
========================= */
function checkDrops(){
  for (const f of favCache){
    const h = f.history || [];
    if (h.length < 2) continue;
    const prev = h[h.length-2]?.p;
    const last = h[h.length-1]?.p;
    if (prev == null || last == null) continue;

    const diff = (prev - last) / prev * 100;
    if (diff >= DROP_THRESHOLD){
      fireBrowserNotif(`${f.siteName}: %${diff.toFixed(1)} düşüş`, `${f.query} → ${fmtTRY(prev)} → ${fmtTRY(last)}`);
    }
  }
}

/* =========================
   Search rows (Normal)
   - “en düşük sırala” KAPALI: alakalı satırlar (site sırası)
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
      lastPrice: existing?.lastPrice ?? null,
      aiComment: existing?.aiComment ?? null
    };
  });

  searchResults.className = "listBox";
  searchResults.innerHTML = "";

  for (const r of rows){
    const item = document.createElement("div");
    item.className = "item";

    const priceHtml = (r.lastPrice!=null)
      ? `<div class="badgeOk">✅ ${fmtTRY(r.lastPrice)}</div>`
      : `<div class="badgeErr">⚠️ fiyat yok</div>`;

    const favOn = !!r.fav;

    item.innerHTML = `
      <div class="itemLeft">
        <div class="siteName">${escapeHtml(r.site.name)}</div>
        <div class="queryText">${escapeHtml(q)}</div>
        ${r.aiComment ? `<div class="aiBubble">${escapeHtml(r.aiComment)}<small>AI yorum (favoriden)</small></div>` : ``}
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

/* =========================
   Open selected
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
   AI Settings Modal
========================= */
function openAI(){
  aiWrap.classList.remove("hidden");
  const cfg = loadAIConfig();
  aiInfo.textContent = hasAIConfig()
    ? "AI key kayıtlı. PIN doğruysa AI arama çalışır."
    : "AI key kayıtlı değil. Gemini API key gir.";
}
function closeAI(){ aiWrap.classList.add("hidden"); }

btnAISettings.addEventListener("click", openAI);
btnCloseAI.addEventListener("click", closeAI);

btnSaveAI.addEventListener("click", async ()=>{
  try{
    const key = aiKey.value.trim();
    const pin = aiPin.value.trim();
    const remember = !!aiRemember.checked;
    await saveAIConfigEncrypted({ apiKey:key, pin, rememberPin: remember });
    aiInfo.textContent = remember ? "Kaydedildi. PIN bu oturumda hatırlandı." : "Kaydedildi. (PIN hatırlanmadı)";
    showToast("AI ayarları kaydedildi.");
    // temizle
    aiKey.value = "";
    aiPin.value = "";
  }catch(e){
    aiInfo.textContent = "Hata: " + (e?.message || e);
  }
});

btnClearAI.addEventListener("click", ()=>{
  clearAIConfig();
  aiInfo.textContent = "AI key silindi.";
  showToast("AI key silindi.");
});

/* =========================
   AI Search (site isimleri + yorum)
   - AI sonuçları: her site için "searchQuery" + "comment"
========================= */
async function ensureAIReady(){
  if (!hasAIConfig()) throw new Error("AI key kayıtlı değil. (AI Ayarları)");
  const pin = getSessionPin();
  if (pin) return true;
  throw new Error("PIN yok. AI Ayarları → PIN gir → Oturumu hatırla");
}

function buildAISearchPrompt(userQuery){
  const sites = SITES.filter(s=>selectedSites.has(s.key))
    .map(s=>({ siteKey:s.key, siteName:s.name }));
  return `
Sen bir e-ticaret arama asistanısın.
Kullanıcının aradığı ürün: "${userQuery}"

Seçili siteler:
${JSON.stringify(sites)}

GÖREV:
Her site için:
- "searchQuery": O sitede daha iyi sonuç getirecek kısa arama metni (ör: marka/model/kapasite)
- "comment": O site özelinde dikkat edilmesi gereken 1-2 cümle (ör: garanti/ithalatçı/ram-tür)

KURALLAR:
- Sadece JSON döndür.
- Dizi formatı: [{siteKey, siteName, searchQuery, comment}]
- siteKey/siteName seçili listeden olmalı.
- searchQuery boş olmasın.
`.trim();
}

btnAISearch.addEventListener("click", async ()=>{
  const q = qEl.value.trim();
  if (!q){ showToast("Önce arama metni yaz."); return; }

  aiResults.className = "listBox emptyBox";
  aiResults.textContent = "AI düşünüyor...";

  try{
    await ensureAIReady();
    const text = await runAI({ prompt: buildAISearchPrompt(q) });

    let arr = [];
    try { arr = JSON.parse(text); } catch { arr = []; }

    if (!Array.isArray(arr) || arr.length===0) throw new Error("AI sonuç üretemedi.");

    // render
    aiResults.className = "listBox";
    aiResults.innerHTML = "";

    for (const r of arr){
      const site = SITES.find(s=>s.key===r.siteKey) || null;
      if (!site) continue;

      const searchQ = String(r.searchQuery || q).trim();
      const url = site.build(searchQ);

      const existing = favCache.find(f=>f.siteKey===site.key && f.queryLower===searchQ.toLowerCase());
      const lastPrice = existing?.lastPrice ?? null;

      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="itemLeft">
          <div class="siteName">${escapeHtml(site.name)}</div>
          <div class="queryText">${escapeHtml(searchQ)}</div>
          ${r.comment ? `<div class="aiBubble">${escapeHtml(r.comment)}<small>AI yorum</small></div>` : ``}
        </div>
        <div class="itemRight">
          ${lastPrice!=null ? `<div class="badgeOk">✅ ${fmtTRY(lastPrice)}</div>` : `<div class="badgeErr">⚠️ fiyat yok</div>`}
          <button class="btnOpen">Aç</button>
          <button class="btnFav ${existing ? "on":""}">${existing ? "Favoride" : "Favori Ekle"}</button>
        </div>
      `;

      item.querySelector(".btnOpen").addEventListener("click", ()=>{
        // AI aramada tıklayınca “normal arama” değil, direkt ilgili site araması açılır
        window.open(url, "_blank", "noopener");
      });

      item.querySelector(".btnFav").addEventListener("click", async ()=>{
        if (!currentUser) return;
        if (existing) {
          showToast("Zaten favoride.");
          return;
        }
        await addFavorite(site.key, site.name, searchQ, url);
        // favoriye AI yorumunu da yaz
        const id = favDocId(site.key, searchQ);
        await updateDoc(doc(db,"users",currentUser.uid,"favorites",id), {
          aiComment: r.comment || null,
          aiCommentUpdatedAt: nowMs()
        });
        await loadFavorites();
        showToast("Favoriye eklendi.");
      });

      aiResults.appendChild(item);
    }

  }catch(e){
    aiResults.className = "listBox emptyBox";
    aiResults.textContent = "Hata: " + (e?.message || e);
  }
});

/* =========================
   Image Search (Gemini vision -> text)
   - Çıkan metin: Google'da aransın (senin istediğin)
========================= */
function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(String(r.result||""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function buildImagePrompt(){
  return `
Bu bir ürün fotoğrafı olabilir.
1) Fotoğraftaki ürünü/markayı/modeli tahmin et.
2) Eğer yazı varsa (etiket/model kodu) aynen çıkar.
Sadece JSON döndür:
{"title":"...", "keywords":["...","..."], "bestQuery":"..."}
`.trim();
}

btnImgSearch.addEventListener("click", async ()=>{
  const f = imgFile.files?.[0];
  if (!f){ showToast("Önce görsel seç."); return; }

  imgOut.className = "listBox emptyBox";
  imgOut.textContent = "Analiz ediliyor...";

  try{
    await ensureAIReady();
    const b64 = await fileToDataURL(f);
    const text = await runAI({ prompt: buildImagePrompt(), imageB64: b64 });

    let obj = null;
    try { obj = JSON.parse(text); } catch { obj = null; }
    if (!obj?.bestQuery) throw new Error("Görsel bulunamadı / metin çıkarılamadı.");

    const bestQuery = String(obj.bestQuery).trim();
    const title = obj.title ? String(obj.title).trim() : "Görsel Analizi";

    // Google araması (istediğin gibi)
    const gUrl = `https://www.google.com/search?q=${encodeURIComponent(bestQuery)}&tbm=shop`;

    imgOut.className = "listBox";
    imgOut.innerHTML = `
      <div class="item">
        <div class="itemLeft">
          <div class="siteName">${escapeHtml(title)}</div>
          <div class="queryText">${escapeHtml(bestQuery)}</div>
          <div class="aiBubble">
            Anahtarlar: ${escapeHtml((obj.keywords||[]).join(", "))}
            <small>Görselden çıkarım</small>
          </div>
        </div>
        <div class="itemRight">
          <button class="btnOpen" id="btnOpenGoogle">Google’da Ara</button>
          <button class="btnGhost" id="btnFillNormal">Normal’e aktar</button>
          <button class="btnGhost" id="btnFillAI">AI Arama’ya aktar</button>
        </div>
      </div>
    `;

    imgOut.querySelector("#btnOpenGoogle").addEventListener("click", ()=>{
      window.open(gUrl, "_blank", "noopener");
    });
    imgOut.querySelector("#btnFillNormal").addEventListener("click", ()=>{
      qEl.value = bestQuery;
      setModeUI("normal");
      renderSearchRows(bestQuery);
    });
    imgOut.querySelector("#btnFillAI").addEventListener("click", ()=>{
      qEl.value = bestQuery;
      setModeUI("ai");
      btnAISearch.click();
    });

  }catch(e){
    imgOut.className = "listBox emptyBox";
    imgOut.textContent = "Hata: " + (e?.message || e);
  }
});

/* =========================
   Favorites UI (AI yorum + tekrar dene)
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
    const status = f.lastError
      ? `<span class="badgeErr">⚠️ ${escapeHtml(f.lastError)}</span>`
      : `<span class="badgeOk">✅ OK</span>`;

    el.innerHTML = `
      <div class="favTop">
        <div>
          <div class="favName">${escapeHtml(f.query)}</div>
          <div class="favMeta">${escapeHtml(f.siteName)} • Son kontrol: ${escapeHtml(msToText(f.lastCheckedAt))}</div>
        </div>
        <div class="favPrice">${priceText}</div>
      </div>

      <div class="favBtns">
        <button class="btnAction btnOpen">Siteyi Aç</button>
        <button class="btnAction btnCopy">Copy Link</button>
        <button class="btnWarn btnRetry">Tekrar dene şimdi</button>
        <button class="btnAction btnAIComment">AI Yorum</button>
        <button class="btnDelete btnDeleteFav">Sil</button>
        ${status}
      </div>

      ${f.aiComment ? `<div class="aiBubble">${escapeHtml(f.aiComment)}<small>Güncellendi: ${escapeHtml(msToText(f.aiCommentUpdatedAt))}</small></div>` : ``}
    `;

    // Open
    el.querySelector(".btnOpen").addEventListener("click", async ()=>{
      window.open(f.url, "_blank", "noopener");
      await markManualView(f); // link açınca otomatik sıfırlama + nextTryAt
      showToast("Link açıldı. (Sonraki cron’da tekrar denenecek)");
      await loadFavorites();
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

    // Retry now (anında değil; bir sonraki cron tetik)
    el.querySelector(".btnRetry").addEventListener("click", async ()=>{
      await markManualView(f);
      showToast("İşaretlendi: sonraki cron’da tekrar denenecek.");
      await loadFavorites();
    });

    // AI comment (favori için)
    el.querySelector(".btnAIComment").addEventListener("click", async ()=>{
      try{
        await ensureAIReady();
        const prompt = `
Kullanıcı bir ürünü takip ediyor.
Site: ${f.siteName}
Arama ifadesi: ${f.query}
Son fiyat: ${f.lastPrice ?? "bilinmiyor"}
Kısa ve faydalı 2-3 cümle yorum yaz:
- dikkat edilmesi gerekenler (garanti, satıcı, model uyuşması)
- varsa alternatif öneri
Sadece düz metin döndür.
`.trim();

        const text = await runAI({ prompt });
        const ref = doc(db, "users", currentUser.uid, "favorites", f.id);
        await updateDoc(ref, { aiComment: text, aiCommentUpdatedAt: nowMs() });
        showToast("AI yorum güncellendi.");
        await loadFavorites();
      }catch(e){
        showToast("AI hata: " + (e?.message || e));
      }
    });

    // Delete
    el.querySelector(".btnDeleteFav").addEventListener("click", async ()=>{
      if (!confirm("Favoriyi silmek istiyor musun?")) return;
      await deleteDoc(doc(db, "users", currentUser.uid, "favorites", f.id));
      await loadFavorites();
    });

    favList.appendChild(el);
  }
}

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
    if (isMobile()) await signInWithRedirect(auth, googleProvider);
    else await signInWithPopup(auth, googleProvider);
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

getRedirectResult(auth).catch(()=>{});

/* cache temizleme (login ekranında) */
btnHardRefresh.addEventListener("click", async ()=>{
  try{
    if ("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
    if ("caches" in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
    // session PIN temizle (temiz giriş)
    clearSessionPin();
    showToast("Önbellek temizlendi. Sayfa yenileniyor...");
    setTimeout(()=>location.reload(), 600);
  }catch(e){
    showToast("Temizleme hata: " + (e?.message || e));
  }
});

/* =========================
   Main events
========================= */
renderSitePills();
setModeUI("normal");

btnSearch.addEventListener("click", ()=>renderSearchRows(qEl.value));
qEl.addEventListener("keydown", (e)=>{ if (e.key==="Enter"){ e.preventDefault(); btnSearch.click(); }});

btnClear.addEventListener("click", ()=>{
  qEl.value = "";
  searchResults.className = "listBox emptyBox";
  searchResults.textContent = "Henüz arama yapılmadı.";
  aiResults.className = "listBox emptyBox";
  aiResults.textContent = "AI arama yapılmadı.";
});

btnOpenSelected.addEventListener("click", ()=>openSelectedSites(qEl.value));
favSort.addEventListener("change", ()=>loadFavorites());
btnRefreshFav.addEventListener("click", ()=>loadFavorites());

btnBell.addEventListener("click", async ()=>{
  const ok = await ensureNotifPermission();
  showToast(ok ? "Bildirimler açık." : "Bildirim izni verilmedi.");
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
   Error text
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
