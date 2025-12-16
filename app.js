import { auth, db, googleProvider } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* SİTELER */
const SITES = [
  { key: "trendyol", name: "Trendyol", search: (q) => `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key: "hepsiburada", name: "Hepsiburada", search: (q) => `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key: "n11", name: "N11", search: (q) => `https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key: "amazon", name: "Amazon TR", search: (q) => `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key: "pazarama", name: "Pazarama", search: (q) => `https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key: "ciceksepeti", name: "ÇiçekSepeti", search: (q) => `https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key: "idefix", name: "İdefix", search: (q) => `https://www.idefix.com/search?q=${encodeURIComponent(q)}` },
];

/* DOM */
const $ = (id) => document.getElementById(id);

const authOverlay = $("authOverlay");
const tabSignIn = $("tabSignIn");
const tabSignUp = $("tabSignUp");
const confirmWrap = $("confirmWrap");
const authEmail = $("authEmail");
const authPassword = $("authPassword");
const authPassword2 = $("authPassword2");
const btnAuthPrimary = $("btnAuthPrimary");
const btnGoogle = $("btnGoogle");
const authMsg = $("authMsg");
const togglePw = $("togglePw");
const togglePw2 = $("togglePw2");

const btnLogout = $("btnLogout");
const btnEnableNotif = $("btnEnableNotif");
const btnHelper = $("btnHelper");
const helpModal = $("helpModal");
const btnCloseHelp = $("btnCloseHelp");

const siteChips = $("siteChips");
const qInput = $("qInput");
const suggestBox = $("suggestBox");
const btnSearch = $("btnSearch");
const btnClearResults = $("btnClearResults");
const btnOpenSelected = $("btnOpenSelected");
const resultsBox = $("resultsBox");

const favBox = $("favBox");
const btnRefreshFav = $("btnRefreshFav");
const sortFav = $("sortFav");

const chartModal = $("chartModal");
const btnCloseChart = $("btnCloseChart");
const chartTitle = $("chartTitle");
const chartCanvas = $("chartCanvas");
const chartHint = $("chartHint");

/* STATE */
let currentUser = null;
let authMode = "signin";
let selectedSites = new Set(SITES.map(s => s.key));
let lastResults = [];
let favorites = [];
let recentQueries = [];

const LS_RECENT = "ft_recentQueries_v1";

/* HELPERS */
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 220);
  }, 1800);
}

function setAuthMsg(text, ok=false){
  authMsg.textContent = text || "";
  authMsg.className = "authMsg " + (ok ? "ok" : "err");
  if(!text) authMsg.className = "authMsg";
}

function normalizeTitle(q){
  const s = (q || "").trim().replace(/\s+/g, " ");
  return s.length ? s : "Ürün";
}

function favIdFrom(siteKey, title){
  return `${siteKey}__${title.toLowerCase().replace(/[^a-z0-9çğıöşü\- ]/gi,"").replace(/\s+/g,"_")}`.slice(0,150);
}

function formatTRY(n){
  if (n == null || Number.isNaN(n)) return "Fiyat yok";
  try { return new Intl.NumberFormat("tr-TR", { style:"currency", currency:"TRY", maximumFractionDigits: 0 }).format(n); }
  catch { return `${Math.round(n)} TL`; }
}

function percentDrop(prev, cur){
  if (!prev || !cur) return 0;
  return ((prev - cur) / prev) * 100;
}

function openUrl(url){ window.open(url, "_blank", "noopener,noreferrer"); }

async function copyText(text){
  try {
    await navigator.clipboard.writeText(text);
    toast("Link kopyalandı");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Link kopyalandı");
  }
}

/* AUTH UI */
function setAuthMode(mode){
  authMode = mode;
  if(mode === "signin"){
    tabSignIn.classList.add("active");
    tabSignUp.classList.remove("active");
    confirmWrap.classList.add("hidden");
    btnAuthPrimary.textContent = "Giriş Yap";
    authPassword.autocomplete = "current-password";
  }else{
    tabSignUp.classList.add("active");
    tabSignIn.classList.remove("active");
    confirmWrap.classList.remove("hidden");
    btnAuthPrimary.textContent = "Hesap Oluştur";
    authPassword.autocomplete = "new-password";
  }
  setAuthMsg("");
}

