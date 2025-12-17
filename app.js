// app.js (module)

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const esc = (s="") => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const nowISO = () => new Date().toISOString();
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

const LS = {
  SEARCH_ROWS: "ft_search_rows_v1",
  FAVS: "ft_favs_v2",
  GEMINI_KEY: "ft_gemini_key",
  LAST_USER: "ft_last_user"
};

// ---------- Site Config ----------
const SITES = {
  trendyol:  { name:"Trendyol",   colorClass:"good",  buildSearch:(q)=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}&sst=PRICE_BY_ASC` },
  hepsiburada:{ name:"Hepsiburada", colorClass:"good", buildSearch:(q)=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}&sorting=price_asc` },
  n11:       { name:"N11",        colorClass:"good",  buildSearch:(q)=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}&srt=PRICE_LOW` },
  amazontr:  { name:"Amazon TR",  colorClass:"good",  buildSearch:(q)=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}&s=price-asc-rank` },
  pazarama:  { name:"Pazarama",   colorClass:"good",  buildSearch:(q)=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}&sorting=price_asc` },
  cicek:     { name:"ÇiçekSepeti",colorClass:"good",  buildSearch:(q)=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}&sorting=price_asc` },
  idefix:    { name:"idefix",     colorClass:"good",  buildSearch:(q)=>`https://www.idefix.com/arama?q=${encodeURIComponent(q)}&s=price-asc-rank` }
};

// ---------- State ----------
let searchRows = loadJSON(LS.SEARCH_ROWS, []); // {siteKey, query, createdAt}
let favs = loadJSON(LS.FAVS, []);              // {id, siteKey, title, url, prices:[{t, v}], createdAt}
let sortMode = "last_desc";

function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch{ return fallback; }
}
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

// ---------- UI elements ----------
const authOverlay = $("authOverlay");
const tabLogin = $("tabLogin");
const tabRegister = $("tabRegister");
const authEmail = $("authEmail");
const authPass = $("authPass");
const authPass2 = $("authPass2");
const registerRepeat = $("registerRepeat");
const btnAuthPrimary = $("btnAuthPrimary");
const btnGoogle = $("btnGoogle");
const authMsg = $("authMsg");
const togglePw = $("togglePw");
const togglePw2 = $("togglePw2");

const btnLogout = $("btnLogout");

const qInput = $("q");
const btnSearch = $("btnSearch");
const btnClearSearch = $("btnClearSearch");
const btnOpenSelected = $("btnOpenSelected");
const searchRowsBox = $("searchRows");
const btnRefreshFav = $("btnRefreshFav");
const favList = $("favList");
const sortSelect = $("sortSelect");
const btnExport = $("btnExport");
const btnImport = $("btnImport");
const importFile = $("importFile");

// AI
const btnAI = $("btnAI");
const aiPanel = $("aiPanel");
const btnAIClose = $("btnAIClose");
const geminiKey = $("geminiKey");
const btnAISave = $("btnAISave");
const btnAIRun = $("btnAIRun");
const aiStatus = $("aiStatus");

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async ()=>{
    try{
      await navigator.serviceWorker.register("./sw.js");
    }catch(e){
      console.warn("SW register error", e);
    }
  });
}

// ---------- Auth (Firebase optional) ----------
// Bu proje “giriş ekranı görünmesin / arka plan sızmasın” diye overlay ile çalışır.
// Firebase kurmak istersen: aşağıdaki initFirebase() kısmına kendi Firebase config’ini koyabilirsin.
// Şimdilik demo: local auth gibi davranır (tarayıcıda giriş yapınca overlay kapanır).

let currentUser = null;

function showAuth(show){
  authOverlay.classList.toggle("show", !!show);
}
function setAuthMode(mode){
  const isReg = mode === "register";
  tabLogin.classList.toggle("active", !isReg);
  tabRegister.classList.toggle("active", isReg);
  registerRepeat.classList.toggle("hidden", !isReg);
  btnAuthPrimary.textContent = isReg ? "Hesap Oluştur" : "Giriş Yap";
  authMsg.textContent = "";
}
function setAuthMsg(t){
  authMsg.textContent = t || "";
  authMsg.style.display = t ? "block" : "none";
}
function fakeLogin(email){
  currentUser = { email };
  localStorage.setItem(LS.LAST_USER, email);
  showAuth(false);
}
function fakeLogout(){
  currentUser = null;
  showAuth(true);
}

