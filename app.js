const { auth, db, googleProvider } = window.FIYATTAKIP_FIREBASE.init();

// -------- Sites --------
const SITES = [
  { id: "trendyol", name: "Trendyol",  search: q => `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { id: "hepsiburada", name: "Hepsiburada", search: q => `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { id: "n11", name: "N11", search: q => `https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { id: "amazontr", name: "Amazon TR", search: q => `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { id: "pazarama", name: "Pazarama", search: q => `https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { id: "ciceksepeti", name: "ÇiçekSepeti", search: q => `https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { id: "idefix", name: "idefix", search: q => `https://www.idefix.com/arama?q=${encodeURIComponent(q)}` }
];

// -------- LocalStorage keys --------
const LS = {
  selectedSites: "ft_selected_sites_v3",
  favorites: "ft_favorites_v3",
  ai: "ft_ai_settings_v1"
};

// -------- DOM --------
const siteChipsEl = document.getElementById("siteChips");
const qEl = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");
const btnOpenSelected = document.getElementById("btnOpenSelected");
const btnClear = document.getElementById("btnClear");
const searchStatus = document.getElementById("searchStatus");
const inAppResults = document.getElementById("inAppResults");

const favList = document.getElementById("favList");
const sortSelect = document.getElementById("sortSelect");
const btnRefreshFav = document.getElementById("btnRefreshFav");

const btnLogout = document.getElementById("btnLogout");
const authModal = document.getElementById("authModal");

const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const registerExtra = document.getElementById("registerExtra");
const btnAuthAction = document.getElementById("btnAuthAction");
const btnGoogle = document.getElementById("btnGoogle");
const authErr = document.getElementById("authErr");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const password2El = document.getElementById("password2");
const togglePw = document.getElementById("togglePw");
const togglePw2 = document.getElementById("togglePw2");

const btnAI = document.getElementById("btnAI");
const aiModal = document.getElementById("aiModal");
const aiProvider = document.getElementById("aiProvider");
const geminiKey = document.getElementById("geminiKey");
const openaiKey = document.getElementById("openaiKey");
const btnSaveAI = document.getElementById("btnSaveAI");
const btnClearAI = document.getElementById("btnClearAI");

const chartModal = document.getElementById("chartModal");
const chartCanvasBig = document.getElementById("chartCanvasBig");

// -------- State --------
let mode = "login"; // login | register

// -------- Utils --------
function loadJSON(key, fallback){ try{ const s=localStorage.getItem(key); return s?JSON.parse(s):fallback; }catch{ return fallback; } }
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function siteById(id){ return SITES.find(s=>s.id===id); }
function formatTL(n){ if(!Number.isFinite(n)) return "Fiyat yok"; return `${n.toLocaleString("tr-TR")} ₺`; }
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

// -------- Chips --------
function renderChips(){
  siteChipsEl.innerHTML = "";
  const selected = new Set(loadJSON(LS.selectedSites, SITES.map(s=>s.id)));

  SITES.forEach(site => {
    const chip = document.createElement("button");
    chip.className = "chip " + (selected.has(site.id) ? "chip--on" : "");
    chip.type = "button";
    chip.innerHTML = `<span class="dot"></span><span>${site.name}</span>`;
    chip.addEventListener("click", () => {
      if (selected.has(site.id)) selected.delete(site.id);
      else selected.add(site.id);
      saveJSON(LS.selectedSites, Array.from(selected));
      renderChips();
    });
    siteChipsEl.appendChild(chip);
  });
}
function getSelectedSites(){
  const arr = loadJSON(LS.selectedSites, SITES.map(s=>s.id));
  const valid = arr.filter(id => siteById(id));
  return valid.length ? valid : SITES.map(s=>s.id);
}

// -------- Favorites --------
function loadFavs(){ return loadJSON(LS.favorites, []); }
function saveFavs(favs){ saveJSON(LS.favorites, favs); }
function latestPrice(fav){
  if (Number.isFinite(fav.lastPrice)) return fav.lastPrice;
  if (fav.prices?.length) return fav.prices[fav.prices.length-1].v;
  return null;
}
function upsertFavorite(productName, siteIds){
  const name = (productName||"").trim();
  if (!name) return;

  const favs = loadFavs();
  const key = name.toLowerCase();
  let f = favs.find(x => x.name.toLowerCase() === key);

  if (!f){
    f = { id: uid(), name, sites: Array.from(new Set(siteIds)), createdAt: Date.now(), prices: [], lastPrice: null };
    favs.unshift(f);
  }else{
    const merged = new Set([...(f.sites||[]), ...siteIds]);
    f.sites = Array.from(merged);
  }
  saveFavs(favs);
  renderFavs();
}
function deleteFav(id){
  const favs = loadFavs().filter(f=>f.id!==id);
  saveFavs(favs);
  renderFavs();
}
function addPriceToFav(id, price){
  const p = Number(String(price).replace(",", ".").replace(/[^\d.]/g,""));
  if (!Number.isFinite(p) || p<=0) return;

  const favs = loadFavs();
  const f = favs.find(x=>x.id===id);
  if(!f) return;

  f.prices = Array.isArray(f.prices) ? f.prices : [];
  f.prices.push({ t: Date.now(), v: p });
  if (f.prices.length > 50) f.prices = f.prices.slice(-50);
  f.lastPrice = p;

  saveFavs(favs);
  renderFavs();
}
function getPrimaryLinkForFav(fav){
  const first = siteById((fav.sites||[])[0]);
  return first ? first.search(fav.name) : "";
}
function sortFavs(favs){
  const m = sortSelect.value;
  const copy = [...favs];
  copy.sort((a,b)=>{
    const ap = latestPrice(a);
    const bp = latestPrice(b);
    const an = (a.name||"").toLowerCase();
    const bn = (b.name||"").toLowerCase();
    const as0 = (a.sites?.[0] ? siteById(a.sites[0])?.name : "") || "";
    const bs0 = (b.sites?.[0] ? siteById(b.sites[0])?.name : "") || "";

    if (m==="price_asc"){
      const av = Number.isFinite(ap)?ap:Number.POSITIVE_INFINITY;
      const bv = Number.isFinite(bp)?bp:Number.POSITIVE_INFINITY;
      if (av!==bv) return av-bv;
      return an.localeCompare(bn,"tr");
    }
    if (m==="price_desc"){
      const av = Number.isFinite(ap)?ap:Number.NEGATIVE_INFINITY;
      const bv = Number.isFinite(bp)?bp:Number.NEGATIVE_INFINITY;
      if (av!==bv) return bv-av;
      return an.localeCompare(bn,"tr");
    }
    if (m==="site_asc"){
      const c = as0.localeCompare(bs0,"tr");
      if (c!==0) return c;
      return an.localeCompare(bn,"tr");
    }
    return an.localeCompare(bn,"tr");
  });
  return copy;
}

// -------- Charts --------
function drawChart(canvas, prices){
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  if (!prices || prices.length < 2){
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, h-20);
    ctx.lineTo(w-10, 20);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  const vals = prices.map(p=>p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = 14;

  const xStep = (w - pad*2) / (prices.length - 1);
  const yMap = (v) => {
    if (max === min) return h/2;
    const t = (v - min) / (max - min);
    return (h - pad) - t*(h - pad*2);
  };

  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  for (let i=1;i<=3;i++){
    const y = pad + i*(h-pad*2)/4;
    ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.lineWidth = 3;
  ctx.beginPath();
  prices.forEach((p,i)=>{
    const x = pad + i*xStep;
    const y = yMap(p.v);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  ctx.globalAlpha = 0.95;
  prices.forEach((p,i)=>{
    const x = pad + i*xStep;
    const y = yMap(p.v);
    ctx.beginPath(); ctx.arc(x,y,3.2,0,Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function openChartModal(fav){
  chartModal.classList.remove("hidden");
  drawChart(chartCanvasBig, fav.prices || []);
}

// -------- Render Favorites --------
function renderFavs(){
  const favs = sortFavs(loadFavs());
  favList.innerHTML = "";
  if (!favs.length){
    favList.innerHTML = `<div class="empty">Favori yok.</div>`;
    return;
  }

  favs.forEach(fav=>{
    const sites = (fav.sites||[]).map(id=>siteById(id)?.name).filter(Boolean);
    const last = latestPrice(fav);

    const card = document.createElement("div");
    card.className = "favcard";
    card.innerHTML = `
      <div class="favtop">
        <div>
          <div class="favtitle">❤ ${escapeHtml(fav.name)}</div>
          <div class="favsites">Siteler: <strong>${escapeHtml(sites.join(", ")||"-")}</strong></div>
        </div>
        <div class="pricepill">${formatTL(last)}</div>
      </div>

      <div class="favactions">
        ${makeOpenButtonsHtml(fav)}
        <button class="btn btn--ghost" data-action="copy" data-id="${fav.id}">Copy Link</button>
        <button class="btn btn--softwarn" data-action="addprice" data-id="${fav.id}">Fiyat ekle</button>
        <button class="btn btn--softdanger" data-action="delete" data-id="${fav.id}">Sil</button>
      </div>

      <div class="priceentry hidden" id="priceentry_${fav.id}">
        <input class="input" id="price_${fav.id}" inputmode="decimal" placeholder="Fiyat (₺)" />
        <button class="btn btn--primary" data-action="saveprice" data-id="${fav.id}">Fiyat Ekle</button>
      </div>

      <div class="canvasbox">
        <canvas id="c_${fav.id}" width="820" height="170"></canvas>
        <div class="note" id="note_${fav.id}">${(fav.prices?.length||0) >= 2 ? "" : "Grafik için en az 2 fiyat gir."}</div>
        <div class="row row--wrap" style="margin-top:10px">
          <button class="btn btn--ghost" data-action="bigchart" data-id="${fav.id}">Grafiği büyüt</button>
        </div>
      </div>
    `;
    favList.appendChild(card);

    // chart
    const c = document.getElementById(`c_${fav.id}`);
    drawChart(c, fav.prices||[]);

    // open site buttons
    card.querySelectorAll("[data-openurl]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const url = decodeURIComponent(btn.getAttribute("data-openurl"));
        window.open(url, "_blank", "noopener,noreferrer");
      });
    });

    // actions
    card.querySelectorAll("[data-action]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");

        if (action==="delete") deleteFav(id);

        if (action==="copy"){
          const f = loadFavs().find(x=>x.id===id);
          const link = f ? getPrimaryLinkForFav(f) : "";
          if (link) await navigator.clipboard?.writeText(link);
        }

        if (action==="addprice"){
          document.getElementById(`priceentry_${id}`)?.classList.toggle("hidden");
          setTimeout(()=>document.getElementById(`price_${id}`)?.focus(), 30);
        }

        if (action==="saveprice"){
          const val = document.getElementById(`price_${id}`)?.value || "";
          addPriceToFav(id, val);
          const inp = document.getElementById(`price_${id}`);
          if (inp) inp.value = "";
          document.getElementById(`priceentry_${id}`)?.classList.add("hidden");
        }

        if (action==="bigchart"){
          const f = loadFavs().find(x=>x.id===id);
          if (f) openChartModal(f);
        }
      });
    });
  });
}

function makeOpenButtonsHtml(fav){
  const q = fav.name;
  const ids = (fav.sites||[]).slice(0, 3); // 3 buton yeterli
  return ids.map(id=>{
    const s = siteById(id);
    if(!s) return "";
    const url = s.search(q);
    return `<button class="btn btn--softok" data-openurl="${encodeURIComponent(url)}">${escapeHtml(s.name)} Aç</button>`;
  }).join("");
}

// -------- Search results in-app --------
function renderSearchResults(q, siteIds){
  const rows = siteIds.map(id=>{
    const s = siteById(id);
    if(!s) return "";
    const url = s.search(q);
    return `
      <div class="favcard">
        <div class="favtop">
          <div>
            <div class="favtitle">${escapeHtml(s.name)}</div>
            <div class="favsites">Arama: <strong>${escapeHtml(q)}</strong></div>
          </div>
          <div class="pricepill">Fiyat: —</div>
        </div>
        <div class="favactions">
          <button class="btn btn--softok" data-openurl="${encodeURIComponent(url)}">${escapeHtml(s.name)} Aç</button>
          <button class="btn btn--ghost" data-copyurl="${encodeURIComponent(url)}">Copy Link</button>
        </div>
      </div>
    `;
  }).join("");

  inAppResults.innerHTML = rows || `<div class="empty">Sonuç yok.</div>`;

  inAppResults.querySelectorAll("[data-openurl]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const url = decodeURIComponent(b.getAttribute("data-openurl"));
      window.open(url, "_blank", "noopener,noreferrer");
    });
  });
  inAppResults.querySelectorAll("[data-copyurl]").forEach(b=>{
    b.addEventListener("click", async ()=>{
      const url = decodeURIComponent(b.getAttribute("data-copyurl"));
      await navigator.clipboard?.writeText(url);
    });
  });
}

function doSearch(openTabs){
  const q = (qEl.value||"").trim();
  if(!q){ searchStatus.textContent="Ürün adı boş olamaz."; return; }

  const selected = getSelectedSites();
  upsertFavorite(q, selected);
  renderSearchResults(q, selected);

  searchStatus.textContent = `Arama hazır: “${q}” — sonuçlar uygulama içinde listelendi.`;

  if(openTabs){
    selected.forEach(id=>{
      const s = siteById(id);
      if(!s) return;
      window.open(s.search(q), "_blank", "noopener,noreferrer");
    });
  }
}

// -------- Auth UI --------
function showAuth(show){ authModal.classList.toggle("hidden", !show); }
function setAuthMode(m){
  mode = m;
  const loginOn = (m==="login");
  tabLogin.classList.toggle("tab--active", loginOn);
  tabRegister.classList.toggle("tab--active", !loginOn);
  registerExtra.classList.toggle("hidden", loginOn);
  btnAuthAction.textContent = loginOn ? "Giriş Yap" : "Hesap Oluştur";
  authErr.classList.add("hidden"); authErr.textContent="";
}
async function doAuthAction(){
  const email = (emailEl.value||"").trim();
  const pw = passwordEl.value||"";
  const pw2 = password2El.value||"";
  try{
    authErr.classList.add("hidden");
    if(!email || !pw) throw new Error("Email ve şifre zorunlu.");
    if(mode==="register"){
      if(pw.length<6) throw new Error("Şifre en az 6 karakter olmalı.");
      if(pw!==pw2) throw new Error("Şifreler eşleşmiyor.");
      await auth.createUserWithEmailAndPassword(email, pw);
    }else{
      await auth.signInWithEmailAndPassword(email, pw);
    }
  }catch(e){
    authErr.textContent = "Hata: " + (e?.message || String(e));
    authErr.classList.remove("hidden");
  }
}

// Google login: popup dene, olmazsa redirect
async function loginWithGoogle(){
  try{
    await auth.signInWithPopup(googleProvider);
  }catch(e){
    await auth.signInWithRedirect(googleProvider);
  }
}
auth.getRedirectResult().catch((e)=>{
  // Burada hatayı gösteriyoruz (debug için)
  console.warn("Redirect error:", e?.code, e?.message);
});

togglePw.addEventListener("click", ()=> passwordEl.type = (passwordEl.type==="password"?"text":"password"));
togglePw2.addEventListener("click", ()=> password2El.type = (password2El.type==="password"?"text":"password"));
tabLogin.addEventListener("click", ()=>setAuthMode("login"));
tabRegister.addEventListener("click", ()=>setAuthMode("register"));
btnAuthAction.addEventListener("click", doAuthAction);
btnGoogle.addEventListener("click", loginWithGoogle);
btnLogout.addEventListener("click", ()=>auth.signOut());

// -------- AI settings (storage only) --------
function loadAI(){ return loadJSON(LS.ai, { provider:"gemini", geminiKey:"", openaiKey:"" }); }
function saveAI(v){ saveJSON(LS.ai, v); }
btnAI.addEventListener("click", ()=>{
  const s = loadAI();
  aiProvider.value = s.provider || "gemini";
  geminiKey.value = s.geminiKey || "";
  openaiKey.value = s.openaiKey || "";
  aiModal.classList.remove("hidden");
});
btnSaveAI.addEventListener("click", ()=>{
  saveAI({ provider: aiProvider.value, geminiKey: geminiKey.value.trim(), openaiKey: openaiKey.value.trim() });
  aiModal.classList.add("hidden");
});
btnClearAI.addEventListener("click", ()=>{
  saveAI({ provider:"gemini", geminiKey:"", openaiKey:"" });
  geminiKey.value=""; openaiKey.value="";
});

// Close modals
document.querySelectorAll(".modal__backdrop").forEach(b=>{
  b.addEventListener("click", ()=>{
    const t = b.getAttribute("data-close");
    if (t==="ai") aiModal.classList.add("hidden");
    if (t==="chart") chartModal.classList.add("hidden");
  });
});
document.querySelectorAll("[data-closebtn]").forEach(b=>{
  b.addEventListener("click", ()=>{
    if (b.getAttribute("data-closebtn")==="chart") chartModal.classList.add("hidden");
  });
});

// -------- Events --------
btnSearch.addEventListener("click", ()=>doSearch(false));          // artık sekme açmıyor
btnOpenSelected.addEventListener("click", ()=>doSearch(true));     // hepsini aç
btnClear.addEventListener("click", ()=>{
  qEl.value="";
  searchStatus.textContent="Temizlendi.";
  inAppResults.innerHTML = `<div class="empty">Arama sonuçları burada listelenecek.</div>`;
});
qEl.addEventListener("keydown", (e)=>{ if(e.key==="Enter") doSearch(false); });

btnRefreshFav.addEventListener("click", renderFavs);
sortSelect.addEventListener("change", renderFavs);

// -------- Init --------
renderChips();
renderFavs();
setAuthMode("login");

// Auth gate: login değilse kilitle
auth.onAuthStateChanged((user)=>{
  if(!user){
    document.body.classList.add("locked");
    showAuth(true);
    btnLogout.classList.add("hidden");
  }else{
    document.body.classList.remove("locked");
    showAuth(false);
    btnLogout.classList.remove("hidden");
  }
});
