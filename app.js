import { auth, db, googleProvider, firebaseConfigLooksInvalid } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  saveGeminiKey, clearAiCfg, aiConfigured, geminiText, geminiVision
} from "./ai.js";

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
function show(el){ el.style.display = ""; }
function hide(el){ el.style.display = "none"; }

let toastTimer = null;
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  show(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> hide(t), 2200);
}

function esc(s){
  const str = (s === null || s === undefined) ? "" : String(s);
  return str.replace(/[&<>"\']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}[m])); }
function encQ(s){
  const str = (s === null || s === undefined) ? "" : String(s);
  return encodeURIComponent(str.trim());
}

function openUrl(url){
  window.open(url, "_blank", "noopener,noreferrer");
}

function nowIso(){
  const d = new Date();
  return d.toISOString().slice(0,19).replace("T"," ");
}

async function clearAllCaches(){
  try{
    localStorage.removeItem("fiyattakip_local_cache_v1");
    // keep AI cfg? user wants clean login: remove all except AI? We'll remove everything except AI
    // (AI cfg stays unless user presses AI Key Sil)
    const keys = Object.keys(localStorage);
    for (const k of keys){
      if (k.startsWith("fiyattakip_") && k !== "fiyattakip_ai_cfg_v4") localStorage.removeItem(k);
    }
    if ("caches" in window){
      const names = await caches.keys();
      await Promise.all(names.map(n=>caches.delete(n)));
    }
    toast("Önbellek temizlendi.");
  }catch(e){
    toast("Önbellek temizleme hata.");
  }
}

/* ---------- Sites ---------- */
const SITES = [
  { id:"trendyol",   name:"Trendyol",     build:(q)=>`https://www.trendyol.com/sr?q=${encQ(q)}` },
  { id:"hepsiburada",name:"Hepsiburada",  build:(q)=>`https://www.hepsiburada.com/ara?q=${encQ(q)}` },
  { id:"n11",        name:"N11",          build:(q)=>`https://www.n11.com/arama?q=${encQ(q)}` },
  { id:"amazon",     name:"Amazon TR",    build:(q)=>`https://www.amazon.com.tr/s?k=${encQ(q)}` },
  { id:"pazarama",   name:"Pazarama",     build:(q)=>`https://www.pazarama.com/arama?q=${encQ(q)}` },
  { id:"cicek",      name:"ÇiçekSepeti",  build:(q)=>`https://www.ciceksepeti.com/arama?query=${encQ(q)}` },
  { id:"idefix",     name:"idefix",       build:(q)=>`https://www.idefix.com/arama/?q=${encQ(q)}` },
];

function renderSiteList(targetEl, queryText, extra = {}){
  const html = SITES.map(s => {
    const hint = extra?.hintMap?.[s.id] || queryText;
    const comment = extra?.commentMap?.[s.id] || "";
    const btnLabel = extra?.btnLabel || "Ara";

    return `
      <div class="item">
        <div class="itemLeft">
          <div class="siteName">${esc(s.name)}</div>
          <div class="queryText">${esc(hint || "")}</div>
          ${comment ? `<div class="aiBubble">${esc(comment)}<small>Güncellendi: ${esc(nowIso())}</small></div>` : ""}
        </div>
        <div class="itemRight">
          <button class="btnOpen" data-open="${esc(s.id)}">${esc(btnLabel)}</button>
          <button class="btnFav" data-fav="${esc(s.id)}" title="Favoriye ekle">
            <svg class="miniIco" viewBox="0 0 24 24"><path d="M12 21s-7-4.6-9.5-9C.5 7.8 3.2 5 6.6 5c1.7 0 3.2.8 4.1 2 1-1.2 2.4-2 4.1-2 3.4 0 6.1 2.8 4.1 7-2.5 4.4-9 9-9 9Z"/></svg>
            Favoriye ekle
          </button>
        </div>
      </div>
    `;
  }).join("");

  targetEl.innerHTML = html || `<div class="emptyBox">Sonuç yok.</div>`;

  // bind buttons
  targetEl.querySelectorAll("[data-open]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-open");
      const site = SITES.find(x=>x.id===id);
      const q = (extra?.hintMap?.[id] || queryText || "").trim();
      openUrl(site.build(q));
    });
  });

  targetEl.querySelectorAll("[data-fav]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-fav");
      const site = SITES.find(x=>x.id===id);
      const q = (extra?.hintMap?.[id] || queryText || "").trim();
      await addFavorite({
        title: q || "(boş)",
        siteId: site.id,
        siteName: site.name,
        query: q,
        url: site.build(q),
      });
      toast("Favoriye eklendi.");
    });
  });
}