function initAuthUI(){
  setAuthMode("login");
  showAuth(true);

  const last = localStorage.getItem(LS.LAST_USER);
  if(last) authEmail.value = last;

  tabLogin.addEventListener("click", ()=>setAuthMode("login"));
  tabRegister.addEventListener("click", ()=>setAuthMode("register"));

  togglePw.addEventListener("click", ()=>{
    authPass.type = authPass.type === "password" ? "text" : "password";
  });
  togglePw2.addEventListener("click", ()=>{
    authPass2.type = authPass2.type === "password" ? "text" : "password";
  });

  btnAuthPrimary.addEventListener("click", ()=>{
    const email = (authEmail.value||"").trim();
    const p1 = (authPass.value||"").trim();
    const isReg = tabRegister.classList.contains("active");
    const p2 = (authPass2.value||"").trim();

    if(!email || !p1) return setAuthMsg("Email ve şifre gerekli.");
    if(isReg && p1 !== p2) return setAuthMsg("Şifreler aynı değil.");

    // Demo login
    fakeLogin(email);
  });

  btnGoogle.addEventListener("click", ()=>{
    // Demo google login (firebase bağlarsan burada provider açarsın)
    const email = (authEmail.value||"google_user@gmail.com").trim() || "google_user@gmail.com";
    fakeLogin(email);
  });

  btnLogout.addEventListener("click", ()=>{
    fakeLogout();
  });
}

// ---------- Search rows ----------
function getSelectedSites(){
  return [...document.querySelectorAll(".sitecb")]
    .filter(cb=>cb.checked)
    .map(cb=>cb.value);
}

function addSearchRows(query, siteKeys){
  const t = nowISO();
  for(const siteKey of siteKeys){
    searchRows.push({ siteKey, query, createdAt:t });
  }
  // keep last 60 rows
  if(searchRows.length > 60) searchRows = searchRows.slice(-60);
  saveJSON(LS.SEARCH_ROWS, searchRows);
  renderSearchRows();
}

function renderSearchRows(){
  if(!searchRows.length){
    searchRowsBox.classList.add("empty");
    searchRowsBox.textContent = "Henüz arama yapılmadı.";
    return;
  }
  searchRowsBox.classList.remove("empty");
  searchRowsBox.innerHTML = "";

  // newest first
  const rows = [...searchRows].reverse();
  for(const r of rows){
    const site = SITES[r.siteKey];
    if(!site) continue;
    const url = site.buildSearch(r.query);

    const el = document.createElement("div");
    el.className = "searchrowitem";
    el.innerHTML = `
      <div class="sr-left">
        <div class="sr-site">${esc(site.name)}</div>
        <div class="sr-q">${esc(r.query)}</div>
      </div>
      <div class="sr-actions">
        <button class="btn ${site.colorClass}" data-act="open">Aç</button>
        <button class="btn ghost" data-act="fav">♡ Favori</button>
      </div>
    `;

    el.querySelector('[data-act="open"]').addEventListener("click", ()=>{
      window.open(url, "_blank", "noopener,noreferrer");
    });

    el.querySelector('[data-act="fav"]').addEventListener("click", ()=>{
      addFav({
        siteKey: r.siteKey,
        title: r.query,
        url
      });
      renderFavs();
    });

    searchRowsBox.appendChild(el);
  }
}

btnSearch.addEventListener("click", ()=>{
  const q = (qInput.value||"").trim();
  if(!q) return;
  const sites = getSelectedSites();
  if(!sites.length) return;

  // sadece satırları oluşturur (sekme açmak için “Seçili Siteleri Aç” var)
  addSearchRows(q, sites);
});

btnOpenSelected.addEventListener("click", ()=>{
  const q = (qInput.value||"").trim();
  if(!q) return;
  const sites = getSelectedSites();
  if(!sites.length) return;

  // “Seçili siteleri aç” = hepsini sekmede aç
  for(const sk of sites){
    const site = SITES[sk];
    const url = site.buildSearch(q);
    window.open(url, "_blank", "noopener,noreferrer");
  }
});

btnClearSearch.addEventListener("click", ()=>{
  qInput.value = "";
});

