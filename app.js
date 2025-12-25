// app.js (module) - FiyatTakip core (login gate + search + favorites + graph + AI yorum)

import { auth, db, googleProvider, firebaseConfigLooksInvalid } from "./firebase.js";
import { openAiSettingsModal, aiIsConfigured, setAiPin, aiGenerateText, aiGenerateJSON } from "./ai.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, setDoc, getDoc, collection, getDocs, deleteDoc,
  addDoc, serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id)=> document.getElementById(id);

function toast(msg){
  const t = $("toast");
  if (!t){ console.log(msg); return; }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=> t.classList.remove("show"), 2600);
}

function showPage(name){
  document.querySelectorAll(".page").forEach(p=> p.classList.remove("active"));
  const page = $("page-" + name);
  page?.classList.add("active");
  document.querySelectorAll(".tab[data-page]").forEach(b=>{
    b.classList.toggle("active", b.dataset.page === name);
  });
}

function lockApp(lock){
  const gate = $("appGate");
  if (!gate) return;
  gate.style.display = lock ? "block" : "none";
  document.body.classList.toggle("locked", lock);
}

function openLogin(){
  const m = $("loginModal");
  if (!m) return;
  m.classList.add("open");
  m.setAttribute("aria-hidden","false");
}
function closeLogin(){
  const m = $("loginModal");
  if (!m) return;
  m.classList.remove("open");
  m.setAttribute("aria-hidden","true");
}

function setSearchMode(mode){
  localStorage.setItem("searchMode", mode);
  $("modeNormal")?.classList.toggle("active", mode === "normal");
  $("modeAI")?.classList.toggle("active", mode === "ai");
  const hint = $("modeHint");
  if (hint){
    hint.textContent = mode === "ai"
      ? "AI arama: sorguyu iyileştirip arar (API key gerekir)."
      : "Normal arama: sitelerde direkt arar.";
  }
}
function getSearchMode(){
  return localStorage.getItem("searchMode") || "normal";
}

async function sha1Base64Url(str){
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(str));
  const b = btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  return b.slice(0,28);
}

