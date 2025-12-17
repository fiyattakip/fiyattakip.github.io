import { authApi } from "./firebase.js";

/* ------------------ Helpers ------------------ */
const $ = (id) => document.getElementById(id);

const LS = {
  selectedSites: "ft_selected_sites_v5",
  favorites: "ft_favorites_v6",
  ai: "ft_ai_settings_v1",
};

function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function saveJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function loadJSON(k, def){ try{ return JSON.parse(localStorage.getItem(k) || ""); } catch{ return def; } }

function escapeHtml(s=""){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function formatTL(n){
  if (n === null || n === undefined || Number.isNaN(n)) return "Fiyat yok";
  const x = Number(n);
  return x.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺";
}

function parseTL(input){
  if(!input) return null;
  const s = String(input).replaceAll(".", "").replace(",", ".").replace(/[^\d.]/g,"");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmtDate(ts){
  const d = new Date(ts);
  return d.toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

/* ------------------ Sites ------------------ */
const SITES = [
  { id:"trendyol", name:"Trendyol", url:(q)=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}&qt=${encodeURIComponent(q)}&st=${encodeURIComponent(q)}&os=1` },
  { id:"hepsiburada", name:"Hepsiburada", url:(q)=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}&siralama=price-asc` },
  { id:"n11", name:"N11", url:(q)=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}&srt=PRICE_LOW` },
  { id:"amazontr", name:"Amazon TR", url:(q)=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}&s=price-asc-rank` },
  { id:"pazarama", name:"Pazarama", url:(q)=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}&sort=price_asc` },
  { id:"ciceksepeti", name:"ÇiçekSepeti", url:(q)=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}&sort=price_asc` },
  { id:"idefix", name:"idefix", url:(q)=>`https://www.idefix.com/search/?q=${encodeURIComponent(q)}&Sort=price_asc` },
];

function siteById(id){ return SITES.find(s=>s.id===id) || null; }
function urlForSite(site, q){ return site.url(q); }

/* ------------------ UI refs ------------------ */
const siteChips = $("siteChips");
const q = $("q");
const btnSearch = $("btnSearch");
const btnClear = $("btnClear");
const btnOpenSelected = $("btnOpenSelected");
const inAppResults = $("inAppResults");

const favList = $("favList");
const sortFav = $("sortFav");
const btnRefreshFav = $("btnRefreshFav");

const chartModal = $("chartModal");
const chartClose = $("chartClose");
const chartCanvasBig = $("chartCanvasBig");
const chartTipBig = $("chartTipBig");

const btnAI = $("btnAI");
const aiModal = $("aiModal");
const aiClose = $("aiClose");
const aiProvider = $("aiProvider");
const aiKey = $("aiKey");
const aiSave = $("aiSave");
const aiClear = $("aiClear");

/* AUTH */
const authWrap = $("authWrap");
const tabLogin = $("tabLogin");
const tabRegister = $("tabRegister");
const authEmail = $("authEmail");
const authPass = $("authPass");
const authPass2 = $("authPass2");
const authPass2Wrap = $("authPass2Wrap");
const btnAuthSubmit = $("btnAuthSubmit");
const btnGoogle = $("btnGoogle");
const authMsg = $("authMsg");
const togglePass = $("togglePass");
const togglePass2 = $("togglePass2");
const btnLogout = $("btnLogout");

/* ------------------ Selected sites ------------------ */
function loadSelected(){
  const d = loadJSON(LS.selectedSites, null);
  if (Array.isArray(d) && d.length) return d;
  // default hepsi seçili
  return SITES.map(s=>s.id);
}
function saveSelected(ids){ saveJSON(LS.selectedSites, ids); }

function renderSiteChips(){
  const selected = new Set(loadSelected());
  siteChips.innerHTML = "";
  SITES.forEach(s=>{
    const chip = document.createElement("button");
    chip.className = "chip" + (selected.has(s.id) ? " active" : "");
    chip.innerHTML = `<span class="dot"></span> ${escapeHtml(s.name)}`;
    chip.addEventListener("click", ()=>{
      const now = new Set(loadSelected());
      if (now.has(s.id)) now.delete(s.id); else now.add(s.id);
      saveSelected([...now]);
      renderSiteChips();
    });
    siteChips.appendChild(chip);
  });
}

