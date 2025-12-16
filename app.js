import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import {
  doc, getDoc, setDoc, updateDoc,
  collection, getDocs, addDoc, deleteDoc,
  serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ------------------ SİTELER ------------------ */
const SITES = [
  { key:"trendyol", name:"Trendyol",      build:(q)=>`https://www.trendyol.com/sr?q=${enc(q)}&sst=PRICE_BY_ASC` },
  { key:"hepsiburada", name:"Hepsiburada",build:(q)=>`https://www.hepsiburada.com/ara?q=${enc(q)}&sorting=price-asc` },
  { key:"n11", name:"N11",                build:(q)=>`https://www.n11.com/arama?q=${enc(q)}&srt=PRICE_LOW` },
  { key:"amazontr", name:"Amazon TR",     build:(q)=>`https://www.amazon.com.tr/s?k=${enc(q)}&s=price-asc-rank` },
  { key:"pazarama", name:"Pazarama",      build:(q)=>`https://www.pazarama.com/arama?q=${enc(q)}&sort=price_asc` },
  { key:"ciceksepeti", name:"ÇiçekSepeti",build:(q)=>`https://www.ciceksepeti.com/arama?query=${enc(q)}&sort=PRICE_ASC` },
  { key:"idefix", name:"İdefix",          build:(q)=>`https://www.idefix.com/arama/?q=${enc(q)}&sort=price_asc` },
];

function enc(s){ return encodeURIComponent(String(s||"").trim()); }

/* ------------------ DOM ------------------ */
const appShell = document.getElementById("appShell");
const authShell = document.getElementById("authShell");

const chips = document.getElementById("chips");
const qInput = document.getElementById("q");
const suggestBox = document.getElementById("suggestBox");
const btnSearch = document.getElementById("btnSearch");
const btnClearResults = document.getElementById("btnClearResults");
const results = document.getElementById("results");

const favList = document.getElementById("favList");
const btnRefreshFav = document.getElementById("btnRefreshFav");

const btnNotif = document.getElementById("btnNotif");
const btnAi = document.getElementById("btnAi");
const btnLogout = document.getElementById("btnLogout");

/* AUTH UI */
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const loginPane = document.getElementById("loginPane");
const registerPane = document.getElementById("registerPane");
const authError = document.getElementById("authError");

const loginEmail = document.getElementById("loginEmail");
const loginPass = document.getElementById("loginPass");
const regEmail = document.getElementById("regEmail");
const regPass = document.getElementById("regPass");
const regPass2 = document.getElementById("regPass2");
const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");

/* ------------------ STATE ------------------ */
let user = null;
let selected = new Set(SITES.map(s=>s.key)); // default hepsi açık
let lastResults = []; // {siteKey, q, url}
let favCache = [];    // favorites loaded

/* ------------------ AUTH TABS ------------------ */
tabLogin.onclick = ()=>{
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  loginPane.classList.remove("hidden");
  registerPane.classList.add("hidden");
  setAuthErr("");
};
tabRegister.onclick = ()=>{
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  registerPane.classList.remove("hidden");
  loginPane.classList.add("hidden");
  setAuthErr("");
};

function setAuthErr(msg){
  if(!msg){ authError.classList.add("hidden"); authError.textContent=""; return; }
  authError.classList.remove("hidden");
  authError.textContent = msg;
}

/* ------------------ FIRESTORE PATHS ------------------ */
function userDocRef(){ return doc(db, "users", user.uid); }
function favCol(){ return collection(db, "users", user.uid, "favorites"); }

/* ------------------ USER DOC ------------------ */
async function ensureUserDoc(){
  const ref = userDocRef();
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, { createdAt: serverTimestamp(), email: user.email });
  }
}

/* ------------------ UI: CHIPS ------------------ */
function renderChips(){
  chips.innerHTML = "";
  for(const s of SITES){
    const b = document.createElement("button");
    b.className = "chip" + (selected.has(s.key) ? " active":"");
    b.innerHTML = `<span class="dot"></span>${s.name}`;
    b.onclick = ()=>{
      if(selected.has(s.key)) selected.delete(s.key);
      else selected.add(s.key);
      b.classList.toggle("active");
    };
    chips.appendChild(b);
  }
}

/* ------------------ SUGGEST (basit düzeltme/öneri) ------------------ */
const COMMON_SUGGEST = [
  "iphone 15", "iphone 16", "samsung s24", "xiaomi pad 7", "dyson v15",
  "airfryer", "ps5", "airpods pro", "robot süpürge", "klima 12000 btu",
  "ram ddr5 32gb", "ssd 1tb nvme"
];