function currencyToNumber(tr){
  const s = String(tr||"").replace(/[^\d,\.]/g,"").replace(/\./g,"").replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchHTML(url){
  // r.jina.ai proxy helps bypass CORS for simple reads
  const prox = "https://r.jina.ai/" + url;
  const r = await fetch(prox, { cache:"no-store" });
  if (!r.ok) throw new Error("Fetch hata: " + r.status);
  const txt = await r.text();
  // jina sometimes prefixes metadata lines; keep from first "<"
  const i = txt.indexOf("<");
  return i > 0 ? txt.slice(i) : txt;
}

function parseTrendyol(html){
  const dom = new DOMParser().parseFromString(html, "text/html");
  const cards = [...dom.querySelectorAll("div.p-card-wrppr, div.p-card-chldrn-cntnr")].slice(0, 24);
  const out = [];
  for (const c of cards){
    const a = c.querySelector("a[href]");
    const img = c.querySelector("img");
    const title = c.querySelector(".prdct-desc-cntnr-name, .prdct-desc-cntnr-ttl, .product-desc-sub-text")?.textContent?.trim()
      || img?.getAttribute("alt")?.trim()
      || a?.textContent?.trim()
      || "Ürün";
    const href = a ? new URL(a.getAttribute("href"), "https://www.trendyol.com").toString() : null;
    const priceTxt = c.querySelector(".prc-box-dscntd, .prc-box-sllng, .price-item")?.textContent?.trim();
    const price = currencyToNumber(priceTxt);
    const imgUrl = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
    if (href) out.push({ site:"Trendyol", title, url: href, price, priceText: priceTxt || "", img: imgUrl });
  }
  return out;
}

function parseHepsiburada(html){
  const dom = new DOMParser().parseFromString(html, "text/html");
  // Try multiple patterns
  const cards = [...dom.querySelectorAll('li[class*="productListContent"], div[data-test-id="product-card"]')].slice(0, 24);
  const out = [];
  for (const c of cards){
    const a = c.querySelector("a[href]");
    const href = a ? new URL(a.getAttribute("href"), "https://www.hepsiburada.com").toString() : null;
    const title =
      c.querySelector('[data-test-id="product-card-name"]')?.textContent?.trim()
      || c.querySelector("h3, h2")?.textContent?.trim()
      || a?.getAttribute("title")?.trim()
      || "Ürün";
    const img = c.querySelector("img");
    const imgUrl = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
    const priceTxt =
      c.querySelector('[data-test-id="price-current-price"]')?.textContent?.trim()
      || c.querySelector(".price_1n2, .price")?.textContent?.trim();
    const price = currencyToNumber(priceTxt);
    if (href) out.push({ site:"Hepsiburada", title, url: href, price, priceText: priceTxt || "", img: imgUrl });
  }
  return out;
}

async function searchAllSites(queryText){
  const q = queryText.trim();
  if (!q) return [];
  const urls = [
    { site:"Trendyol", url:`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}`, parser: parseTrendyol },
    { site:"Hepsiburada", url:`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}`, parser: parseHepsiburada }
  ];

  const results = [];
  for (const u of urls){
    try{
      const html = await fetchHTML(u.url);
      results.push(...u.parser(html));
    }catch(e){
      console.warn("site fail", u.site, e);
    }
  }
  return results;
}

function renderResults(list, items){
  list.innerHTML = "";
  if (!items.length){
    list.innerHTML = `<div class="empty">Sonuç bulunamadı. (Bazı siteler koruma uygulayabilir.)</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const it of items){
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="thumb">${it.img ? `<img src="${it.img}" alt="">` : "🧾"}</div>
      <div class="meta">
        <div class="t">${escapeHTML(it.title)}</div>
        <div class="s">${it.site} • <span class="p">${it.priceText || (it.price ? it.price.toLocaleString("tr-TR")+" ₺" : "—")}</span></div>
        <div class="rowGap">
          <button class="btnGhost sm" data-open="1">Ürüne Git</button>
          <button class="btnGhost sm" data-ai="1">AI Yorum</button>
          <button class="btnPrimary sm" data-fav="1">❤️ Favori</button>
        </div>
        <div class="aiOut" hidden></div>
      </div>
    `;
    div.querySelector('[data-open="1"]').addEventListener("click", ()=> window.open(it.url, "_blank", "noopener"));
    div.querySelector('[data-ai="1"]').addEventListener("click", ()=> openAiComment(it, div.querySelector(".aiOut")));
    div.querySelector('[data-fav="1"]').addEventListener("click", ()=> addToFav(it));
    frag.appendChild(div);
  }
  list.appendChild(frag);
}

function escapeHTML(s){
  return String(s||"")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

// --- AI comment modal ---
async function openAiComment(item, inlineEl){
  if (!aiIsConfigured()){
    toast("AI ayarı yok. Ayarlar > AI Ayarları");
    showPage("settings");
    return;
  }
  // Ask PIN once per session if not set
  if (!window.__aiPinSet){
    const pin = prompt("AI PIN gir:");
    if (!pin) return;
    setAiPin(pin);
    window.__aiPinSet = true;
  }

  inlineEl.hidden = false;
  inlineEl.textContent = "AI yazıyor…";
  try{
    const promptText = [
      "Sen bir e-ticaret ürün yorum asistanısın.",
      "SADECE ürün özelliklerine göre yorum yap. Fiyat, stok, piyasaya sürülme, ürün bulunamadı gibi cümleler kurma.",
      "Ürün linki var diye ürün 'bulunamadı' deme.",
      "Çıktı formatı:",
      "- 3 madde Artı",
      "- 3 madde Eksi",
      "- Kimler için uygun (2-3 cümle)",
      "- Alırken nelere bakmalı (madde madde)",
      "",
      `Ürün başlığı: ${item.title}`,
      `Site: ${item.site}`
    ].join("\n");
    const out = await aiGenerateText(promptText);
    inlineEl.innerHTML = `<div class="aiBox"><div class="aiTitle">AI Yorum</div><div class="aiText">${escapeHTML(out).replaceAll("\n","<br>")}</div></div>`;
  }catch(e){
    inlineEl.textContent = "AI hata: " + (e.message || String(e));
  }
}

// --- Favorites (Firestore) ---
let currentUser = null;

async function favDocRefForUrl(uid, url){
  const id = await sha1Base64Url(url);
  return doc(db, "users", uid, "favs", id);
}

async function addToFav(item){
  if (!currentUser){
    toast("Favori için giriş gerekli.");
    openLogin();
    return;
  }
  try{
    const ref = await favDocRefForUrl(currentUser.uid, item.url);
    await setDoc(ref, {
      title: item.title,
      url: item.url,
      site: item.site,
      img: item.img || "",
      lastPrice: item.price ?? null,
      lastPriceText: item.priceText || "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    }, { merge:true });

    // also add a price point if we have a number
    if (item.price != null){
      await addDoc(collection(ref, "prices"), { price: item.price, at: serverTimestamp() });
    }

    toast("Favoriye eklendi ✅");
    await loadFavs();
  }catch(e){
    toast("Favori hata: " + (e.message || String(e)));
  }
}

async function removeFav(fav){
  if (!currentUser) return;
  try{
    const ref = await favDocRefForUrl(currentUser.uid, fav.url);
    await deleteDoc(ref);
    toast("Silindi");
    await loadFavs();
  }catch(e){
    toast("Silme hata: " + (e.message || String(e)));
  }
}

let favCache = [];
async function loadFavs(){
  const list = $("favList");
  if (!list) return;
  list.innerHTML = "";
  if (!currentUser){
    list.innerHTML = `<div class="empty">Favoriler için giriş yap.</div>`;
    return;
  }
  const col = collection(db, "users", currentUser.uid, "favs");
  const snap = await getDocs(col);
  favCache = snap.docs.map(d=> ({ id:d.id, ...d.data() }))
    .sort((a,b)=> (b.updatedAt?.seconds||0) - (a.updatedAt?.seconds||0));
  if (!favCache.length){
    list.innerHTML = `<div class="empty">Henüz favori yok.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const f of favCache){
    const div = document.createElement("div");
    div.className = "item";
    const priceText = f.lastPriceText || (f.lastPrice!=null ? (Number(f.lastPrice).toLocaleString("tr-TR")+" ₺") : "—");
    div.innerHTML = `
      <div class="thumb">${f.img ? `<img src="${f.img}" alt="">` : "❤️"}</div>
      <div class="meta">
        <div class="t">${escapeHTML(f.title)}</div>
        <div class="s">${f.site} • <span class="p">${escapeHTML(priceText)}</span></div>
        <div class="rowGap">
          <button class="btnGhost sm" data-open="1">Ürüne Git</button>
          <button class="btnGhost sm" data-addprice="1">Fiyat Ekle</button>
          <button class="btnPrimary sm" data-graph="1">Grafik</button>
          <button class="btnGhost sm" data-del="1">Sil</button>
        </div>
      </div>
    `;
    div.querySelector('[data-open="1"]').addEventListener("click", ()=> window.open(f.url, "_blank", "noopener"));
    div.querySelector('[data-del="1"]').addEventListener("click", ()=> removeFav(f));
    div.querySelector('[data-graph="1"]').addEventListener("click", ()=> { showPage("graph"); renderGraph(f); });
    div.querySelector('[data-addprice="1"]').addEventListener("click", ()=> addManualPrice(f));
    frag.appendChild(div);
  }
  list.appendChild(frag);
  await maybeNotifyPriceDrops();
}

async function addManualPrice(fav){
  if (!currentUser) return;
  const val = prompt("Fiyat (₺) gir:");
  if (!val) return;
  const n = currencyToNumber(val);
  if (n == null) return toast("Fiyat okunamadı.");
  try{
    const ref = await favDocRefForUrl(currentUser.uid, fav.url);
    await setDoc(ref, { lastPrice: n, lastPriceText: n.toLocaleString("tr-TR")+" ₺", updatedAt: serverTimestamp() }, { merge:true });
    await addDoc(collection(ref, "prices"), { price: n, at: serverTimestamp() });
    toast("Fiyat eklendi ✅");
    await loadFavs();
  }catch(e){
    toast("Fiyat ekleme hata: " + (e.message || String(e)));
  }
}

// --- Graph page ---
async function loadPriceSeries(fav){
  const ref = await favDocRefForUrl(currentUser.uid, fav.url);
  const qy = query(collection(ref, "prices"), orderBy("at","asc"), limit(120));
  const snap = await getDocs(qy);
  const pts = [];
  snap.forEach(d=>{
    const v = d.data();
    const p = Number(v.price);
    const t = v.at?.toDate ? v.at.toDate() : null;
    if (Number.isFinite(p) && t) pts.push({ t, p });
  });
  return pts;
}

function formatDay(d){
  return new Intl.DateTimeFormat("tr-TR", { day:"2-digit", month:"2-digit" }).format(d);
}

async function renderGraph(fav){
  const root = $("graphRoot");
  if (!root) return;
  if (!currentUser){
    root.innerHTML = `<div class="empty">Grafik için giriş yap.</div>`;
    return;
  }
  root.innerHTML = `
    <div class="cardTitle">${escapeHTML(fav.title)}</div>
    <div class="miniHint">Fiyat geçmişi (manuel ekleme veya aramadan favoriye eklerken).</div>
    <canvas id="gCanvas" width="800" height="320" class="gCanvas"></canvas>
    <div id="gStats" class="miniHint"></div>
    <div class="rowGap">
      <button id="gAdd" class="btnPrimary full" type="button">Fiyat Ekle</button>
    </div>
  `;
  $("gAdd").addEventListener("click", ()=> addManualPrice(fav));
  const pts = await loadPriceSeries(fav);
  drawChart($("gCanvas"), pts);
  renderStats(pts);
}

function drawChart(canvas, pts){
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  // background grid
  ctx.globalAlpha = 0.35;
  for (let i=0;i<=4;i++){
    const y = (h-30) * (i/4) + 10;
    ctx.beginPath(); ctx.moveTo(20,y); ctx.lineTo(w-20,y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (!pts.length){
    ctx.fillText("Henüz veri yok. Favoriden 'Fiyat Ekle' ile ekleyebilirsin.", 24, h/2);
    return;
  }
  const minP = Math.min(...pts.map(x=>x.p));
  const maxP = Math.max(...pts.map(x=>x.p));
  const pad = (maxP-minP) * 0.15 || 1;
  const lo = minP - pad, hi = maxP + pad;

  const x0=30, x1=w-30, y0=20, y1=h-40;
  const t0=pts[0].t.getTime(), t1=pts[pts.length-1].t.getTime();
  const xt = (t)=> x0 + ( (t - t0) / Math.max(1,(t1-t0)) ) * (x1-x0);
  const yp = (p)=> y1 - ( (p - lo) / (hi-lo) ) * (y1-y0);

  // line
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((pt,i)=>{
    const x=xt(pt.t.getTime()), y=yp(pt.p);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // dots
  ctx.fillStyle = "rgba(255,255,255,.9)";
  pts.slice(-1).forEach(pt=>{
    const x=xt(pt.t.getTime()), y=yp(pt.p);
    ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
  });

  // labels
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText(formatDay(pts[0].t), x0, h-16);
  ctx.fillText(formatDay(pts[pts.length-1].t), x1-50, h-16);
  ctx.fillText(`${Math.round(minP).toLocaleString("tr-TR")} ₺`, 24, y1);
  ctx.fillText(`${Math.round(maxP).toLocaleString("tr-TR")} ₺`, 24, y0+8);
}

function renderStats(pts){
  const el = $("gStats");
  if (!el) return;
  if (pts.length < 2){ el.textContent = ""; return; }
  const last = pts[pts.length-1].p;
  const min = Math.min(...pts.map(p=>p.p));
  const max = Math.max(...pts.map(p=>p.p));
  const pctFromMax = ((last-max)/max)*100;
  el.textContent = `Son: ${last.toLocaleString("tr-TR")} ₺ • Min: ${min.toLocaleString("tr-TR")} ₺ • Max: ${max.toLocaleString("tr-TR")} ₺ • Max'a göre: ${pctFromMax.toFixed(1)}%`;
}

// --- Price drop notification (in-app) ---
function getDropThreshold(){
  const v = Number(localStorage.getItem("dropThreshold") || "10");
  return Number.isFinite(v) ? Math.max(1, Math.min(90, v)) : 10;
}

async function maybeNotifyPriceDrops(){
  // Only when app open
  if (!("Notification" in window)) return;
  const threshold = getDropThreshold();
  // request permission once
  if (Notification.permission === "default"){
    // don't nag immediately; only after user has favorites
    await Notification.requestPermission().catch(()=>{});
  }
  if (Notification.permission !== "granted") return;

  // for each fav, compute last vs max of last 30 points (or all)
  for (const f of favCache.slice(0, 12)){
    if (!f.lastPrice) continue;
    try{
      const pts = await loadPriceSeries(f);
      if (pts.length < 3) continue;
      const recent = pts.slice(-30);
      const max = Math.max(...recent.map(x=>x.p));
      const last = recent[recent.length-1].p;
      const dropPct = ((last - max) / max) * 100;
      if (dropPct <= -threshold){
        const key = `notified_${f.id}_${threshold}`;
        if (sessionStorage.getItem(key)) continue;
        sessionStorage.setItem(key,"1");
        new Notification("Fiyat düştü! 🔔", { body: `${f.title.slice(0,60)} • ${Math.abs(dropPct).toFixed(1)}% düşüş`, icon:"./icon-192.png" });
      }
    }catch{}
  }
}

// --- Search ---
async function runSearch(){
  const q = $("qNormal")?.value || "";
  if (!q.trim()) return toast("Arama yaz.");
  showPage("search");
  $("normalList").innerHTML = `<div class="empty">Aranıyor…</div>`;

  const mode = getSearchMode();
  let queryText = q.trim();

  if (mode === "ai"){
    if (!aiIsConfigured()){
      toast("AI ayarı yok. Normal aramaya geçildi.");
      setSearchMode("normal");
    }else{
      try{
        if (!window.__aiPinSet){
          const pin = prompt("AI PIN gir:");
          if (!pin) throw new Error("PIN iptal.");
          setAiPin(pin);
          window.__aiPinSet = true;
        }
        const j = await aiGenerateJSON(
          "Kullanıcı sorgusunu e-ticaret araması için iyileştir.\n" +
          "JSON formatı: {\"query\":\"...\"}\n" +
          "Sorgu: " + queryText
        );
        if (j?.query) queryText = String(j.query).trim().slice(0,120);
      }catch(e){
        toast("AI iyileştirme başarısız, normale dönüldü.");
      }
    }
  }

  try{
    const items = await searchAllSites(queryText);
    renderResults($("normalList"), items);
  }catch(e){
    $("normalList").innerHTML = `<div class="empty">Hata: ${escapeHTML(e.message || String(e))}</div>`;
  }
}

// --- Auth UI wiring ---
function wireUI(){
  document.querySelectorAll(".tab[data-page]").forEach(btn=>{
    btn.addEventListener("click", ()=> showPage(btn.dataset.page));
  });

  $("modeNormal")?.addEventListener("click", ()=> setSearchMode("normal"));
  $("modeAI")?.addEventListener("click", ()=> setSearchMode("ai"));

  $("btnNormal")?.addEventListener("click", runSearch);
  $("btnClearSearch")?.addEventListener("click", ()=> $("normalList").innerHTML="");

  $("btnAiSettings")?.addEventListener("click", ()=> openAiSettingsModal({ toast }));
  $("logoutBtn")?.addEventListener("click", async ()=>{
    try{ await signOut(auth); }catch(e){ toast(e.message || String(e)); }
  });

  $("btnGraphRefresh")?.addEventListener("click", async ()=>{
    if (favCache[0]) await renderGraph(favCache[0]);
    else $("graphRoot").innerHTML = `<div class="empty">Grafik için favori ekle.</div>`;
  });
  $("btnFavRefresh")?.addEventListener("click", loadFavs);

  // settings extra: drop threshold slider
  const settingsBox = $("page-settings")?.querySelector(".cardBox");
  if (settingsBox){
    const extra = document.createElement("div");
    extra.className = "cardBox";
    extra.innerHTML = `
      <div class="rowBetween">
        <div>
          <div class="cardTitle">İndirim Bildirimi</div>
          <div class="miniHint">Uygulama açıkken, favorilerde % düşüş olursa bildirim.</div>
        </div>
      </div>
      <div class="rowBetween">
        <div class="miniHint">Eşik: <b id="thLabel"></b></div>
        <input id="thRange" type="range" min="1" max="50" step="1" />
      </div>
    `;
    settingsBox.parentElement.insertBefore(extra, settingsBox.nextSibling);
    const r = extra.querySelector("#thRange");
    const lab = extra.querySelector("#thLabel");
    const setLab = ()=> { lab.textContent = getDropThreshold() + "%"; r.value = String(getDropThreshold()); };
    setLab();
    r.addEventListener("input", ()=>{
      localStorage.setItem("dropThreshold", String(r.value));
      setLab();
    });
  }

  // login modal behavior
  $("closeLogin")?.addEventListener("click", closeLogin);
  $("loginBackdrop")?.addEventListener("click", ()=>{
    if (!currentUser){
      toast("Giriş yapmadan kullanamazsın.");
      openLogin();
      return;
    }
    closeLogin();
  });

  $("btnLogin")?.addEventListener("click", async ()=>{
    const email = $("authEmail").value.trim();
    const pass = $("authPass").value;
    try{
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Giriş başarılı ✅");
      closeLogin();
    }catch(e){
      toast(e.message || String(e));
    }
  });

  $("btnRegister")?.addEventListener("click", async ()=>{
    const email = $("authEmail").value.trim();
    const pass = $("authPass").value;
    try{
      await createUserWithEmailAndPassword(auth, email, pass);
      toast("Kayıt başarılı ✅");
      closeLogin();
    }catch(e){
      toast(e.message || String(e));
    }
  });

  $("btnGoogle")?.addEventListener("click", async ()=>{
    try{
      await signInWithPopup(auth, googleProvider);
      toast("Google giriş ✅");
      closeLogin();
    }catch(e){
      toast(e.message || String(e));
    }
  });

  // camera FAB -> simple: ask image via file input and use AI to extract query (optional)
  $("fabCamera")?.addEventListener("click", ()=> openVisionPicker());
}

async function openVisionPicker(){
  if (!aiIsConfigured()){
    toast("AI ayarı yok. Ayarlar > AI Ayarları");
    showPage("settings");
    return;
  }
  if (!window.__aiPinSet){
    const pin = prompt("AI PIN gir:");
    if (!pin) return;
    setAiPin(pin);
    window.__aiPinSet = true;
  }
  const inp = document.createElement("input");
  inp.type="file"; inp.accept="image/*";
  inp.onchange = async ()=>{
    const file = inp.files?.[0];
    if (!file) return;
    toast("Görsel analiz…");
    try{
      // We keep it simple: ask user to describe image; true vision requires multimodal call,
      // which Gemini v1beta needs inlineData. We'll do it.
      const b64 = await fileToBase64(file);
      const cfg = await (await import("./ai.js")).loadAiConfig(); // uses sessionPin
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
      const body = {
        contents: [{
          role:"user",
          parts: [
            { text:"Bu görseldeki ürün için Türkçe kısa arama sorgusu üret. SADECE sorgu döndür." },
            { inlineData:{ mimeType:file.type || "image/jpeg", data: b64 } }
          ]
        }],
        generationConfig:{ temperature:0.2, maxOutputTokens:60 }
      };
      const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if (!r.ok) throw new Error("Vision hata: "+r.status);
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")?.trim();
      if (!text) throw new Error("Sorgu çıkarılamadı.");
      $("qNormal").value = text;
      toast("Sorgu: " + text);
      await runSearch();
    }catch(e){
      toast(e.message || String(e));
    }
  };
  inp.click();
}

function fileToBase64(file){
  return new Promise((res, rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>{
      const dataUrl = String(fr.result||"");
      const b64 = dataUrl.split(",")[1] || "";
      res(b64);
    };
    fr.onerror = ()=> rej(new Error("Dosya okunamadı"));
    fr.readAsDataURL(file);
  });
}

// --- init ---
async function init(){
  // Service worker
  if ("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }

  // ensure gate exists
  if (!$("appGate")){
    const gate = document.createElement("div");
    gate.id="appGate";
    gate.className="appGate";
    gate.innerHTML = `<div class="gateInner">
      <div class="gateTitle">Giriş gerekli</div>
      <div class="miniHint">Devam etmek için giriş yap.</div>
      <button class="btnPrimary full" id="gateLoginBtn" type="button">Giriş Yap</button>
    </div>`;
    document.body.appendChild(gate);
    $("gateLoginBtn").addEventListener("click", openLogin);
  }

  // toast
  if (!$("toast")){
    const t = document.createElement("div");
    t.id="toast"; t.className="toast";
    document.body.appendChild(t);
  }

  wireUI();
  setSearchMode(getSearchMode());

  lockApp(true);
  openLogin();

  onAuthStateChanged(auth, async (user)=>{
    currentUser = user || null;
    window.currentUser = currentUser;
    if (!currentUser){
      lockApp(true);
      openLogin();
      return;
    }
    closeLogin();
    lockApp(false);
    toast("Hoş geldin 👋");
    await loadFavs();
    if (favCache[0]) await renderGraph(favCache[0]);
  });

  if (firebaseConfigLooksInvalid()){
    toast("Firebase config eksik görünüyor.");
  }
}

init().catch(e=> toast(e.message || String(e)));
