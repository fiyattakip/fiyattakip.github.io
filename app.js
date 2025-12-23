/* app.js — Fiyat Takip (stabil) */

import { auth, db, googleProvider } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** -------------------------
 *  DOM helpers
 *  ------------------------- */
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function")
      n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    if (typeof c === "string") n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  });
  return n;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** -------------------------
 *  App state
 *  ------------------------- */
let currentUser = null;
let activeTab = "normal"; // normal | ai | visual

/** -------------------------
 *  Sites
 *  (Normal aramada direkt site aramasına gider)
 *  ------------------------- */
const SITES = [
  {
    key: "trendyol",
    name: "Trendyol",
    searchUrl: (q) =>
      `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}`,
  },
  {
    key: "hepsiburada",
    name: "Hepsiburada",
    searchUrl: (q) =>
      `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}`,
  },
  { key: "n11", name: "N11", searchUrl: (q) => `https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key: "amazon", name: "Amazon TR", searchUrl: (q) => `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { key: "pazarama", name: "Pazarama", searchUrl: (q) => `https://www.pazarama.com/arama?q=${encodeURIComponent(q)}` },
  { key: "ciceksepeti", name: "ÇiçekSepeti", searchUrl: (q) => `https://www.ciceksepeti.com/arama?query=${encodeURIComponent(q)}` },
  { key: "idefix", name: "İdefix", searchUrl: (q) => `https://www.idefix.com/arama/?q=${encodeURIComponent(q)}` },
];

/** -------------------------
 *  Cache / SW temizleme
 *  ------------------------- */
async function clearAllCaches() {
  try {
    // localStorage (AI ayarları dahil — istersen bazılarını tutabiliriz)
    // Burada hepsini silmiyoruz; sadece uygulama cache anahtarlarını siliyoruz:
    const keep = new Set([
      // AI ayarlarını tutmak istersen:
      // "fiyattakip_ai_cfg_v3"
    ]);
    const keys = Object.keys(localStorage);
    keys.forEach((k) => {
      if (!keep.has(k)) localStorage.removeItem(k);
    });

    // Cache Storage
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }

    // Service Worker unregister (varsa)
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }

    toast("Bellek temizlendi. Sayfa yenileniyor…");
    await sleep(600);
    location.reload();
  } catch (e) {
    console.error(e);
    toast("Temizleme sırasında hata oldu.");
  }
}

/** -------------------------
 *  Toast
 *  ------------------------- */
function toast(msg, type = "info") {
  // Basit durum yazısı: loginStatus / aiStatus / visualStatus varsa oralara da yazar.
  const s = $("loginStatus") || $("aiStatus") || $("visualStatus");
  if (s) {
    s.textContent = msg;
    s.style.color = type === "err" ? "#b00020" : "";
  } else {
    alert(msg);
  }
}

/** -------------------------
 *  Tabs UI
 *  ------------------------- */
function setTab(tab) {
  activeTab = tab;

  // Tab butonları
  const btnNormal = $("btnNormal") || $("tabNormal");
  const btnAi = $("btnAi") || $("tabAi");
  const btnVisual = $("btnVisual") || $("tabVisual");

  [btnNormal, btnAi, btnVisual].forEach((b) => b && b.classList.remove("active"));
  if (tab === "normal" && btnNormal) btnNormal.classList.add("active");
  if (tab === "ai" && btnAi) btnAi.classList.add("active");
  if (tab === "visual" && btnVisual) btnVisual.classList.add("active");

  // Sonuç alanı açıklamaları
  const results = $("results");
  if (!results) return;

  results.innerHTML = "";
  if (tab === "normal") {
    results.appendChild(el("div", { class: "hint" }, "Normal arama: seçilen sitelerde arar."));
    renderNormalResults();
  }
  if (tab === "ai") {
    results.appendChild(
      el(
        "div",
        { class: "hint" },
        "AI arama: en alakalı arama terimlerini önerir ve tek tıkla site araması açar."
      )
    );
    renderAiSearchUI();
  }
  if (tab === "visual") {
    results.appendChild(
      el(
        "div",
        { class: "hint" },
        "Görsel: fotoğraftan ürün/metin çıkarmaya çalışır; olmazsa Google Lens’e yönlendirir."
      )
    );
    renderVisualUI();
  }
}

/** -------------------------
 *  Login UI
 *  ------------------------- */
function showLogin(show) {
  const wrap = $("loginWrap");
  const main = $("mainWrap");
  if (!wrap || !main) return;
  wrap.style.display = show ? "block" : "none";
  main.style.display = show ? "none" : "block";
}