function showSuggest(list){
  if(!list.length){ suggestBox.classList.add("hidden"); suggestBox.innerHTML=""; return; }
  suggestBox.classList.remove("hidden");
  suggestBox.innerHTML = "";
  list.slice(0,6).forEach(txt=>{
    const d = document.createElement("div");
    d.className = "suggestItem";
    d.textContent = txt;
    d.onclick = ()=>{
      qInput.value = txt;
      suggestBox.classList.add("hidden");
      qInput.focus();
    };
    suggestBox.appendChild(d);
  });
}

qInput.addEventListener("input", ()=>{
  const v = qInput.value.trim().toLowerCase();
  if(v.length < 2){ showSuggest([]); return; }
  const hits = COMMON_SUGGEST.filter(x=>x.toLowerCase().includes(v));
  showSuggest(hits.length ? hits : [qInput.value.trim()]);
});

document.addEventListener("click",(e)=>{
  if(!suggestBox.contains(e.target) && e.target !== qInput){
    suggestBox.classList.add("hidden");
  }
});

/* ------------------ SEARCH ------------------ */
function doSearch(){
  const q = qInput.value.trim();
  if(!q) return;

  const picked = SITES.filter(s=>selected.has(s.key));
  lastResults = picked.map(s=>({
    siteKey: s.key,
    siteName: s.name,
    q,
    url: s.build(q),
  }));

  // burada “sıralama”: gerçek fiyat yok, o yüzden sabit: kullanıcı seçtiği sırada
  renderResults();
}

function isFaved(siteKey, q){
  // aynı query+site var mı?
  return favCache.some(f => f.query === q && f.siteKey === siteKey);
}

function renderResults(){
  results.innerHTML = "";
  if(!lastResults.length){
    results.innerHTML = `<div class="empty">Henüz arama yapılmadı.</div>`;
    return;
  }

  for(const r of lastResults){
    const row = document.createElement("div");
    row.className = "resultItem";

    const left = document.createElement("div");
    left.className = "resultLeft";
    left.innerHTML = `<div class="siteName">${r.siteName}</div><div class="querySmall">${escapeHtml(r.q)}</div>`;

    const acts = document.createElement("div");
    acts.className = "resultActions";

    const open = document.createElement("button");
    open.className = "openBtn";
    open.textContent = "Aç";
    open.onclick = ()=> window.open(r.url, "_blank");

    const fav = document.createElement("button");
    const faved = isFaved(r.siteKey, r.q);
    fav.className = "favBtn" + (faved ? " faved":"");
    fav.textContent = faved ? "❤ Favoride" : "♡ Favori Ekle";
    fav.onclick = async ()=>{
      await toggleFav(r);
      // satır UI yenile
      renderResults();
      await loadFavorites();
    };

    acts.appendChild(open);
    acts.appendChild(fav);

    row.appendChild(left);
    row.appendChild(acts);
    results.appendChild(row);
  }
}

btnSearch.onclick = doSearch;
qInput.addEventListener("keydown",(e)=>{ if(e.key==="Enter") doSearch(); });

btnClearResults.onclick = ()=>{
  lastResults = [];
  results.innerHTML = `<div class="empty">Henüz arama yapılmadı.</div>`;
};

/* ------------------ FAVORITES ------------------ */
/*
favorite doc:
{
  query: "xiaomi pad 7 256gb",
  siteKey: "amazontr",
  siteName: "Amazon TR",
  url: "...",
  createdAt,
  priceHistory: [{ price: 12999, at: ms }]
}
*/
async function toggleFav(r){
  const existing = favCache.find(f=> f.query===r.q && f.siteKey===r.siteKey);
  if(existing){
    await deleteDoc(doc(db,"users",user.uid,"favorites", existing.id));
  } else {
    await addDoc(favCol(), {
      query: r.q,
      siteKey: r.siteKey,
      siteName: r.siteName,
      url: r.url,
      createdAt: serverTimestamp(),
      priceHistory: []
    });
  }
}

async function loadFavorites(){
  const snap = await getDocs(query(favCol(), orderBy("createdAt","desc")));
  favCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  renderFavorites();
}

