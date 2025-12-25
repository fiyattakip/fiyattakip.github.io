// app.js — Click freeze fix + tab navigation + Normal/AI toggle
// Bu dosya sadece UI katmanını güvenli hale getirir.
// Mevcut arama/favori/ai mantığını bozmaz; varsa global fonksiyonlarını çağırır.


import { auth, db, googleProvider } from "./firebase.js";
import { saveGeminiKey, clearAiCfg, aiConfigured, geminiText, geminiVision } from "./ai.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function toast(msg){
  const el = $("toast");
  if (!el){ console.log(msg); return; }
  el.textContent = String(msg || "");
  el.classList.add("show");
  clearTimeout(el.__t);
  el.__t = setTimeout(()=> el.classList.remove("show"), 2200);
}
window.toast = toast;

function lockUI(){
  document.body.classList.add("authLocked");
}

function openLogin(){
  const m = $("loginModal");
  if (!m) return;
  lockUI();
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
  m.style.pointerEvents = "";
  document.body.classList.add("modalOpen");
}


function closeLogin(){
  const m = $("loginModal");
  if (!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden","true");
  m.style.pointerEvents = "none";
  document.body.classList.remove("modalOpen");
}


function unlockUI(){
  document.body.classList.remove("authLocked");
}


window.addEventListener("load", ()=> setTimeout(unlockUI, 60));
document.addEventListener("click", ()=> setTimeout(unlockUI, 60), true);

function showPage(key){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));

  const page = document.querySelector(`#page-${CSS.escape(key)}`);
  if (page) page.classList.add("active");

  const tab = document.querySelector(`.tab[data-page="${CSS.escape(key)}"]`);
  if (tab) tab.classList.add("active");
}

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

async function aiBuildSearchQuery(userText){
  if (typeof window.aiText !== "function"){
    return { query: userText.trim() };
  }
  const prompt = `
Sadece e-ticaret aramasına uygun tek satırlık sorgu üret.
Kurallar:
- Uydurma model ekleme.
- Çıktı SADECE JSON: {"query":"..."}
Kullanıcı: ${userText}
`.trim();

  const raw = await window.aiText(prompt);
  let txt = String(raw || "").trim();
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) txt = m[0];

  try{
    const obj = JSON.parse(txt);
    const q = String(obj?.query || userText).replace(/\s+/g," ").trim().slice(0,80);
    return { query: q };
  }catch{
    return { query: userText.trim() };
  }
}

