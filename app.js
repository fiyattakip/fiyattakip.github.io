
// app.js — stable: link-only search + favs + graphs + AI settings + camera + auth gate (no broken imports)

import { auth, googleProvider, firebaseConfigLooksInvalid } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, addDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore();

const $ = (id) => document.getElementById(id);

const SITES = [
  { key:"trendyol", name:"Trendyol", build:q=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", build:q=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11", name:"N11", build:q=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazontr", name:"Amazon TR", build:q=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"pazarama", name:"Pazarama", build:q=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:q=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key:"idefix", name:"İdefix", build:q=>`https://www.idefix.com/search?q=${encodeURIComponent(q)}` },
];

const PAGE_SIZE = 10;
const pageState = { normal: 1, favs: 1, graph: 1 };

function toast(msg){
  try { alert(msg); } catch { /* noop */ }
}

function paginate(items, page, pageSize=PAGE_SIZE){
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  const start = (p - 1) * pageSize;
  return { page: p, totalPages, slice: items.slice(start, start + pageSize), total };
}

function renderPager(pagerEl, page, totalPages, onGo){
  if (!pagerEl) return;
  if (totalPages <= 1){ pagerEl.innerHTML=""; return; }
  const mk = (label, p, disabled=false, active=false) => {
    const b=document.createElement("button");
    b.type="button";
    b.className="pgBtn"+(active?" active":"");
    b.textContent=label;
    b.disabled=disabled;
    b.addEventListener("click", ()=>onGo(p));
    return b;
  };
  pagerEl.innerHTML="";
  pagerEl.appendChild(mk("‹", page-1, page<=1));
  const windowSize=5;
  let s=Math.max(1, page-Math.floor(windowSize/2));
  let e=Math.min(totalPages, s+windowSize-1);
  s=Math.max(1, e-windowSize+1);
  if (s>1){
    pagerEl.appendChild(mk("1",1,false,page===1));
    if (s>2){ const sp=document.createElement("span"); sp.className="pgInfo"; sp.textContent="…"; pagerEl.appendChild(sp); }
  }
  for (let p=s;p<=e;p++) pagerEl.appendChild(mk(String(p),p,false,page===p));
  if (e<totalPages){
    if (e<totalPages-1){ const sp=document.createElement("span"); sp.className="pgInfo"; sp.textContent="…"; pagerEl.appendChild(sp); }
    pagerEl.appendChild(mk(String(totalPages),totalPages,false,page===totalPages));
  }
  pagerEl.appendChild(mk("›", page+1, page>=totalPages));
}

function showLogin(force=true){
  const m=$("loginModal");
  if (!m) return;
  m.classList.add("show");
  m.style.display="flex";
  m.style.pointerEvents="auto";
  m.setAttribute("aria-hidden","false");
  // gate app
  const app=$("app");
  if (app){ app.style.display="none"; }
  // close disabled if force
  const closeBtn=$("closeLogin");
  if (closeBtn){
    closeBtn.disabled = !!force;
    closeBtn.style.opacity = force ? "0.4" : "1";
  }
  const back=$("loginBackdrop");
  if (back){
    back.onclick = force ? (e)=>e.preventDefault() : ()=>hideLogin();
  }
  if (closeBtn){
    closeBtn.onclick = force ? (e)=>e.preventDefault() : ()=>hideLogin();
  }
}

function hideLogin(){
  const m=$("loginModal");
  if (!m) return;
  m.classList.remove("show");
  m.style.display="none";
  m.style.pointerEvents="none";
  m.setAttribute("aria-hidden","true");
  const app=$("app");
  if (app){ app.style.display="block"; }
}

let currentUser = null;
let favCache = []; // array of {id, siteKey, siteName, query, url, history:[]}

async function loadFavorites(){
  if (!currentUser) { favCache=[]; return; }
  const col = collection(db, "users", currentUser.uid, "favorites");
  const snap = await getDocs(col);
  favCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
}

async function toggleFavorite(siteKey, siteName, query, url){
  if (!currentUser){ toast("Favori için giriş yap."); return; }
  const existing = favCache.find(f=>f.siteKey===siteKey && f.query===query);
  if (existing){
    await deleteDoc(doc(db, "users", currentUser.uid, "favorites", existing.id));
  } else {
    await addDoc(collection(db, "users", currentUser.uid, "favorites"), {
      siteKey, siteName, query, url,
      createdAt: Date.now(),
      history: []
    });
  }
}

function isFav(siteKey, query){
  return !!favCache.find(f=>f.siteKey===siteKey && f.query===query);
}

function applyFavUI(){
  document.querySelectorAll("[data-fav-key]").forEach(btn=>{
    const siteKey=btn.getAttribute("data-fav-key");
    const query=btn.getAttribute("data-fav-q");
    const fav=isFav(siteKey, query);
    btn.classList.toggle("isFav", fav);
    btn.textContent = fav ? "❤️ Favoride" : "🤍 Favori";
  });
}

function renderSiteList(container, query){
  const pager=$("normalPager");
  const q=String(query||"").trim();
  const { page, totalPages, slice } = paginate(SITES, pageState.normal);
  pageState.normal = page;

  container.innerHTML="";
  if (!q){
    container.innerHTML = `<div class="empty">Arama kelimesi gir.</div>`;
    if (pager) pager.innerHTML="";
    return;
  }

  for (const s of slice){
    const url=s.build(q);
    const card=document.createElement("div");
    card.className="cardBox";
    card.innerHTML=`
      <div class="rowLine">
        <div>
          <div class="ttl">${s.name}</div>
          <div class="sub">${q}</div>
        </div>
        <div class="actions">
          <button class="btnPrimary sm btnOpen" type="button">Aç</button>
          <button class="btnGhost sm btnFav" type="button" data-fav-key="${s.key}" data-fav-q="${q}">🤍 Favori</button>
        </div>
      </div>
      <div class="mini">${url}</div>
    `;
    card.querySelector(".btnOpen").onclick = ()=>window.open(url,"_blank","noopener");
    card.querySelector(".btnFav").onclick = async ()=>{
      await toggleFavorite(s.key, s.name, q, url);
      await loadFavorites();
      applyFavUI();
    };
    container.appendChild(card);
  }

  renderPager(pager, pageState.normal, totalPages, (p)=>{ pageState.normal=p; renderSiteList(container,q); });
  applyFavUI();
}

function renderFavorites(){
  const list=$("favList"); const pager=$("favPager");
  const { page, totalPages, slice } = paginate(favCache, pageState.favs);
  pageState.favs=page;
  list.innerHTML="";
  if (!slice.length){
    list.innerHTML=`<div class="empty">Favori yok.</div>`;
    if (pager) pager.innerHTML="";
    return;
  }
  for (const it of slice){
    const card=document.createElement("div");
    card.className="cardBox";
    card.innerHTML=`
      <div class="rowLine">
        <div>
          <div class="ttl">${it.siteName||""}</div>
          <div class="sub">${it.query||""}</div>
        </div>
        <div class="actions">
          <button class="btnPrimary sm btnOpen" type="button">Aç</button>
          <button class="btnGhost sm btnFav" type="button" data-fav-key="${it.siteKey}" data-fav-q="${it.query}">❤️ Favoride</button>
        </div>
      </div>
      <div class="mini">${it.url||""}</div>
    `;
    card.querySelector(".btnOpen").onclick=()=>it.url && window.open(it.url,"_blank","noopener");
    card.querySelector(".btnFav").onclick=async ()=>{
      await toggleFavorite(it.siteKey, it.siteName, it.query, it.url);
      await loadFavorites();
      renderFavorites();
      applyFavUI();
    };
    list.appendChild(card);
  }
  renderPager(pager, pageState.favs, totalPages, (p)=>{ pageState.favs=p; renderFavorites(); });
  applyFavUI();
}

function fmtPrice(x){
  if (x==null || !isFinite(Number(x))) return "—";
  const n=Number(x);
  return n.toLocaleString("tr-TR",{maximumFractionDigits:2})+" TL";
}

function makeSparkline(hist){
  const arr=(hist||[]).map(h=>Number(h.p)).filter(n=>isFinite(n));
  if (arr.length<2) return "";
  const min=Math.min(...arr), max=Math.max(...arr);
  const w=80, h=22;
  const pts=arr.map((v,i)=>{
    const x=i*(w/(arr.length-1));
    const y=h-(max===min? h/2 : ((v-min)/(max-min))*h);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts}"/></svg>`;
}

async function addPricePoint(favId, price){
  const idx=favCache.findIndex(x=>x.id===favId);
  if (idx<0) return;
  const it=favCache[idx];
  const hist=Array.isArray(it.history)? it.history.slice(): [];
  hist.push({ t: Date.now(), p: price });
  await updateDoc(doc(db, "users", currentUser.uid, "favorites", favId), { history: hist, lastPrice: price, updatedAt: Date.now() });
}

function renderGraphs(){
  const root=$("graphRoot"); const pager=$("graphPager");
  const items=favCache.filter(f=>Array.isArray(f.history) && f.history.length);
  const { page, totalPages, slice } = paginate(items, pageState.graph);
  pageState.graph=page;

  root.innerHTML="";
  if (!slice.length){
    root.innerHTML=`<div class="empty">Grafik yok. Favorilerde fiyat ekleyince görünür.</div>`;
    if (pager) pager.innerHTML="";
    return;
  }
  for (const it of slice){
    const hist=Array.isArray(it.history)? it.history: [];
    const prices=hist.map(h=>Number(h.p)).filter(n=>isFinite(n));
    const min=prices.length? Math.min(...prices): null;
    const max=prices.length? Math.max(...prices): null;
    const last=prices.length? prices[prices.length-1]: null;

    const card=document.createElement("div");
    card.className="cardBox";
    card.innerHTML=`
      <div class="rowLine">
        <div>
          <div class="ttl">${it.siteName||""}</div>
          <div class="sub">${it.query||""}</div>
        </div>
        <div class="actions">
          <button class="btnGhost sm btnAdd" type="button">Fiyat Ekle</button>
        </div>
      </div>
      <div class="rowBetween">
        <div class="mini">Min: <b>${fmtPrice(min)}</b> • Max: <b>${fmtPrice(max)}</b> • Son: <b>${fmtPrice(last)}</b></div>
        <div class="spark">${makeSparkline(hist)}</div>
      </div>
    `;
    card.querySelector(".btnAdd").onclick=async ()=>{
      const v=prompt("Yeni fiyat (TL):", it.lastPrice ?? "");
      if (!v) return;
      const n=Number(String(v).replace(",", "."));
      if (!isFinite(n) || n<=0) return toast("Geçerli fiyat gir.");
      await addPricePoint(it.id, n);
      await loadFavorites();
      renderGraphs();
    };
    root.appendChild(card);
  }
  renderPager(pager, pageState.graph, totalPages, (p)=>{ pageState.graph=p; renderGraphs(); });
}

// ---------- Tabs ----------
function showPage(key){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  const el = $(`page-${key}`);
  if (el) el.classList.remove("hidden");
  document.querySelectorAll(".tabbar .tab").forEach(b=>b.classList.toggle("active", b.dataset.page===key));
}
document.querySelectorAll(".tabbar .tab").forEach(b=>{
  b.addEventListener("click", ()=>showPage(b.dataset.page));
});

// ---------- AI settings (local) ----------
const AI_KEY_STORAGE="ft_ai_key";
const AI_PIN_STORAGE="ft_ai_pin";

function openAiSettings(){
  const m=$("aiModal");
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
  $("aiKey").value = localStorage.getItem(AI_KEY_STORAGE) || "";
  $("aiPin").value = localStorage.getItem(AI_PIN_STORAGE) || "";
}
function closeAiSettings(){
  const m=$("aiModal");
  m.classList.remove("show");
  m.setAttribute("aria-hidden","true");
}
$("btnAiSettings")?.addEventListener("click", openAiSettings);
$("aiClose")?.addEventListener("click", closeAiSettings);
$("aiBackdrop")?.addEventListener("click", closeAiSettings);

$("aiSave")?.addEventListener("click", ()=>{
  const key=$("aiKey").value.trim();
  const pin=$("aiPin").value.trim();
  localStorage.setItem(AI_KEY_STORAGE, key);
  localStorage.setItem(AI_PIN_STORAGE, pin);
  toast("AI ayarları kaydedildi.");
});

async function testGemini(){
  const key = (localStorage.getItem(AI_KEY_STORAGE)||"").trim();
  if (!key) { toast("Key gir."); return; }
  try{
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ contents:[{ parts:[{ text:"ping" }] }] })
    });
    if (!res.ok){
      const t=await res.text();
      throw new Error(`${res.status} ${t.slice(0,200)}`);
    }
    toast("Test OK ✅");
  }catch(e){
    console.error(e);
    toast("Test FAIL ❌");
  }
}
$("aiTest")?.addEventListener("click", testGemini);
$("aiClear")?.addEventListener("click", ()=>{
  localStorage.removeItem(AI_KEY_STORAGE);
  localStorage.removeItem(AI_PIN_STORAGE);
  $("aiKey").value=""; $("aiPin").value="";
  toast("AI ayarları silindi.");
});