togglePw.addEventListener("click", () => {
  authPassword.type = authPassword.type === "password" ? "text" : "password";
});
togglePw2.addEventListener("click", () => {
  authPassword2.type = authPassword2.type === "password" ? "text" : "password";
});

tabSignIn.addEventListener("click", () => setAuthMode("signin"));
tabSignUp.addEventListener("click", () => setAuthMode("signup"));

btnAuthPrimary.addEventListener("click", async () => {
  setAuthMsg("");
  const email = authEmail.value.trim();
  const pw = authPassword.value;

  if(!email || !pw) return setAuthMsg("E-posta ve şifre gir.");

  try{
    if(authMode === "signup"){
      const pw2 = authPassword2.value;
      if(pw.length < 6) return setAuthMsg("Şifre en az 6 karakter olmalı.");
      if(pw !== pw2) return setAuthMsg("Şifreler aynı değil.");
      await createUserWithEmailAndPassword(auth, email, pw);
      setAuthMsg("Hesap oluşturuldu.", true);
    }else{
      await signInWithEmailAndPassword(auth, email, pw);
      setAuthMsg("Giriş başarılı.", true);
    }
  }catch(e){
    setAuthMsg("Hata: " + (e?.message || e));
  }
});

btnGoogle.addEventListener("click", async () => {
  setAuthMsg("");
  try{
    await signInWithPopup(auth, googleProvider);
  }catch(e){
    setAuthMsg("Google giriş hatası: " + (e?.message || e));
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});

/* SITE CHIPS */
function renderSiteChips(){
  siteChips.innerHTML = "";
  SITES.forEach(s => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (selectedSites.has(s.key) ? " active" : "");
    b.innerHTML = `<span class="dot"></span><span class="chipText">${s.name}</span>`;
    b.addEventListener("click", () => {
      if(selectedSites.has(s.key)) selectedSites.delete(s.key);
      else selectedSites.add(s.key);
      renderSiteChips();
    });
    siteChips.appendChild(b);
  });
}

/* RECENT */
function loadRecent(){
  try{
    recentQueries = JSON.parse(localStorage.getItem(LS_RECENT) || "[]");
    if(!Array.isArray(recentQueries)) recentQueries = [];
  }catch{ recentQueries = []; }
}
function saveRecent(q){
  const v = normalizeTitle(q);
  if(!v) return;
  recentQueries = [v, ...recentQueries.filter(x => x !== v)].slice(0, 12);
  localStorage.setItem(LS_RECENT, JSON.stringify(recentQueries));
}
function renderSuggest(){
  const q = qInput.value.trim().toLowerCase();
  if(!q){ suggestBox.classList.add("hidden"); suggestBox.innerHTML = ""; return; }
  const items = recentQueries.filter(x => x.toLowerCase().includes(q)).slice(0, 6);
  if(!items.length){ suggestBox.classList.add("hidden"); suggestBox.innerHTML = ""; return; }
  suggestBox.classList.remove("hidden");
  suggestBox.innerHTML = items.map(x => `<div class="suggestItem">${x}</div>`).join("");
  [...suggestBox.querySelectorAll(".suggestItem")].forEach((el, i) => {
    el.addEventListener("click", () => {
      qInput.value = items[i];
      suggestBox.classList.add("hidden");
      suggestBox.innerHTML = "";
      qInput.focus();
    });
  });
}
qInput.addEventListener("input", renderSuggest);
document.addEventListener("click", (e) => {
  if(!suggestBox.contains(e.target) && e.target !== qInput){
    suggestBox.classList.add("hidden");
  }
});

/* RESULTS */
function buildResults(q){
  const title = normalizeTitle(q);
  const chosen = SITES.filter(s => selectedSites.has(s.key));
  lastResults = chosen.map(s => ({
    siteKey: s.key,
    siteName: s.name,
    query: title,
    url: s.search(title)
  }));
}

function isFavorited(siteKey, title){
  const fid = favIdFrom(siteKey, normalizeTitle(title));
  return favorites.some(f => f.id === fid);
}

async function addFavoriteFromResult(r){
  const title = normalizeTitle(r.query);
  const fid = favIdFrom(r.siteKey, title);
  const ref = doc(db, "users", currentUser.uid, "favorites", fid);

  const payload = {
    id: fid,
    title,
    siteKey: r.siteKey,
    siteName: r.siteName,
    url: r.url,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastPrice: null,
    priceHistory: []
  };
  await setDoc(ref, payload, { merge: true });
  toast("Favoriye eklendi");
  await loadFavorites();
  renderResults();
  renderFavorites();
}

