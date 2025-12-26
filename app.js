
function normalizeUrl(raw){
  try{
    const u = new URL(raw);
    // strip tracking params
    const drop = new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid","yclid","mc_eid","ref","referrer","source","spm"]);
    [...u.searchParams.keys()].forEach(k=>{ if(drop.has(k)) u.searchParams.delete(k); });
    u.hash = "";
    // normalize protocol+host+pathname (remove trailing slash)
    let path = u.pathname.replace(/\/$/,"");
    return (u.origin + path + (u.searchParams.toString()?("?"+u.searchParams.toString()):"")).toLowerCase();
  }catch{
    return String(raw||"").trim().toLowerCase();
  }
}

/* ===== Pagination (4 per page) ===== */
const PAGINATION = {
  search: { page: 1, perPage: 4, lastQuery: "" },
  fav:    { page: 1, perPage: 4 },
};

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function paginate(items, page, perPage){
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const p = clamp(page, 1, totalPages);
  const start = (p - 1) * perPage;
  return { page: p, perPage, total, totalPages, slice: items.slice(start, start + perPage) };
}

function renderPager(container, meta, onChange){
  if (!container) return;
  container.innerHTML = `
    <div class="pager">
      <button class="btnGhost sm" type="button" ${meta.page<=1?'disabled':''} data-act="prev">‹</button>
      <span class="pagerInfo">${meta.page} / ${meta.totalPages}</span>
      <button class="btnGhost sm" type="button" ${meta.page>=meta.totalPages?'disabled':''} data-act="next">›</button>
    </div>
  `;
  container.querySelector('[data-act="prev"]')?.addEventListener("click", ()=> onChange(meta.page-1));
  container.querySelector('[data-act="next"]')?.addEventListener("click", ()=> onChange(meta.page+1));
}


// app.js (theme preserved) — Link-only normal search + Firebase auth (email + Google)
// Normal arama: e-ticaret sitelerinden ÜRÜN ÇEKMEZ; sadece arama LİNKİ üretir (stabil).
// Tema/HTML bozulmaz.

import { auth, googleProvider, firebaseConfigLooksInvalid } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore();


const $ = (id) => document.getElementById(id);

// ---------- Toast ----------
function toast(msg){
  const t = $("toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.add("hidden"), 2200);
}

async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    toast("Kopyalandı");
  }catch(e){
    const ta=document.createElement("textarea");
    ta.value=text;
    ta.style.position="fixed"; ta.style.left="-9999px";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try{ document.execCommand("copy"); toast("Kopyalandı"); }catch(_){}
    document.body.removeChild(ta);
  }
}

async function clearAppCache(){
  try{
    // Clear Cache Storage
    if (window.caches && caches.keys){
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
    // Clear storages
    try{ localStorage.clear(); }catch(e){}
    try{ sessionStorage.clear(); }catch(e){}
    // Clear IndexedDB (best effort)
    if (indexedDB && indexedDB.databases){
      const dbs = await indexedDB.databases();
      await Promise.all((dbs||[]).map(db=>{
        if (!db || !db.name) return Promise.resolve();
        return new Promise(res=>{
          const req = indexedDB.deleteDatabase(db.name);
          req.onsuccess=req.onerror=req.onblocked=()=>res();
        });
      }));
    }
    toast("Önbellek temizlendi. Yenileniyor...");
  }catch(e){
    console.error(e);
    toast("Temizleme hatası");
  }
  setTimeout(()=>location.reload(true), 600);
}



// ---------- Pages / Tabs ----------
function showPage(key){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));

  const page = document.querySelector(`#page-${CSS.escape(key)}`);
  if (page) page.classList.add("active");

  const tab = document.querySelector(`.tab[data-page="${CSS.escape(key)}"]`);
  if (tab) tab.classList.add("active");
}

// ---------- Search mode (Normal / AI toggle on home) ----------
function setSearchMode(mode){
  localStorage.setItem("searchMode", mode);
  $("modeNormal")?.classList.toggle("active", mode==="normal");
  $("modeAI")?.classList.toggle("active", mode==="ai");
  const hint = $("modeHint");
  if (hint){
    hint.textContent = mode==="ai"
      ? "AI arama: yazdığını analiz eder, daha net ürün sorgusuyla arar."
      : "Normal arama: sitelerde direkt arar.";
  }
}
function getSearchMode(){
  return localStorage.getItem("searchMode") || "normal";
}