// ---------- Favorites ----------
function uid(){
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function addFav({siteKey, title, url}){
  // Aynı site+url varsa tekrar ekleme
  const exists = favs.find(f => f.siteKey===siteKey && f.url===url);
  if(exists) return;

  favs.push({
    id: uid(),
    siteKey,
    title,
    url,
    prices: [],
    createdAt: nowISO()
  });
  saveJSON(LS.FAVS, favs);
}

function deleteFav(id){
  favs = favs.filter(f=>f.id!==id);
  saveJSON(LS.FAVS, favs);
}

function addPrice(id, val){
  const f = favs.find(x=>x.id===id);
  if(!f) return;
  const v = Number(val);
  if(!Number.isFinite(v) || v<=0) return;

  f.prices.push({ t: nowISO(), v });
  // keep last 90 points
  if(f.prices.length>90) f.prices = f.prices.slice(-90);
  saveJSON(LS.FAVS, favs);
}

function lastPrice(f){
  if(!f.prices?.length) return null;
  return f.prices[f.prices.length-1].v;
}

function sortFavs(list){
  const arr = [...list];
  if(sortMode==="last_asc"){
    arr.sort((a,b)=>(lastPrice(a)??Infinity) - (lastPrice(b)??Infinity));
  }else if(sortMode==="last_desc"){
    arr.sort((a,b)=>(lastPrice(b)??-Infinity) - (lastPrice(a)??-Infinity));
  }else if(sortMode==="name_asc"){
    arr.sort((a,b)=>(a.title||"").localeCompare(b.title||"", "tr"));
  }else if(sortMode==="site_asc"){
    arr.sort((a,b)=>(SITES[a.siteKey]?.name||"").localeCompare(SITES[b.siteKey]?.name||"", "tr"));
  }
  return arr;
}

function renderFavs(){
  if(!favs.length){
    favList.classList.add("empty");
    favList.textContent = "Favori yok.";
    return;
  }
  favList.classList.remove("empty");
  favList.innerHTML = "";

  const items = sortFavs(favs);

  for(const f of items){
    const site = SITES[f.siteKey];
    const lp = lastPrice(f);
    const lpText = lp ? `₺${lp.toLocaleString("tr-TR")}` : "Fiyat yok";

    const card = document.createElement("div");
    card.className = "favcard";
    card.innerHTML = `
      <div class="favtop">
        <div>
          <div class="favtitle">${esc(site?.name || f.siteKey)}</div>
          <div class="favsub">${esc(f.title || "")}</div>
        </div>
        <div class="pricepill">${esc(lpText)}</div>
      </div>

      <div class="favactions">
        <button class="btn good" data-act="open">Aç</button>
        <button class="btn ghost" data-act="copy">Copy Link</button>
        <input class="input" data-act="priceInput" inputmode="numeric" placeholder="Fiyat (₺)" />
        <button class="btn warn" data-act="addPrice">Fiyat ekle</button>
        <button class="btn danger" data-act="del">Sil</button>
      </div>

      <div class="graphwrap">
        <div class="graphnote">${f.prices.length<2 ? "Grafik için en az 2 fiyat kaydı gir." : "Fiyat grafiği"}</div>
        <canvas width="600" height="140" data-act="cv"></canvas>
      </div>
    `;

    card.querySelector('[data-act="open"]').addEventListener("click", ()=>{
      window.open(f.url, "_blank", "noopener,noreferrer");
    });

    card.querySelector('[data-act="copy"]').addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(f.url);
      }catch{
        // fallback
        const ta = document.createElement("textarea");
        ta.value = f.url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
    });

    const priceInput = card.querySelector('[data-act="priceInput"]');
    card.querySelector('[data-act="addPrice"]').addEventListener("click", ()=>{
      addPrice(f.id, priceInput.value);
      renderFavs();
    });

    card.querySelector('[data-act="del"]').addEventListener("click", ()=>{
      deleteFav(f.id);
      renderFavs();
    });

    // draw graph
    const cv = card.querySelector('[data-act="cv"]');
    drawGraph(cv, f.prices || []);

    favList.appendChild(card);
  }
}

