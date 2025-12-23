import { watchAuth, loginEmailPass, loginGoogle, logout, upsertUser, listFavorites, saveFavorite, patchFavorite, removeFavorite } from "./firebase.js";
import { hasAIConfig, saveAIConfigEncrypted, clearAIConfig, getDecryptedApiKey, geminiGenerateText, geminiExtractTextFromImage, setSessionPin } from "./ai.js";

// --- Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

// --- Sites
const SITES = [
  { key:"trendyol", name:"Trendyol", searchUrl:q=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", searchUrl:q=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11", name:"N11", searchUrl:q=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazontr", name:"Amazon TR", searchUrl:q=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"idefix", name:"idefix", searchUrl:q=>`https://www.idefix.com/search?q=${encodeURIComponent(q)}` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", searchUrl:q=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` }
];

let currentUser = null;
let favCache = [];

// --- UI refs
const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginErr = document.getElementById("loginErr");

const btnLogin = document.getElementById("btnLogin");
const btnGoogle = document.getElementById("btnGoogle");
const btnLogout = document.getElementById("btnLogout");
const btnClearCacheLogin = document.getElementById("btnClearCacheLogin");

const qNormal = document.getElementById("qNormal");
const btnNormalSearch = document.getElementById("btnNormalSearch");
const normalResults = document.getElementById("normalResults");

const qAI = document.getElementById("qAI");
const btnAISearch = document.getElementById("btnAISearch");
const aiStatus = document.getElementById("aiStatus");
const aiResults = document.getElementById("aiResults");

const imgFile = document.getElementById("imgFile");
const btnExtract = document.getElementById("btnExtract");
const imgPreview = document.getElementById("imgPreview");
const extractedText = document.getElementById("extractedText");
const btnGoogleSearchText = document.getElementById("btnGoogleSearchText");
const btnLens = document.getElementById("btnLens");
const visualErr = document.getElementById("visualErr");

const favList = document.getElementById("favList");
const favEmpty = document.getElementById("favEmpty");
const favSort = document.getElementById("favSort");
const btnRefreshFav = document.getElementById("btnRefreshFav");
const btnClearLocal = document.getElementById("btnClearLocal");

// AI modal
const btnOpenAISettings = document.getElementById("btnOpenAISettings");
const aiModal = document.getElementById("aiModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const btnCloseModal = document.getElementById("btnCloseModal");
const aiKey = document.getElementById("aiKey");
const aiPin = document.getElementById("aiPin");
const rememberPin = document.getElementById("rememberPin");
const btnSaveAI = document.getElementById("btnSaveAI");
const btnClearAI = document.getElementById("btnClearAI");
const aiCfgErr = document.getElementById("aiCfgErr");

// Tabs
document.querySelectorAll(".seg").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".seg").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    ["normal","ai","visual"].forEach(t=>{
      document.getElementById(`tab-${t}`).classList.toggle("hidden", t!==tab);
    });
  });
});

// --- Login
btnLogin.addEventListener("click", async ()=>{
  try{
    showErr(loginErr, "");
    const email = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPass").value.trim();
    await loginEmailPass(email, pass);
  }catch(e){
    showErr(loginErr, String(e?.message||e));
  }
});

btnGoogle.addEventListener("click", async ()=>{
  try{
    showErr(loginErr, "");
    await loginGoogle();
  }catch(e){
    showErr(loginErr, String(e?.message||e));
  }
});

btnLogout.addEventListener("click", async ()=>{
  await logout();
});

btnClearCacheLogin.addEventListener("click", async ()=>{
  await clearAllCachesAndSW();
  alert("Önbellek temizlendi. Sayfa yenileniyor…");
  location.reload();
});

// --- Auth watcher
watchAuth(async (u)=>{
  currentUser = u || null;
  if(!u){
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
    btnLogout.classList.add("hidden");
    return;
  }
  btnLogout.classList.remove("hidden");
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  await upsertUser(u.uid);
  await loadFavorites();
});

// --- Normal search
btnNormalSearch.addEventListener("click", ()=> runNormalSearch(qNormal.value));
qNormal.addEventListener("keydown", (e)=>{ if(e.key==="Enter") runNormalSearch(qNormal.value); });

function runNormalSearch(query){
  const q = (query||"").trim();
  if(!q) return;

  normalResults.innerHTML = "";
  SITES.forEach(site=>{
    const el = renderSearchCard({
      title: site.name,
      subtitle: q,
      body: "Bu sitede aramak için “Ara”. İstersen favoriye ekleyip otomatik takip edebilirsin.",
      siteKey: site.key,
      siteName: site.name,
      query: q
    });
    normalResults.appendChild(el);
  });
}

// --- AI search
btnAISearch.addEventListener("click", ()=> runAISearch(qAI.value));
qAI.addEventListener("keydown",(e)=>{ if(e.key==="Enter") runAISearch(qAI.value); });

async function runAISearch(query){
  const q = (query||"").trim();
  if(!q) return;

  aiStatus.textContent = "";
  aiResults.innerHTML = "";
  showErr(aiCfgErr, "");

  try{
    // PIN yoksa kullanıcı modalden kaydettiğinde sessionPin setleniyor.
    const apiKey = await getDecryptedApiKey();

    aiStatus.textContent = "AI düşünüyor…";
    const system = "Sen e-ticaret araması asistanısın. Her site için kısa ve net arama ifadesi üret. Ayrıca 1 cümlelik öneri yaz. JSON döndür.";
    const prompt = `
Kullanıcı araması: "${q}"
Siteler: ${SITES.map(s=>s.name).join(", ")}
ÇIKTI FORMAT:
{
 "items":[
  {"siteKey":"trendyol","query":"...","note":"..."},
  ...
 ]
}
Sadece JSON döndür.`;
    const text = await geminiGenerateText({ apiKey, prompt, system });

    let data;
    try{ data = JSON.parse(extractJson(text)); }catch{ data = null; }
    const items = data?.items || [];

    if(!items.length){
      aiStatus.textContent = "AI sonuç üretemedi.";
      return;
    }

    aiStatus.textContent = "";
    items.forEach(it=>{
      const site = SITES.find(s=>s.key===it.siteKey) || SITES[0];
      const el = renderSearchCard({
        title: site.name,
        subtitle: it.query || q,
        body: it.note || "Öneri üretilmedi.",
        siteKey: site.key,
        siteName: site.name,
        query: it.query || q
      });
      aiResults.appendChild(el);
    });

  }catch(e){
    aiStatus.textContent = "";
    const msg = String(e?.message||e);
    aiResults.innerHTML = `<div class="err">Hata: ${escapeHtml(msg)}</div>`;
  }
}

// --- Visual
imgFile.addEventListener("change", ()=>{
  const f = imgFile.files?.[0];
  if(!f) return;
  const url = URL.createObjectURL(f);
  imgPreview.src = url;
  imgPreview.style.display = "block";
  hideErr(visualErr);
});

btnExtract.addEventListener("click", async ()=>{
  hideErr(visualErr);
  extractedText.value = "";
  btnGoogleSearchText.disabled = true;

  try{
    const f = imgFile.files?.[0];
    if(!f) throw new Error("Görsel seç.");
    const apiKey = await getDecryptedApiKey();
    const text = await geminiExtractTextFromImage({ apiKey, file:f });

    if(!text){
      throw new Error("Görsel bulunamadı / metin çıkarılamadı.");
    }

    extractedText.value = text;
    btnGoogleSearchText.disabled = false;

    // otomatik google shopping araması
    openGoogleShopping(text);

  }catch(e){
    showErr(visualErr, String(e?.message||e));
  }
});

btnGoogleSearchText.addEventListener("click", ()=>{
  const t = (extractedText.value||"").trim();
  if(!t) return;
  openGoogleShopping(t);
});

btnLens.addEventListener("click", ()=>{
  // Direkt upload URL'i tarayıcıda file göndermek kolay değil. Lens'i açıp manuel yükleme:
  window.open("https://lens.google.com/", "_blank", "noopener,noreferrer");
});

// --- Favorites
btnRefreshFav.addEventListener("click", loadFavorites);
favSort.addEventListener("change", renderFavorites);

btnClearLocal.addEventListener("click", async ()=>{
  await clearAllCachesAndSW(false); // localStorage'ı tamamen silmesin
  alert("Cache temizlendi.");
});

// --- AI Modal
btnOpenAISettings.addEventListener("click", openModal);
btnCloseModal.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);

btnSaveAI.addEventListener("click", async ()=>{
  try{
    hideErr(aiCfgErr);
    const key = aiKey.value.trim();
    const pin = aiPin.value.trim();
    const remember = !!rememberPin.checked;
    await saveAIConfigEncrypted({ apiKey:key, pin, rememberPin:remember });

    // session pin set:
    setSessionPin(pin);

    // ✅ Kaydet → otomatik kapan
    closeModal();
    alert("AI key kaydedildi.");
  }catch(e){
    showErr(aiCfgErr, String(e?.message||e));
  }
});

btnClearAI.addEventListener("click", ()=>{
  clearAIConfig();
  aiKey.value = "";
  aiPin.value = "";
  rememberPin.checked = false;
  alert("AI key silindi.");
});

// --- helpers render
function renderSearchCard({ title, subtitle, body, siteKey, siteName, query }){
  const wrap = document.createElement("div");
  wrap.className = "item";
  wrap.innerHTML = `
    <div class="itemHead">
      <div>
        <div class="itemTitle">${escapeHtml(title)}</div>
        <div class="muted small">${escapeHtml(subtitle)}</div>
      </div>
      <div class="badge">${escapeHtml(siteName)}</div>
    </div>
    <div class="itemBody">${escapeHtml(body)}</div>
    <div class="itemActions">
      <button class="pill warn" data-act="search">Ara</button>
      <button class="pill" data-act="fav">Favoriye ekle</button>
    </div>
  `;
  wrap.querySelector('[data-act="search"]').addEventListener("click", ()=>{
    const site = SITES.find(s=>s.key===siteKey);
    safeOpen(site?.searchUrl(query) || "");
  });
  wrap.querySelector('[data-act="fav"]').addEventListener("click", async ()=>{
    if(!currentUser) return alert("Önce giriş yap.");
    const favId = makeFavId(siteKey, query);
    await saveFavorite(currentUser.uid, favId, {
      siteKey,
      siteName,
      query,
      createdAtClient: Date.now(),
      lastPrice: null,
      lastStatus: "OK",
      lastCheckedAt: null,
      aiComment: "",
      aiCommentAt: null,
      url: (SITES.find(s=>s.key===siteKey)?.searchUrl(query)) || ""
    });
    await loadFavorites();
    alert("Favoriye eklendi.");
  });
  return wrap;
}

function renderFavoriteItem(item){
  const wrap = document.createElement("div");
  wrap.className = "item";

  const priceTxt = item.lastPrice ? formatTry(item.lastPrice) : "Fiyat yok";
  const st = item.lastStatus || "OK";
  const statusPill = st === "OK"
    ? `<span class="pill ok">OK</span>`
    : `<span class="pill danger">${escapeHtml(st)}</span>`;

  wrap.innerHTML = `
    <div class="itemHead">
      <div>
        <div class="itemTitle">${escapeHtml(item.query || "—")}</div>
        <div class="muted small">${escapeHtml(item.siteName || item.siteKey)} • Son kontrol: ${escapeHtml(item.lastCheckedAt || "—")}</div>
      </div>
      <div class="badge">${priceTxt}</div>
    </div>

    <div class="itemActions">
      <button class="pill" data-act="open">Siteyi Aç</button>
      <button class="pill" data-act="copy">Copy Link</button>
      <button class="pill warn" data-act="retry">Tekrar dene şimdi</button>
      <button class="pill" data-act="aiComment">AI Yorum</button>
      <button class="pill danger" data-act="del">Sil</button>
      ${statusPill}
    </div>

    <div class="itemBody">
      ${item.aiComment ? `<b>AI:</b> ${escapeHtml(item.aiComment)}<div class="muted small">Güncellendi: ${escapeHtml(item.aiCommentAt||"")}</div>` : `<span class="muted">AI yorumu yok.</span>`}
    </div>
  `;

  wrap.querySelector('[data-act="open"]').addEventListener("click", ()=>{
    const url = item.url || (SITES.find(s=>s.key===item.siteKey)?.searchUrl(item.query)) || "";
    safeOpen(url);
  });

  wrap.querySelector('[data-act="copy"]').addEventListener("click", async ()=>{
    const url = item.url || (SITES.find(s=>s.key===item.siteKey)?.searchUrl(item.query)) || "";
    await navigator.clipboard.writeText(url);
    alert("Kopyalandı.");
  });

  wrap.querySelector('[data-act="retry"]').addEventListener("click", async ()=>{
    // Frontend CORS yüzünden fiyat çekemez; ama kullanıcı siteyi açıp captcha vs geçebilir.
    const url = item.url || (SITES.find(s=>s.key===item.siteKey)?.searchUrl(item.query)) || "";
    safeOpen(url);
  });

  wrap.querySelector('[data-act="aiComment"]').addEventListener("click", async ()=>{
    try{
      const apiKey = await getDecryptedApiKey();
      const prompt = `
Ürün: ${item.query}
Site: ${item.siteName || item.siteKey}
Fiyat: ${item.lastPrice ? item.lastPrice + " TL" : "Bilinmiyor"}
Kısa 2-3 cümle yorum yaz: güven, fiyat mantığı, alternatif öneri.
      `.trim();
      const txt = await geminiGenerateText({ apiKey, prompt, system:"Kısa ve net Türkçe yaz." });
      await patchFavorite(currentUser.uid, item.id, {
        aiComment: txt,
        aiCommentAt: new Date().toLocaleString("tr-TR")
      });
      await loadFavorites();
    }catch(e){
      alert("AI Yorum hatası: " + String(e?.message||e));
    }
  });

  wrap.querySelector('[data-act="del"]').addEventListener("click", async ()=>{
    if(!confirm("Silinsin mi?")) return;
    await removeFavorite(currentUser.uid, item.id);
    await loadFavorites();
  });

  return wrap;
}

async function loadFavorites(){
  if(!currentUser) return;
  favCache = await listFavorites(currentUser.uid);
  renderFavorites();
}

function renderFavorites(){
  favList.innerHTML = "";
  const items = [...favCache];

  const mode = favSort.value;
  if(mode==="newest") items.sort((a,b)=> (b.createdAtClient||0)-(a.createdAtClient||0));
  if(mode==="priceAsc") items.sort((a,b)=> (Number(a.lastPrice||1e18)-Number(b.lastPrice||1e18)));
  if(mode==="priceDesc") items.sort((a,b)=> (Number(b.lastPrice||0)-Number(a.lastPrice||0)));
  // relevance: varsayılan → karışma

  favEmpty.classList.toggle("hidden", items.length>0);
  items.forEach(it=> favList.appendChild(renderFavoriteItem(it)));
}

// --- Modal
function openModal(){
  modalBackdrop.classList.remove("hidden");
  aiModal.classList.remove("hidden");
}
function closeModal(){
  modalBackdrop.classList.add("hidden");
  aiModal.classList.add("hidden");
  hideErr(aiCfgErr);
}

// --- Cache clear
async function clearAllCachesAndSW(clearLocalStorage=true){
  try{
    if("caches" in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
    if("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
    if(clearLocalStorage){
      localStorage.clear();
      sessionStorage.clear();
    }
  }catch{}
}

// --- misc
function openGoogleShopping(text){
  const q = encodeURIComponent(text);
  // shopping intent:
  safeOpen(`https://www.google.com/search?tbm=shop&q=${q}`);
}
function safeOpen(url){
  if(!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
function makeFavId(siteKey, query){
  return `${siteKey}_${hash(query)}`;
}
function hash(s){
  let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; }
  return String(Math.abs(h));
}
function formatTry(n){
  try{
    return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:0}).format(Number(n));
  }catch{ return `${n} TL`; }
}
function showErr(el,msg){
  if(!msg){ el.classList.add("hidden"); el.textContent=""; return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}
function hideErr(el){ showErr(el,""); }
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function extractJson(text){
  // Gemini bazen ```json ... ``` dönebilir
  const t = String(text||"").trim();
  const m = t.match(/\{[\s\S]*\}$/);
  if(m) return m[0];
  return t;
}