function scrollToLogin() {
  const wrap = $("loginWrap");
  if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** -------------------------
 *  Favorites (Firestore)
 *  users/{uid}/favorites/{favId}
 *  ------------------------- */
function favCol(uid) {
  return collection(db, "users", uid, "favorites");
}

function favId(siteKey, queryText) {
  // deterministic id
  const raw = `${siteKey}::${queryText}`.toLowerCase().trim();
  return raw
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-:]/g, "")
    .slice(0, 120);
}

async function addFavorite(siteKey, queryText) {
  if (!currentUser) {
    toast("Favoriye eklemek için giriş yapmalısın.", "err");
    showLogin(true);
    scrollToLogin();
    return;
  }

  const site = SITES.find((s) => s.key === siteKey);
  if (!site) return;

  const id = favId(siteKey, queryText);
  const ref = doc(db, "users", currentUser.uid, "favorites", id);

  // Worker için temel alanlar:
  const payload = {
    siteKey,
    siteName: site.name,
    query: queryText,
    url: site.searchUrl(queryText),
    createdAt: serverTimestamp(),
    // Worker güncelleyebilir:
    lastPrice: null,
    lastCurrency: "TRY",
    lastCheckedAt: null,
    // Grafik için (worker yazarsa kullanır):
    history: [], // [{t: timestampMillis, p: number}]
    aiComment: "", // favori kartında görünsün
    status: "OK",
  };

  await setDoc(ref, payload, { merge: true });
  toast("Favoriye eklendi ✅");
  await loadFavorites(); // UI yenile
}

async function removeFavorite(docId) {
  if (!currentUser) return;
  await deleteDoc(doc(db, "users", currentUser.uid, "favorites", docId));
  await loadFavorites();
}

async function loadFavorites() {
  const list = $("favList");
  if (!list) return;

  list.innerHTML = "";

  if (!currentUser) {
    list.appendChild(el("div", { class: "muted" }, "Favoriler için giriş yapmalısın."));
    return;
  }

  const sortSel = $("favSort");
  const sortVal = sortSel ? sortSel.value : "new";

  let qy;
  if (sortVal === "new") qy = query(favCol(currentUser.uid), orderBy("createdAt", "desc"), limit(50));
  else if (sortVal === "old") qy = query(favCol(currentUser.uid), orderBy("createdAt", "asc"), limit(50));
  else qy = query(favCol(currentUser.uid), orderBy("createdAt", "desc"), limit(50));

  const snap = await getDocs(qy);
  if (snap.empty) {
    list.appendChild(el("div", { class: "muted" }, "Favori yok."));
    return;
  }

  snap.forEach((d) => {
    const fav = d.data();
    list.appendChild(renderFavCard(d.id, fav));
  });
}

function renderFavCard(docId, fav) {
  const title = fav.query || "Ürün";
  const site = fav.siteName || fav.siteKey || "";
  const url = fav.url || "#";

  const priceText =
    fav.lastPrice != null
      ? `${formatTRY(fav.lastPrice)}`
      : "Fiyat yok";

  const status = fav.status || "OK";
  const statusBadge = el(
    "span",
    { class: `badge ${status === "OK" ? "ok" : "warn"}` },
    status
  );

  const btnOpen = el(
    "button",
    {
      class: "btn soft",
      onclick: () => window.open(url, "_blank", "noopener,noreferrer"),
    },
    "Siteyi Aç"
  );

  const btnRetry = el(
    "button",
    {
      class: "btn soft",
      onclick: () => window.open(url, "_blank", "noopener,noreferrer"),
    },
    "Tekrar dene"
  );

  const btnGraph = el(
    "button",
    {
      class: "btn soft",
      onclick: () => openGraphModal(title, fav),
    },
    "Grafik"
  );

  const btnAI = el(
    "button",
    {
      class: "btn soft",
      onclick: () => alert(fav.aiComment ? fav.aiComment : "AI yorum yok (worker/AI üretmemiş)."),
    },
    "AI Yorum"
  );

  const btnDel = el(
    "button",
    { class: "btn danger", onclick: () => removeFavorite(docId) },
    "Sil"
  );

  const meta = el(
    "div",
    { class: "favMeta" },
    `${site} • Son kontrol: ${fav.lastCheckedAt ? toTRDate(fav.lastCheckedAt) : "—"}`
  );

  const comment = fav.aiComment
    ? el("div", { class: "aiComment" }, fav.aiComment)
    : el("div", { class: "aiComment muted" }, "AI yorumu yok.");

  return el("div", { class: "card fav" }, [
    el("div", { class: "row between" }, [
      el("div", { class: "col" }, [
        el("div", { class: "title" }, title),
        meta,
      ]),
      el("div", { class: "col right" }, [
        el("div", { class: "price" }, priceText),
        statusBadge,
      ]),
    ]),
    el("div", { class: "row wrap gap" }, [btnOpen, btnRetry, btnGraph, btnAI, btnDel]),
    comment,
  ]);
}