function wireUI(){
  document.querySelectorAll(".tab[data-page]").forEach(btn=>{
    btn.addEventListener("click", ()=> showPage(btn.dataset.page));
  });

  $("modeNormal")?.addEventListener("click", ()=> setSearchMode("normal"));
  $("modeAI")?.addEventListener("click", ()=> setSearchMode("ai"));
  setSearchMode(getSearchMode());

  $("closeLogin")?.addEventListener("click", ()=>{
    if (window.currentUser === null || window.currentUser === undefined){
      toast("Giriş yapmadan kullanamazsın.");
      openLogin();
      return;
    }
    closeLogin();
  });
  $("loginBackdrop")?.addEventListener("click", ()=>{
    if (window.currentUser === null || window.currentUser === undefined){
      toast("Giriş yapmadan kullanamazsın.");
      openLogin();
      return;
    }
    closeLogin();
  });

  $("fabCamera")?.addEventListener("click", ()=>{ $("imgInput")?.click(); });

  $("btnNormal")?.addEventListener("click", async ()=>{
    const q = ($("qNormal")?.value || "").trim();
    if (!q) return toast("Bir şey yaz.");

    showPage("search");

    const mode = getSearchMode();
    let query = q;

    if (mode === "ai"){
      toast("AI sorgu hazırlanıyor...");
      const built = await aiBuildSearchQuery(q);
      query = built.query || q;
      if ($("qNormal")) $("qNormal").value = query;
    }

    if (typeof window.doNormalSearch === "function"){
      return window.doNormalSearch(query);
    }
    if (typeof window.renderSiteList === "function"){
      return window.renderSiteList($("normalList"), query);
    }

    $("normalList").innerHTML = `
      <div class="cardBox">
        <div style="font-weight:1000">Arama sorgusu</div>
        <div style="opacity:.8;margin-top:6px">${query}</div>
        <div style="opacity:.7;margin-top:8px;font-size:12px">
          Not: Normal arama fonksiyonun window.doNormalSearch / window.renderSiteList olarak bağlı değil.
        </div>
      </div>`;
  });

  $("btnAiSettings")?.addEventListener("click", ()=>{
    if (typeof window.openAiSettings === "function") return window.openAiSettings();
    toast("AI ayar popup fonksiyonu bulunamadı (openAiSettings).");
  });

  $("logoutBtn")?.addEventListener("click", ()=>{
    if (typeof window.doLogout === "function") return window.doLogout();
    if (typeof window.signOutUser === "function") return window.signOutUser();
    toast("Çıkış fonksiyonu bulunamadı.");
  });

  $("btnClearSearch")?.addEventListener("click", ()=> { $("normalList").innerHTML = ""; });
  $("btnFavRefresh")?.addEventListener("click", ()=> { if (typeof window.renderFavorites === "function") window.renderFavorites(); });
  $("btnGraphRefresh")?.addEventListener("click", ()=> { if (typeof window.renderGraphs === "function") window.renderGraphs(); });
}

window.addEventListener("DOMContentLoaded", ()=>{
  wireUI();
  wireAuthUI();
  // Auth durumu gelene kadar arka taraf kilitli kalsın
  lockUI();
});



/* =========================
   APP LOGIC (Auth + Favorites + AI + Graph)
   Tema bozulmadan çalışacak şekilde minimal ve sağlam.
========================= */

const LS_LAST_QUERY = "fiyattakip_last_query_v1";
let currentUser = null;
window.currentUser = null;

// --- Service Worker ---
if ("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

// --- Helpers ---
function moneyTry(n){
  const x = Number(n);
  if (!isFinite(x)) return "—";
  try{ return x.toLocaleString("tr-TR", { style:"currency", currency:"TRY", maximumFractionDigits: 0 }); }
  catch{ return `${Math.round(x)} TL`; }
}
function safeText(s, max=120){
  return String(s||"").replace(/\s+/g," ").trim().slice(0,max);
}
function uidOrThrow(){
  if (!currentUser?.uid) throw new Error("Giriş gerekli.");
  return currentUser.uid;
}
function favColRef(uid){ return collection(db, "users", uid, "favorites"); }
function priceColRef(uid, favId){ return collection(db, "users", uid, "favorites", favId, "prices"); }

function openModal(id){
  const m = $(id);
  if (!m) return;
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
  document.body.classList.add("modalOpen");
}
function closeModal(id){
  const m = $(id);
  if (!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden","true");
  document.body.classList.remove("modalOpen");
  unlockUI();
}

// --- Auth wiring (login modal buttons) ---
function wireAuthUI(){
  const segs = document.querySelectorAll(".segBtn[data-auth]");
  segs.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      segs.forEach(b=>b.classList.toggle("active", b===btn));
      const mode = btn.dataset.auth;
      $("authEmail").style.display = (mode==="email" ? "" : "none");
      $("authGoogle").style.display = (mode==="google" ? "" : "none");
    });
  });

  $("btnLogin")?.addEventListener("click", async ()=>{
    const email = ($("email")?.value || "").trim();
    const pass  = ($("pass")?.value || "").trim();
    if (!email || !pass) return toast("E-posta ve şifre gir.");
    try{
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Giriş başarılı.");
      closeLogin();
    }catch(e){
      toast("Giriş hata: " + (e?.message || "Bilinmeyen"));
    }
  });

  $("btnRegister")?.addEventListener("click", async ()=>{
    const email = ($("email")?.value || "").trim();
    const pass  = ($("pass")?.value || "").trim();
    if (!email || !pass) return toast("E-posta ve şifre gir.");
    if (pass.length < 6) return toast("Şifre en az 6 karakter olmalı.");
    try{
      await createUserWithEmailAndPassword(auth, email, pass);
      toast("Kayıt oluşturuldu.");
      closeLogin();
    }catch(e){
      toast("Kayıt hata: " + (e?.message || "Bilinmeyen"));
    }
  });

  $("btnGoogle")?.addEventListener("click", async ()=>{
    try{
      await signInWithPopup(auth, googleProvider);
      toast("Google ile giriş başarılı.");
      closeLogin();
    }catch(e){
      toast("Google giriş hata: " + (e?.message || "Bilinmeyen"));
    }
  });
}
window.doLogout = async ()=> {
  try{
    await signOut(auth);
    toast("Çıkış yapıldı.");
  }catch(e){
    toast("Çıkış hata: " + (e?.message || "Bilinmeyen"));
  }
};