function renderFavorites(){
  favList.innerHTML = "";
  if(!favCache.length){
    favList.innerHTML = `<div class="empty">Favori yok.</div>`;
    return;
  }

  // aynı query altında grupla (karışıklık bitsin)
  const groups = new Map(); // query -> items[]
  for(const f of favCache){
    if(!groups.has(f.query)) groups.set(f.query, []);
    groups.get(f.query).push(f);
  }

  for(const [queryText, items] of groups.entries()){
    const card = document.createElement("div");
    card.className = "favCard";

    const head = document.createElement("div");
    head.className = "favHead";

    const left = document.createElement("div");
    left.innerHTML = `<h3 class="favTitle">${escapeHtml(queryText)}</h3>
                      <div class="smallMuted">Favorilediğin siteler: ${items.map(x=>x.siteName).join(", ")}</div>`;

    const badge = document.createElement("div");
    badge.className = "badge";
    const lastPrice = getLastKnownPrice(items);
    badge.textContent = lastPrice ? `Son: ${fmt(lastPrice)} ₺` : "Fiyat yok";

    head.appendChild(left);
    head.appendChild(badge);

    const grid = document.createElement("div");
    grid.className = "favGrid";

    // her site için: Aç + Copy Link
    for(const it of items){
      const open = document.createElement("button");
      open.className = "siteBtn";
      open.textContent = `${it.siteName} Aç`;
      open.onclick = ()=> window.open(it.url, "_blank");

      const copy = document.createElement("button");
      copy.className = "copyBtn";
      copy.textContent = "Copy Link";
      copy.onclick = async ()=>{
        await navigator.clipboard.writeText(it.url);
        toast("Kopyalandı ✅");
      };

      grid.appendChild(open);
      grid.appendChild(copy);
    }

    // fiyat ekle (gruba tek giriş)
    const priceRow = document.createElement("div");
    priceRow.className = "priceRow";

    const priceInp = document.createElement("input");
    priceInp.type = "number";
    priceInp.placeholder = "Fiyat (₺)";

    const btnAddPrice = document.createElement("button");
    btnAddPrice.className = "warnBtn";
    btnAddPrice.textContent = "Fiyat Ekle";
    btnAddPrice.onclick = async ()=>{
      const p = Number(priceInp.value);
      if(!p || p<=0) return toast("Geçerli fiyat gir.");
      await addPriceToGroup(queryText, p);
      priceInp.value = "";
      await loadFavorites();
      await checkDropAndNotify(); // ekler eklemez kontrol
    };

    const btnDel = document.createElement("button");
    btnDel.className = "dangerBtn";
    btnDel.textContent = "Grubu Sil";
    btnDel.onclick = async ()=>{
      // bu queryText'e ait tüm favorileri sil
      for(const it of items){
        await deleteDoc(doc(db,"users",user.uid,"favorites", it.id));
      }
      await loadFavorites();
    };

    priceRow.appendChild(priceInp);
    priceRow.appendChild(btnAddPrice);
    priceRow.appendChild(btnDel);

    // grafik: queryText'e ait tüm itemların priceHistory birleşik (en çok kayıt olanı al)
    const hist = mergeHistory(items);
    const chartWrap = document.createElement("div");
    chartWrap.className = "chartWrap";
    if(hist.length < 2){
      chartWrap.innerHTML = `<div class="chartHint">Grafik için en az 2 fiyat kaydı gir.</div>`;
    } else {
      const canvas = document.createElement("canvas");
      chartWrap.appendChild(canvas);
      setTimeout(()=>drawChart(canvas, hist), 0);
      const hint = document.createElement("div");
      hint.className = "chartHint";
      hint.textContent = "Tıklayıp büyütme (sonraki adımda ekleriz).";
      chartWrap.appendChild(hint);
    }

    card.appendChild(head);
    card.appendChild(grid);
    card.appendChild(priceRow);
    card.appendChild(chartWrap);

    favList.appendChild(card);
  }
}

function mergeHistory(items){
  // en uzun history hangi item'daysa onu kullan (şimdilik)
  let best = [];
  for(const it of items){
    const h = Array.isArray(it.priceHistory) ? it.priceHistory : [];
    if(h.length > best.length) best = h;
  }
  // sırala
  return best.slice().sort((a,b)=> (a.at||0)-(b.at||0));
}

function getLastKnownPrice(items){
  const h = mergeHistory(items);
  if(!h.length) return null;
  return h[h.length-1].price || null;
}