// ---------- Camera (simple) ----------
$("fabCamera")?.addEventListener("click", async ()=>{
  // open camera overlay in ai.js if exists; here keep simple: prompt
  toast("Kamera özelliği bu sürümde basit. (Gelişmiş AI Kamera için sonraki paket)");
});

// ---------- Auth ----------
async function initAuth(){
  if (firebaseConfigLooksInvalid()){
    showLogin(true);
    toast("Firebase config eksik/hatalı.");
    return;
  }
  await setPersistence(auth, browserLocalPersistence);

  // Redirect result (mobile)
  try { await getRedirectResult(auth); } catch {}

  onAuthStateChanged(auth, async (user)=>{
    currentUser = user || null;
    if (!user){
      showLogin(true);
      return;
    }
    hideLogin();
    await loadFavorites();
    // render current views
    renderSiteList($("normalList"), $("q")?.value || "");
    renderFavorites();
    renderGraphs();
  });
}

$("btnLogin")?.addEventListener("click", async ()=>{
  const email=$("email").value.trim();
  const pass=$("pass").value;
  if (!email || !pass) return toast("Email ve şifre gir.");
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    console.error(e);
    toast("Giriş başarısız.");
  }
});

$("btnRegister")?.addEventListener("click", async ()=>{
  const email=$("email").value.trim();
  const pass=$("pass").value;
  if (!email || !pass) return toast("Email ve şifre gir.");
  try{
    await createUserWithEmailAndPassword(auth, email, pass);
    toast("Kayıt başarılı ✅");
  }catch(e){
    console.error(e);
    toast("Kayıt başarısız.");
  }
});

$("btnGoogle")?.addEventListener("click", async ()=>{
  try{
    // try popup first
    await signInWithPopup(auth, googleProvider);
  }catch(e){
    // fallback to redirect (mobile/popup blocked)
    try { await signInWithRedirect(auth, googleProvider); }
    catch(err){ console.error(err); toast("Google giriş başarısız."); }
  }
});

$("logoutBtn")?.addEventListener("click", async ()=>{
  await signOut(auth);
});

$("btnClearSearch")?.addEventListener("click", ()=>{
  const qEl=$("q");
  if (qEl) qEl.value="";
  renderSiteList($("normalList"), "");
});

// Search trigger
$("btnSearch")?.addEventListener("click", ()=>{
  if (!currentUser) return showLogin(true);
  const q=$("q").value||"";
  pageState.normal=1;
  renderSiteList($("normalList"), q);
});

$("btnFavRefresh")?.addEventListener("click", async ()=>{
  await loadFavorites();
  renderFavorites();
  applyFavUI();
});
$("btnGraphRefresh")?.addEventListener("click", async ()=>{
  await loadFavorites();
  renderGraphs();
});

initAuth();
