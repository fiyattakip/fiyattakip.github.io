// worker/price-worker.js (Node 18+)
// GitHub Actions çalıştırır. Firestore Admin ile yazar.
// Not: Sitelerin HTML yapısı değişebilir. Burada “meta/JSON-LD” ağırlıklı okunur.

import admin from "firebase-admin";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

function mustEnv(name){
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const svc = JSON.parse(mustEnv("FIREBASE_SERVICE_ACCOUNT_JSON"));
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const SITES = [
  { key:"trendyol", name:"Trendyol" },
  { key:"hepsiburada", name:"Hepsiburada" },
  { key:"n11", name:"N11" },
  { key:"amazontr", name:"Amazon TR" },
  { key:"pazarama", name:"Pazarama" },
  { key:"ciceksepeti", name:"ÇiçekSepeti" },
  { key:"idefix", name:"idefix" },
];

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function normPriceTry(str){
  if (!str) return null;
  const s = String(str).replace(/[^\d.,]/g,"").replace(/\./g,"").replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickJsonLdPrice($){
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const s of scripts){
    const txt = $(s).text();
    try{
      const j = JSON.parse(txt);
      const arr = Array.isArray(j) ? j : [j];
      for (const o of arr){
        const offers = o?.offers;
        if (offers){
          const offArr = Array.isArray(offers) ? offers : [offers];
          for (const ofr of offArr){
            const p = ofr?.price || ofr?.lowPrice || ofr?.highPrice;
            const n = normPriceTry(p);
            if (n) return n;
          }
        }
      }
    }catch{}
  }
  return null;
}

function pickMetaPrice($){
  const metaProps = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[name="price"]',
    'meta[itemprop="price"]',
  ];
  for (const sel of metaProps){
    const v = $(sel).attr("content");
    const n = normPriceTry(v);
    if (n) return n;
  }
  return null;
}

async function fetchHtml(url){
  const res = await fetch(url, {
    headers:{
      "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      "Accept":"text/html,application/xhtml+xml"
    }
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function extractPrice(url){
  const { ok, status, text } = await fetchHtml(url);
  if (!ok) return { price:null, status };

  const $ = cheerio.load(text);
  let price = pickJsonLdPrice($) || pickMetaPrice($);

  // son çare: sayfadaki TL desenleri (riskli)
  if (!price){
    const body = $("body").text().slice(0, 200000);
    const m = body.match(/(\d{1,3}(\.\d{3})*|\d+)(,\d{2})?\s*TL/);
    if (m) price = normPriceTry(m[0]);
  }
  return { price, status };
}

// Search intent resolver (çok basit): site arama linkinden ilk ürün URL’sini bulmaya çalışır.
// Not: Her sitenin arama HTML’i farklı. Burada “en basit” yaklaşım var.
async function resolveSearchToProduct(siteKey, query){
  // Minimal: site arama sayfasını aç → ilk ürün linkini yakala (her zaman tutmayabilir)
  const build = {
    trendyol: `https://www.trendyol.com/sr?q=${encodeURIComponent(query)}`,
    hepsiburada: `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`,
    n11: `https://www.n11.com/arama?q=${encodeURIComponent(query)}`,
    amazontr: `https://www.amazon.com.tr/s?k=${encodeURIComponent(query)}`,
    pazarama: `https://www.pazarama.com/arama?q=${encodeURIComponent(query)}`,
    ciceksepeti: `https://www.ciceksepeti.com/arama?query=${encodeURIComponent(query)}`,
    idefix: `https://www.idefix.com/arama/?q=${encodeURIComponent(query)}`
  }[siteKey];

  if (!build) return null;

  const { ok, text } = await fetchHtml(build);
  if (!ok) return null;

  const $ = cheerio.load(text);

  // genel link yakalama (siteye göre değişir)
  const anchors = $("a[href]").toArray().slice(0, 400);
  for (const a of anchors){
    const href = $(a).attr("href") || "";
    const abs = href.startsWith("http") ? href : new URL(href, build).toString();

    // basit filtre: ürün sayfası olabilecek linkler
    if (siteKey === "trendyol" && abs.includes("/p-")) return abs;
    if (siteKey === "hepsiburada" && abs.includes(".com/") && abs.includes("-p-")) return abs;
    if (siteKey === "n11" && abs.includes("/urun/")) return abs;
    if (siteKey === "amazontr" && abs.includes("/dp/")) return abs;
    if (siteKey === "pazarama" && abs.includes("/urun/")) return abs;
    if (siteKey === "ciceksepeti" && abs.includes("/p/")) return abs;
    if (siteKey === "idefix" && abs.includes("/")) {
      // idefix ürün linkleri değişken, kaba bırakıyoruz:
      if (!abs.includes("/arama")) return abs;
    }
  }
  return null;
}

async function main(){
  // users/*/favorites/*
  const usersSnap = await db.collection("users").get();
  console.log("users:", usersSnap.size);

  for (const u of usersSnap.docs){
    const uid = u.id;
    const favsRef = db.collection("users").doc(uid).collection("favorites");
    const favsSnap = await favsRef.get();

    for (const f of favsSnap.docs){
      const fav = f.data();
      const favId = f.id;

      try{
        // 1) Search intent ise resolve et
        if (fav.type === "search" && !fav.resolved){
          const url = await resolveSearchToProduct(fav.siteKey, fav.query);
          if (url){
            await favsRef.doc(favId).update({
              resolved: true,
              productUrl: url,
              productTitle: fav.productTitle || fav.query
            });
            console.log("resolved", uid, favId, url);
          } else {
            console.log("resolve failed", uid, favId);
            continue; // resolve yoksa fiyat çekmeyelim
          }
          await sleep(800);
        }

        // 2) fiyat çek
        const productUrl = (fav.productUrl || "").trim();
        if (!productUrl) continue;

        const { price } = await extractPrice(productUrl);
        if (!price){
          console.log("price not found", uid, favId);
          continue;
        }

        const history = Array.isArray(fav.history) ? fav.history.slice() : [];
        const last = history.length ? history[history.length-1]?.p : null;
        if (last != null && Number(last) === Number(price)){
          // değişmediyse ekleme yok
          continue;
        }

        history.push({ t: new Date().toISOString(), p: price });

        // yüzde düşüş kontrol (son 2)
        let drop = null;
        if (history.length >= 2){
          const prev = history[history.length-2]?.p;
          const cur = history[history.length-1]?.p;
          if (prev && cur && cur < prev){
            drop = ((prev - cur) / prev) * 100;
          }
        }

        await favsRef.doc(favId).update({
          lastPrice: price,
          history
        });

        if (drop != null && drop >= 10){
          console.log("DROP >=10%", uid, favId, drop.toFixed(1));
          // İstersen buraya FCM ekleriz (bir sonraki adım).
        }

        await sleep(900);
      }catch(e){
        console.log("err", uid, favId, e?.message || e);
      }
    }
  }
}

main().catch(e=>{
  console.error(e);
  process.exit(1);
});