/* ------------------ Favorites (site+product) ------------------ */
function loadFavs(){ return loadJSON(LS.favorites, []); }
function saveFavs(favs){ saveJSON(LS.favorites, favs); }

function favKey(name, siteId){
  return `${(siteId||"").trim()}::${(name||"").trim().toLowerCase()}`;
}
function findFavByKey(key){
  return loadFavs().find(f => f.key === key) || null;
}
function isFav(name, siteId){
  const key = favKey(name, siteId);
  return !!findFavByKey(key);
}
function upsertFavorite(name, siteId){
  name = (name||"").trim();
  if(!name || !siteId) return;
  const favs = loadFavs();
  const key = favKey(name, siteId);
  let f = favs.find(x=>x.key===key);
  if(!f){
    f = { id: uid(), key, name, siteId, createdAt: Date.now(), prices: [], lastPrice: null };
    favs.unshift(f);
    saveFavs(favs);
  }
}
function removeFavorite(name, siteId){
  const key = favKey(name, siteId);
  const favs = loadFavs().filter(f=>f.key!==key);
  saveFavs(favs);
}
function toggleFavorite(name, siteId){
  if (isFav(name, siteId)) removeFavorite(name, siteId);
  else upsertFavorite(name, siteId);
  renderFavs();
}

function latestPrice(fav){
  if (fav.lastPrice != null) return fav.lastPrice;
  const p = (fav.prices || []);
  return p.length ? p[p.length-1].price : null;
}

function calcChangePercentFromFirst(prices){
  if (!prices || prices.length < 2) return null;
  const first = prices[0].price;
  const last = prices[prices.length-1].price;
  if (!first || !last) return null;
  return ((last-first)/first)*100;
}
function calcLastStepPercent(prices){
  if (!prices || prices.length < 2) return null;
  const a = prices[prices.length-2].price;
  const b = prices[prices.length-1].price;
  if (!a || !b) return null;
  return ((b-a)/a)*100;
}

function sortFavs(favs){
  const mode = sortFav.value;
  const withPrice = (f)=>latestPrice(f) ?? Number.POSITIVE_INFINITY;
  if (mode === "last_asc") return [...favs].sort((a,b)=>withPrice(a)-withPrice(b));
  if (mode === "last_desc") return [...favs].sort((a,b)=>withPrice(b)-withPrice(a));
  return [...favs].sort((a,b)=>b.createdAt-a.createdAt);
}

function addPriceToFav(favId, input){
  const price = parseTL(input);
  if (price == null) return;
  const favs = loadFavs();
  const f = favs.find(x=>x.id===favId);
  if (!f) return;
  f.prices = Array.isArray(f.prices) ? f.prices : [];
  f.prices.push({ ts: Date.now(), price });
  f.lastPrice = price;
  saveFavs(favs);
  renderFavs();
}