async function removeFavorite(siteKey, title){
  const fid = favIdFrom(siteKey, normalizeTitle(title));
  await deleteDoc(doc(db, "users", currentUser.uid, "favorites", fid));
  toast("Favoriden silindi");
  await loadFavorites();
  renderResults();
  renderFavorites();
}

function renderResults(){
  resultsBox.innerHTML = "";
  if(!lastResults.length){
    resultsBox.innerHTML = `<div class="emptyHint">Henüz arama yapılmadı.</div>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "resultsList";

  lastResults.forEach(r => {
    const row = document.createElement("div");
    row.className = "resultRow";

    const fav = isFavorited(r.siteKey, r.query);

    row.innerHTML = `
      <div class="resultLeft">
        <div class="siteTitle">${r.siteName}</div>
        <div class="qText">${r.query}</div>
      </div>
      <div class="resultRight">
        <button class="btnOpen" type="button">Aç</button>
        <button class="${fav ? "btnFavOn" : "btnFav"}" type="button">
          ${fav ? "❤️ Favoride" : "♡ Favori Ekle"}
        </button>
      </div>
    `;

    row.querySelector(".btnOpen").addEventListener("click", () => openUrl(r.url));
    row.querySelector(fav ? ".btnFavOn" : ".btnFav").addEventListener("click", async () => {
      if(!currentUser) return;
      if(fav) await removeFavorite(r.siteKey, r.query);
      else await addFavoriteFromResult(r);
    });

    wrap.appendChild(row);
  });

  resultsBox.appendChild(wrap);
}

btnSearch.addEventListener("click", () => {
  const q = qInput.value.trim();
  if(!q) return toast("Ürün adı yaz.");
  buildResults(q);
  saveRecent(q);
  renderSuggest();
  renderResults();
});
qInput.addEventListener("keydown", (e) => { if(e.key === "Enter") btnSearch.click(); });

btnClearResults.addEventListener("click", () => {
  lastResults = [];
  resultsBox.innerHTML = `<div class="emptyHint">Henüz arama yapılmadı.</div>`;
});
btnOpenSelected.addEventListener("click", () => {
  if(!lastResults.length) return toast("Önce ara.");
  lastResults.forEach(r => openUrl(r.url));
});

/* FAVORITES */
async function loadFavorites(){
  if(!currentUser) return;
  const snap = await getDocs(collection(db, "users", currentUser.uid, "favorites"));
  favorites = snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

function sortFavorites(list){
  const mode = sortFav.value;
  const copy = [...list];

  const priceOrNull = (f) => (typeof f.lastPrice === "number" ? f.lastPrice : null);

  const cmpNullLastAsc = (a,b) => {
    const pa = priceOrNull(a), pb = priceOrNull(b);
    if(pa == null && pb == null) return 0;
    if(pa == null) return 1;      // null sona
    if(pb == null) return -1;     // null sona
    return pa - pb;
  };

  const cmpNullLastDesc = (a,b) => {
    const pa = priceOrNull(a), pb = priceOrNull(b);
    if(pa == null && pb == null) return 0;
    if(pa == null) return 1;      // null sona
    if(pb == null) return -1;     // null sona
    return pb - pa;               // pahalı→ucuz
  };

  if(mode === "lastPriceAsc") copy.sort(cmpNullLastAsc);
  if(mode === "lastPriceDesc") copy.sort(cmpNullLastDesc);
  if(mode === "nameAsc") copy.sort((a,b)=> (a.title||"").localeCompare(b.title||"", "tr"));
  if(mode === "siteAsc") copy.sort((a,b)=> (a.siteName||"").localeCompare(b.siteName||"", "tr"));
  return copy;
}

async function addPrice(favId){
  const val = prompt("Fiyat gir (TL):");
  if(val == null) return;
  const n = Number(String(val).replace(",", ".").replace(/[^\d.]/g,""));
  if(!n || Number.isNaN(n)) return toast("Geçersiz fiyat");

  const ref = doc(db, "users", currentUser.uid, "favorites", favId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;

  const data = snap.data();
  const hist = Array.isArray(data.priceHistory) ? data.priceHistory : [];
  const ts = Date.now();
  hist.push({ ts, price: Math.round(n) });

  await updateDoc(ref, {
    priceHistory: hist,
    lastPrice: Math.round(n),
    updatedAt: serverTimestamp()
  });

  toast("Fiyat eklendi");
  await loadFavorites();
  renderFavorites();
}

function drawMiniSpark(canvas, history){
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0,0,w,h);

  if(!history || history.length < 2){
    ctx.globalAlpha = 0.6;
    ctx.font = "12px system-ui";
    ctx.fillText("Grafik için en az 2 fiyat kaydı", 10, h/2);
    ctx.globalAlpha = 1;
    return;
  }

  const prices = history.map(x => x.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = 8;
  const span = (max - min) || 1;

  ctx.lineWidth = 2.5;
  ctx.beginPath();
  history.forEach((p, i) => {
    const x = pad + (i * (w - pad*2)) / (history.length - 1);
    const y = pad + (h - pad*2) * (1 - ((p.price - min)/span));
    if(i === 0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

function openChartModal(title, history){
  chartTitle.textContent = title || "Fiyat Grafiği";
  chartModal.classList.remove("hidden");
  drawBigChart(history || []);
}

function drawBigChart(history){
  const ctx = chartCanvas.getContext("2d");
  const W = chartCanvas.width;
  const H = chartCanvas.height;
  ctx.clearRect(0,0,W,H);

  if(!history || history.length < 2){
    chartHint.textContent = "Grafik için en az 2 fiyat kaydı gerekli.";
    ctx.globalAlpha = 0.7;
    ctx.font = "18px system-ui";
    ctx.fillText("Grafik için en az 2 fiyat kaydı gerekli.", 22, 60);
    ctx.globalAlpha = 1;
    return;
  }

  chartHint.textContent = "Noktaya dokun: tarih + fiyat";
  const pad = 42;

  const prices = history.map(x => x.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = (max - min) || 1;

  ctx.globalAlpha = 0.75;
  ctx.font = "14px system-ui";
  ctx.fillText(formatTRY(max), 10, pad);
  ctx.fillText(formatTRY(min), 10, H - 18);
  ctx.globalAlpha = 1;

  const points = history.map((p, i) => {
    const x = pad + (i * (W - pad*2)) / (history.length - 1);
    const y = pad + (H - pad*2) * (1 - ((p.price - min)/span));
    return { x, y, ...p };
  });

  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();

  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
    ctx.fill();
  });

  const showTip = (x,y) => {
    let best = null, bd = Infinity;
    for(const p of points){
      const d = Math.hypot(p.x - x, p.y - y);
      if(d < bd){ bd = d; best = p; }
    }
    if(!best || bd > 40) return;

    const dt = new Date(best.ts);
    const label = `${dt.toLocaleDateString("tr-TR")} • ${formatTRY(best.price)}`;

    // redraw clean
    ctx.clearRect(0,0,W,H);
    drawBigChart(history);

    const tw = ctx.measureText(label).width + 20;
    const th = 34;
    const tx = Math.min(best.x + 10, W - tw - 10);
    const ty = Math.max(best.y - th - 10, 10);

    ctx.globalAlpha = 0.92;
    ctx.fillRect(tx, ty, tw, th);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.font = "14px system-ui";
    ctx.fillText(label, tx + 10, ty + 22);
    ctx.fillStyle = "#000";
  };

  chartCanvas.onpointermove = (ev) => {
    const rect = chartCanvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * W;
    const y = ((ev.clientY - rect.top) / rect.height) * H;
    showTip(x,y);
  };
  chartCanvas.onpointerdown = chartCanvas.onpointermove;
}

btnCloseChart.addEventListener("click", () => chartModal.classList.add("hidden"));
chartModal.querySelector(".modalBackdrop").addEventListener("click", () => chartModal.classList.add("hidden"));

async function deleteFav(favId){
  if(!confirm("Favoriden silinsin mi?")) return;
  await deleteDoc(doc(db, "users", currentUser.uid, "favorites", favId));
  toast("Silindi");
  await loadFavorites();
  renderFavorites();
}

function renderFavorites(){
  favBox.innerHTML = "";
  if(!favorites.length){
    favBox.innerHTML = `<div class="emptyHint">Favori yok.</div>`;
    return;
  }

  const list = sortFavorites(favorites);

  list.forEach(f => {
    const card = document.createElement("div");
    card.className = "favItem";
    const last = typeof f.lastPrice === "number" ? f.lastPrice : null;

    card.innerHTML = `
      <div class="favTopRow">
        <div class="favInfo">
          <div class="favName">${f.title || "Ürün"}</div>
          <div class="favMeta">${f.siteName || ""}</div>
        </div>
        <div class="favBadges">
          <div class="badgePrice">${last == null ? "Fiyat yok" : formatTRY(last)}</div>
        </div>
      </div>

      <div class="favBtns">
        <button class="btnOpenSite" type="button">${f.siteName} Aç</button>
        <button class="btnCopy" type="button">Copy Link</button>
        <button class="btnAddPrice" type="button">${last == null ? "Fiyat ekle" : "Fiyat güncelle"}</button>
        <button class="btnDelete" type="button">Sil</button>
      </div>

      <div class="sparkWrap">
        <canvas class="spark" width="320" height="72"></canvas>
        <button class="btnChart" type="button">Grafiği büyüt</button>
      </div>
    `;

    card.querySelector(".btnOpenSite").addEventListener("click", () => openUrl(f.url));
    card.querySelector(".btnCopy").addEventListener("click", () => copyText(f.url));
    card.querySelector(".btnAddPrice").addEventListener("click", () => addPrice(f.id));
    card.querySelector(".btnDelete").addEventListener("click", () => deleteFav(f.id));
    card.querySelector(".btnChart").addEventListener("click", () => openChartModal(`${f.title} • ${f.siteName}`, f.priceHistory || []));

    const c = card.querySelector(".spark");
    drawMiniSpark(c, f.priceHistory || []);

    favBox.appendChild(card);
  });
}

btnRefreshFav.addEventListener("click", async () => { await loadFavorites(); renderFavorites(); });
sortFav.addEventListener("change", () => renderFavorites());

/* NOTIFICATIONS */
async function ensureNotificationPermission(){
  if(!("Notification" in window)) return false;
  if(Notification.permission === "granted") return true;
  if(Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}
function sendLocalNotification(title, body){
  if(!("Notification" in window)) return;
  if(Notification.permission !== "granted") return;
  new Notification(title, { body });
}
btnEnableNotif.addEventListener("click", async () => {
  const ok = await ensureNotificationPermission();
  toast(ok ? "Bildirim açık" : "Bildirim kapalı");
});
async function checkDropsOnOpen(){
  if(!favorites.length) return;

  const hits = [];
  for(const f of favorites){
    const h = Array.isArray(f.priceHistory) ? f.priceHistory : [];
    if(h.length < 2) continue;
    const prev = h[h.length - 2]?.price;
    const cur = h[h.length - 1]?.price;
    const drop = percentDrop(prev, cur);
    if(drop >= 5) hits.push({ f, drop: Math.round(drop) });
  }
  if(!hits.length) return;

  const ok = await ensureNotificationPermission();
  if(!ok) return;

  const first = hits[0];
  const body =
    hits.length === 1
      ? `${first.f.title} (${first.f.siteName}) %${first.drop} düştü.`
      : `${hits.length} favoride %5+ düşüş var. Örn: ${first.f.title} %${first.drop}`;

  sendLocalNotification("fiyattakip: İndirim Uyarısı", body);
}

/* HELP MODAL */
btnHelper.addEventListener("click", () => helpModal.classList.remove("hidden"));
btnCloseHelp.addEventListener("click", () => helpModal.classList.add("hidden"));
helpModal.querySelector(".modalBackdrop").addEventListener("click", () => helpModal.classList.add("hidden"));

/* INIT */
function init(){
  setAuthMode("signin");
  renderSiteChips();
  loadRecent();
}
init();

/* AUTH STATE */
onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  if(!currentUser){
    authOverlay.classList.remove("hidden");
    document.body.classList.add("lockScroll");
    favorites = [];
    lastResults = [];
    renderResults();
    renderFavorites();
    return;
  }

  authOverlay.classList.add("hidden");
  document.body.classList.remove("lockScroll");

  await loadFavorites();
  renderResults();
  renderFavorites();
  checkDropsOnOpen();
});