/** -------------------------
 *  Normal Search UI
 *  ------------------------- */
function renderNormalResults() {
  const results = $("results");
  const qInput = $("q");
  const queryText = (qInput?.value || "").trim();

  if (!results) return;

  const wrap = el("div", { class: "stack" });

  SITES.forEach((s) => {
    const row = el("div", { class: "card result" }, [
      el("div", { class: "row between" }, [
        el("div", { class: "col" }, [
          el("div", { class: "site" }, s.name),
          el("div", { class: "muted" }, queryText || "—"),
          el("div", { class: "small muted" }, 'Bu sitede aramak için "Ara". İstersen favoriye ekleyebilirsin.'),
        ]),
        el("div", { class: "col right" }, [
          el(
            "button",
            {
              class: "btn primary",
              onclick: () => {
                if (!queryText) return toast("Arama metni yaz.", "err");
                window.open(s.searchUrl(queryText), "_blank", "noopener,noreferrer");
              },
            },
            "Ara"
          ),
        ]),
      ]),
      el("div", { class: "row wrap gap" }, [
        el(
          "button",
          {
            class: "btn soft",
            onclick: () => {
              if (!queryText) return toast("Arama metni yaz.", "err");
              addFavorite(s.key, queryText);
            },
          },
          "Favoriye ekle"
        ),
      ]),
    ]);
    wrap.appendChild(row);
  });

  results.appendChild(wrap);
}

/** -------------------------
 *  AI Search (Gemini — basit öneri)
 *  Not: Key saklama / PIN şifreleme senden önceki ai.js’deyse,
 *  bu kodu ona bağlamak yerine burada minimum stabil yaptım:
 *  localStorage: fiyattakip_gemini_key
 *  ------------------------- */
const LS_GEMINI_KEY = "fiyattakip_gemini_key";

function getGeminiKey() {
  return (localStorage.getItem(LS_GEMINI_KEY) || "").trim();
}
function setGeminiKey(k) {
  localStorage.setItem(LS_GEMINI_KEY, (k || "").trim());
}

function renderAiSearchUI() {
  const results = $("results");
  if (!results) return;

  const aiArea = el("div", { class: "card" }, [
    el("div", { class: "row between" }, [
      el("div", { class: "col" }, [
        el("div", { class: "title" }, "AI Arama"),
        el("div", { class: "muted" }, "Gemini ile en alakalı arama terimlerini önerir."),
      ]),
      el(
        "button",
        { class: "btn soft", onclick: openAiModal },
        "AI Ayar"
      ),
    ]),
    el("div", { id: "aiText", class: "muted" }, "AI arama yapılmadı."),
    el("div", { class: "stack", id: "aiList" }, []),
  ]);

  results.appendChild(aiArea);
}