/* ------------------ Chart ------------------ */
function drawChart(canvas, prices){
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  // background
  ctx.fillStyle = "rgba(58,73,201,0.06)";
  ctx.fillRect(0,0,w,h);

  if (!prices || prices.length < 2){
    ctx.fillStyle = "rgba(102,112,133,0.9)";
    ctx.font = "900 18px ui-sans-serif, system-ui";
    ctx.fillText("Grafik için en az 2 fiyat kaydı gir.", 18, 40);
    return;
  }

  const xs = prices.map((_,i)=>i);
  const ys = prices.map(p=>p.price);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 26;

  const xTo = (i)=> pad + (i/(xs.length-1))*(w-2*pad);
  const yTo = (y)=> {
    if (maxY===minY) return h/2;
    const t = (y-minY)/(maxY-minY);
    return (h-pad) - t*(h-2*pad);
  };

  // grid
  ctx.strokeStyle = "rgba(11,18,32,0.08)";
  ctx.lineWidth = 1;
  for(let k=0;k<4;k++){
    const yy = pad + k*((h-2*pad)/3);
    ctx.beginPath(); ctx.moveTo(pad,yy); ctx.lineTo(w-pad,yy); ctx.stroke();
  }

  // line
  ctx.strokeStyle = "rgba(31,45,143,0.95)";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.beginPath();
  prices.forEach((p,i)=>{
    const xx = xTo(i), yy = yTo(p.price);
    if (i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = "rgba(225,29,72,0.92)";
  prices.forEach((p,i)=>{
    const xx = xTo(i), yy = yTo(p.price);
    ctx.beginPath(); ctx.arc(xx,yy,4.2,0,Math.PI*2); ctx.fill();
  });

  // labels
  ctx.fillStyle = "rgba(11,18,32,0.75)";
  ctx.font = "900 14px ui-sans-serif, system-ui";
  ctx.fillText(`Min: ${formatTL(minY)}`, pad, h-8);
  const txt = `Max: ${formatTL(maxY)}`;
  const tw = ctx.measureText(txt).width;
  ctx.fillText(txt, w-pad-tw, h-8);
}

function attachTooltip(canvas, prices, tipEl){
  const rectOf = ()=>canvas.getBoundingClientRect();
  const w = canvas.width;
  const pad = 26;

  const xToIndex = (clientX)=>{
    const r = rectOf();
    const x = (clientX - r.left) * (canvas.width / r.width);
    const t = Math.max(pad, Math.min(w-pad, x));
    const p = (t-pad)/(w-2*pad);
    const idx = Math.round(p*(prices.length-1));
    return Math.max(0, Math.min(prices.length-1, idx));
  };

  const show = (idx)=>{
    const p = prices[idx];
    tipEl.classList.remove("hidden");
    tipEl.innerHTML = `${formatTL(p.price)}<div style="opacity:.85;margin-top:6px">${fmtDate(p.ts)}</div>`;
  };
  const hide = ()=> tipEl.classList.add("hidden");

  const move = (e)=>{
    if (!prices || prices.length < 2) return;
    const idx = xToIndex(e.clientX || (e.touches?.[0]?.clientX ?? 0));
    show(idx);
  };

  canvas.onmousemove = move;
  canvas.ontouchmove = move;
  canvas.onmouseleave = hide;
  canvas.ontouchend = hide;
}

/* ------------------ Render Favorites ------------------ */
function renderFavs(){
  const favs = sortFavs(loadFavs());
  favList.innerHTML = "";
  if (!favs.length){
    favList.innerHTML = `<div class="empty">Favori yok.</div>`;
    return;
  }

  favs.forEach(fav=>{
    const site = siteById(fav.siteId);
    const last = latestPrice(fav);
    const totalChange = calcChangePercentFromFirst(fav.prices||[]);
    const totalBadge = (totalChange === null) ? "" : `
      <div class="change ${totalChange < 0 ? "down" : "up"}">
        ${totalChange < 0 ? "▼" : "▲"} ${totalChange.toFixed(1)}%
      </div>
    `;
    const lastStep = calcLastStepPercent(fav.prices||[]);
    const dropBadge = (lastStep !== null && lastStep <= -5) ? `
      <div class="dropbadge">⚠️ %${Math.abs(lastStep).toFixed(1)} düşüş</div>
    ` : "";

    const url = site ? urlForSite(site, fav.name) : "";

    const card = document.createElement("div");
    card.className = "favcard";
    card.innerHTML = `
      <div class="favtop">
        <div>
          <div class="favtitle">❤️ ${escapeHtml(site?.name || "-")}</div>
          <div class="favsites">${escapeHtml(fav.name)}</div>
          ${totalBadge}
          ${dropBadge}
        </div>
        <div class="pricepill">${formatTL(last)}</div>
      </div>

      <div class="favactions">
        <button class="btn btn--softok" data-openurl="${encodeURIComponent(url)}">Aç</button>
        <button class="btn btn--ghost" data-action="copy" data-id="${fav.id}">Copy Link</button>
        <button class="btn btn--softwarn" data-action="addprice" data-id="${fav.id}">Fiyat Ekle</button>
        <button class="btn btn--ghost" data-action="bigchart" data-id="${fav.id}">Grafiği büyüt</button>
        <button class="btn btn--softdanger" data-action="delete" data-id="${fav.id}">Sil</button>
      </div>

      <div class="priceentry hidden" id="priceentry_${fav.id}">
        <input class="input" id="price_${fav.id}" inputmode="decimal" placeholder="Fiyat (₺)" />
        <button class="btn primary" data-action="saveprice" data-id="${fav.id}">Kaydet</button>
      </div>

      <div class="canvasbox">
        <canvas id="c_${fav.id}" width="820" height="170"></canvas>
        <div id="tip_${fav.id}" class="charttip hidden"></div>
        <div class="note" id="note_${fav.id}">
          ${(fav.prices?.length||0) >= 2 ? "Grafikte gezdir: tarih + fiyat gör." : "Grafik için en az 2 fiyat gir."}
        </div>
      </div>
    `;
    favList.appendChild(card);

    // open
    card.querySelector("[data-openurl]")?.addEventListener("click", ()=>{
      const u = decodeURIComponent(card.querySelector("[data-openurl]").getAttribute("data-openurl") || "");
      if (u) window.open(u, "_blank", "noopener,noreferrer");
    });

    // chart
    const c = $(`c_${fav.id}`);
    const tip = $(`tip_${fav.id}`);
    drawChart(c, fav.prices || []);
    attachTooltip(c, fav.prices || [], tip);

    // actions
    card.querySelectorAll("[data-action]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");

        if (action==="delete"){
          const x = loadFavs().filter(f=>f.id!==id);
          saveFavs(x); renderFavs();
        }

        if (action==="copy"){
          if (url) await navigator.clipboard?.writeText(url);
        }

        if (action==="addprice"){
          $(`priceentry_${id}`)?.classList.toggle("hidden");
          setTimeout(()=> $(`price_${id}`)?.focus(), 30);
        }

        if (action==="saveprice"){
          const val = $(`price_${id}`)?.value || "";
          addPriceToFav(id, val);
          const inp = $(`price_${id}`); if (inp) inp.value = "";
          $(`priceentry_${id}`)?.classList.add("hidden");
        }

        if (action==="bigchart"){
          const f = loadFavs().find(x=>x.id===id);
          if (f){
            chartModal.classList.remove("hidden");
            drawChart(chartCanvasBig, f.prices || []);
            attachTooltip(chartCanvasBig, f.prices || [], chartTipBig);
          }
        }
      });
    });
  });
}