async function addPriceToGroup(queryText, price){
  // queryText'e bağlı tüm docs içine aynı history’yi yazmak istemiyoruz:
  // bir tanesine yazalım (ilk item'a)
  const items = favCache.filter(x=>x.query===queryText);
  if(!items.length) return;

  const target = items[0];
  const h = Array.isArray(target.priceHistory) ? target.priceHistory.slice() : [];
  h.push({ price, at: Date.now() });

  await updateDoc(doc(db,"users",user.uid,"favorites", target.id), { priceHistory: h });
}

btnRefreshFav.onclick = loadFavorites;

/* ------------------ NOTIFICATION ------------------ */
btnNotif.onclick = async ()=>{
  const p = await Notification.requestPermission();
  toast(p === "granted" ? "Bildirim izni verildi ✅" : "Bildirim izni yok.");
};

function notify(title, body){
  if(Notification.permission !== "granted") return;
  new Notification(title, { body });
}

/* %5+ düşüş kontrolü: son iki fiyatı karşılaştır */
async function checkDropAndNotify(){
  // her grup için history kontrol
  const groups = new Map();
  for(const f of favCache){
    if(!groups.has(f.query)) groups.set(f.query, []);
    groups.get(f.query).push(f);
  }
  for(const [qText, items] of groups.entries()){
    const hist = mergeHistory(items);
    if(hist.length < 2) continue;
    const prev = hist[hist.length-2].price;
    const last = hist[hist.length-1].price;
    if(!prev || !last) continue;
    const drop = (prev - last) / prev * 100;
    if(drop >= 5){
      notify("Fiyat düştü! 🎉", `${qText} %${drop.toFixed(1)} düştü. ${prev} → ${last} ₺`);
    }
  }
}

/* ------------------ AI DEMO ------------------ */
btnAi.onclick = ()=>{
  alert("AI Arama (demo): Şimdilik API KEY alanı hazır değil. Sonraki adımda Gemini/GPT entegrasyonunu ekleyeceğiz.");
};

/* ------------------ LOGOUT ------------------ */
btnLogout.onclick = ()=> signOut(auth);

/* ------------------ CHART ------------------ */
function drawChart(canvas, hist){
  const labels = hist.map(x=>{
    const d = new Date(x.at);
    return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`;
  });
  const data = hist.map(x=>x.price);

  // eslint-disable-next-line no-undef
  new Chart(canvas, {
    type:"line",
    data:{ labels, datasets:[{ label:"Fiyat", data, tension:.25 }] },
    options:{
      responsive:true,
      plugins:{ legend:{ display:false } },
      scales:{
        y:{ ticks:{ callback:(v)=> v + " ₺" } }
      }
    }
  });
}

/* ------------------ SMALL HELPERS ------------------ */
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g,(c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function fmt(n){ return Number(n).toLocaleString("tr-TR"); }

/* mini toast */
let toastTimer = null;
function toast(msg){
  clearTimeout(toastTimer);
  let el = document.getElementById("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    el.style.cssText = `
      position:fixed; left:50%; bottom:22px; transform:translateX(-50%);
      background:#12162a; color:#fff; padding:10px 12px; border-radius:14px;
      font-weight:900; z-index:99999; opacity:.95;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = "block";
  toastTimer = setTimeout(()=>{ el.style.display="none"; }, 1600);
}

/* ------------------ AUTH ACTIONS ------------------ */
btnLogin.onclick = async ()=>{
  try{
    setAuthErr("");
    const email = loginEmail.value.trim();
    const pass = loginPass.value;
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    setAuthErr(e?.message || "Giriş hatası");
  }
};

btnRegister.onclick = async ()=>{
  try{
    setAuthErr("");
    const email = regEmail.value.trim();
    const pass = regPass.value;
    const pass2 = regPass2.value;
    if(pass !== pass2) return setAuthErr("Şifreler eşleşmiyor.");
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await sendEmailVerification(cred.user);
    toast("Doğrulama maili gönderildi ✅");
  }catch(e){
    setAuthErr(e?.message || "Kayıt hatası");
  }
};

/* ------------------ AUTH STATE ------------------ */
onAuthStateChanged(auth, async (u)=>{
  user = u;

  if(!user){
    // App gizle auth göster
    appShell.classList.add("hidden");
    authShell.classList.remove("hidden");
    return;
  }

  authShell.classList.add("hidden");
  appShell.classList.remove("hidden");

  renderChips();
  results.innerHTML = `<div class="empty">Henüz arama yapılmadı.</div>`;

  await ensureUserDoc();
  await loadFavorites();
  await checkDropAndNotify();
});