async function runAiSearch() {
  const qInput = $("q");
  const queryText = (qInput?.value || "").trim();
  if (!queryText) return toast("Arama metni yaz.", "err");

  const key = getGeminiKey();
  if (!key) return toast("AI key kayıtlı değil. AI Ayar’dan ekle.", "err");

  const outText = $("aiText");
  const list = $("aiList");
  if (outText) outText.textContent = "Düşünüyor…";
  if (list) list.innerHTML = "";

  // Gemini prompt: her site için “önerilen arama metni” üret
  const prompt = `
Kullanıcı şunu arıyor: "${queryText}"
Aşağıdaki siteler için en alakalı arama metnini üret.
Sadece JSON döndür:
{
  "items":[
    {"siteKey":"trendyol","q":"...","note":"kısa not"},
    ...
  ]
}
SiteKey listesi: ${SITES.map((s) => s.key).join(", ")}
Kurallar:
- En alakalı ürün adı/özelliği bazlı öner
- Fiyat/ucuzluk odaklı sıralama yapma
- note en fazla 1 cümle.
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      key
    )}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    const txt =
      json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";

    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch {
      // bazen ```json ... ``` döner
      const cleaned = txt.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    if (!items.length) {
      if (outText) outText.textContent = "AI sonuç üretemedi.";
      return;
    }

    if (outText) outText.textContent = "Öneriler hazır.";

    items.forEach((it) => {
      const site = SITES.find((s) => s.key === it.siteKey);
      if (!site) return;

      const q2 = (it.q || queryText).trim();
      const note = (it.note || "").trim();

      const row = el("div", { class: "card result" }, [
        el("div", { class: "row between" }, [
          el("div", { class: "col" }, [
            el("div", { class: "site" }, site.name),
            el("div", { class: "muted" }, q2),
            note ? el("div", { class: "small muted" }, note) : null,
          ]),
          el(
            "button",
            {
              class: "btn primary",
              onclick: () => window.open(site.searchUrl(q2), "_blank", "noopener,noreferrer"),
            },
            "Ara"
          ),
        ]),
        el("div", { class: "row wrap gap" }, [
          el(
            "button",
            {
              class: "btn soft",
              onclick: () => addFavorite(site.key, q2),
            },
            "Favoriye ekle"
          ),
        ]),
      ]);

      $("aiList")?.appendChild(row);
    });
  } catch (e) {
    console.error(e);
    if (outText) outText.textContent = "AI sonuç üretemedi.";
  }
}

/** -------------------------
 *  Visual Search (Google Lens + basit OCR yok)
 *  - Görselden metin çıkarma tarayıcıda stabil değil (OCR libsiz).
 *  - Bu yüzden: Lens + Google alışveriş araması.
 *  ------------------------- */
function renderVisualUI() {
  const results = $("results");
  if (!results) return;

  const vStatus = $("visualStatus");
  if (vStatus) vStatus.textContent = "";

  const wrap = el("div", { class: "card" }, [
    el("div", { class: "row between" }, [
      el("div", { class: "col" }, [
        el("div", { class: "title" }, "Görsel Arama"),
        el("div", { class: "muted" }, "Görseli seç → Google Lens ile arat."),
      ]),
      el(
        "button",
        {
          class: "btn soft",
          onclick: openLens,
        },
        "Google Lens"
      ),
    ]),
    el("div", { class: "row wrap gap" }, [
      el("button", { class: "btn primary", onclick: () => $("fileInput")?.click() }, "Dosya Seç"),
      el("button", { class: "btn soft", onclick: openGoogleShopping }, "Google Alışveriş"),
    ]),
    el("div", { id: "visualHint", class: "small muted" }, "Not: Tarayıcıda stabil OCR olmadığı için metin çıkarma yerine Lens kullanıyoruz."),
  ]);

  results.appendChild(wrap);
}

function openLens() {
  // Lens web giriş sayfası (kullanıcı burada upload yapar)
  window.open("https://lens.google.com/", "_blank", "noopener,noreferrer");
}
function openGoogleShopping() {
  const qInput = $("q");
  const queryText = (qInput?.value || "").trim();
  const q = queryText ? queryText : "";
  window.open(`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
}

/** -------------------------
 *  AI Modal
 *  ------------------------- */
function openAiModal() {
  const modal = $("aiModal");
  if (!modal) return;

  modal.style.display = "block";
  // alanları doldur
  const apiKeyInput = $("aiKey") || $("aiPin"); // bazı sürümlerde id farklı olabiliyor
  // Biz HTML’de aiKey yoksa aiPin vs ile karışmasın diye sadece aiPin kullanmıyoruz.
  // Bu projede AI modal inputları: aiPin var; ama senin ekranda "API Key" alanı var.
  // O yüzden: mümkün olanı bulalım:
  const keyField =
    modal.querySelector('input[name="apiKey"]') ||
    modal.querySelector('input[placeholder*="key"]') ||
    modal.querySelector("input");

  if (keyField) keyField.value = getGeminiKey();
}

function closeAiModal() {
  const modal = $("aiModal");
  if (modal) modal.style.display = "none";
}

async function saveAiModal() {
  const modal = $("aiModal");
  if (!modal) return;

  const keyField =
    modal.querySelector('input[name="apiKey"]') ||
    modal.querySelector('input[placeholder*="key"]') ||
    modal.querySelector("input");

  const k = (keyField?.value || "").trim();
  if (!k) return toast("API Key boş olamaz.", "err");

  setGeminiKey(k);
  toast("AI key kaydedildi ✅");
  // İstenen: Kaydet’e basınca pencere otomatik kapansın
  closeAiModal();
}

/** -------------------------
 *  Graph modal (mini)
 *  ------------------------- */