/* ------------------ Search Results (satır bazlı) ------------------ */
function renderSearchResults(query, siteIds){
  inAppResults.className = "searchlist";
  inAppResults.innerHTML = "";

  if (!query){
    inAppResults.innerHTML = `<div class="empty">Ürün adı boş.</div>`;
    return;
  }

  siteIds.forEach(id=>{
    const s = siteById(id);
    if(!s) return;

    const favOn = isFav(query, id);
    const url = urlForSite(s, query);

    const row = document.createElement("div");
    row.className = "srow";
    row.innerHTML = `
      <div class="srow__left">
        <div class="srow__site">${escapeHtml(s.name)}</div>
        <div class="srow__prod">${escapeHtml(query)}</div>
      </div>

      <div class="srow__actions">
        <button class="btn btn--softok" data-open="${encodeURIComponent(url)}">
          <span class="ic">
            <svg viewBox="0 0 24 24" fill="none"><path d="M14 3h7v7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M21 3 10 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </span>
          Aç
        </button>

        <button class="btn ${favOn ? "btn--faved" : "btn--favadd"}" data-fav="${escapeHtml(id)}">
          <span class="ic">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 21s-7-4.7-9.3-9A5.7 5.7 0 0 1 12 6.7 5.7 5.7 0 0 1 21.3 12C19 16.3 12 21 12 21Z"
                stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </span>
          ${favOn ? "Favoride" : "Favori"}
        </button>
      </div>
    `;

    row.querySelector("[data-open]").addEventListener("click", ()=>{
      const u = decodeURIComponent(row.querySelector("[data-open]").getAttribute("data-open"));
      window.open(u, "_blank", "noopener,noreferrer");
    });

    row.querySelector("[data-fav]").addEventListener("click", ()=>{
      // SADECE O SATIR FAVORİLENİR
      toggleFavorite(query, id);
      renderSearchResults(query, siteIds);
    });

    inAppResults.appendChild(row);
  });
}

