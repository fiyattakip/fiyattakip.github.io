// app.js
import { auth, db, fb } from "./firebase.js";

const SITES = [
  { key: "trendyol", name: "Trendyol", searchUrl: (q) => `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key: "hepsiburada", name: "Hepsiburada", searchUrl: (q) => `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key: "n11", name: "N11", searchUrl: (q) => `https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key: "amazon", name: "Amazon TR", searchUrl: (q) => `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key: "pazarama", name: "Pazarama", searchUrl: (q) => `https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key: "ciceksepeti", name: "ÇiçekSepeti", searchUrl: (q) => `https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key: "idefix", name: "İdefix", searchUrl: (q) => `https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` }
];

const $ = (sel) => document.querySelector(sel);

let currentUser = null;
let lastQuery = "";
let currentResults = []; // {siteKey, siteName, query, url, favId?}
let favorites = []; // {id, productName, siteKey, siteName, url, createdAt}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

function setAuthOverlay(open) {
  document.body.classList.toggle("auth-open", !!open);
  const overlay = $("#authRoot");
  if (overlay) overlay.style.display = open ? "flex" : "none";
}

function toast(msg) {
  const t = $("#toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

function normalizePrice(input) {
  // "12.999,00" -> 12999
  const s = String(input).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function ensureUserDoc(uid, email) {
  const ref = fb.doc(db, "users", uid);
  const snap = await fb.getDoc(ref);
  if (!snap.exists()) {
    await fb.setDoc(ref, { email, createdAt: Date.now() });
  }
}

async function loadFavorites() {
  if (!currentUser) return;
  const colRef = fb.collection(db, "users", currentUser.uid, "favorites");
  const qs = await fb.getDocs(colRef);
  favorites = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderFavorites();
  renderResults(); // favori işaretleri güncellensin
}

async function addFavorite(siteKey, siteName, productName, url) {
  const colRef = fb.collection(db, "users", currentUser.uid, "favorites");
  // aynı site+url varsa tekrar ekleme
  const exists = favorites.find((f) => f.url === url);
  if (exists) return;

  const docRef = await fb.addDoc(colRef, {
    siteKey,
    siteName,
    productName,
    url,
    createdAt: Date.now()
  });

  favorites.unshift({ id: docRef.id, siteKey, siteName, productName, url, createdAt: Date.now() });
  renderResults();
  renderFavorites();
  toast("Favorilere eklendi");
}

async function removeFavoriteByUrl(url) {
  const f = favorites.find((x) => x.url === url);
  if (!f) return;

  await fb.deleteDoc(fb.doc(db, "users", currentUser.uid, "favorites", f.id));
  favorites = favorites.filter((x) => x.id !== f.id);
  renderResults();
  renderFavorites();
  toast("Favoriden çıkarıldı");
}

async function addPriceRecord(fav, priceNumber) {
  const colRef = fb.collection(db, "users", currentUser.uid, "favorites", fav.id, "prices");
  await fb.addDoc(colRef, {
    price: priceNumber,
    ts: Date.now()
  });
  toast("Fiyat kaydedildi");
  await renderFavorites(); // güncelle
}

async function getLastPrices(favId, take = 5) {
  const colRef = fb.collection(db, "users", currentUser.uid, "favorites", favId, "prices");
  const q1 = fb.query(colRef, fb.orderBy("ts", "desc"), fb.limit(take));
  const qs = await fb.getDocs(q1);
  return qs.docs.map((d) => d.data());
}

function renderResults() {
  const root = $("#results");
  if (!root) return;

  if (!lastQuery) {
    root.innerHTML = `<div class="empty">Henüz arama yapılmadı.</div>`;
    return;
  }

  // (Sıralama: istersen burada “en düşükten yükseğe” gerçek fiyat çekemediğimiz için sadece site sırası var.
  // Fiyatları manuel eklediğinde favoriler kısmında “en son fiyat”a göre sıralayacağız.)
  const html = currentResults.map((r) => {
    const isFav = !!favorites.find((f) => f.url === r.url);
    return `
      <div class="rowcard">
        <div class="rowleft">
          <div class="sitename">${escapeHtml(r.siteName)}</div>
          <div class="query">${escapeHtml(r.query)}</div>
        </div>
        <div class="rowright">
          <button class="btn open" data-open="${escapeHtml(r.url)}">Aç</button>
          <button class="btn fav ${isFav ? "on" : ""}" data-fav="${escapeHtml(r.url)}" data-site="${escapeHtml(r.siteKey)}">
            ${isFav ? "♥ Favoride" : "♡ Favori Ekle"}
          </button>
        </div>
      </div>
    `;
  }).join("");

  root.innerHTML = html;
}

async function renderFavorites() {
  const root = $("#favorites");
  if (!root) return;

  if (!favorites.length) {
    root.innerHTML = `<div class="empty">Favori yok.</div>`;
    return;
  }

  // Favorileri “son fiyatı olanlar önce / en düşükten yükseğe” göstermek için:
  // her favorinin son fiyatını çekiyoruz (az sayıda olduğu için sorun yok)
  const enriched = [];
  for (const f of favorites) {
    const last = await getLastPrices(f.id, 1);
    const lastPrice = last[0]?.price ?? null;
    enriched.push({ ...f, lastPrice });
  }

  // önce fiyatı olanlar, sonra olmayanlar; fiyatı olanlarda düşükten yükseğe
  enriched.sort((a, b) => {
    const ap = a.lastPrice, bp = b.lastPrice;
    if (ap == null && bp == null) return 0;
    if (ap == null) return 1;
    if (bp == null) return -1;
    return ap - bp;
  });

  const html = await Promise.all(enriched.map(async (f) => {
    const last5 = await getLastPrices(f.id, 5);
    const mini = last5.length
      ? `<div class="mini">
          ${last5.map((p) => `<span>${new Date(p.ts).toLocaleDateString("tr-TR")} • <b>${p.price}₺</b></span>`).join("")}
        </div>`
      : `<div class="mini muted">Grafik için en az 2 fiyat kaydı.</div>`;

    return `
      <div class="favcard">
        <div class="favtop">
          <div>
            <div class="favtitle">${escapeHtml(f.productName)}</div>
            <div class="favsub">${escapeHtml(f.siteName)} • Link gizli</div>
          </div>
          <div class="badge">${f.lastPrice == null ? "Fiyat yok" : `${f.lastPrice}₺`}</div>
        </div>

        <div class="favactions">
          <button class="btn small open" data-open="${escapeHtml(f.url)}">${escapeHtml(f.siteName)} Aç</button>
          <button class="btn small copy" data-copy="${escapeHtml(f.url)}">Copy Link</button>
          <button class="btn small addprice" data-addprice="${escapeHtml(f.id)}">Fiyat Ekle</button>
          <button class="btn small danger" data-del="${escapeHtml(f.url)}">Sil</button>
        </div>

        ${mini}
      </div>
    `;
  }));

  root.innerHTML = html.join("");
}

function buildResults(queryText) {
  lastQuery = queryText;
  currentResults = SITES.map((s) => ({
    siteKey: s.key,
    siteName: s.name,
    query: queryText,
    url: s.searchUrl(queryText)
  }));
  renderResults();
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).then(() => toast("Link kopyalandı")).catch(() => {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Link kopyalandı");
  });
}

function bindEvents() {
  // arama
  $("#searchBtn")?.addEventListener("click", () => {
    const q = ($("#query")?.value || "").trim();
    if (!q) return toast("Ürün adını yaz");
    buildResults(q);
  });

  $("#clearBtn")?.addEventListener("click", () => {
    $("#query").value = "";
    lastQuery = "";
    currentResults = [];
    renderResults();
  });

  // AI demo
  $("#aiBtn")?.addEventListener("click", () => {
    // alert yerine toast
    toast("AI Arama (demo): Şimdilik API KEY alanı hazır değil.");
  });

  // logout
  $("#logoutBtn")?.addEventListener("click", async () => {
    await fb.signOut(auth);
  });

  // favori yenile
  $("#favRefresh")?.addEventListener("click", loadFavorites);

  // delegated clicks
  document.addEventListener("click", async (e) => {
    const t = e.target;

    // aç
    const openUrl = t?.dataset?.open;
    if (openUrl) {
      window.open(openUrl, "_blank", "noopener");
      return;
    }

    // favori ekle/çıkar
    const favUrl = t?.dataset?.fav;
    if (favUrl) {
      if (!currentUser) return toast("Giriş yapmalısın");
      const siteKey = t.dataset.site;
      const siteName = SITES.find((x) => x.key === siteKey)?.name || siteKey;
      const productName = lastQuery || "Ürün";
      const isFav = !!favorites.find((f) => f.url === favUrl);
      if (isFav) {
        await removeFavoriteByUrl(favUrl);
      } else {
        await addFavorite(siteKey, siteName, productName, favUrl);
      }
      return;
    }

    // favori sil
    const delUrl = t?.dataset?.del;
    if (delUrl) {
      await removeFavoriteByUrl(delUrl);
      return;
    }

    // copy
    const copyUrl = t?.dataset?.copy;
    if (copyUrl) {
      copyToClipboard(copyUrl);
      return;
    }

    // fiyat ekle
    const favId = t?.dataset?.addprice;
    if (favId) {
      const fav = favorites.find((x) => x.id === favId);
      if (!fav) return;
      const input = prompt("Fiyat gir (örn: 12999 veya 12.999,00)");
      if (input == null) return;
      const p = normalizePrice(input);
      if (p == null) return toast("Geçersiz fiyat");
      await addPriceRecord(fav, p);
      return;
    }
  });
}

function renderAuth() {
  // basit auth ekranı (sende zaten var olabilir; yoksa çalışır)
  const root = $("#authRoot");
  if (!root) return;

  root.innerHTML = `
    <div class="auth-overlay">
      <div class="auth-card">
        <div class="auth-title">fiyattakip</div>
        <div class="auth-tabs">
          <button class="tab on" id="tabLogin">Giriş</button>
          <button class="tab" id="tabRegister">Kayıt</button>
        </div>

        <div id="authForm"></div>
      </div>
    </div>
  `;

  const authForm = $("#authForm");
  const showLogin = () => {
    $("#tabLogin").classList.add("on");
    $("#tabRegister").classList.remove("on");
    authForm.innerHTML = `
      <div class="field"><input id="email" type="email" placeholder="E-posta"></div>
      <div class="field"><input id="pass" type="password" placeholder="Şifre"></div>
      <button class="btn full" id="doLogin">Giriş Yap</button>
    `;
    $("#doLogin").onclick = async () => {
      const email = $("#email").value.trim();
      const pass = $("#pass").value.trim();
      if (!email || !pass) return toast("E-posta/şifre gir");
      try {
        await fb.signInWithEmailAndPassword(auth, email, pass);
      } catch (err) {
        toast("Giriş hatası: " + (err?.message || "bilinmiyor"));
      }
    };
  };

  const showRegister = () => {
    $("#tabRegister").classList.add("on");
    $("#tabLogin").classList.remove("on");
    authForm.innerHTML = `
      <div class="field"><input id="email2" type="email" placeholder="E-posta"></div>
      <div class="field"><input id="pass2" type="password" placeholder="Şifre"></div>
      <div class="field"><input id="pass3" type="password" placeholder="Şifre (tekrar)"></div>
      <button class="btn full" id="doRegister">Hesap Oluştur</button>
      <div class="hint">Kayıt sonrası e-posta doğrulaması gönderilir.</div>
    `;
    $("#doRegister").onclick = async () => {
      const email = $("#email2").value.trim();
      const p1 = $("#pass2").value.trim();
      const p2 = $("#pass3").value.trim();
      if (!email || !p1 || !p2) return toast("Bilgileri doldur");
      if (p1 !== p2) return toast("Şifreler aynı değil");
      try {
        const cred = await fb.createUserWithEmailAndPassword(auth, email, p1);
        await fb.sendEmailVerification(cred.user);
        toast("Doğrulama maili gönderildi");
      } catch (err) {
        toast("Kayıt hatası: " + (err?.message || "bilinmiyor"));
      }
    };
  };

  $("#tabLogin").onclick = showLogin;
  $("#tabRegister").onclick = showRegister;
  showLogin();
}

async function init() {
  renderAuth();
  bindEvents();

  fb.onAuthStateChanged(auth, async (user) => {
    currentUser = user || null;
    if (!currentUser) {
      setAuthOverlay(true);
      return;
    }
    await ensureUserDoc(currentUser.uid, currentUser.email || "");
    setAuthOverlay(false);
    await loadFavorites();
  });

  renderResults();
}

init();
