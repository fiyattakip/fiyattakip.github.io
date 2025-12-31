// app.js (STABLE + SECURE)
// - NO import/export (works with normal <script>)
// - Gemini API key is ONLY on backend (Render ENV), frontend never stores it.

(function(){
  const $ = (id)=>document.getElementById(id);

  // ---------- Global error logging ----------
  window.addEventListener("error", (ev)=>{ try{ console.error("JS ERROR:", ev.message, ev.error); }catch(_){} });
  window.addEventListener("unhandledrejection", (ev)=>{ try{ console.error("PROMISE ERROR:", ev.reason); }catch(_){} });

  // ---------- Toast ----------
  function toast(msg, type="info"){
    const t = $("toast");
    if (!t){ console.log("[toast]", type, msg); return; }
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> t.classList.add("hidden"), 2200);
  }
  window.toast = toast;

  // ---------- API URL (base) ----------
  const DEFAULT_API_BASE = "https://fiyattakip-api.onrender.com";
  function normalizeBase(u){
    u = String(u||"").trim();
    if (!u) return DEFAULT_API_BASE;
    u = u.replace(/\/+$/g,"");
    // if user pasted endpoint like /api/health, reduce to base
    u = u.replace(/\/(api\/)?(health|ai-yorum)\/?$/i,"");
    return u.replace(/\/+$/g,"");
  }
  function api(base, path){
    const b = normalizeBase(base);
    const p = String(path||"").replace(/^\/+/,"");
    return `${b}/${p}`;
  }
  let API_BASE = normalizeBase(localStorage.getItem("fiyattakip_api_base") || DEFAULT_API_BASE);

  // ---------- Pages ----------
  function showPage(key){
    document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
    document.querySelectorAll(".tabbar .tab").forEach(t=>t.classList.remove("active"));
    const page = document.querySelector(`#page-${CSS.escape(key)}`);
    if (page) page.classList.add("active");
    const tab = document.querySelector(`.tabbar .tab[data-page="${CSS.escape(key)}"]`);
    if (tab) tab.classList.add("active");

    if (key==="favs") renderFavorites();
  }
  window.showPage = showPage;

  // ---------- Clipboard ----------
  async function copyToClipboard(text){
    try{ await navigator.clipboard.writeText(text); toast("Kopyalandı","success"); }
    catch(_){
      const ta=document.createElement("textarea");
      ta.value=text; ta.style.position="fixed"; ta.style.left="-9999px";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try{ document.execCommand("copy"); toast("Kopyalandı","success"); }catch(__){}
      document.body.removeChild(ta);
    }
  }
  window.copyToClipboard = copyToClipboard;

  // ---------- Search mode ----------
  function setSearchMode(mode){
    localStorage.setItem("searchMode", mode);
    $("modeNormal")?.classList.toggle("active", mode==="normal");
    $("modeFiyat")?.classList.toggle("active", mode==="fiyat");
    $("modeAI")?.classList.toggle("active", mode==="ai");
  }
  function getSearchMode(){ return localStorage.getItem("searchMode") || "normal"; }

  // ---------- Sites (link only) ----------
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
            <button class="btnGhost sm btnCopy" type="button" data-copy-url="${url}" title="Linki kopyala">⧉</button>
            <button class="btnGhost sm btnFav" type="button" data-fav-url="${url}" data-site-key="${s.key}" data-site-name="${s.name}" data-query="${q}">🤍</button>
          </div>
        </div>
      `;
      card.querySelector(".btnOpen")?.addEventListener("click", ()=> window.open(url,"_blank","noopener"));
      card.querySelector(".btnFav")?.addEventListener("click", ()=> toggleFavorite({ url, siteKey:s.key, siteName:s.name, query:q }));
      container.appendChild(card);
    }
    applyFavUI();
  }

  // ---------- Favorites (localStorage, stable) ----------
  function favStoreKey(){
    const uid = window.currentUser?.uid || "guest";
    return `fiyattakip_favs_${uid}`;
  }
  function loadFavorites(){
    try{ return JSON.parse(localStorage.getItem(favStoreKey()) || "[]"); }
    catch(_){ return []; }
  }
  function saveFavorites(list){
    localStorage.setItem(favStoreKey(), JSON.stringify(list||[]));
  }
  function favIdFromUrl(url){
    try{
      const u = new URL(url);
      const key = (u.hostname + u.pathname + u.search).toLowerCase();
      let h=0; for (let i=0;i<key.length;i++){ h=((h<<5)-h)+key.charCodeAt(i); h|=0; }
      return "fav_" + Math.abs(h);
    }catch(_){
      return "fav_" + Math.random().toString(36).slice(2);
    }
  }
  function isFav(url){
    const id = favIdFromUrl(url);
    return loadFavorites().some(f=>f.id===id);
  }
  function toggleFavorite(fav){
    if (!window.currentUser){
      openLogin();
      return;
    }
    const list = loadFavorites();
    const id = favIdFromUrl(fav.url);
    const idx = list.findIndex(x=>x.id===id);
    if (idx>=0){
      list.splice(idx,1);
      toast("Favoriden çıkarıldı","info");
    }else{
      list.unshift({ id, ...fav, createdAt: Date.now() });
      toast("Favorilere eklendi","success");
    }
    saveFavorites(list);
    applyFavUI();
    if (document.querySelector("#page-favs.active")) renderFavorites();
  }
  function applyFavUI(){
    document.querySelectorAll("[data-fav-url]").forEach(btn=>{
      const url = btn.getAttribute("data-fav-url") || "";
      const fav = isFav(url);
      btn.classList.toggle("isFav", fav);
      btn.textContent = fav ? "❤️" : "🤍";
      btn.title = fav ? "Favoride" : "Favoriye ekle";
    });
  }

  function renderFavorites(){
    const listEl = $("favList");
    if (!listEl) return;
    const list = loadFavorites();
    listEl.innerHTML = "";
    if (!list.length){
      listEl.innerHTML = `<div class="emptyState">Favori yok.</div>`;
      return;
    }

    for (const fav of list){
      const card = document.createElement("div");
      card.className = "cardBox favoriteCard";
      card.innerHTML = `
        <div class="favoriteHeader">
          <div class="favoriteInfo">
            <div class="favSite">${fav.siteName || "Favori"}</div>
            <div class="favQuery">${fav.query || ""}</div>
          </div>
          <div class="favoriteActions">
            <button class="btnGhost sm" type="button" data-open="${fav.url}">Aç</button>
            <button class="btnGhost sm" type="button" data-copy-url="${fav.url}">⧉</button>
            <button class="btnGhost sm btnAiComment" type="button" data-product="${encodeURIComponent(fav.query||"")}">🤖 AI</button>
            <button class="btnGhost sm btnFav isFav" type="button" data-fav-url="${fav.url}">❤️</button>
          </div>
        </div>
      `;
      card.querySelector("[data-open]")?.addEventListener("click", ()=> window.open(fav.url,"_blank","noopener"));
      card.querySelector(".btnFav")?.addEventListener("click", ()=> toggleFavorite({ url:fav.url, siteKey:fav.siteKey, siteName:fav.siteName, query:fav.query }));
      card.querySelector(".btnAiComment")?.addEventListener("click", ()=> aiYorum(String(fav.query||"")));
      listEl.appendChild(card);
    }
    applyFavUI();
  }

  // ---------- AI comment (backend) ----------
  async function aiYorum(product){
    const p = String(product||"").trim();
    if (!p){ toast("Ürün adı yok","error"); return; }
    toast("🤖 AI yorum hazırlanıyor...", "info");
    try{
      const res = await fetch(api(API_BASE, "api/ai-yorum"), {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ urun: p })
      });
      const data = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(data.error || ("HTTP "+res.status));
      const text = data.text || data.yorum || "AI yorum alınamadı.";
      alert(text);
      toast("✅ AI yorum hazır", "success");
    }catch(e){
      console.error(e);
      toast("AI yorum alınamadı", "error");
      alert("AI yorum alınamadı");
    }
  }
  window.aiYorum = aiYorum;

  // ---------- Camera (stable placeholder) ----------
  async function cameraAiSearch(){
    // Most stable: prompt + optional camera later
    const q = prompt("Kamera AI (beta): Şimdilik ürün adını yaz (örn: Xiaomi Pad 7 256GB)");
    if (!q) return;
    // AI mode behaviour
    showPage("search");
    renderSiteList($("normalList"), q);
    aiYorum(q);
  }
  window.cameraAiSearch = cameraAiSearch;

  // ---------- API Settings modal ----------
  async function checkAPIStatus(){
    const statusElement = $("apiStatus");
    if (!statusElement) return;
    try{
      statusElement.textContent = "Bağlanıyor...";
      statusElement.className = "apiStatus checking";
      const res = await fetch(api(API_BASE, "health"), { method:"GET" });
      if (res.ok){
        statusElement.textContent = "Çalışıyor";
        statusElement.className = "apiStatus online";
      }else{
        statusElement.textContent = "Hata";
        statusElement.className = "apiStatus error";
      }
    }catch(_){
      statusElement.textContent = "Bağlantı yok";
      statusElement.className = "apiStatus offline";
    }
  }
  function saveAPISettings(){
    const url = ($("apiUrl")?.value || "").trim();
    API_BASE = normalizeBase(url || DEFAULT_API_BASE);
    localStorage.setItem("fiyattakip_api_base", API_BASE);
    toast("API URL kaydedildi","success");
    closeAPIModal();
  }

  function openAPIModal(){
    const m = $("apiModal"); if(!m) return;
    m.classList.add("show");
    $("apiUrl").value = API_BASE;
    checkAPIStatus();
  }
  function closeAPIModal(){
    const m = $("apiModal"); if(!m) return;
    m.classList.remove("show");
  }

  // ---------- Login (Firebase Auth compat) ----------
  window.currentUser = null;

  function setAuthPane(mode){
    const loginPane=$("loginPane"), registerPane=$("registerPane");
    const tL=$("tabLogin"), tR=$("tabRegister");
    if (!loginPane || !registerPane) return;
    const isReg = mode==="register";
    loginPane.classList.toggle("hidden", isReg);
    registerPane.classList.toggle("hidden", !isReg);
    tL?.classList.toggle("isActive", !isReg);
    tR?.classList.toggle("isActive", isReg);
  }

  function openLogin(){
    setAuthPane("login");
    const m=$("loginModal"); if(!m) return;
    m.classList.add("show");
    document.body.classList.add("modalOpen");
  }
  function closeLogin(){
    const m=$("loginModal"); if(!m) return;
    m.classList.remove("show");
    document.body.classList.remove("modalOpen");
  }

  async function doEmailLogin(isRegister){
    const email = (isRegister ? $("regEmail")?.value : $("loginEmail")?.value || "").trim();
    const pass  = (isRegister ? $("regPass")?.value : $("loginPass")?.value || "");
    const pass2 = (isRegister ? $("regPass2")?.value : "");
    if (!email || !pass) return toast("E-posta ve şifre gir.","error");
    if (isRegister){
      if (pass.length<6) return toast("Şifre en az 6 karakter.","error");
      if (pass !== pass2) return toast("Şifreler uyuşmuyor.","error");
    }
    if (!window.auth){ toast("Firebase yüklenemedi.","error"); return; }

    try{
      if (isRegister){
        await auth.createUserWithEmailAndPassword(email, pass);
        toast("Kayıt tamam.","success");
      }else{
        await auth.signInWithEmailAndPassword(email, pass);
        toast("Giriş başarılı.","success");
      }
    }catch(e){
      console.error(e);
      toast("Hata: " + (e?.message||""), "error");
    }
  }

  async function doGoogleLogin(){
    if (!window.auth || !window.googleProvider){ toast("Firebase yüklenemedi.","error"); return; }
    try{
      await auth.signInWithPopup(googleProvider);
    }catch(e){
      console.error(e);
      toast("Google giriş hatası", "error");
    }
  }

  // ---------- Wire UI ----------
  function addCameraButton(){
    const tabbar = document.querySelector(".tabbar");
    if (!tabbar) return;
    const spacer = tabbar.querySelector(".tabSpacer");
    if (!spacer) return;
    const btn = document.createElement("button");
    btn.id = "fabCamera";
    btn.className = "tab main";
    btn.type = "button";
    btn.innerHTML = `<span class="ico">📷</span><span class="lbl">Kamera</span>`;
    btn.addEventListener("click", cameraAiSearch);
    spacer.replaceWith(btn);
  }

  function wireUI(){
    // Mode
    $("modeNormal")?.addEventListener("click", ()=> setSearchMode("normal"));
    $("modeFiyat")?.addEventListener("click", ()=> setSearchMode("fiyat"));
    $("modeAI")?.addEventListener("click", ()=> setSearchMode("ai"));
    setSearchMode(getSearchMode());

    // Search button
    $("btnNormal")?.addEventListener("click", ()=>{
      const query = ($("qNormal")?.value || "").trim();
      if (!query) return toast("Ürün adı girin","error");
      const mode = getSearchMode();

      showPage("search");
      renderSiteList($("normalList"), query);

      // Fiyat/Aİ modunda: fiyat çekme yok → sadece AI özet
      if (mode === "ai" || mode === "fiyat"){
        aiYorum(query);
      }
    });

    $("qNormal")?.addEventListener("keypress",(e)=>{ if (e.key==="Enter") $("btnNormal")?.click(); });

    // API modal
    $("btnApiSettings")?.addEventListener("click", openAPIModal);
    $("closeApi")?.addEventListener("click", closeAPIModal);
    $("apiBackdrop")?.addEventListener("click", closeAPIModal);
    $("btnSaveApi")?.addEventListener("click", saveAPISettings);
    $("btnTestApi")?.addEventListener("click", checkAPIStatus);

    // Login modal
    $("tabLogin")?.addEventListener("click", ()=> setAuthPane("login"));
    $("tabRegister")?.addEventListener("click", ()=> setAuthPane("register"));
    $("btnLogin")?.addEventListener("click", ()=> doEmailLogin(false));
    $("btnRegister")?.addEventListener("click", ()=> doEmailLogin(true));
    $("btnGoogleLogin")?.addEventListener("click", doGoogleLogin);
    $("btnGoogleLogin2")?.addEventListener("click", doGoogleLogin);
    $("closeLogin")?.addEventListener("click", closeLogin);
    $("loginBackdrop")?.addEventListener("click", closeLogin);

    // Clear search
    $("btnClearSearch")?.addEventListener("click", ()=> { $("normalList").innerHTML=""; toast("Temizlendi","info"); });

    // Logout
    $("logoutBtn")?.addEventListener("click", async ()=>{
      try{ await auth.signOut(); toast("Çıkış yapıldı","info"); }
      catch(e){ console.error(e); }
    });

    // Delegated copy
    document.addEventListener("click", async (e)=>{
      const btn = e.target?.closest?.("[data-copy-url]");
      if (!btn) return;
      const url = btn.getAttribute("data-copy-url") || "";
      if (url) await copyToClipboard(url);
    });
  }

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", ()=>{
    wireUI();
    addCameraButton();

    // Firebase config check
    if (typeof window.firebaseConfigLooksInvalid === "function" && firebaseConfigLooksInvalid()){
      toast("Firebase config eksik/yanlış.", "error");
    }

    // Auth state
    if (window.auth && auth.onAuthStateChanged){
      auth.onAuthStateChanged((user)=>{
        window.currentUser = user || null;
        if (!user) openLogin(); else closeLogin();
        applyFavUI();
        if (document.querySelector("#page-favs.active")) renderFavorites();
      });
    }else{
      // If firebase not available, allow app but no favorites
      toast("Firebase yüklenemedi. Favoriler kapalı.", "error");
    }

    // Default
    showPage("home");
  });
})();