/* ------------------ Search actions ------------------ */
function doSearch(openTabs=false){
  const query = (q.value || "").trim();
  const sites = loadSelected();

  if (!query){
    inAppResults.innerHTML = `<div class="empty">Ürün adı boş.</div>`;
    return;
  }

  renderSearchResults(query, sites);

  if (openTabs){
    sites.forEach(id=>{
      const s = siteById(id);
      if (!s) return;
      const url = urlForSite(s, query);
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }
}

/* ------------------ AI modal ------------------ */
function loadAI(){ return loadJSON(LS.ai, { provider:"openai", key:"" }); }
function saveAI(v){ saveJSON(LS.ai, v); }

function openAIModal(){
  const s = loadAI();
  aiProvider.value = s.provider || "openai";
  aiKey.value = s.key || "";
  aiModal.classList.remove("hidden");
}
function closeAIModal(){ aiModal.classList.add("hidden"); }

/* ------------------ Auth UI ------------------ */
let authMode = "login"; // login|register
function setAuthMode(m){
  authMode = m;
  tabLogin.classList.toggle("active", m==="login");
  tabRegister.classList.toggle("active", m==="register");
  authPass2Wrap.classList.toggle("hidden", m!=="register");
  btnAuthSubmit.textContent = (m==="login" ? "Giriş Yap" : "Hesap Oluştur");
  authMsg.classList.add("hidden");
  authMsg.textContent = "";
}

function showAuthMsg(msg){
  authMsg.textContent = msg;
  authMsg.classList.remove("hidden");
}

async function tryAuthSubmit(){
  const email = (authEmail.value || "").trim();
  const pass = (authPass.value || "").trim();
  const pass2 = (authPass2.value || "").trim();

  if (!email || !pass) return showAuthMsg("Email ve şifre gerekli.");
  if (authMode==="register" && pass !== pass2) return showAuthMsg("Şifreler aynı değil.");

  try{
    if (authMode==="login"){
      await authApi.signIn(email, pass);
    } else {
      await authApi.signUp(email, pass);
    }
  }catch(e){
    showAuthMsg("Hata: " + (e?.message || String(e)));
  }
}

async function tryGoogle(){
  try{
    await authApi.signInWithGoogle();
  }catch(e){
    showAuthMsg("Google giriş hatası: " + (e?.message || String(e)));
  }
}

function openAuthModal(){ authWrap.classList.remove("hidden"); }
function closeAuthModal(){ authWrap.classList.add("hidden"); }

/* ------------------ Events ------------------ */
btnSearch.addEventListener("click", ()=>doSearch(false));
btnOpenSelected.addEventListener("click", ()=>doSearch(true));
btnClear.addEventListener("click", ()=>{
  q.value = "";
  inAppResults.innerHTML = `<div class="empty">Henüz arama yapılmadı.</div>`;
});

q.addEventListener("keydown", (e)=>{
  if (e.key === "Enter") doSearch(false);
});

sortFav.addEventListener("change", renderFavs);
btnRefreshFav.addEventListener("click", renderFavs);

chartClose.addEventListener("click", ()=>chartModal.classList.add("hidden"));
chartModal.addEventListener("click", (e)=>{ if (e.target === chartModal) chartModal.classList.add("hidden"); });

btnAI.addEventListener("click", openAIModal);
aiClose.addEventListener("click", closeAIModal);
aiModal.addEventListener("click", (e)=>{ if (e.target === aiModal) closeAIModal(); });
aiSave.addEventListener("click", ()=>{
  saveAI({ provider: aiProvider.value, key: (aiKey.value||"").trim() });
  closeAIModal();
});
aiClear.addEventListener("click", ()=>{
  saveAI({ provider: aiProvider.value, key:"" });
  aiKey.value = "";
});

tabLogin.addEventListener("click", ()=>setAuthMode("login"));
tabRegister.addEventListener("click", ()=>setAuthMode("register"));
btnAuthSubmit.addEventListener("click", tryAuthSubmit);
btnGoogle.addEventListener("click", tryGoogle);

togglePass.addEventListener("click", ()=>{
  authPass.type = (authPass.type==="password" ? "text" : "password");
});
togglePass2.addEventListener("click", ()=>{
  authPass2.type = (authPass2.type==="password" ? "text" : "password");
});

btnLogout.addEventListener("click", async ()=>{
  try{ await authApi.signOut(); }catch{}
});

/* ------------------ Init ------------------ */
renderSiteChips();
renderFavs();
setAuthMode("login");

/* auth state */
authApi.onAuthStateChanged((user)=>{
  if (user) closeAuthModal();
  else openAuthModal();
});
