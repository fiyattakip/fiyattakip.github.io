// app.js (theme preserved) — Link-only normal search + Firebase auth (email + Google)
// Normal arama: e-ticaret sitelerinden ÜRÜN ÇEKMEZ; sadece arama LİNKİ üretir (stabil).
// Tema/HTML bozulmaz.

import { auth, googleProvider, firebaseConfigLooksInvalid } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const $ = (id) => document.getElementById(id);

// ---------- Toast ----------
function toast(msg){
  const t = $("toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.add("hidden"), 2200);
}

// ---------- Pages / Tabs ----------
function showPage(key){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));

  const page = document.querySelector(`#page-${CSS.escape(key)}`);
  if (page) page.classList.add("active");

  const tab = document.querySelector(`.tab[data-page="${CSS.escape(key)}"]`);
  if (tab) tab.classList.add("active");
}

// ---------- Search mode (Normal / AI toggle on home) ----------
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

// ---------- Login modal helpers ----------
function openLogin(){
  const m = $("loginModal");
  if (!m) return;
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
  document.body.classList.add("modalOpen");
}
function closeLogin(){
  const m = $("loginModal");
  if (!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden","true");
  document.body.classList.remove("modalOpen");
}

// ---------- Sites (link-only) ----------
const SITES = [
  { key:"trendyol", name:"Trendyol", build:q=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", build:q=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11", name:"N11", build:q=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazontr", name:"Amazon TR", build:q=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key:"pazarama", name:"Pazarama", build:q=>`https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key:"ciceksepeti", name:"ÇiçekSepeti", build:q=>`https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key:"idefix", name:"idefix", build:q=>`https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` },
];

function renderSiteList(container, query){
  if (!container) return;
  const q = String(query||"").trim();
  if (!q){
    container.innerHTML = `<div class="cardBox"><b>Bir şey yaz.</b></div>`;
    return;
  }

  container.innerHTML = "";
  for (const s of SITES){
    const url = s.build(q);
    const card = document.createElement("div");
    card.className = "cardBox";
    card.innerHTML = `
      <div class="rowLine">
        <div>
          <div class="ttl">${s.name}</div>
          <div class="sub">${q}</div>
        </div>
        <div class="actions">
          <button class="btnPrimary sm btnOpen" type="button">Aç</button>
        </div>
      </div>
      <div class="mini">${url}</div>
    `;
    card.querySelector(".btnOpen")?.addEventListener("click", ()=> {
      window.open(url, "_blank", "noopener");
    });
    container.appendChild(card);
  }
}

window.renderSiteList = renderSiteList;
window.doNormalSearch = (query)=>{
  showPage("search");
  renderSiteList($("normalList"), query);
};

// ---------- Auth state ----------
window.currentUser = null;

async function doEmailLogin(isRegister){
  const email = ($("email")?.value || "").trim();
  const pass  = ($("pass")?.value || "");
  if (!email || !pass) return toast("E-posta ve şifre gir.");

  try{
    if (isRegister){
      await createUserWithEmailAndPassword(auth, email, pass);
      toast("Kayıt tamam.");
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Giriş başarılı.");
    }
  }catch(e){
    const msg = String(e?.message || e || "");
    if (msg.includes("auth/unauthorized-domain")){
      toast("Google giriş hatası (unauthorized-domain). Firebase > Auth > Settings > Authorized domains: fiyattakip.github.io ekle.");
      return;
    }
    toast("Hata: " + msg.replace(/^Firebase:\s*/,""));
  }
}

async function doGoogleLogin(){
  try{
    await signInWithPopup(auth, googleProvider);
    return;
  }catch(e){
    // popup blocked / mobile -> redirect
    try{
      await signInWithRedirect(auth, googleProvider);
      return;
    }catch(e2){
      const msg = String(e2?.message || e?.message || e2 || e || "");
      if (msg.includes("auth/unauthorized-domain")){
        toast("Google giriş için domain yetkisi yok. Firebase > Authentication > Settings > Authorized domains içine siteni ekle (örn: fiyattakip.github.io).");
        return;
      }
      toast("Google giriş hatası: " + msg.replace(/^Firebase:\s*/,""));
    }
  }
}

// Redirect dönüşünü sessizce işle
getRedirectResult(auth).catch(()=>{});

// ---------- Wire UI ----------
function wireUI(){
  // bottom tabs
  document.querySelectorAll(".tab[data-page]").forEach(btn=>{
    btn.addEventListener("click", ()=> showPage(btn.dataset.page));
  });

  $("modeNormal")?.addEventListener("click", ()=> setSearchMode("normal"));
  $("modeAI")?.addEventListener("click", ()=> setSearchMode("ai"));
  setSearchMode(getSearchMode());

  // close login guard
  $("closeLogin")?.addEventListener("click", ()=>{
    if (!window.currentUser){
      toast("Giriş yapmadan kullanamazsın.");
      openLogin();
      return;
    }
    closeLogin();
  });
  $("loginBackdrop")?.addEventListener("click", ()=>{
    if (!window.currentUser){
      toast("Giriş yapmadan kullanamazsın.");
      openLogin();
      return;
    }
    closeLogin();
  });

  // login buttons
  $("btnLogin")?.addEventListener("click", ()=>doEmailLogin(false));
  $("btnRegister")?.addEventListener("click", ()=>doEmailLogin(true));
  $("btnGoogle")?.addEventListener("click", ()=>doGoogleLogin());

  // auth tab switch (email/google) if present
  document.querySelectorAll(".segBtn[data-auth]").forEach(b=>{
    b.addEventListener("click", ()=>{
      document.querySelectorAll(".segBtn[data-auth]").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      const which = b.dataset.auth;
      const emailBox = $("authEmail");
      const gBox = $("authGoogle");
      if (emailBox && gBox){
        emailBox.style.display = which==="email" ? "" : "none";
        gBox.style.display = which==="google" ? "" : "none";
      }
    });
  });

  // home search
  $("btnNormal")?.addEventListener("click", async ()=>{
    const q = ($("qNormal")?.value || "").trim();
    if (!q) return toast("Bir şey yaz.");
    // Normal / AI toggle: AI yoksa normal davran
    if (getSearchMode()==="ai" && typeof window.aiText === "function"){
      toast("AI sorgu hazırlanıyor...");
      try{
        const built = await window.aiText(`Sadece tek satır arama sorgusu üret. Çıktı sadece düz metin. Kullanıcı: ${q}`);
        const qq = String(built||q).replace(/\s+/g," ").trim().slice(0,80);
        $("qNormal").value = qq;
        window.doNormalSearch(qq);
      }catch{
        window.doNormalSearch(q);
      }
    } else {
      window.doNormalSearch(q);
    }
  });

  // camera button (AI visual sayfaya gitsin)
  $("fabCamera")?.addEventListener("click", ()=>{
    // Eğer görsel sayfa yoksa settings'e kayma olmasın:
    const visualTab = $("tabAIVisual") || $("tabVisual");
    if (visualTab) visualTab.click();
    else showPage("settings");
  });

  // logout if exists
  $("logoutBtn")?.addEventListener("click", async ()=>{
    try{ await signOut(auth); }catch{}
  });
}

// ---------- Auth visibility ----------
function setAuthedUI(isAuthed){
  // App içinde giriş zorunlu: authed değilse modal aç
  if (!isAuthed) openLogin();
  else closeLogin();
}

// Boot
window.addEventListener("DOMContentLoaded", ()=>{
  wireUI();

  if (firebaseConfigLooksInvalid()){
    toast("Firebase config eksik/yanlış. firebase.js içindeki değerleri kontrol et.");
  }

  onAuthStateChanged(auth, (u)=>{
    window.currentUser = u || null;
    setAuthedUI(!!u);
  });
});