/* ---------- Tabs ---------- */
function setTab(name){
  const btns = document.querySelectorAll(".tabBtn");
  btns.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $("paneNormal").style.display = name==="normal" ? "" : "none";
  $("paneAi").style.display = name==="ai" ? "" : "none";
  $("paneVisual").style.display = name==="visual" ? "" : "none";
}
document.querySelectorAll(".tabBtn").forEach(btn=>{
  btn.addEventListener("click", ()=> setTab(btn.dataset.tab));
});

/* ---------- PWA install ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").style.display = "";
});
$("installBtn").addEventListener("click", async ()=>{
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(()=>{});
  deferredPrompt = null;
  $("installBtn").style.display = "none";
});

/* ---------- SW register ---------- */
if ("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

/* ---------- Login ---------- */
let currentUser = null;
let unsubFav = null;

function openLogin(){
  $("loginErr").style.display = "none";
  $("loginModal").style.display = "";
}
function closeLogin(){
  $("loginModal").style.display = "none";
}

$("closeLogin").addEventListener("click", closeLogin);

document.querySelectorAll(".segBtn").forEach(b=>{
  b.addEventListener("click", ()=>{
    document.querySelectorAll(".segBtn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    const mode = b.dataset.auth;
    $("authEmail").style.display = mode==="email" ? "" : "none";
    $("authGoogle").style.display = mode==="google" ? "" : "none";
  });
});

$("togglePass").addEventListener("click", ()=>{
  const p = $("pass");
  p.type = p.type==="password" ? "text" : "password";
});

$("btnPreClear").addEventListener("click", clearAllCaches);

$("btnLoginEmail").addEventListener("click", async ()=>{
  const email = $("email").value.trim();
  const pass = $("pass").value;
  try{
    if (firebaseConfigLooksInvalid()) throw new Error("Firebase config eksik. firebase.js içine Web config yapıştır.");
    $("loginErr").style.display = "none";
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    // if user doesn't exist -> create
    try{
      if (String(e?.code||"").includes("auth/user-not-found")){
        await createUserWithEmailAndPassword(auth, email, pass);
        return;
      }
    }catch(e2){ e = e2; }

    $("loginErr").textContent = `Hata: ${e?.message || e}`;
    $("loginErr").style.display = "";
  }
});

$("btnLoginGoogle").addEventListener("click", async ()=>{
  try{
    if (firebaseConfigLooksInvalid()) throw new Error("Firebase config eksik. firebase.js içine Web config yapıştır.");
    $("loginErr").style.display = "none";
    await signInWithPopup(auth, googleProvider);
  }catch(e){
    $("loginErr").textContent = `Hata: ${e?.message || e}`;
    $("loginErr").style.display = "";
  }
});

$("logoutBtn").addEventListener("click", async ()=>{
  await signOut(auth);
});

/* ---------- AI Settings Modal ---------- */
$("aiSettingsBtn").addEventListener("click", ()=>{
  $("aiModal").style.display = "";
});
$("closeAi").addEventListener("click", ()=> $("aiModal").style.display="none");

$("saveAi").addEventListener("click", async ()=>{
  try{
    await saveGeminiKey({
      apiKey: $("gemKey").value.trim(),
      pin: $("gemPin").value,
      rememberPin: $("rememberPin").checked
    });
    toast("AI ayarı kaydedildi.");
    $("aiModal").style.display = "none"; // <- senin istediğin: Kaydet deyince kapansın
  }catch(e){
    toast(e?.message || String(e));
  }
});

$("clearAi").addEventListener("click", ()=>{
  clearAiCfg();
  toast("AI key silindi.");
});

/* ---------- Normal / AI / Visual ---------- */
$("btnNormal").addEventListener("click", ()=>{
  const q = $("qNormal").value.trim();
  if (!q) return toast("Ürün adı yaz.");
  renderSiteList($("normalList"), q);
});

$("btnAi").addEventListener("click", async ()=>{
  const q = $("qAi").value.trim();
  if (!q) return toast("Bir şey yaz.");
  if (!aiConfigured()) return toast("AI key kayıtlı değil. AI Ayarları'ndan gir.");

  $("btnAi").disabled = true;
  $("aiBox").style.display = "none";
  $("aiList").innerHTML = "";
  try{
    const prompt =
`Kullanıcı bir ürün arıyor: "${q}"
Amaç: E-ticarette doğru arama ifadesi ve kısa öneri.
Çıktı formatı:
- query: (tek satır arama ifadesi)
- comment: (kısa yorum: nelere dikkat edilmeli)
Sadece bu formatla cevap ver.`;

    const out = await geminiText(prompt);
    const queryLine = (out.match(/query:\s*(.+)/i)?.[1] || q).trim();
    const commentLine = (out.match(/comment:\s*(.+)/i)?.[1] || "").trim();

    $("aiBox").textContent = commentLine ? `Öneri: ${commentLine}` : "AI öneri üretemedi.";
    $("aiBox").style.display = "";

    // AI aramada: her siteyi queryLine ile arar (Normal'e yönlendirme yok)
    renderSiteList($("aiList"), queryLine, {
      hintMap: Object.fromEntries(SITES.map(s=>[s.id, queryLine])),
      commentMap: Object.fromEntries(SITES.map(s=>[s.id, commentLine])),
      btnLabel: "Ara"
    });

  }catch(e){
    toast(e?.message || String(e));
    $("aiBox").textContent = "AI sonuç üretemedi.";
    $("aiBox").style.display = "";
  }finally{
    $("btnAi").disabled = false;
  }
});

function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = () => {
      const res = String(r.result || "");
      const b64 = res.split(",")[1] || "";
      resolve(b64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

$("btnVisual").addEventListener("click", async ()=>{
  const f = $("fileImg").files?.[0];
  if (!f) return toast("Bir görsel seç.");

  if (!aiConfigured()) {
    // AI yoksa direkt lens
    const lens = "https://lens.google.com/upload";
    $("visualOut").innerHTML = `AI key yok. <button class="btnPrimary" id="goLens" style="margin-left:10px">Google Lens</button>`;
    $("visualOut").style.display = "";
    setTimeout(()=> $("goLens")?.addEventListener("click", ()=> openUrl(lens)), 0);
    return;
  }

  $("btnVisual").disabled = true;
  $("visualOut").style.display = "none";

  try{
    const b64 = await fileToBase64(f);
    const prompt =
`Bu görseldeki ürün/metni çıkar.
- 1 satır: ürün adı / arama ifadesi (en alakalı)
- 2 satır: kısa açıklama
Eğer ürün belirsizse "UNKNOWN" yaz.`;

    const txt = await geminiVision({
      prompt,
      mime: f.type || "image/png",
      base64Data: b64
    });

    const lines = txt.split("\n").map(s=>s.trim()).filter(Boolean);
    const extracted = (lines[0] || "UNKNOWN").trim();
    const note = lines.slice(1).join(" ").trim();

    if (!extracted || extracted.toUpperCase()==="UNKNOWN"){
      const lens = "https://lens.google.com/upload";
      $("visualOut").innerHTML = `
        <div><b>Hata:</b> Görsel bulunamadı / metin çıkarılamadı.</div>
        <div style="margin-top:10px">
          <button class="btnPrimary" id="goLens">Google Lens (Alternatif)</button>
        </div>
      `;
      $("visualOut").style.display = "";
      $("goLens").addEventListener("click", ()=> openUrl(lens));
      return;
    }

    // Google alışveriş araması
    const gShop = `https://www.google.com/search?tbm=shop&q=${encQ(extracted)}`;
    const gWeb  = `https://www.google.com/search?q=${encQ(extracted)}`;
    const lens = "https://lens.google.com/upload";

    $("visualOut").innerHTML = `
      <div><b>Çıkan metin:</b> ${esc(extracted)}</div>
      ${note ? `<div class="smallNote">${esc(note)}</div>` : ""}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        <button class="btnOpen" id="goShop">Google Alışveriş</button>
        <button class="btnAction" id="goWeb">Google</button>
        <button class="btnWarn" id="goLens">Google Lens</button>
        <button class="btnAction" id="toNormal">Normal’e aktar</button>
        <button class="btnAction" id="toAi">AI’ye aktar</button>
      </div>
    `;
    $("visualOut").style.display = "";

    $("goShop").addEventListener("click", ()=> openUrl(gShop));
    $("goWeb").addEventListener("click", ()=> openUrl(gWeb));
    $("goLens").addEventListener("click", ()=> openUrl(lens));
    $("toNormal").addEventListener("click", ()=>{
      $("qNormal").value = extracted;
      setTab("normal");
      toast("Normal aramaya aktarıldı.");
    });
    $("toAi").addEventListener("click", ()=>{
      $("qAi").value = extracted;
      setTab("ai");
      toast("AI aramaya aktarıldı.");
    });

  }catch(e){
    toast(e?.message || String(e));
    const lens = "https://lens.google.com/upload";
    $("visualOut").innerHTML = `
      <div><b>Hata:</b> Görsel bulunamadı / metin çıkarılamadı.</div>
      <div style="margin-top:10px">
        <button class="btnPrimary" id="goLens">Google Lens (Alternatif)</button>
      </div>
    `;
    $("visualOut").style.display = "";
    $("goLens").addEventListener("click", ()=> openUrl(lens));
  }finally{
    $("btnVisual").disabled = false;
  }
});

/* ---------- Favorites ---------- */
function userFavCol(){
  return collection(db, "users", currentUser.uid, "favorites");
}

async function addFavorite({ title, siteId, siteName, query, url }){
  if (!currentUser) return toast("Giriş gerekli.");
  await addDoc(userFavCol(), {
    title,
    siteId,
    siteName,
    query,
    url,
    // Worker burayı güncelleyebilir:
    lastPrice: null,
    currency: "TRY",
    lastCheckedAt: null,
    error: null,
    priceHistory: [], // [{t: timestamp(ms), p: number}]
    aiComment: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function removeFavorite(docId){
  await deleteDoc(doc(db, "users", currentUser.uid, "favorites", docId));
}

async function genAiComment(fav){
  if (!aiConfigured()) return toast("AI key kayıtlı değil.");
  const title = fav.title || fav.query || "ürün";
  const price = fav.lastPrice ? `${fav.lastPrice} TL` : "fiyat yok";
  const site = fav.siteName || "";
  const prompt =
`Ürün: ${title}
Site: ${site}
Fiyat: ${price}
Kullanıcıya kısa, pratik bir yorum yaz: (uyumluluk, satıcı, garanti, alternatif vs).
Maks 3-4 cümle. Türkçe.`;
  const t = await geminiText(prompt);
  return t.trim();
}

function formatPrice(p){
  if (p===null || p===undefined || p==="") return "Fiyat yok";
  const n = Number(p);
  if (Number.isFinite(n)) return `${n.toLocaleString("tr-TR")} TL`;
  return String(p);
}

function sortFav(list, mode){
  const arr = [...list];
  if (mode==="old") return arr.sort((a,b)=>(a._created||0)-(b._created||0));
  if (mode==="new") return arr.sort((a,b)=>(b._created||0)-(a._created||0));
  if (mode==="cheap") return arr.sort((a,b)=>(Number(a.lastPrice)||1e18)-(Number(b.lastPrice)||1e18));
  if (mode==="exp") return arr.sort((a,b)=>(Number(b.lastPrice)||-1)-(Number(a.lastPrice)||-1));
  return arr;
}

/* Graph */
function drawGraph(canvas, points){
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  // bg
  ctx.fillStyle = "rgba(248,250,252,.85)";
  ctx.fillRect(0,0,w,h);

  if (!points || points.length < 2){
    ctx.fillStyle = "rgba(15,23,42,.65)";
    ctx.font = "16px system-ui";
    ctx.fillText("Grafik için yeterli veri yok (priceHistory boş).", 18, 34);
    return;
  }

  const pad = 50;
  const xs = points.map(p=>p.t);
  const ys = points.map(p=>p.p);

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  // axis
  ctx.strokeStyle = "rgba(15,23,42,.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, h-pad);
  ctx.lineTo(w-pad, h-pad);
  ctx.stroke();

  // line
  ctx.strokeStyle = "rgba(59,91,253,.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i)=>{
    const x = pad + ((p.t - minX)/spanX) * (w - pad*2);
    const y = (h - pad) - ((p.p - minY)/spanY) * (h - pad*2);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // labels
  ctx.fillStyle = "rgba(15,23,42,.65)";
  ctx.font = "14px system-ui";
  ctx.fillText(`Min: ${minY.toLocaleString("tr-TR")} TL`, pad, pad-18);
  ctx.fillText(`Max: ${maxY.toLocaleString("tr-TR")} TL`, pad+180, pad-18);
}

function openGraph(fav){
  $("graphTitle").textContent = `${fav.title || fav.query || ""} • ${fav.siteName || ""}`;
  const pts = (fav.priceHistory || [])
    .map(x=>({ t: Number(x.t||0), p: Number(x.p||0) }))
    .filter(x=>Number.isFinite(x.t) && Number.isFinite(x.p) && x.t>0)
    .sort((a,b)=>a.t-b.t);

  $("graphHint").textContent = pts.length ? `Nokta: ${pts.length}` : "priceHistory yok.";
  show($("graphModal"));
  // resize for hiDPI
  const c = $("graphCanvas");
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.floor(rect.width * dpr);
  c.height = Math.floor(420 * dpr);
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawGraph(c, pts);
}
$("closeGraph").addEventListener("click", ()=> hide($("graphModal")));

/* Render favorites */
let favCache = [];

function renderFavorites(){
  const mode = $("favSort").value;
  const list = sortFav(favCache, mode);

  if (!list.length){
    $("favList").innerHTML = `<div class="emptyBox">Favori yok.</div>`;
    return;
  }

  $("favList").innerHTML = list.map(f => {
    const errBadge = f.error ? `<span class="badgeErr">Hata: ${esc(f.error)}</span>` : `<span class="badgeOk">OK</span>`;
    const price = formatPrice(f.lastPrice);
    const meta = `${esc(f.siteName || "")} • Son kontrol: ${esc(f.lastCheckedAt || "—")}`;
    const ai = f.aiComment ? `<div class="aiBubble">${esc(f.aiComment)}<small>Güncellendi: ${esc(f.aiCommentAt || "—")}</small></div>` : "";
    return `
      <div class="favItem" data-id="${esc(f.id)}">
        <div class="favTop">
          <div style="min-width:0">
            <div class="favName">${esc(f.title || f.query || "")}</div>
            <div class="favMeta">${meta}</div>
          </div>
          <div class="favPrice">${esc(price)}</div>
        </div>

        ${ai}

        <div class="favBtns">
          <button class="btnOpen" data-openfav="${esc(f.id)}">Siteyi Aç</button>
          <button class="btnCopy" data-copy="${esc(f.url || "")}">Copy Link</button>
          <button class="btnWarn" data-retry="${esc(f.id)}">Tekrar dene şimdi</button>
          <button class="btnAction" data-graph="${esc(f.id)}">Grafik</button>
          <button class="btnAction" data-aicom="${esc(f.id)}">AI Yorum</button>
          <button class="btnDelete" data-del="${esc(f.id)}">Sil</button>
          ${errBadge}
        </div>
      </div>
    `;
  }).join("");

  $("favList").querySelectorAll("[data-openfav]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const id = b.getAttribute("data-openfav");
      const f = favCache.find(x=>x.id===id);
      if (f?.url) openUrl(f.url);
    });
  });

  $("favList").querySelectorAll("[data-copy]").forEach(b=>{
    b.addEventListener("click", async ()=>{
      const url = b.getAttribute("data-copy") || "";
      try{
        await navigator.clipboard.writeText(url);
        toast("Kopyalandı.");
      }catch{
        toast("Kopyalanamadı.");
      }
    });
  });

  $("favList").querySelectorAll("[data-retry]").forEach(b=>{
    b.addEventListener("click", async ()=>{
      // Bu buton worker'ın işi; biz sadece "son kontrol" alanını güncelleriz (isteğe bağlı)
      const id = b.getAttribute("data-retry");
      const ref = doc(db, "users", currentUser.uid, "favorites", id);
      await updateDoc(ref, { lastCheckedAt: nowIso(), updatedAt: serverTimestamp() }).catch(()=>{});
      toast("İstek gönderildi (worker varsa günceller).");
    });
  });

  $("favList").querySelectorAll("[data-graph]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const id = b.getAttribute("data-graph");
      const f = favCache.find(x=>x.id===id);
      openGraph(f);
    });
  });

  $("favList").querySelectorAll("[data-aicom]").forEach(b=>{
    b.addEventListener("click", async ()=>{
      const id = b.getAttribute("data-aicom");
      const f = favCache.find(x=>x.id===id);
      try{
        const t = await genAiComment(f);
        const ref = doc(db, "users", currentUser.uid, "favorites", id);
        await updateDoc(ref, { aiComment: t, aiCommentAt: nowIso(), updatedAt: serverTimestamp() });
        toast("AI yorum eklendi.");
      }catch(e){
        toast(e?.message || String(e));
      }
    });
  });

  $("favList").querySelectorAll("[data-del]").forEach(b=>{
    b.addEventListener("click", async ()=>{
      const id = b.getAttribute("data-del");
      await removeFavorite(id);
      toast("Silindi.");
    });
  });
}

$("favSort").addEventListener("change", renderFavorites);
$("btnRefreshFav").addEventListener("click", ()=> renderFavorites());
$("btnClearCache").addEventListener("click", clearAllCaches);

/* ---------- Auth state ---------- */
onAuthStateChanged(auth, async (u)=>{
  currentUser = u || null;

  if (!u){
    $("logoutBtn").style.display = "none";
    openLogin();
    if (unsubFav){ unsubFav(); unsubFav = null; }
    favCache = [];
    renderFavorites();
    return;
  }

  closeLogin();
  $("logoutBtn").style.display = "";

  // listen favorites
  const qFav = query(userFavCol(), orderBy("createdAt","desc"));
  unsubFav = onSnapshot(qFav, (snap)=>{
    const list = [];
    snap.forEach(d=>{
      const data = d.data() || {};
      list.push({
        id: d.id,
        ...data,
        _created: data?.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
      });
    });
    favCache = list;
    renderFavorites();
  });
});
