import fetch from "node-fetch";
import * as cheerio from "cheerio";
import admin from "firebase-admin";

// --- INIT (GitHub Secret'tan service account) ---
const svc = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : null;

if (!svc) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_JSON secret env.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(svc),
});
const db = admin.firestore();

// --- Helpers ---
function nowTs() {
  return admin.firestore.Timestamp.now();
}
function normalizePrice(str) {
  if (!str) return null;
  const s = String(str)
    .replace(/\s/g, "")
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "site";
  }
}
function siteLabel(url) {
  const d = domainFromUrl(url);
  if (d.includes("hepsiburada")) return "Hepsiburada";
  if (d.includes("trendyol")) return "Trendyol";
  if (d.includes("n11")) return "N11";
  if (d.includes("amazon")) return "Amazon TR";
  if (d.includes("pazarama")) return "Pazarama";
  if (d.includes("ciceksepeti")) return "ÇiçekSepeti";
  if (d.includes("idefix")) return "idefix";
  return d;
}

// --- Price Extractors (güçlendirilmiş) ---
function pickFromJsonLd($) {
  try {
    const scripts = $('script[type="application/ld+json"]').toArray();
    for (const el of scripts) {
      const txt = $(el).text()?.trim();
      if (!txt) continue;
      let data;
      try { data = JSON.parse(txt); } catch { continue; }
      const arr = Array.isArray(data) ? data : [data];
      for (const item of arr) {
        const offers = item?.offers;
        const price =
          offers?.price ??
          offers?.lowPrice ??
          (Array.isArray(offers) ? offers[0]?.price : null);
        const p = normalizePrice(price);
        if (p) return p;
      }
    }
  } catch {}
  return null;
}

function pickFromMeta($) {
  const metaCandidates = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[itemprop="price"]',
    'meta[name="twitter:data1"]'
  ];
  for (const sel of metaCandidates) {
    const v = $(sel).attr("content");
    const p = normalizePrice(v);
    if (p) return p;
  }
  return null;
}

function pickByRegex(html) {
  // TL / TRY gibi geçen en makul sayı
  const matches = html.match(/(\d{1,3}(\.\d{3})*|\d+)(,\d{2})?\s*(TL|₺|TRY)\b/gi);
  if (!matches) return null;
  // ilk 10 içinden en büyük olmayanı seçmek yerine: en sık görüleni yakalamaya çalış
  const nums = matches
    .slice(0, 15)
    .map(m => normalizePrice(m))
    .filter(Boolean);
  if (!nums.length) return null;
  nums.sort((a,b)=>a-b);
  return nums[0]; // genelde sayfada en düşük TL fiyat “kampanya” olur
}

function pickBySelectors($, url) {
  const label = siteLabel(url);

  const selectorsBySite = {
    "Hepsiburada": [
      '[data-test-id="price-current-price"]',
      '[data-testid="price-current-price"]',
      ".product-price",
      ".price"
    ],
    "Trendyol": [
      ".prc-dsc",
      ".prc-slg",
      ".prc-org",
      '[data-testid="price-current-price"]'
    ],
    "N11": [
      ".unf-p-summary-price",
      ".newPrice",
      ".price"
    ],
    "Amazon TR": [
      "#priceblock_dealprice",
      "#priceblock_ourprice",
      ".a-price .a-offscreen"
    ],
    "Pazarama": [
      '[data-testid="price"]',
      ".price",
      ".productPrice"
    ],
    "ÇiçekSepeti": [
      ".product__price",
      ".productPrice",
      ".price"
    ],
    "idefix": [
      ".price",
      ".product-price",
      '[data-testid="price"]'
    ]
  };

  const sels = selectorsBySite[label] || [
    '[itemprop="price"]',
    ".price",
    ".product-price",
    ".current-price"
  ];

  for (const sel of sels) {
    const t = $(sel).first().text()?.trim();
    const p = normalizePrice(t);
    if (p) return p;
  }
  return null;
}

async function fetchHtml(url) {
  // Basit headerlar: bazen “Failed to fetch” azaltır
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "tr-TR,tr;q=0.9,en;q=0.8"
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.text();
}

async function getPrice(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // sırayla dene:
  return (
    pickFromJsonLd($) ||
    pickFromMeta($) ||
    pickBySelectors($, url) ||
    pickByRegex(html) ||
    null
  );
}

// --- FCM send ---
async function sendPushToToken(token, title, body, data = {}) {
  // Firebase Admin SDK send() ile de atılabilir:
  await admin.messaging().send({
    token,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)])),
    webpush: {
      fcmOptions: {
        link: data?.link || undefined
      }
    }
  });
}

// --- MAIN ---
async function run() {
  console.log("Worker start:", new Date().toISOString());

  // Firestore yapı varsayımı:
  // users/{uid}/favorites/{favId}
  // users/{uid} doc içinde tokens: { fcmTokens: ["..."] } veya tokens/{tokenDoc}
  const usersSnap = await db.collection("users").get();
  let checked = 0;

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;

    const favSnap = await db.collection("users").doc(uid).collection("favorites").get();
    if (favSnap.empty) continue;

    // tokenları oku
    const tokens = userDoc.data()?.fcmTokens || [];
    for (const fav of favSnap.docs) {
      const f = fav.data();
      const url = f.url;
      if (!url) continue;

      checked++;
      const label = siteLabel(url);

      // akıllı gecikme (çok hızlı bot gibi görünmesin)
      await new Promise(r => setTimeout(r, 800 + Math.random()*700));

      let price = null;
      let err = null;
      try {
        price = await getPrice(url);
      } catch (e) {
        err = String(e?.message || e);
      }

      const favRef = fav.ref;

      if (!price) {
        // çekilemedi: “link aç” durumunu yaz
        await favRef.set(
          {
            lastCheckAt: nowTs(),
            lastError: err || "Çekilemedi",
            needUserOpen: true,
            site: label
          },
          { merge: true }
        );
        continue;
      }

      // önceki fiyat
      const lastPrice = Number(f.lastPrice || 0) || null;

      // history ekle (sadece değiştiyse ya da ilk kezse)
      const changed = !lastPrice || price !== lastPrice;

      await favRef.set(
        {
          lastCheckAt: nowTs(),
          lastError: null,
          needUserOpen: false,
          site: label,
          lastPrice: price
        },
        { merge: true }
      );

      if (changed) {
        await favRef.collection("history").add({
          price,
          at: nowTs()
        });
      }

      // %10+ düşüş bildirimi
      if (lastPrice && price <= lastPrice * 0.90) {
        const diffPct = Math.round(((lastPrice - price) / lastPrice) * 100);
        const title = "fiyattakip";
        const body = `${label}: %${diffPct} düştü • ${price} TL`;

        for (const t of tokens) {
          try {
            await sendPushToToken(t, title, body, { link: url, site: label, price });
          } catch (e) {
            console.log("Push fail:", uid, String(e?.message || e));
          }
        }
      }
    }
  }

  console.log("Worker done. checked:", checked);
}

run().catch((e) => {
  console.error("Worker fatal:", e);
  process.exit(1);
});
await db.collection("worker_test").add({
  test: true,
  createdAt: admin.firestore.Timestamp.now()
});

console.log("🔥 TEST WRITE OK");
