// app.js (module) — Login gate + Normal/AI search + Favorites (tema bozulmadan)
import { auth, googleProvider, firebaseConfigLooksInvalid } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signOut } 
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { aiConfigured, geminiText, geminiVision, saveGeminiKey, setSessionPin, clearSessionPin } from "./ai.js";

const $ = (id) => document.getElementById(id);
const el = (sel, root=document) => root.querySelector(sel);

function showToast(msg){
  // basit toast (tema uyumlu)
  let t = $("toast");
  if (!t){
    t = document.createElement("div");
    t.id = "toast";
    t.style.position = "fixed";
    t.style.left = "50%";
    t.style.bottom = "86px";
    t.style.transform = "translateX(-50%)";
    t.style.maxWidth = "92vw";
    t.style.padding = "10px 12px";
    t.style.borderRadius = "14px";
    t.style.background = "rgba(0,0,0,.72)";
    t.style.border = "1px solid rgba(255,255,255,.18)";
    t.style.backdropFilter = "blur(12px)";
    t.style.color = "#fff";
    t.style.fontSize = "13px";
    t.style.opacity = "0";
    t.style.transition = "opacity .2s ease, transform .2s ease";
    t.style.zIndex = "9999";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  t.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(()=>{ t.style.opacity="0"; t.style.transform="translateX(-50%) translateY(6px)"; }, 2200);
}

function lockApp(locked){
  document.body.classList.toggle("locked", !!locked);
}

function openLogin(){
  const m = $("loginModal");
  if (!m) return;
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
}
function closeLogin(){
  const m = $("loginModal");
  if (!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden","true");
}

function go(pageId){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const p = $(pageId);
  if (p) p.classList.add("active");
}

let mode = "normal"; // normal | ai
function setMode(next){
  mode = next;
  $("modeNormal")?.classList.toggle("active", next==="normal");
  $("modeAI")?.classList.toggle("active", next==="ai");
  $("modeHint")?.textContent = next==="ai"
    ? "AI arama: sorguyu düzeltir, daha iyi sonuç bulmaya çalışır."
    : "Normal arama: sitelerde direkt arar.";
}

function safeText(s){ return (s||"").toString().replace(/\s+/g," ").trim(); }

function uniqBy(arr, keyFn){
  const seen = new Set();
  const out = [];
  for (const x of arr){
    const k = keyFn(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

async function fetchTrendyolResults(q){
  // CORS için r.jina.ai proxy (HTML düz metin döndürür)
  const target = `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}`;
  const url = `https://r.jina.ai/http://${target.replace(/^https?:\/\//,"")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Arama isteği başarısız.");
  const html = await res.text();

  // href="...-p-..." pattern
  const hrefs = [...html.matchAll(/href="(\/[^"]*-p-\d+[^"]*)"/g)].map(m=>m[1]);
  const titles = [...html.matchAll(/title="([^"]{5,140})"/g)].map(m=>m[1]);

  // görsel
  const imgs = [...html.matchAll(/src="(https:\/\/cdn\.dsmcdn\.com\/[^"]+)"/g)].map(m=>m[1]);

  // fiyat: çok değişken; en azından TL geçenleri yakalamaya çalış
  const prices = [...html.matchAll(/([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?)\s*TL/g)].map(m=>m[1] + " TL");

  const items = [];
  for (let i=0;i<Math.min(hrefs.length, 60);i++){
    items.push({
      url: "https://www.trendyol.com" + hrefs[i],
      title: safeText(titles[i] || ""),
      img: imgs[i] || "",
      price: prices[i] || ""
    });
  }
  // başlık boş olanları temizle
  const cleaned = items.filter(it=>it.url && (it.title || it.img));
  return uniqBy(cleaned, x=>x.url).slice(0, 25);
}

function renderResults(items){
  const list = $("normalList");
  if (!list) return;
  list.innerHTML = "";
  if (!items.length){
    list.innerHTML = `<div class="empty">Sonuç bulunamadı.</div>`;
    return;
  }
  for (const it of items){
    const card = document.createElement("div");
    card.className = "item";
    card.innerHTML = `
      <div class="itemLeft">
        <div class="thumb">${it.img ? `<img alt="" src="${it.img}" />` : "🛒"}</div>
        <div class="meta">
          <div class="t">${escapeHtml(it.title || "Ürün")}</div>
          <div class="s">${escapeHtml(it.price || "Fiyat: —")} • Trendyol</div>
        </div>
      </div>
      <div class="itemRight">
        <button class="miniBtn" data-act="open">Aç</button>
        <button class="miniBtn" data-act="fav">♡</button>
      </div>
    `;
    card.querySelector('[data-act="open"]')?.addEventListener("click", ()=> window.open(it.url, "_blank"));
    card.querySelector('[data-act="fav"]')?.addEventListener("click", async ()=>{
      if (!auth.currentUser){ showToast("Favori için giriş yapmalısın."); openLogin(); return; }
      await addFavorite(it);
      showToast("Favorilere eklendi.");
    });
    list.appendChild(card);
  }
}

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- Favorites (localStorage per user) ----------
function favKey(){
  const u = auth.currentUser;
  return u ? `fiyattakip_favs_${u.uid}` : `fiyattakip_favs_guest`;
}
function loadFavs(){
  try{ return JSON.parse(localStorage.getItem(favKey()) || "[]"); }catch{ return []; }
}
function saveFavs(list){
  localStorage.setItem(favKey(), JSON.stringify(list));
}
async function addFavorite(item){
  const list = loadFavs();
  if (list.some(x=>x.url===item.url)) return;
  list.unshift({
    url: item.url,
    title: item.title || "Ürün",
    img: item.img || "",
    site: "Trendyol",
    createdAt: Date.now(),
    history: item.price ? [{ t: Date.now(), p: item.price }] : []
  });
  saveFavs(list);
  renderFavorites();
}
async function removeFavorite(url){
  const list = loadFavs().filter(x=>x.url!==url);
  saveFavs(list);
  renderFavorites();
}

function renderFavorites(){
  const box = $("favList");
  if (!box) return;
  const u = auth.currentUser;
  if (!u){
    box.innerHTML = `<div class="empty">Favoriler için giriş yap.</div>`;
    return;
  }
  const list = loadFavs();
  if (!list.length){
    box.innerHTML = `<div class="empty">Henüz favori yok.</div>`;
    return;
  }
  box.innerHTML = "";
  for (const it of list){
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="thumb">${it.img ? `<img alt="" src="${it.img}" />` : "⭐"}</div>
        <div class="meta">
          <div class="t">${escapeHtml(it.title)}</div>
          <div class="s">${escapeHtml((it.history?.[0]?.p)||"Fiyat: —")} • ${escapeHtml(it.site||"")}</div>
        </div>
      </div>
      <div class="itemRight">
        <button class="miniBtn" data-act="open">Aç</button>
        <button class="miniBtn" data-act="del">Sil</button>
      </div>
    `;
    row.querySelector('[data-act="open"]')?.addEventListener("click", ()=> window.open(it.url, "_blank"));
    row.querySelector('[data-act="del"]')?.addEventListener("click", ()=> removeFavorite(it.url));
    box.appendChild(row);
  }
}

// ---------- Search ----------
async function doSearch(){
  const q = safeText($("qNormal")?.value);
  if (!q){ showToast("Arama kelimesi yaz."); return; }
  go("page-search");
  $("normalList").innerHTML = `<div class="empty">Aranıyor…</div>`;

  let query = q;
  if (mode === "ai"){
    try{
      if (!aiConfigured()) throw new Error("AI ayarı yok.");
      // Özellik bazlı arama kelimesi üret
      const prompt = [
        "Sen bir alışveriş arama asistanısın.",
        "Kullanıcının sorgusunu alışveriş araması için daha iyi hale getir.",
        "SADECE yeni sorguyu yaz; açıklama yazma.",
        `Kullanıcı sorgusu: ${q}`
      ].join("\n");
      query = safeText(await geminiText({ prompt, temperature: 0.2, maxOutputTokens: 64 }));
      if (!query) query = q;
      showToast(`AI sorgu: ${query}`);
    }catch(e){
      showToast("AI çalışmadı, normal arama ile devam.");
      query = q;
    }
  }

  try{
    const items = await fetchTrendyolResults(query);
    renderResults(items);
  }catch(e){
    $("normalList").innerHTML = `<div class="empty">Arama başarısız: ${escapeHtml(e.message||"")}</div>`;
  }
}

function wireUI(){
  // mode toggle
  $("modeNormal")?.addEventListener("click", ()=> setMode("normal"));
  $("modeAI")?.addEventListener("click", ()=> setMode("ai"));

  // search
  $("btnNormal")?.addEventListener("click", doSearch);
  $("qNormal")?.addEventListener("keydown", (ev)=>{ if (ev.key==="Enter") doSearch(); });

  $("btnClearSearch")?.addEventListener("click", ()=>{
    $("qNormal").value = "";
    $("normalList").innerHTML = "";
    go("page-home");
  });

  // bottom nav (varsa)
  document.querySelectorAll("[data-nav]").forEach(btn=>{
    btn.addEventListener("click", ()=> go(btn.getAttribute("data-nav")));
  });

  // login close
  $("closeLogin")?.addEventListener("click", ()=>{ if (auth.currentUser) closeLogin(); else showToast("Önce giriş yapmalısın."); });
  $("loginBackdrop")?.addEventListener("click", ()=>{ if (auth.currentUser) closeLogin(); });

  // auth
  $("btnLogin")?.addEventListener("click", async ()=>{
    try{
      const email = safeText($("email")?.value);
      const pass = $("pass")?.value || "";
      if (!email || !pass) throw new Error("E-posta ve şifre gerekli.");
      await signInWithEmailAndPassword(auth, email, pass);
      showToast("Giriş başarılı.");
    }catch(e){ showToast(e.message || "Giriş başarısız."); }
  });
  $("btnRegister")?.addEventListener("click", async ()=>{
    try{
      const email = safeText($("email")?.value);
      const pass = $("pass")?.value || "";
      if (!email || !pass) throw new Error("E-posta ve şifre gerekli.");
      await createUserWithEmailAndPassword(auth, email, pass);
      showToast("Kayıt başarılı.");
    }catch(e){ showToast(e.message || "Kayıt başarısız."); }
  });
  $("btnGoogle")?.addEventListener("click", async ()=>{
    try{
      await signInWithPopup(auth, googleProvider);
      showToast("Google ile giriş başarılı.");
    }catch(e){ showToast(e.message || "Google giriş başarısız."); }
  });

  $("logoutBtn")?.addEventListener("click", async ()=>{
    await signOut(auth);
  });

  // AI settings (basit)
  $("btnAiSettings")?.addEventListener("click", async ()=>{
    try{
      const apiKey = prompt("Gemini API key (AIza...):");
      if (!apiKey) return;
      const pin = prompt("PIN (en az 4):");
      if (!pin) return;
      await saveGeminiKey({ apiKey, pin, rememberPin: true });
      setSessionPin(pin);
      showToast("AI ayarı kaydedildi.");
    }catch(e){ showToast(e.message || "AI ayarı başarısız."); }
  });

  // camera -> gemini vision -> set query
  $("fabCamera")?.addEventListener("click", async ()=>{
    try{
      if (!aiConfigured()) throw new Error("Önce AI ayarını yap.");
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      input.onchange = async ()=>{
        const file = input.files?.[0];
        if (!file) return;
        const b64 = await fileToBase64(file);
        const prompt = "Bu görseldeki ürün/nesne ne? Sadece arama kelimesi yaz, açıklama yazma.";
        const text = await geminiVision({ prompt, mime: file.type || "image/jpeg", base64Data: b64 });
        $("qNormal").value = safeText(text);
        setMode("ai");
        showToast("Görselden sorgu çıkarıldı.");
      };
      input.click();
    }catch(e){ showToast(e.message || "Görsel arama başarısız."); }
  });

  // pages refresh buttons
  $("btnFavRefresh")?.addEventListener("click", renderFavorites);
}

async function fileToBase64(file){
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// auth state
onAuthStateChanged(auth, (user)=>{
  if (firebaseConfigLooksInvalid()){
    showToast("Firebase config eksik/hatalı görünüyor.");
  }
  if (user){
    lockApp(false);
    closeLogin();
    renderFavorites();
  }else{
    lockApp(true);
    openLogin();
    renderFavorites();
  }
});

window.addEventListener("DOMContentLoaded", ()=>{
  setMode("normal");
  wireUI();
  // İlk açılışta lock durumu onAuthStateChanged ile ayarlanır
});
