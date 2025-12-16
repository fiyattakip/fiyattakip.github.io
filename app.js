import {
  auth, db, fb,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification
} from "./firebase.js";

const SITES = [
  { key: "trendyol", name: "Trendyol", searchUrl: (q) => `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key: "hepsiburada", name: "Hepsiburada", searchUrl: (q) => `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key: "n11", name: "N11", searchUrl: (q) => `https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key: "amazon", name: "Amazon TR", searchUrl: (q) => `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key: "pazarama", name: "Pazarama", searchUrl: (q) => `https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key: "ciceksepeti", name: "ÇiçekSepeti", searchUrl: (q) => `https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key: "idefix", name: "İdefix", searchUrl: (q) => `https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` }
];

const $ = (s) => document.querySelector(s);
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
const now = () => Date.now();

let user = null;
let favorites = [];
let selectedSites = new Set(SITES.map(s => s.key));
let lastQuery = "";
let currentResults = [];
let sortMode = "lastAsc";

// --------- TOAST ----------
function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1600);
}

// --------- PRICE ----------
function normalizePrice(input) {
  const s = String(input).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// --------- LOCAL SUGGESTIONS ----------
function loadQueryHistory(){
  try { return JSON.parse(localStorage.getItem("ft_queries") || "[]"); } catch { return []; }
}
function saveQueryHistory(q){
  const list = loadQueryHistory();
  const cleaned = q.trim();
  if (!cleaned) return;
  const next = [cleaned, ...list.filter(x => x !== cleaned)].slice(0, 20);
  localStorage.setItem("ft_queries", JSON.stringify(next));
}
function buildSuggestions(text){
  const q = text.trim().toLowerCase();
  if (!q) return [];

  const hist = loadQueryHistory();
  const fromHist = hist.filter(x => x.toLowerCase().includes(q));

  const fromFav = [...new Set(favorites.map(f=>f.productName).filter(Boolean))]
    .filter(x => x.toLowerCase().includes(q));

  // basit “düzeltme” hissi: kelime başı önerisi
  const pool = [...new Set([...fromHist, ...fromFav])];
  return pool.slice(0, 8);
}
function renderSuggestions(list){
  const box = $("#suggestBox");
  if (!list.length){
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }
  box.style.display = "block";
  box.innerHTML = list.map(s => `<div class="suggItem" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join("");
}

// --------- FIRESTORE PATHS ----------
async function ensureUserDoc() {
  const ref = fb.doc(db, "users", user.uid);
  const snap = await fb.getDoc(ref);
  if (!snap.exists()) await fb.setDoc(ref, { email: user.email || "", createdAt: now() });
}

async function loadFavorites() {
  if (!user) return;
  const colRef = fb.collection(db, "users", user.uid, "favorites");
  const qs = await fb.getDocs(colRef);
  favorites = qs.docs.map(d => ({ id: d.id, ...d.data() }));
  await renderFavorites();
  renderResults(); // favoride / değil durumunu net göstersin
}

async function addFavorite(siteKey, siteName, productName, url){
  if (!user) return toast("Giriş yapmalısın");
  if (favorites.some(f => f.url === url)) return;

  const colRef = fb.collection(db, "users", user.uid, "favorites");
  const docRef = await fb.addDoc(colRef, {
    siteKey, siteName, productName, url,
    createdAt: now()
  });

  // anında UI (bekletme yok)
  favorites.unshift({ id: docRef.id, siteKey, siteName, productName, url, createdAt: now() });
  await renderFavorites();
  renderResults();
  toast("Favorilere eklendi");
}

async function removeFavoriteByUrl(url){
  const f = favorites.find(x => x.url === url);
  if (!f) return;
  await fb.deleteDoc(fb.doc(db, "users", user.uid, "favorites", f.id));
  favorites = favorites.filter(x => x.id !== f.id);
  await renderFavorites();
  renderResults();
  toast("Favoriden çıkarıldı");
}

async function addPriceRecord(favId, priceNumber){
  const colRef = fb.collection(db, "users", user.uid, "favorites", favId, "prices");
  await fb.addDoc(colRef, { price: priceNumber, ts: now() });
}

async function getPricesAsc(favId, take = 120){
  const colRef = fb.collection(db, "users", user.uid, "favorites", favId, "prices");
  const q1 = fb.query(colRef, fb.orderBy("ts","asc"), fb.limit(take));
  const qs = await fb.getDocs(q1);
  return qs.docs.map(d => d.data());
}
async function getLastPrices(favId, take = 30){
  const colRef = fb.collection(db, "users", user.uid, "favorites", favId, "prices");
  const q1 = fb.query(colRef, fb.orderBy("ts","desc"), fb.limit(take));
  const qs = await fb.getDocs(q1);
  return qs.docs.map(d => d.data()).reverse();
}
async function getLastPriceOne(favId){
  const list = await getLastPrices(favId, 1);
  return list[0]?.price ?? null;
}

// --------- SITE CHIPS ----------
function renderSiteChips(){
  const grid = $("#siteGrid");
  grid.innerHTML = SITES.map(s => {
    const on = selectedSites.has(s.key);
    return `
      <button class="siteChip ${on ? "" : "off"}" data-sitechip="${s.key}">
        <span class="siteDot"></span>${escapeHtml(s.name)}
      </button>
    `;
  }).join("");
}

// --------- RESULTS ----------
function buildResults(q){
  lastQuery = q;
  currentResults = SITES
    .filter(s => selectedSites.has(s.key))
    .map(s => ({ siteKey:s.key, siteName:s.name, query:q, url:s.searchUrl(q) }));

  renderResults();
}

function renderResults(){
  const root = $("#results");
  if (!lastQuery){
    root.innerHTML = `<div class="empty">Henüz arama yapılmadı.</div>`;
    return;
  }
  if (!currentResults.length){
    root.innerHTML = `<div class="empty">Seçili site yok.</div>`;
    return;
  }

  root.innerHTML = currentResults.map(r => {
    const isFav = favorites.some(f => f.url === r.url);
    return `
      <div class="rowcard">
        <div class="rowleft">
          <div class="sitename">${escapeHtml(r.siteName)}</div>
          <div class="query">${escapeHtml(r.query)}</div>
        </div>
        <div class="rowright">
          <button class="btn open" data-open="${escapeHtml(r.url)}">Aç</button>
          <button class="btn fav ${isFav ? "on" : ""}" data-fav="${escapeHtml(r.url)}" data-site="${escapeHtml(r.siteKey)}">
            ${isFav ? "♥ Favoride" : "♡ Favori Ekle"}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

// --------- FAVORITES + SORT + CHART ----------
async function renderFavorites(){
  const root = $("#favorites");
  if (!favorites.length){
    root.innerHTML = `<div class="empty">Favori yok.</div>`;
    return;
  }

  // enrich with lastPrice
  const enriched = [];
  for (const f of favorites){
    const lastPrice = await getLastPriceOne(f.id);
    enriched.push({ ...f, lastPrice });
  }

  // sort
  if (sortMode === "lastAsc"){
    enriched.sort((a,b)=>{
      if (a.lastPrice == null && b.lastPrice == null) return 0;
      if (a.lastPrice == null) return 1;
      if (b.lastPrice == null) return -1;
      return a.lastPrice - b.lastPrice;
    });
  } else if (sortMode === "lastDesc"){
    enriched.sort((a,b)=>{
      if (a.lastPrice == null && b.lastPrice == null) return 0;
      if (a.lastPrice == null) return 1;
      if (b.lastPrice == null) return -1;
      return b.lastPrice - a.lastPrice;
    });
  } else {
    enriched.sort((a,b)=> (b.createdAt || 0) - (a.createdAt || 0));
  }

  root.innerHTML = enriched.map(f => `
    <div class="favcard">
      <div class="favtop">
        <div>
          <div class="favtitle">${escapeHtml(f.productName || "Ürün")}</div>
          <div class="favsub">${escapeHtml(f.siteName)} • Link gizli</div>
        </div>
        <div class="badge">${f.lastPrice == null ? "Fiyat yok" : `${f.lastPrice}₺`}</div>
      </div>

      <div class="favactions">
        <button class="btn small open" data-open="${escapeHtml(f.url)}">${escapeHtml(f.siteName)} Aç</button>
        <button class="btn small" data-copy="${escapeHtml(f.url)}">Copy Link</button>
        <button class="btn small" data-addprice="${escapeHtml(f.id)}">Fiyat Ekle</button>
        <button class="btn small danger" data-del="${escapeHtml(f.url)}">Sil</button>
        <button class="btn small" data-openchart="${escapeHtml(f.id)}">Grafiği Büyüt</button>
      </div>

      <div class="sparkWrap">
        <div class="sparkRow">
          <div class="sparkMeta">Geçmiş fiyat (mini grafik)</div>
          <div class="sparkMeta">${f.lastPrice == null ? "" : `Son: ${f.lastPrice}₺`}</div>
        </div>
        <canvas class="sparkCanvas" id="spark_${escapeHtml(f.id)}" width="900" height="140" data-openchart="${escapeHtml(f.id)}"></canvas>
      </div>
    </div>
  `).join("");

  // draw spark charts
  for (const f of enriched){
    const prices = await getLastPrices(f.id, 30);
    const canvas = document.getElementById(`spark_${f.id}`);
    if (!canvas) continue;
    drawLineChart(canvas, prices.map(x=>x.price), { compact:true });
  }

  // after render -> %5 drop demo check
  await checkDropsDemo(enriched);
}

function drawLineChart(canvas, values, opts={}){
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  if (!values || values.length < 2){
    ctx.font = "28px system-ui";
    ctx.fillStyle = "#9aa0b7";
    ctx.fillText("Grafik için en az 2 fiyat kaydı", 24, H/2);
    return;
  }

  const pad = opts.compact ? 18 : 36;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(1, maxV - minV);

  ctx.strokeStyle = "#edf0ff";
  ctx.lineWidth = 2;
  for (let i=1;i<=3;i++){
    const y = pad + (H-2*pad) * (i/4);
    ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad,y); ctx.stroke();
  }

  ctx.strokeStyle = "#2b3ea8";
  ctx.lineWidth = opts.compact ? 6 : 7;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const toX = (i) => pad + (W-2*pad) * (i/(values.length-1));
  const toY = (v) => pad + (H-2*pad) * (1 - ((v-minV)/range));

  ctx.beginPath();
  ctx.moveTo(toX(0), toY(values[0]));
  for (let i=1;i<values.length;i++) ctx.lineTo(toX(i), toY(values[i]));
  ctx.stroke();

  ctx.fillStyle = "#2b3ea8";
  for (let i=0;i<values.length;i++){
    const x = toX(i), y = toY(values[i]);
    ctx.beginPath(); ctx.arc(x,y, opts.compact ? 6 : 7, 0, Math.PI*2); ctx.fill();
  }

  ctx.fillStyle = "#6d718a";
  ctx.font = (opts.compact ? "24px" : "26px") + " system-ui";
  ctx.fillText(`${minV}₺`, pad, H - 12);
  ctx.fillText(`${maxV}₺`, pad, pad + 22);
}

async function openBigChart(favId){
  const f = favorites.find(x=>x.id===favId);
  if (!f) return;

  const list = await getPricesAsc(favId, 150);
  const prices = list.map(x=>x.price);

  $("#modalTitle").textContent = f.productName || "Ürün";
  $("#modalSub").textContent = `${f.siteName} • ${list.length} kayıt`;
  $("#chartHint").textContent = list.length
    ? `İlk: ${new Date(list[0].ts).toLocaleDateString("tr-TR")} • Son: ${new Date(list[list.length-1].ts).toLocaleDateString("tr-TR")}`
    : "";

  $("#chartModal").style.display = "flex";
  drawLineChart($("#bigChart"), prices, { compact:false });
}

// --------- %5 DROP DEMO (APP AÇILINCA) ----------
async function checkDropsDemo(enriched){
  // “arka planda her gün” ücretsiz GH pages’te garanti değil.
  // Ama app açılınca kontrol eder: son 2 fiyatı karşılaştırır.
  for (const f of enriched){
    const last2 = await getLastPrices(f.id, 2);
    if (last2.length < 2) continue;
    const prev = last2[last2.length-2].price;
    const cur  = last2[last2.length-1].price;
    if (!prev || !cur) continue;

    const dropPct = ((prev - cur) / prev) * 100;
    if (dropPct >= 5){
      toast(`%${dropPct.toFixed(1)} düşüş: ${f.productName} (${f.siteName})`);
      // istersen burada Notification API de açarız, ama telefonda izin ister.
    }
  }
}

// --------- AUTH OVERLAY ----------
function showAuth(){
  const root = $("#authRoot");
  root.classList.add("show");
  root.innerHTML = `
    <div class="authOverlay">
      <div class="authCard">
        <div class="authTitle">
          <img src="./icon-192.png" style="width:26px;height:26px;border-radius:10px" alt="">
          <span>fiyattakip</span>
        </div>

        <div class="authTabs">
          <button class="tab on" id="tabLogin">Giriş</button>
          <button class="tab" id="tabRegister">Kayıt</button>
        </div>

        <div id="authForm"></div>
      </div>
    </div>
  `;

  const authForm = $("#authForm");

  const renderLogin = () => {
    $("#tabLogin").classList.add("on");
    $("#tabRegister").classList.remove("on");
    authForm.innerHTML = `
      <div class="field"><input id="email" type="email" placeholder="E-posta"></div>
      <div class="field"><input id="pass" type="password" placeholder="Şifre"></div>
      <button class="btn full" id="doLogin">Giriş Yap</button>
    `;
    $("#doLogin").onclick = async () => {
      const email = $("#email").value.trim();
      const pass = $("#pass").value.trim();
      if (!email || !pass) return toast("E-posta / şifre gir");
      try{
        await signInWithEmailAndPassword(auth, email, pass);
      }catch{
        toast("Giriş hatası");
      }
    };
  };

  const renderRegister = () => {
    $("#tabRegister").classList.add("on");
    $("#tabLogin").classList.remove("on");
    authForm.innerHTML = `
      <div class="field"><input id="email2" type="email" placeholder="E-posta"></div>
      <div class="field"><input id="pass2" type="password" placeholder="Şifre"></div>
      <div class="field"><input id="pass3" type="password" placeholder="Şifre (tekrar)"></div>
      <button class="btn full" id="doRegister">Hesap Oluştur</button>
      <div class="hint">Kayıt sonrası doğrulama maili gönderilir.</div>
    `;
    $("#doRegister").onclick = async () => {
      const email = $("#email2").value.trim();
      const p1 = $("#pass2").value.trim();
      const p2 = $("#pass3").value.trim();
      if (!email || !p1 || !p2) return toast("Bilgileri doldur");
      if (p1 !== p2) return toast("Şifreler aynı değil");
      try{
        const cred = await createUserWithEmailAndPassword(auth, email, p1);
        await sendEmailVerification(cred.user);
        toast("Doğrulama maili gönderildi");
      }catch{
        toast("Kayıt hatası");
      }
    };
  };

  $("#tabLogin").onclick = renderLogin;
  $("#tabRegister").onclick = renderRegister;
  renderLogin();
}

function hideAuth(){
  const root = $("#authRoot");
  root.classList.remove("show");
  root.innerHTML = "";
}

// --------- CLIPBOARD ----------
function copyToClipboard(text){
  navigator.clipboard?.writeText(text)
    .then(()=>toast("Link kopyalandı"))
    .catch(()=>{
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Link kopyalandı");
    });
}

// --------- EVENTS ----------
function bindEvents(){
  renderSiteChips();
  renderResults();

  $("#sortSelect").addEventListener("change", (e)=>{
    sortMode = e.target.value;
    renderFavorites();
  });

  $("#searchBtn").addEventListener("click", ()=>{
    const q = ($("#query").value || "").trim();
    if (!q) return toast("Ürün adını yaz");
    saveQueryHistory(q);
    buildResults(q);
    renderSuggestions([]);
  });

  $("#query").addEventListener("input", (e)=>{
    const list = buildSuggestions(e.target.value);
    renderSuggestions(list);
  });

  $("#query").addEventListener("focus", (e)=>{
    const list = buildSuggestions(e.target.value);
    renderSuggestions(list);
  });

  document.addEventListener("click", (e)=>{
    if (!e.target.closest(".suggestBox") && e.target.id !== "query") renderSuggestions([]);
  });

  $("#clearBtn").addEventListener("click", ()=>{
    $("#query").value = "";
    lastQuery = "";
    currentResults = [];
    renderResults();
    renderSuggestions([]);
  });

  $("#openAllBtn").addEventListener("click", ()=>{
    if (!lastQuery || !currentResults.length) return toast("Önce arama yap");
    currentResults.forEach(r => window.open(r.url, "_blank", "noopener"));
  });

  $("#favRefresh").addEventListener("click", loadFavorites);

  $("#aiBtn").addEventListener("click", ()=>{
    toast("AI Arama (demo): İstersen sonra Gemini/GPT entegrasyonu ekleriz.");
  });

  $("#logoutBtn").addEventListener("click", async ()=>{
    await signOut(auth);
  });

  $("#modalClose").addEventListener("click", ()=> $("#chartModal").style.display = "none");
  $("#chartModal").addEventListener("click", (e)=>{
    if (e.target.id === "chartModal") $("#chartModal").style.display = "none";
  });

  // delegated
  document.addEventListener("click", async (e)=>{
    const t = e.target;

    const chip = t.closest?.("[data-sitechip]");
    if (chip){
      const key = chip.dataset.sitechip;
      if (selectedSites.has(key)) selectedSites.delete(key);
      else selectedSites.add(key);
      renderSiteChips();
      if (lastQuery) buildResults(lastQuery);
      return;
    }

    const sugg = t.dataset?.sugg;
    if (sugg){
      $("#query").value = sugg;
      renderSuggestions([]);
      return;
    }

    const openUrl = t.dataset?.open;
    if (openUrl){
      window.open(openUrl, "_blank", "noopener");
      return;
    }

    const favUrl = t.dataset?.fav;
    if (favUrl){
      const siteKey = t.dataset.site;
      const siteName = SITES.find(x=>x.key===siteKey)?.name || siteKey;
      const productName = ($("#query").value || lastQuery || "Ürün").trim();
      const isFav = favorites.some(f => f.url === favUrl);
      if (isFav) await removeFavoriteByUrl(favUrl);
      else await addFavorite(siteKey, siteName, productName, favUrl);
      return;
    }

    const delUrl = t.dataset?.del;
    if (delUrl){
      await removeFavoriteByUrl(delUrl);
      return;
    }

    const copyUrl = t.dataset?.copy;
    if (copyUrl){
      copyToClipboard(copyUrl);
      return;
    }

    const addId = t.dataset?.addprice;
    if (addId){
      const input = prompt("Fiyat gir (örn: 12999 veya 12.999,00)");
      if (input == null) return;
      const p = normalizePrice(input);
      if (p == null) return toast("Geçersiz fiyat");
      await addPriceRecord(addId, p);
      toast("Fiyat kaydedildi");
      await loadFavorites();
      return;
    }

    const chartId = t.dataset?.openchart || t.closest?.("[data-openchart]")?.dataset?.openchart;
    if (chartId){
      await openBigChart(chartId);
      return;
    }
  });
}

// --------- INIT ----------
async function init(){
  bindEvents();
  showAuth();

  onAuthStateChanged(auth, async (u)=>{
    user = u || null;

    if (!user){
      showAuth();
      return;
    }

    hideAuth();
    await ensureUserDoc();
    await loadFavorites();
  });
}

init();
