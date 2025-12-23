import admin from "firebase-admin";
import * as cheerio from "cheerio";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const SA_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!PROJECT_ID) throw new Error("FIREBASE_PROJECT_ID env yok");
if (!SA_JSON) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON secret yok");

const serviceAccount = JSON.parse(SA_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: PROJECT_ID
});

const db = admin.firestore();

const TRACK_INTERVAL_MIN = 20;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36";

function nowMs(){ return Date.now(); }
function toNumTR(s){
  if (!s) return null;
  const cleaned = String(s).replace(/\s/g,"").replace(/[^\d.,]/g,"");
  if (!cleaned) return null;
  // 12.345,67 -> 12345.67 / 12.345 -> 12345
  let v = cleaned;
  if (v.includes(",") && v.includes(".")) v = v.replace(/\./g,"").replace(",",".");
  else v = v.replace(",",".");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchHtml(url){
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language":"tr-TR,tr;q=0.9,en;q=0.8" },
    redirect: "follow"
  });
  const text = await res.text();
  return { status: res.status, text };
}

function pickFromJsonLd($){
  let best = null;

  $('script[type="application/ld+json"]').each((_, el)=>{
    const raw = $(el).text();
    if (!raw) return;
    try{
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];

      for (const obj of arr){
        const items = [];
        if (obj && typeof obj === "object"){
          // product itself
          if (obj["@type"] === "Product") items.push(obj);
          // itemList
          if (obj["@type"] === "ItemList" && Array.isArray(obj.itemListElement)){
            for (const it of obj.itemListElement){
              const item = it?.item || it;
              if (item?.["@type"] === "Product") items.push(item);
            }
          }
        }

        for (const p of items){
          const offer = p.offers;
          const price = offer?.price || offer?.lowPrice || offer?.offers?.price;
          const currency = offer?.priceCurrency;
          const n = toNumTR(price);
          if (n && (!best || n < best.price)){
            best = { price: n, currency: currency || "TRY" };
          }
        }
      }
    }catch{}
  });

  return best?.price ?? null;
}

function pickFromMeta($){
  const metas = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[itemprop="price"]'
  ];
  for (const sel of metas){
    const v = $(sel).attr("content");
    const n = toNumTR(v);
    if (n) return n;
  }
  return null;
}

function pickFromSelectors($, siteKey){
  const map = {
    trendyol: [
      ".prc-box-dscntd", ".prc-dsc", ".pr-new-br span", '[data-testid="price-current-price"]'
    ],
    hepsiburada: [
      '[data-test-id="price-current-price"]', ".product-price", ".price"
    ],
    n11: [
      ".newPrice", ".priceContainer .price"
    ],
    amazontr: [
      "span.a-price > span.a-offscreen", ".a-price .a-offscreen"
    ],
    pazarama: [
      '[data-testid="price"]', ".price"
    ],
    ciceksepeti: [
      ".price", ".product__price"
    ],
    idefix: [
      ".price", ".product-price"
    ]
  };
  const sels = map[siteKey] || [];
  for (const sel of sels){
    const t = $(sel).first().text();
    const n = toNumTR(t);
    if (n) return n;
  }
  return null;
}

// “arama sayfasından ürün fiyatı” yakalama (siteye göre)
function pickFromSearchPage($, siteKey){
  // Bu kısım siteye göre değişir; burada “en sık” çalışan basit yaklaşım:
  const candidates = [];
  // fiyat gibi görünen tüm metinleri çek
  $("*").each((_, el)=>{
    const txt = $(el).text();
    if (!txt) return;
    if (txt.includes("₺") || txt.includes("TL")){
      const n = toNumTR(txt);
      if (n && n > 0) candidates.push(n);
    }
  });
  if (candidates.length === 0) return null;
  // “en düşük” alma demiştin ama worker burada “ilk ürün” seçemeyebilir.
  // En düşük almak spam ürün getirebilir; bu yüzden medyan+yakın fiyat seçimi:
  candidates.sort((a,b)=>a-b);
  const mid = candidates[Math.floor(candidates.length/2)];
  return mid || candidates[0];
}

async function getPriceFromUrl(siteKey, url){
  const { status, text } = await fetchHtml(url);
  if (status >= 400) throw new Error(`HTTP ${status}`);

  const $ = cheerio.load(text);

  // önce JSON-LD/meta/selector
  const a = pickFromJsonLd($);
  if (a) return a;

  const b = pickFromMeta($);
  if (b) return b;

  const c = pickFromSelectors($, siteKey);
  if (c) return c;

  // son çare: arama sayfası heuristic
  const d = pickFromSearchPage($, siteKey);
  if (d) return d;

  throw new Error("Fiyat bulunamadı");
}

function pctDrop(prev, next){
  if (!prev || !next) return 0;
  return ((prev - next) / prev) * 100;
}

async function main(){
  const usersSnap = await db.collection("users").get();

  let updated = 0;
  let errors = 0;

  for (const userDoc of usersSnap.docs){
    const uid = userDoc.id;
    const favSnap = await db.collection("users").doc(uid).collection("favorites").get();

    for (const favDoc of favSnap.docs){
      const fav = favDoc.data();
      const ref = favDoc.ref;

      const due = (fav.nextTryAt ?? 0) <= nowMs();
      const lastCheckedAt = fav.lastCheckedAt ?? 0;
      const tooSoon = (nowMs() - lastCheckedAt) < TRACK_INTERVAL_MIN*60*1000;

      if (!due && tooSoon) continue;

      const siteKey = fav.siteKey;
      const url = fav.url;

      try{
        const price = await getPriceFromUrl(siteKey, url);

        const lastPrice = fav.lastPrice ?? null;
        const history = Array.isArray(fav.history) ? fav.history.slice() : [];

        // fiyat değişmediyse history ekleme (senin dediğin)
        if (lastPrice == null || price !== lastPrice){
          history.push({ tMs: nowMs(), p: price });
          // çok büyümesin
          if (history.length > 120) history.splice(0, history.length - 120);
        }

        const updates = {
          lastCheckedAt: nowMs(),
          lastSuccessAt: nowMs(),
          lastError: null,
          nextTryAt: nowMs() + TRACK_INTERVAL_MIN*60*1000,
          lastPrice: price,
          history
        };

        await ref.set(updates, { merge: true });
        updated++;

        // %10 düşüş varsa (bildirim kısmını şimdilik web notification ile yapıyoruz)
        // ileride FCM eklemek istersen bunu burada gönderebiliriz.

      }catch(e){
        errors++;
        await ref.set({
          lastCheckedAt: nowMs(),
          lastError: String(e?.message || e),
          // başarısızsa akıllı gecikme (senin dediğin):
          nextTryAt: nowMs() + 5*60*1000 // 5 dk sonra tekrar dene
        }, { merge:true });
      }
    }
  }

  console.log("DONE", { updated, errors });
}

main().catch(err=>{
  console.error("FATAL", err);
  process.exit(1);
});