onAuthStateChanged(auth, (u)=>{
  currentUser = u || null;
  window.currentUser = currentUser;

  if (!currentUser){
    // Giriş yokken: uygulama blur + tıklanamaz, login modal açık
    if ($("favList")) $("favList").innerHTML = "";
    if ($("graphRoot")) $("graphRoot").textContent = "Grafik alanı";
    openLogin();
    return;
  }

  // Giriş varsa: kilidi kaldır, modal kapat
  unlockUI();
  closeLogin();
  renderFavorites();
  renderGraphs();
});

    $("favList").innerHTML = "";
    $("graphRoot").textContent = "Grafik alanı";
    return;
  }
  // user in
  closeLogin();
  renderFavorites();
  renderGraphs();
});

// --- Search / Results ---
// Bu sürüm "sitelerde arama linki + favoriye ekleme" mantığıyla çalışır.
// Scrape yapmaz (CORS / captcha). Favoriye eklenen ürünün fiyat geçmişini sen güncellersin.
const SITES = [
  { key:"trendyol", name:"Trendyol", emoji:"🛒", build:(q)=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", emoji:"📦", build:(q)=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"amazon", name:"Amazon TR", emoji:"🅰️", build:(q)=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"n11", name:"n11", emoji:"🟣", build:(q)=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` }
];

function renderSiteList(root, queryText){
  const q = safeText(queryText, 80);
  localStorage.setItem(LS_LAST_QUERY, q);
  root.innerHTML = "";

  const top = document.createElement("div");
  top.className = "cardBox";
  top.innerHTML = `
    <div style="font-weight:1000">Sorgu</div>
    <div style="opacity:.85;margin-top:6px">${q}</div>
    <div class="miniHint">Aşağıdan mağazayı seçip ürünü aç. Beğendiğin ürün linkini kopyalayıp “Favoriye link ekle” ile takibe al.</div>
    <div class="itemActions">
      <button class="btnGhost btnTiny" id="btnAddByLink" type="button">Favoriye link ekle</button>
    </div>
  `;
  root.appendChild(top);

  top.querySelector("#btnAddByLink").addEventListener("click", async ()=>{
    try{
      uidOrThrow();
      const url = prompt("Ürün linkini yapıştır:");
      if (!url) return;
      await addFavorite({ title: "Ürün", url: url.trim(), source: "link" });
      toast("Favoriye eklendi.");
      showPage("favs");
      renderFavorites();
    }catch(e){ toast(e?.message || "Hata"); }
  });

  for (const s of SITES){
    const url = s.build(q);
    const card = document.createElement("div");
    card.className = "itemCard";
    card.innerHTML = `
      <div class="itemImg">${s.emoji}</div>
      <div class="itemMain">
        <div class="itemTitle">${s.name} araması</div>
        <div class="itemMeta">
          <span>🔎 ${q}</span>
        </div>
        <div class="itemActions">
          <a class="btnTiny btnLink" href="${url}" target="_blank" rel="noopener">Mağazada aç</a>
        </div>
      </div>
    `;
    root.appendChild(card);
  }
}
window.renderSiteList = renderSiteList;
window.doNormalSearch = (q)=> renderSiteList($("normalList"), q);

// --- Favorites (Firestore) ---
async function addFavorite({ title, url, source }){
  const uid = uidOrThrow();
  const data = {
    title: safeText(title || "Ürün", 140),
    url: String(url||"").trim(),
    source: source || "manual",
    createdAt: serverTimestamp(),
    ai: { text: "", updatedAt: null },
    lastPrice: null,
    lastPriceAt: null
  };
  // de-dup by url (best effort)
  const q = query(favColRef(uid), where("url","==", data.url), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0].id;

  const docRef = await addDoc(favColRef(uid), data);
  return docRef.id;
}

async function removeFavorite(favId){
  const uid = uidOrThrow();
  await deleteDoc(doc(db, "users", uid, "favorites", favId));
}

function expandableText(text){
  const box = document.createElement("div");
  box.className = "expBox";
  box.innerHTML = `
    <div class="expText"></div>
    <button class="btnGhost btnTiny expMore" type="button">Devamını göster</button>
  `;
  const t = box.querySelector(".expText");
  t.textContent = String(text || "").trim() || "—";
  const btn = box.querySelector(".expMore");
  btn.addEventListener("click", ()=>{
    box.classList.toggle("open");
    btn.textContent = box.classList.contains("open") ? "Daralt" : "Devamını göster";
  });
  return box;
}

async function renderFavorites(){
  if (!currentUser) return;
  const uid = currentUser.uid;

  const root = $("favList");
  root.innerHTML = "";

  const snap = await getDocs(query(favColRef(uid), orderBy("createdAt","desc"), limit(60)));
  if (snap.empty){
    root.innerHTML = `<div class="cardBox">Henüz favorin yok. Arama yap → link ile favoriye ekle.</div>`;
    return;
  }

  snap.forEach(d=>{
    const fav = d.data() || {};
    const title = safeText(fav.title || "Ürün", 120);
    const url = fav.url || "";
    const price = fav.lastPrice == null ? "—" : moneyTry(fav.lastPrice);

    const card = document.createElement("div");
    card.className = "itemCard";
    card.innerHTML = `
      <div class="itemImg">❤️</div>
      <div class="itemMain">
        <div class="itemTitle">${title}</div>
        <div class="itemMeta">
          <span class="itemPrice">${price}</span>
          <span>🔗 ${safeText(url, 34)}</span>
        </div>
        <div class="itemActions">
          <a class="btnTiny btnLink" href="${url}" target="_blank" rel="noopener">Ürünü aç</a>
          <button class="btnPrimary btnTiny" type="button" data-act="price">Fiyat gir</button>
          <button class="btnGhost btnTiny" type="button" data-act="ai">AI yorum</button>
          <button class="btnGhost btnTiny" type="button" data-act="del">Sil</button>
        </div>
        <div class="aiSlot"></div>
      </div>
    `;

    const aiSlot = card.querySelector(".aiSlot");
    if (fav.ai?.text){
      aiSlot.appendChild(expandableText(fav.ai.text));
    }

    card.querySelector('[data-act="del"]').addEventListener("click", async ()=>{
      if (!confirm("Favoriden silinsin mi?")) return;
      try{ await removeFavorite(d.id); toast("Silindi."); renderFavorites(); renderGraphs(); }
      catch(e){ toast(e?.message || "Hata"); }
    });

    card.querySelector('[data-act="price"]').addEventListener("click", async ()=>{
      try{
        const raw = prompt("Güncel fiyat (TL):", fav.lastPrice ?? "");
        if (raw == null) return;
        const p = Number(String(raw).replace(",", ".").replace(/[^0-9.]/g,""));
        if (!isFinite(p) || p <= 0) return toast("Geçerli bir fiyat gir.");
        await addPricePoint(d.id, p);
        toast("Kaydedildi.");
        renderFavorites();
        renderGraphs();
      }catch(e){ toast(e?.message || "Hata"); }
    });

    card.querySelector('[data-act="ai"]').addEventListener("click", async ()=>{
      try{
        if (!aiConfigured()){
          toast("Önce AI ayarlarını gir.");
          openAiSettings();
          return;
        }
        toast("AI yorum hazırlanıyor...");
        const prompt = buildAiPrompt({ title, url, lastPrice: fav.lastPrice });
        const txt = await geminiText(prompt);
        await setDoc(doc(db,"users",uid,"favorites",d.id), {
          ai: { text: txt, updatedAt: Date.now() }
        }, { merge:true });
        toast("AI yorum hazır.");
        renderFavorites();
      }catch(e){
        toast(e?.message || "AI hata");
      }
    });

    root.appendChild(card);
  });
}
window.renderFavorites = renderFavorites;

// --- AI Prompt (uydurma yapmasın, özellik-bazlı) ---
function buildAiPrompt({ title, url, lastPrice }){
  return `
Sen bir ürün yorum asistanısın.
Görev: Kullanıcıya "özellik ve kullanım senaryosu" bazlı yorum ver.

Kurallar:
- Ürün bulunamadı / piyasaya sürülmedi gibi uydurma cümleler KURMA.
- Eğer spesifik teknik özellik verilmemişse: net olmayan yerlerde "muhtemelen" diye belirt ve kullanıcıya kontrol listesi ver.
- Fiyat konuşacaksan sadece kullanıcıya verilen fiyat üzerinden genel mantık söyle (pahalı/ucuz hükmü verme).
- Çıktı Türkçe, okunabilir; başlıklarla.

Elimdeki bilgiler:
- Başlık: ${title}
- Link: ${url}
- Son fiyat (varsa): ${lastPrice ?? "bilinmiyor"}

İstediğim format:
1) Kısa özet (2-3 cümle)
2) Artılar (madde)
3) Eksiler / Dikkat (madde)
4) Kimler için uygun?
5) Satın almadan önce kontrol listesi (madde)
`.trim();
}

// --- Prices / Graph ---
async function addPricePoint(favId, price){
  const uid = uidOrThrow();
  await addDoc(priceColRef(uid, favId), {
    price: Number(price),
    at: Date.now()
  });
  await setDoc(doc(db,"users",uid,"favorites",favId), {
    lastPrice: Number(price),
    lastPriceAt: Date.now()
  }, { merge:true });
}

function sparklineSVG(values){
  if (!values.length) return "";
  const w=260, h=70, pad=6;
  const minV=Math.min(...values), maxV=Math.max(...values);
  const span = (maxV-minV) || 1;
  const pts = values.map((v,i)=>{
    const x = pad + (i*(w-2*pad)/(values.length-1 || 1));
    const y = pad + (h-2*pad) * (1 - (v-minV)/span);
    return [x,y];
  });
  const d = pts.map((p,i)=> (i? "L":"M")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="70" aria-label="fiyat grafiği">
      <path d="${d}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.5" stroke-linecap="round"/>
      <path d="${d} L ${w-pad} ${h-pad} L ${pad} ${h-pad} Z" fill="rgba(124,92,255,.10)"/>
    </svg>
  `.trim();
}

async function renderGraphs(){
  if (!currentUser) return;
  const uid = currentUser.uid;
  const root = $("graphRoot");
  root.innerHTML = "";

  const favSnap = await getDocs(query(favColRef(uid), orderBy("createdAt","desc"), limit(20)));
  if (favSnap.empty){
    root.innerHTML = "Grafik için önce favori ekle.";
    return;
  }

  for (const d of favSnap.docs){
    const fav = d.data() || {};
    const title = safeText(fav.title || "Ürün", 90);

    const pSnap = await getDocs(query(priceColRef(uid, d.id), orderBy("at","asc"), limit(80)));
    const vals = pSnap.docs.map(x=> Number(x.data()?.price)).filter(v=>isFinite(v));
    const minV = vals.length ? Math.min(...vals) : null;
    const maxV = vals.length ? Math.max(...vals) : null;

    const box = document.createElement("div");
    box.className = "cardBox";
    box.innerHTML = `
      <div class="rowBetween">
        <div>
          <div class="cardTitle">${title}</div>
          <div class="miniHint">${vals.length ? `Kayıt: ${vals.length} • Min: ${moneyTry(minV)} • Max: ${moneyTry(maxV)}` : "Henüz fiyat kaydı yok. Favorilerden fiyat gir."}</div>
        </div>
        <button class="btnGhost btnTiny" type="button">Fiyat gir</button>
      </div>
      <div style="margin-top:10px">${vals.length ? sparklineSVG(vals) : ""}</div>
    `;
    box.querySelector("button").addEventListener("click", ()=>{
      showPage("favs");
      toast("Favorilerden bu ürüne fiyat girebilirsin.");
    });

    root.appendChild(box);
  }
}
window.renderGraphs = renderGraphs;

// --- AI Settings Modal ---
function openAiSettings(){
  openModal("aiModal");
  // sync ui
  $("aiKey").value = "";
  $("aiPin").value = "";
  $("aiRememberPin").checked = false;
}
window.openAiSettings = openAiSettings;

$("aiBackdrop")?.addEventListener("click", ()=> closeModal("aiModal"));
$("closeAi")?.addEventListener("click", ()=> closeModal("aiModal"));

$("btnAiSave")?.addEventListener("click", async ()=>{
  try{
    const apiKey = ($("aiKey")?.value || "").trim();
    const pin = ($("aiPin")?.value || "").trim();
    const rememberPin = !!$("aiRememberPin")?.checked;
    await saveGeminiKey({ apiKey, pin, rememberPin });
    toast("AI ayarları kaydedildi.");
    closeModal("aiModal");
  }catch(e){
    toast(e?.message || "AI kaydetme hatası");
  }
});

$("btnAiClear")?.addEventListener("click", ()=>{
  clearAiCfg();
  toast("AI ayarları sıfırlandı.");
});

// --- Visual search ---
$("imgInput")?.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    if (!aiConfigured()){
      toast("Önce AI ayarlarını gir.");
      openAiSettings();
      return;
    }
    toast("Görsel analiz ediliyor...");
    const base64Data = await new Promise((res, rej)=>{
      const r = new FileReader();
      r.onload = ()=> {
        const s = String(r.result||"");
        const b64 = s.split(",")[1] || "";
        res(b64);
      };
      r.onerror = ()=> rej(new Error("Dosya okunamadı"));
      r.readAsDataURL(file);
    });
    const txt = await geminiVision({
      prompt: "Bu görseldeki ürünü e-ticaret araması için 3-6 kelimelik Türkçe bir sorguya çevir. Sadece sorguyu yaz.",
      mime: file.type || "image/jpeg",
      base64Data
    });
    const q = safeText(txt, 80);
    $("qNormal").value = q;
    showPage("search");
    renderSiteList($("normalList"), q);
    toast("Görsel arama hazır.");
  }catch(err){
    toast(err?.message || "Görsel analiz hata");
  }finally{
    e.target.value = "";
  }
});

// Hook FAB camera to open picker
$("fabCamera")?.addEventListener("click", ()=>{
  $("imgInput")?.click();
});

// Restore last query hint
window.addEventListener("DOMContentLoaded", ()=>{
  const last = localStorage.getItem(LS_LAST_QUERY);
  if (last && $("qNormal")) $("qNormal").value = last;
});

// Fix: remove broken references if present
try{ $("tabVisual")?.remove(); }catch{}
