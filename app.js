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
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { aiConfigured, saveGeminiKey, clearAiCfg, geminiText, geminiVision, setSessionPin } from "./ai.js";


const $ = (id) => document.getElementById(id);

const db = getFirestore();
let currentUser = null;
const FAV_COLL = (uid)=> collection(db, "users", uid, "favorites");


// ---------- Toast ----------
function toast(msg){
  const t = $("toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.add("hidden"), 2200);
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


// ---------- Favorites ----------
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

let favCache = [];

function fmtPrice(p){
  if (p === null || p === undefined || p === "") return "—";
  const n = Number(p);
  if (!isFinite(n)) return String(p);
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " TL";
}

function pctDrop(prev, now){
  const a = Number(prev), b = Number(now);
  if (!isFinite(a) || !isFinite(b) || a<=0) return null;
  return ((a - b) / a) * 100;
}

function getThreshold(){
  const v = Number(localStorage.getItem("dropThreshold") || "10");
  return isFinite(v) && v>0 ? v : 10;
}

async function addFavorite({siteKey, siteName, query, url}){
  const uid = currentUser?.uid;
  if (!uid) return;
  const id = favIdFromUrl(url);
  const ref = doc(db, "users", uid, "favorites", id);
  await setDoc(ref, {
    siteKey, siteName, query, url,
    createdAt: serverTimestamp(),
    lastPrice: null,
    history: []
  }, { merge: true });
  await loadFavorites();
}

async function removeFavorite(id){
  const uid = currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(db, "users", uid, "favorites", id));
  await loadFavorites();
}

async function addPricePoint(id, price){
  const uid = currentUser?.uid;
  if (!uid) return;
  const ref = doc(db, "users", uid, "favorites", id);

  const fav = favCache.find(x=>x.id===id);
  const hist = Array.isArray(fav?.history) ? fav.history.slice() : [];
  const now = Date.now();
  hist.push({ t: now, p: Number(price) });

  const prev = hist.length>=2 ? hist[hist.length-2]?.p : null;
  await updateDoc(ref, { history: hist, lastPrice: Number(price) });
  await loadFavorites();

  const drop = pctDrop(prev, price);
  const thr = getThreshold();
  if (drop !== null && drop >= thr){
    maybeNotify(`Fiyat düştü (%${drop.toFixed(1)})`, `${fav?.siteName||""} • ${fav?.query||""}`);
  }
}

async function loadFavorites(){
  const uid = currentUser?.uid;
  if (!uid){
    favCache = [];
    renderFavorites([]);
    renderGraphs([]);
    return;
  }
  const snap = await getDocs(FAV_COLL(uid));
  favCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  renderFavorites(favCache);
  renderGraphs(favCache);
}

function renderFavorites(items){
  const root = $("favList");
  if (!root) return;
  if (!items.length){
    root.innerHTML = `<div class="cardBox"><div class="miniHint">Henüz favori yok.</div></div>`;
    return;
  }
  root.innerHTML = "";
  for (const it of items){
    const el = document.createElement("div");
    el.className = "cardBox";
    el.innerHTML = `
      <div class="rowLine">
        <div>
          <div class="ttl">${it.siteName || ""}</div>
          <div class="sub">${it.query || ""}</div>
        </div>
        <div class="actions">
          <button class="btnPrimary sm btnOpen" type="button">Aç</button>
          <button class="btnGhost sm btnAddPrice" type="button">Fiyat</button>
          <button class="btnGhost sm btnDel" type="button">Sil</button>
        </div>
      </div>
      <div class="mini">Son: <b>${fmtPrice(it.lastPrice)}</b></div>
    `;
    el.querySelector(".btnOpen")?.addEventListener("click", ()=>window.open(it.url, "_blank", "noopener"));
    el.querySelector(".btnDel")?.addEventListener("click", ()=>removeFavorite(it.id));
    el.querySelector(".btnAddPrice")?.addEventListener("click", async ()=>{
      const v = prompt("Yeni fiyat (TL):", it.lastPrice ?? "");
      if (!v) return;
      const n = Number(String(v).replace(",", "."));
      if (!isFinite(n) || n<=0) return toast("Geçerli fiyat gir.");
      await addPricePoint(it.id, n);
      toast("Fiyat eklendi.");
    });
    root.appendChild(el);
  }
}

function makeSparkline(points, w=160, h=48){
  const ps = (points||[]).map(x=>Number(x?.p)).filter(n=>isFinite(n));
  if (ps.length<2) return "";
  const min = Math.min(...ps), max = Math.max(...ps);
  const dx = w/(ps.length-1);
  const scale = (v)=> {
    if (max===min) return h/2;
    return h - ((v-min)/(max-min))*h;
  };
  let d = "";
  ps.forEach((v,i)=>{
    const x=i*dx, y=scale(v);
    d += (i===0?`M ${x.toFixed(1)} ${y.toFixed(1)}`:` L ${x.toFixed(1)} ${y.toFixed(1)}`);
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" /></svg>`;
}

function renderGraphs(items){
  const root = $("graphRoot");
  if (!root) return;
  if (!items.length){
    root.innerHTML = `<div class="cardBox"><div class="miniHint">Grafik için favori ekle.</div></div>`;
    return;
  }
  root.innerHTML = "";
  for (const it of items){
    const hist = Array.isArray(it.history) ? it.history : [];
    const prices = hist.map(x=>Number(x.p)).filter(n=>isFinite(n));
    const min = prices.length? Math.min(...prices): null;
    const max = prices.length? Math.max(...prices): null;
    const last = prices.length? prices[prices.length-1]: null;

    const card = document.createElement("div");
    card.className = "cardBox";
    card.innerHTML = `
      <div class="rowLine">
        <div>
          <div class="ttl">${it.siteName||""}</div>
          <div class="sub">${it.query||""}</div>
        </div>
        <div class="actions">
          <button class="btnGhost sm btnAddPrice" type="button">Fiyat</button>
        </div>
      </div>
      <div class="rowBetween">
        <div class="mini">Min: <b>${fmtPrice(min)}</b> • Max: <b>${fmtPrice(max)}</b> • Son: <b>${fmtPrice(last)}</b></div>
        <div class="spark">${makeSparkline(hist)}</div>
      </div>
    `;
    card.querySelector(".btnAddPrice")?.addEventListener("click", async ()=>{
      const v = prompt("Yeni fiyat (TL):", it.lastPrice ?? "");
      if (!v) return;
      const n = Number(String(v).replace(",", "."));
      if (!isFinite(n) || n<=0) return toast("Geçerli fiyat gir.");
      await addPricePoint(it.id, n);
      toast("Fiyat eklendi.");
    });
    root.appendChild(card);
  }
}

// ---------- Notifications (foreground) ----------
function maybeNotify(title, body){
  try{
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted"){
      new Notification(title, { body });
    }
  }catch{}
}

// ---------- Login modal helpers ----------
function openLogin(){
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

function renderSiteList(container, query){
  if (!container) return;
  const q = String(query||"").trim();
  if (!q){
    container.innerHTML = `<div class="cardBox"><b>Bir şey yaz.</b></div>`;
    return;
  }

  container.innerHTML = "";
  for (const s of SITES){
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
          <button class="btnGhost sm btnFav" type="button">Favori</button>
        </div>
      </div>
      <div class="mini">${url}</div>
    `;
    card.querySelector(".btnOpen")?.addEventListener("click", ()=> {
      window.open(url, "_blank", "noopener");
    });
    card.querySelector(".btnFav")?.addEventListener("click", async ()=>{
      if (!currentUser) return toast("Favori için giriş yap.");
      await addFavorite({ siteKey: s.key, siteName: s.name, query: q, url });
      toast("Favoriye eklendi.");
    });
    container.appendChild(card);
  }
}

window.renderSiteList = renderSiteList;
window.doNormalSearch = (query)=>{
  showPage("search");
  renderSiteList($("normalList"), query);
};

// ---------- Auth state ----------
window.currentUser = null;

async function doEmailLogin(isRegister){
  const email = ($("email")?.value || "").trim();
  const pass  = ($("pass")?.value || "");
  if (!email || !pass) return toast("E-posta ve şifre gir.");

  try{
    if (isRegister){
      await createUserWithEmailAndPassword(auth, email, pass);
      toast("Kayıt tamam.");
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Giriş başarılı.");
    }
  }catch(e){
    const msg = String(e?.message || e || "");
    if (msg.includes("auth/unauthorized-domain")){
      toast("Google giriş hatası (unauthorized-domain). Firebase > Auth > Settings > Authorized domains: fiyattakip.github.io ekle.");
      return;
    }
    toast("Hata: " + msg.replace(/^Firebase:\s*/,""));
  }
}

async function doGoogleLogin(){
  try{
    // mobilde popup bazen bloklanır
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) await signInWithRedirect(auth, googleProvider);
    else await signInWithPopup(auth, googleProvider);
  }catch(e){
    const msg = String(e?.message || e || "");
    if (msg.includes("auth/unauthorized-domain")){
      toast("Google giriş hatası (unauthorized-domain). Firebase > Auth > Settings > Authorized domains: fiyattakip.github.io ekle.");
      return;
    }
    toast("Google giriş hatası: " + msg.replace(/^Firebase:\s*/,""));
  }
}

// Redirect dönüşünü sessizce işle
getRedirectResult(auth).catch(()=>{});

// ---------- Wire UI ----------
function wireUI(){
  // bottom tabs
  document.querySelectorAll(".tab[data-page]").forEach(btn=>{
    btn.addEventListener("click", ()=> showPage(btn.dataset.page));
  });

  $("modeNormal")?.addEventListener("click", ()=> setSearchMode("normal"));
  $("modeAI")?.addEventListener("click", ()=> setSearchMode("ai"));
  setSearchMode(getSearchMode());

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

    if (getSearchMode()==="ai"){
      if (!aiConfigured()){
        toast("AI için Ayarlar > AI Ayarları'ndan API Key gir.");
        showPage("settings");
        return;
      }
      toast("AI sorgu hazırlanıyor…");
      try{
        const built = await geminiText(
          "Kullanıcının yazdığını e-ticaret araması için 2-6 kelimelik kısa Türkçe sorguya çevir. Sadece sorguyu yaz. Kullanıcı: " + q,
          { maxTokens: 32 }
        );
        const qq = String(built||q).replace(/\s+/g," ").trim().slice(0,80);
        $("qNormal").value = qq;
        window.doNormalSearch(qq);
      }catch(e){
        console.error(e);
        window.doNormalSearch(q);
      }
      return;
    }

    window.doNormalSearch(q);
  });

  // camera button (AI visual sayfaya gitsin)
  $("fabCamera")?.addEventListener("click", ()=>{
    // Eğer görsel sayfa yoksa settings'e kayma olmasın:
    const visualTab = $("tabAIVisual") || $("tabVisual");
    if (visualTab) visualTab.click();
    else showPage("settings");
  });

    // clear search
  $("btnClearSearch")?.addEventListener("click", ()=>{
    $("normalList") && ($("normalList").innerHTML = "");
    showPage("home");
  });

  // refresh buttons
  $("btnFavRefresh")?.addEventListener("click", loadFavorites);
  $("btnGraphRefresh")?.addEventListener("click", loadFavorites);

  // cache clear button on login
  $("btnClearCache")?.addEventListener("click", async ()=>{
    try{
      if (window.caches){
        const keys = await caches.keys();
        await Promise.all(keys.map(k=>caches.delete(k)));
      }
      localStorage.clear();
      sessionStorage.clear();
      if (navigator.serviceWorker){
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=>r.unregister()));
      }
      toast("Önbellek temizlendi. Yenileniyor…");
    }catch{}
    setTimeout(()=>location.reload(), 400);
  });

  // AI settings modal
  const openAi = ()=>{ $("aiModal")?.classList.add("show"); $("aiModal")?.setAttribute("aria-hidden","false"); refreshAiStatus(); };
  const closeAi = ()=>{ $("aiModal")?.classList.remove("show"); $("aiModal")?.setAttribute("aria-hidden","true"); };
  $("btnAiSettings")?.addEventListener("click", openAi);
  $("aiClose")?.addEventListener("click", closeAi);
  $("aiBackdrop")?.addEventListener("click", closeAi);

  $("aiSave")?.addEventListener("click", async ()=>{
    const key = ($("aiKey")?.value || "").trim();
    const pin = ($("aiPin")?.value || "").trim();
    if (!key) return toast("API Key gir.");
    if (pin) setSessionPin(pin);
    try{
      await saveGeminiKey(key, pin || null);
      toast("AI kaydedildi.");
      refreshAiStatus();
    }catch(e){
      console.error(e);
      toast("AI kaydetme hatası.");
    }
  });
  $("aiTest")?.addEventListener("click", async ()=>{
    try{
      const out = await geminiText("Sadece 'ok' yaz.", { maxTokens: 8 });
      toast("AI test: " + String(out||"ok").slice(0,30));
      refreshAiStatus("Test OK");
    }catch(e){
      console.error(e);
      toast("AI test başarısız (key/pin?).");
      refreshAiStatus("Test FAIL");
    }
  });
  $("aiClear")?.addEventListener("click", ()=>{
    clearAiCfg();
    toast("AI ayarları silindi.");
    refreshAiStatus();
  });

  function refreshAiStatus(msg){
    const st = $("aiStatus");
    if (!st) return;
    st.textContent = msg ? msg : (aiConfigured() ? "✅ AI hazır" : "⚠️ AI yapılandırılmadı");
  }

  // AI camera: capture image and extract query
  const camInput = document.createElement("input");
  camInput.type = "file";
  camInput.accept = "image/*";
  camInput.capture = "environment";
  camInput.style.display = "none";
  document.body.appendChild(camInput);

  $("fabCamera")?.addEventListener("click", ()=>{
    camInput.value = "";
    camInput.click();
  });
  camInput.addEventListener("change", async ()=>{
    const file = camInput.files?.[0];
    if (!file) return;
    if (!aiConfigured()){
      toast("AI için Ayarlar > AI Ayarları'ndan API Key gir.");
      showPage("settings");
      return;
    }
    toast("Görsel analiz ediliyor…");
    try{
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const prompt = "Bu görseldeki ürünü e-ticaret araması için 2-5 kelimelik kısa Türkçe sorgu olarak yaz. Sadece sorguyu yaz.";
      const q = (await geminiVision(prompt, b64, file.type))?.trim?.() || "";
      if (!q) throw new Error("empty");
      $("qNormal").value = q;
      setSearchMode("ai");
      showPage("home");
      window.doNormalSearch(q);
      toast("AI sorgu: " + q);
    }catch(e){
      console.error(e);
      toast("Görsel analiz başarısız.");
    }
  });

  // Bell: request notification permission
  $("btnBell")?.addEventListener("click", async ()=>{
    try{
      if (!("Notification" in window)) return toast("Bildirim desteklenmiyor.");
      const p = await Notification.requestPermission();
      toast(p === "granted" ? "Bildirim açık." : "Bildirim kapalı.");
    }catch{}
  });

// logout if exists
  $("logoutBtn")?.addEventListener("click", async ()=>{
    try{ await signOut(auth); }catch{}
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
  setPersistence(auth, browserLocalPersistence).catch(()=>{});
  wireUI();

  if (firebaseConfigLooksInvalid()){
    toast("Firebase config eksik/yanlış. firebase.js içindeki değerleri kontrol et.");
  }

  onAuthStateChanged(auth, async (u)=>{
    currentUser = u || null;
    window.currentUser = currentUser;
    setAuthedUI(!!currentUser);
    await loadFavorites();
  });
});