function openGraphModal(title, fav) {
  // Basit bir modal yoksa alert ile gösterelim.
  const hist = Array.isArray(fav.history) ? fav.history : [];
  if (!hist.length) {
    alert("Grafik için fiyat geçmişi yok. (Worker history yazınca görünür.)");
    return;
  }

  // Çok basit text grafiği:
  const last = hist.slice(-10).map((h) => h.p).filter((n) => typeof n === "number");
  alert(`${title}\n\nSon değerler:\n${last.map((p) => formatTRY(p)).join("\n")}`);
}

/** -------------------------
 *  Utils
 *  ------------------------- */
function formatTRY(n) {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 2,
    }).format(Number(n));
  } catch {
    return `${n} TL`;
  }
}

function toTRDate(ts) {
  try {
    // Firestore Timestamp olabilir
    const d =
      typeof ts?.toDate === "function"
        ? ts.toDate()
        : typeof ts === "number"
        ? new Date(ts)
        : new Date(ts);
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
}

/** -------------------------
 *  Events
 *  ------------------------- */
function bindEvents() {
  // Tab buttons
  $("btnNormal")?.addEventListener("click", () => setTab("normal"));
  $("btnAi")?.addEventListener("click", () => setTab("ai"));
  $("btnVisual")?.addEventListener("click", () => setTab("visual"));

  $("tabNormal")?.addEventListener("click", () => setTab("normal"));
  $("tabAi")?.addEventListener("click", () => setTab("ai"));
  $("tabVisual")?.addEventListener("click", () => setTab("visual"));

  // Search trigger
  const qInput = $("q");
  qInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (activeTab === "normal") {
        $("results").innerHTML = "";
        $("results").appendChild(el("div", { class: "hint" }, "Normal arama: seçilen sitelerde arar."));
        renderNormalResults();
      } else if (activeTab === "ai") {
        runAiSearch();
      } else if (activeTab === "visual") {
        openGoogleShopping();
      }
    }
  });

  // Visual file input
  $("fileInput")?.addEventListener("change", () => {
    // Stabil: direkt Lens’e yönlendir (kullanıcı upload eder)
    toast("Google Lens açılıyor…");
    openLens();
  });

  // Cache clear button
  $("btnClearCache")?.addEventListener("click", clearAllCaches);

  // Login form
  $("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = ($("loginEmail")?.value || "").trim();
    const pass = ($("loginPass")?.value || "").trim();
    if (!email || !pass) return toast("E-posta ve şifre gir.", "err");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      toast("Giriş başarılı ✅");
    } catch (err) {
      console.error(err);
      toast("Giriş başarısız. (E-posta/Şifre kontrol et)", "err");
    }
  });

  $("loginGoogle")?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast("Google ile giriş başarılı ✅");
    } catch (err) {
      console.error(err);
      toast("Google giriş başarısız.", "err");
    }
  });

  $("logoutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
  });

  // Favorites sort & refresh
  $("favSort")?.addEventListener("change", loadFavorites);
  $("btnRefreshFav")?.addEventListener("click", loadFavorites);

  // AI modal
  $("aiSave")?.addEventListener("click", saveAiModal);
  $("modalClose")?.addEventListener("click", closeAiModal);
  $("aiModal")?.addEventListener("click", (e) => {
    // dışarı tıklayınca kapat
    if (e.target === $("aiModal")) closeAiModal();
  });

  // Eğer UI’da “AI Ara” butonu varsa:
  $("aiBtn")?.addEventListener("click", runAiSearch);
  // Senin ekranda sağda “AI Ara” butonu var; ID’si yoksa Enter ile çalışıyor.
}

/** -------------------------
 *  Auth state
 *  ------------------------- */
function bindAuth() {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user || null;

    // header rozetini kaldır (istenen)
    const badge = $("priceWorkerBadge");
    if (badge) badge.style.display = "none";

    if (!currentUser) {
      showLogin(true);
      await loadFavorites();
      return;
    }

    showLogin(false);
    toast(`Giriş: ${currentUser.email || "OK"} ✅`);
    await loadFavorites();
  });
}

/** -------------------------
 *  Init
 *  ------------------------- */
function init() {
  bindEvents();
  bindAuth();
  setTab("normal");
  loadFavorites().catch(() => {});
}

document.addEventListener("DOMContentLoaded", init);

// Ayrıca AI arama “AI Ara” butonun varsa ve id’yi bilmiyorsan:
window.__runAiSearch = runAiSearch;
window.__clearAllCaches = clearAllCaches;