function drawGraph(canvas, prices){
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // clear
  ctx.clearRect(0,0,w,h);

  // background line
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,.12)";
  for(let i=1;i<=3;i++){
    const y = (h/4)*i;
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.lineTo(w,y);
    ctx.stroke();
  }

  if(!prices || prices.length < 2) return;

  const vals = prices.map(p=>p.v);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const pad = (maxV-minV)*0.12 || 1;
  const lo = minV - pad;
  const hi = maxV + pad;

  const toX = (i)=> (i/(prices.length-1)) * (w-20) + 10;
  const toY = (v)=> {
    const t = (v - lo) / (hi - lo);
    return (h-18) - t*(h-30);
  };

  // line
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(47,69,216,.9)";
  ctx.beginPath();
  prices.forEach((p,i)=>{
    const x = toX(i);
    const y = toY(p.v);
    if(i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = "rgba(47,69,216,.95)";
  prices.forEach((p,i)=>{
    const x = toX(i);
    const y = toY(p.v);
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fill();
  });

  // last label
  const last = prices[prices.length-1].v;
  ctx.fillStyle = "rgba(15,23,42,.75)";
  ctx.font = "bold 14px system-ui";
  ctx.fillText(`₺${Math.round(last).toLocaleString("tr-TR")}`, 10, 16);
}

btnRefreshFav.addEventListener("click", renderFavs);
sortSelect.addEventListener("change", ()=>{
  sortMode = sortSelect.value;
  renderFavs();
});

// export/import
btnExport.addEventListener("click", ()=>{
  const data = { favs, searchRows, exportedAt: nowISO() };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fiyattakip_export_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

btnImport.addEventListener("click", ()=> importFile.click());
importFile.addEventListener("change", async ()=>{
  const file = importFile.files?.[0];
  if(!file) return;
  const txt = await file.text();
  try{
    const data = JSON.parse(txt);
    if(Array.isArray(data.favs)) favs = data.favs;
    if(Array.isArray(data.searchRows)) searchRows = data.searchRows;
    saveJSON(LS.FAVS, favs);
    saveJSON(LS.SEARCH_ROWS, searchRows);
    renderSearchRows();
    renderFavs();
  }catch(e){
    alert("İçe aktarma hatası: " + (e?.message||e));
  }finally{
    importFile.value = "";
  }
});

// ---------- AI Search (Gemini only) ----------
(function initAISearch(){
  const saved = localStorage.getItem(LS.GEMINI_KEY);
  if(saved) geminiKey.value = saved;

  function openPanel(){
    aiPanel.classList.remove("hidden");
    setTimeout(()=> geminiKey.focus(), 30);
  }
  function closePanel(){
    aiPanel.classList.add("hidden");
    aiStatus.textContent = "";
  }

  btnAI.addEventListener("click", ()=>{
    if(aiPanel.classList.contains("hidden")) openPanel();
    else closePanel();
  });
  btnAIClose.addEventListener("click", closePanel);

  btnAISave.addEventListener("click", ()=>{
    const key = (geminiKey.value||"").trim();
    if(!key){
      aiStatus.textContent = "API Key boş.";
      return;
    }
    localStorage.setItem(LS.GEMINI_KEY, key);
    aiStatus.textContent = "Kaydedildi ✅";
  });

  async function geminiFixQuery(query, apiKey){
    // stabil model: gemini-1.5-flash (generateContent endpoint)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

    const prompt = `
Kullanıcının e-ticaret araması için yazdığı ürünü daha doğru arama anahtar kelimesine çevir.
Kurallar:
- Sadece tek satır çıktı ver.
- Marka + model + kapasite/renk gibi bilgileri koru.
- Gereksiz kelimeleri çıkar.
- Türkçe karakterleri koru.
Girdi: "${query}"
Çıktı:
`.trim();

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 60 }
    };

    const res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if(!res.ok){
      const msg = data?.error?.message || "Gemini hata verdi.";
      throw new Error(msg);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return text.trim().replace(/\s+/g," ");
  }

  btnAIRun.addEventListener("click", async ()=>{
    const key = (geminiKey.value||"").trim();
    const q = (qInput.value||"").trim();

    if(!q){
      aiStatus.textContent = "Önce ürün adını yaz.";
      return;
    }
    if(!key){
      aiStatus.textContent = "Gemini API Key gir.";
      openPanel();
      return;
    }

    localStorage.setItem(LS.GEMINI_KEY, key);

    try{
      btnAIRun.disabled = true;
      aiStatus.textContent = "AI düzeltiyor…";
      const fixed = await geminiFixQuery(q, key);
      if(!fixed){
        aiStatus.textContent = "Boş sonuç. Tekrar dene.";
        return;
      }
      qInput.value = fixed;
      aiStatus.textContent = `✅ Düzeltildi: ${fixed}`;

      // İstersen otomatik satır oluştursun:
      // btnSearch.click();
    }catch(e){
      aiStatus.textContent = "Hata: " + (e?.message || e);
    }finally{
      btnAIRun.disabled = false;
    }
  });
})();

// ---------- Init ----------
initAuthUI();
renderSearchRows();
renderFavs();

// Bildirim demo
$("btnNotify").addEventListener("click", ()=>{
  alert("Demo: %5+ düşüş bildirimi için fiyat geçmişi lazım. (Şu an sadece yerel takip)");
});
$("btnAISettings").addEventListener("click", ()=>{
  // Aynı AI paneli aç/kapa
  $("btnAI").click();
});