// ---------- Login modal helpers ----------

function setAuthPane(mode){
  const loginPane = document.getElementById("loginPane");
  const registerPane = document.getElementById("registerPane");
  const tL = document.getElementById("tabLogin");
  const tR = document.getElementById("tabRegister");
  if (!loginPane || !registerPane) return;
  const isReg = mode === "register";
  loginPane.classList.toggle("hidden", isReg);
  registerPane.classList.toggle("hidden", !isReg);
  tL?.classList.toggle("isActive", !isReg);
  tR?.classList.toggle("isActive", isReg);
}

function openLogin(){
  setAuthPane('login');
  const m = $("loginModal");
  if (!m) return;
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
  document.body.classList.add("modalOpen");
}
function closeLogin(){
  const m = $("loginModal");
  if (!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden","true");
  document.body.classList.remove("modalOpen");
}

// ---------- Sites (link-only) ----------
const SITES = [
  { key:"trendyol", name:"Trendyol", build:q=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", build:q=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11", name:"N11", build:q=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazontr", name:"Amazon TR", build:q=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"pazarama", name:"Pazarama", build:q=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:q=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key:"idefix", name:"idefix", build:q=>`https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` },
];

// ---------- Favorites (Firestore) ----------
let favCache = []; // [{id, url, siteKey, siteName, query, ...}]

function favIdFromUrl(url){
  try{
    const u = new URL(url);
    const key = (u.hostname + u.pathname + u.search).toLowerCase();
    let h=0; for (let i=0;i<key.length;i++){ h=((h<<5)-h)+key.charCodeAt(i); h|=0; }
    return "fav_" + Math.abs(h);
  }catch{
    return "fav_" + Math.random().toString(36).slice(2);
  }
}

const FAV_COLL = (uid)=> collection(db, "users", uid, "favorites");

async function loadFavorites(uid){
  if (!uid){ favCache=[]; return favCache; }
  const snap = await getDocs(FAV_COLL(uid));
  favCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  return favCache;
}

function isFav(url){
  const id = favIdFromUrl(url);
  return favCache.some(f=>f.id===id);
}

async function toggleFavorite(uid, fav){
  const id = favIdFromUrl(fav.url);
  const ref = doc(db, "users", uid, "favorites", id);
  if (favCache.some(f=>f.id===id)){
    await deleteDoc(ref);
  } else {
    await setDoc(ref, {
      ...fav,
      createdAt: Date.now(),
    }, { merge:true });
  }
  await loadFavorites(uid);
  applyFavUI();
}

function applyFavUI(){
  document.querySelectorAll("[data-fav-url]").forEach(btn=>{
    const url = btn.getAttribute("data-fav-url") || "";
    const fav = isFav(url);
    btn.classList.toggle("isFav", fav);
    btn.textContent = fav ? "❤️" : "🤍";
    btn.title = fav ? "Favoride" : "Favoriye ekle";
  });
}

function renderFavoritesPage(uid){
  const list = $("favList");
  if (!list) return;
  list.innerHTML = "";
  if (!favCache.length){
    list.innerHTML = `<div class="empty">Favori yok.</div>`;
    return;
  }
  const pg = paginate(favCache, PAGINATION.fav.page, PAGINATION.fav.perPage);
  PAGINATION.fav.page = pg.page;
  for (const it of pg.slice){
    const card = document.createElement("div");
    card.className = "cardBox";
    card.innerHTML = `
      <div class="rowLine">
        <div>
          <div class="ttl">${it.siteName || "Favori"}</div>
          <div class="sub">${it.query || ""}</div>
        </div>
        <div class="actions">
          <button class="btnPrimary sm" type="button" data-open-url="${it.url||""}" data-copy-url="${it.url||""}">Aç</button>
          <button class="btnGhost sm btnFav isFav" type="button" data-fav-url="${it.url||""}" data-fav-id="${it.id}" data-site-key="${it.siteKey||""}" data-site-name="${it.siteName||""}" data-query="${it.query||""}">❤️</button>
        </div>
      </div>
      
    `;
    card.querySelector("[data-open-url]")?.addEventListener("click", ()=>{
      if (it.url) window.open(it.url, "_blank", "noopener");
    });
    card.querySelector("[data-fav-url]")?.addEventListener("click", async ()=>{
      await toggleFavorite(uid, { url: it.url, siteKey: it.siteKey||"", siteName: it.siteName||"", query: it.query||"" });
      renderFavoritesPage(uid);
    });
    list.appendChild(card);
  }
  const pagerEl = $("favPager");
  renderPager(pagerEl, {page: pg.page, totalPages: pg.totalPages, total: pg.total}, (newPage)=>{
    PAGINATION.fav.page = newPage;
    renderFavoritesPage(uid);
    window.scrollTo({top:0, behavior:"smooth"});
  });
  applyFavUI();
}

function renderSiteList(container, query){
  if (!container) return;
  const q = String(query||"").trim();
  if (!q){
    container.innerHTML = `<div class="cardBox"><b>Bir şey yaz.</b></div>`;
    return;
  }

  container.innerHTML = "";
  PAGINATION.search.lastQuery = q;
  const pg = paginate(SITES, PAGINATION.search.page, PAGINATION.search.perPage);
  PAGINATION.search.page = pg.page;
  for (const s of pg.slice){
    const url = s.build(q);
    const card = document.createElement("div");
    card.className = "cardBox";
    card.innerHTML = `
      <div class="rowLine">
        <div>
          <div class="ttl">${s.name}</div>
          <div class="sub">${q}</div>
        </div>
        <div class="actions">
          <button class="btnPrimary sm btnOpen" type="button">Aç</button>
          <button class="btnGhost sm btnCopy" type="button" data-copy-url="${url}" title="Linki kopyala">⧉</button>
          <button class="btnGhost sm btnFav" type="button" data-fav-url="${url}" data-site-key="${s.key}" data-site-name="${s.name}" data-query="${q}">🤍</button>
        </div>
      </div>
      
    `;
    card.querySelector(".btnOpen")?.addEventListener("click", ()=> {
      window.open(url, "_blank", "noopener");
    });
        card.querySelector(".btnFav")?.addEventListener("click", async ()=>{
      if (!window.__uid) return toast("Favori için giriş yap.");
      await toggleFavorite(window.__uid, { url, siteKey: s.key, siteName: s.name, query: q });
    });
container.appendChild(card);
  }
}

window.renderSiteList = renderSiteList;
window.doNormalSearch = (query)=>{
  showPage("search");
  PAGINATION.search.page = 1;
  renderSiteList($("normalList"), query);
};

// ---------- Auth state ----------
window.currentUser = null;

async function doEmailLogin(isRegister){
  const btnL = $("btnLogin");
  const btnR = $("btnRegister");
  if (btnL) btnL.disabled = true;
  if (btnR) btnR.disabled = true;

  const email = (isRegister ? ($("regEmail")?.value || "") : ($("loginEmail")?.value || "")).trim();
  const pass  = (isRegister ? ($("regPass")?.value || "") : ($("loginPass")?.value || ""));
  const pass2 = (isRegister ? ($("regPass2")?.value || "") : "");

  if (!email || !pass){
    if (btnL) btnL.disabled = false;
    if (btnR) btnR.disabled = false;
    return toast("E-posta ve şifre gir.");
  }
  if (isRegister){
    if (pass.length < 6){
      if (btnL) btnL.disabled = false;
      if (btnR) btnR.disabled = false;
      return toast("Şifre en az 6 karakter olmalı.");
    }
    if (!pass2 || pass !== pass2){
      if (btnL) btnL.disabled = false;
      if (btnR) btnR.disabled = false;
      return toast("Şifreler uyuşmuyor.");
    }
  }

  toast(isRegister ? "Kayıt deneniyor..." : "Giriş deneniyor...");

  try{
    if (isRegister){
      await createUserWithEmailAndPassword(auth, email, pass);
      toast("Kayıt tamam. Giriş yapıldı.");
      setAuthPane("login");
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Giriş başarılı.");
    }
  }catch(e){
    console.error(e);
    const code = String(e?.code || "");
    const msg = String(e?.message || e || "");
    if (code.includes("auth/email-already-in-use")) return toast("Bu e-posta zaten kayıtlı. Giriş yap.");
    if (code.includes("auth/weak-password")) return toast("Şifre çok zayıf (en az 6 karakter).");
    if (code.includes("auth/invalid-email")) return toast("E-posta formatı hatalı.");
    if (code.includes("auth/operation-not-allowed")) return toast("Email/Şifre ile kayıt kapalı. Firebase Console > Auth > Sign-in method: Email/Password aç.");
    toast("Hata: " + msg.replace(/^Firebase:\s*/,""));
  }finally{
    if (btnL) btnL.disabled = false;
    if (btnR) btnR.disabled = false;
  }
}

async function doGoogleLogin(){
  try{
    await signInWithPopup(auth, googleProvider);
    return;
  }catch(e){
    // popup blocked / mobile -> redirect
    try{
      await signInWithRedirect(auth, googleProvider);
      return;
    }catch(e2){
      const msg = String(e2?.message || e?.message || e2 || e || "");
      if (msg.includes("auth/unauthorized-domain")){
        toast("Google giriş için domain yetkisi yok. Firebase > Authentication > Settings > Authorized domains içine siteni ekle (örn: fiyattakip.github.io).");
        return;
      }
      toast("Google giriş hatası: " + msg.replace(/^Firebase:\s*/,""));
    }
  }
}

// Redirect dönüşünü sessizce işle
getRedirectResult(auth).catch(()=>{});

// ---------- Wire UI ----------
function wireUI(){
  $("btnAiSettings")?.addEventListener("click", openAIModal);
  $("closeAi")?.addEventListener("click", closeAIModal);
  $("aiBackdrop")?.addEventListener("click", closeAIModal);
  $("btnSaveAI")?.addEventListener("click", saveAISettings);

  $("btnClearCache")?.addEventListener("click", ()=>clearAppCache());

  $("tabLogin")?.addEventListener("click", ()=>setAuthPane("login"));
  $("tabRegister")?.addEventListener("click", ()=>setAuthPane("register"));
  // ikinci Google butonu (kayıt paneli)
  $("btnGoogleLogin2")?.addEventListener("click", ()=>doGoogleLogin());


  // Favori click delegation (arama + favoriler)
  document.addEventListener("click", async (e)=>{
    const btn = e.target && e.target.closest ? e.target.closest("[data-fav-url]") : null;
    if (!btn) return;
    e.preventDefault();
    const u = window.currentUser;
    if (!u){ openLogin(); return; }

    const favId = btn.getAttribute("data-fav-id") || "";
    const urlRaw = btn.getAttribute("data-fav-url") || "";
    const norm = normalizeUrl(urlRaw);

    // Favoriler sayfasından kaldırma: id varsa direkt sil + duplicate cleanup
    if (favId){
      try{ await deleteDoc(doc(db, "users", u.uid, "favorites", favId)); }catch(e){ console.error(e); }
      // aynı ürünün diğer kopyalarını da temizle
      const dups = (window.__favCache||[]).filter(f=>{
        const fNorm = f.normUrl || normalizeUrl(f.url||"");
        return norm && fNorm === norm;
      });
      for (const it of dups){
        if (it.id === favId) continue;
        try{ await deleteDoc(doc(db, "users", u.uid, "favorites", it.id)); }catch(e){ console.error(e); }
      }
      await loadFavorites(u.uid);
      renderFavoritesPage(u.uid);
      applyFavUI();
      return;
    }

    // Arama listesinden toggle
    const url = urlRaw;
    const siteKey = btn.getAttribute("data-site-key") || "";
    const siteName = btn.getAttribute("data-site-name") || "";
    const query = btn.getAttribute("data-query") || "";
    await toggleFavorite(u.uid, { url, siteKey, siteName, query });
    renderFavoritesPage(u.uid);
    applyFavUI();
  });

  // bottom tabs
  document.querySelectorAll(".tab[data-page]").forEach(btn=>{
    btn.addEventListener("click", ()=> showPage(btn.dataset.page));
  });

  $("modeNormal")?.addEventListener("click", ()=> setSearchMode("normal"));
  $("modeAI")?.addEventListener("click", ()=> setSearchMode("ai"));
  setSearchMode(getSearchMode());

    $("btnFavRefresh")?.addEventListener("click", async ()=>{
    const u = window.currentUser;
    if (!u) return openLogin();
    await loadFavorites(u.uid);
    renderFavoritesPage(u.uid);
    applyFavUI();
  });

  // close login guard
  $("closeLogin")?.addEventListener("click", ()=>{
    if (!window.currentUser){
      toast("Giriş yapmadan kullanamazsın.");
      openLogin();
      return;
    }
    closeLogin();
  });
  $("loginBackdrop")?.addEventListener("click", ()=>{
    if (!window.currentUser){
      toast("Giriş yapmadan kullanamazsın.");
      openLogin();
      return;
    }
    closeLogin();
  });

  // login buttons
  $("btnLogin")?.addEventListener("click", ()=>doEmailLogin(false));
  $("btnRegister")?.addEventListener("click", ()=>doEmailLogin(true));
  $("btnGoogle")?.addEventListener("click", ()=>doGoogleLogin());

  // auth tab switch (email/google) if present
  document.querySelectorAll(".segBtn[data-auth]").forEach(b=>{
    b.addEventListener("click", ()=>{
      document.querySelectorAll(".segBtn[data-auth]").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      const which = b.dataset.auth;
      const emailBox = $("authEmail");
      const gBox = $("authGoogle");
      if (emailBox && gBox){
        emailBox.style.display = which==="email" ? "" : "none";
        gBox.style.display = which==="google" ? "" : "none";
      }
    });
  });

  // home search
  $("btnNormal")?.addEventListener("click", async ()=>{
    const q = ($("qNormal")?.value || "").trim();
    if (!q) return toast("Bir şey yaz.");
    // Normal / AI toggle: AI yoksa normal davran
    if (getSearchMode()==="ai" && typeof window.aiText === "function"){
      toast("AI sorgu hazırlanıyor...");
      try{
        const built = await window.aiText(`Sadece tek satır arama sorgusu üret. Çıktı sadece düz metin. Kullanıcı: ${q}`);
        const qq = String(built||q).replace(/\s+/g," ").trim().slice(0,80);
        $("qNormal").value = qq;
        window.doNormalSearch(qq);
      }catch{
        window.doNormalSearch(q);
      }
    } else {
      window.doNormalSearch(q);
    }
  });

  // camera button (AI visual sayfaya gitsin)
  $("fabCamera")?.addEventListener("click", ()=>{
    // Eğer görsel sayfa yoksa settings'e kayma olmasın:
    const visualTab = $("tabAIVisual") || $("tabVisual");
    if (visualTab) visualTab.click();
    else showPage("settings");
  });

  // logout if exists
  $("logoutBtn")?.addEventListener("click", async ()=>{
    try{ await signOut(auth); }catch{}
  });
  // Copy link
  document.addEventListener("click", async (e)=>{
    const b = e.target && e.target.closest ? e.target.closest("[data-copy-url]") : null;
    if (!b) return;
    // only when clicking copy button (avoid open button)
    if (!b.classList.contains("btnCopy")) return;
    e.preventDefault();
    const url = b.getAttribute("data-copy-url") || "";
    if (url) await copyToClipboard(url);
  });
}

// ---------- Auth visibility ----------
function setAuthedUI(isAuthed){
  // App içinde giriş zorunlu: authed değilse modal aç
  if (!isAuthed) openLogin();
  else closeLogin();
}

// Boot
window.addEventListener("DOMContentLoaded", ()=>{
  wireUI();

  if (firebaseConfigLooksInvalid()){
    toast("Firebase config eksik/yanlış. firebase.js içindeki değerleri kontrol et.");
  }

  onAuthStateChanged(auth, async (u)=>{
    window.currentUser = u || null;
    setAuthedUI(!!u);
    if (u){
      try{
        await loadFavorites(u.uid);
        renderFavoritesPage(u.uid);
        applyFavUI();
      }catch(e){ console.error(e); }
    }
  });
});

// === AI SETTINGS (STEP 5A) ===
function loadAISettings(){
  try{
    const s=JSON.parse(localStorage.getItem("aiSettings")||"{}");
    $("aiEnabled") && ($("aiEnabled").value = s.enabled || "on");
    $("aiProvider") && ($("aiProvider").value = s.provider || "gemini");
    $("aiApiKey") && ($("aiApiKey").value = s.key || "");
  }catch(e){}
}
function saveAISettings(){
  const s={
    enabled: $("aiEnabled")?.value || "on",
    provider: $("aiProvider")?.value || "gemini",
    key: $("aiApiKey")?.value || ""
  };
  localStorage.setItem("aiSettings", JSON.stringify(s));
  toast("AI ayarları kaydedildi");
}
function openAIModal(){
  const m = document.getElementById("aiModal");
  if(!m) return;
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
  loadAISettings();
}
function closeAIModal(){
  const m = document.getElementById("aiModal");
  if(!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden","true");
}
