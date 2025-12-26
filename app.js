// app.js — Click freeze fix + tab navigation + Normal/AI toggle
// Bu dosya sadece UI katmanını güvenli hale getirir.
// Mevcut arama/favori/ai mantığını bozmaz; varsa global fonksiyonlarını çağırır.

const $ = (id) => document.getElementById(id);

function toast(msg){
  if (typeof window.toast === "function") return window.toast(msg);
  console.log(msg);
}

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
  unlockUI();
}

function unlockUI(){
  const m = $("loginModal");
  if (m && !m.classList.contains("show")){
    m.style.pointerEvents = "none";
  }else if(m){
    m.style.pointerEvents = "";
  }
  document.body.classList.remove("modalOpen");

  document.querySelectorAll(".modalWrap,.modalBack,.overlay,.backdrop").forEach(el=>{
    const cs = getComputedStyle(el);
    const invisible = (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0);
    if (invisible) el.style.pointerEvents = "none";
  });
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

  $("fabCamera")?.addEventListener("click", ()=>{
    $("tabVisual")?.click();
    setTimeout(()=> $("btnVisual")?.click(), 120);
  });

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
  unlockUI();
  if (window.currentUser === null) openLogin();
});

setTimeout(()=>{ wireUI(); unlockUI(); }, 600);


// Bottom nav click handler (SAFE)
document.querySelectorAll('#bottomNav .bn-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;

    document.querySelectorAll('#bottomNav .bn-item')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('[data-page]')
      .forEach(p => p.style.display = 'none');

    const page = document.querySelector(`[data-page="${target}"]`);
    if (page) page.style.display = 'block';
  });
});
