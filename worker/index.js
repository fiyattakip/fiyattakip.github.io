import admin from "firebase-admin";
import fetch from "node-fetch";
import { loadHtml, toNumberTry, sleep } from "./sites/common.js";
import { getPriceTrendyol } from "./sites/trendyol.js";
import { getPriceHepsiburada } from "./sites/hepsiburada.js";
import { getPriceN11 } from "./sites/n11.js";
import { getPriceAmazonTR } from "./sites/amazontr.js";
import { getPriceIdefix } from "./sites/idefix.js";
import { getPriceCiceksepeti } from "./sites/ciceksepeti.js";

const SA = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if(!SA) {
  console.error("Missing secret: FIREBASE_SERVICE_ACCOUNT_JSON");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(SA))
});
const db = admin.firestore();

const SITE_HANDLERS = {
  trendyol: getPriceTrendyol,
  hepsiburada: getPriceHepsiburada,
  n11: getPriceN11,
  amazontr: getPriceAmazonTR,
  idefix: getPriceIdefix,
  ciceksepeti: getPriceCiceksepeti
};

async function main(){
  const usersSnap = await db.collection("users").get();
  console.log("Users:", usersSnap.size);

  for(const userDoc of usersSnap.docs){
    const uid = userDoc.id;
    const favRef = db.collection("users").doc(uid).collection("favorites");
    const favSnap = await favRef.get();

    for(const fav of favSnap.docs){
      const data = fav.data();
      const siteKey = data.siteKey;
      const query = data.query || "";
      const url = data.url || "";
      const handler = SITE_HANDLERS[siteKey];

      const now = new Date().toLocaleString("tr-TR");
      let lastStatus = "OK";
      let lastPrice = null;

      try{
        if(!handler) throw new Error("Handler yok");
        // URL varsa URL üzerinden, yoksa query üzerinden arama sayfasından ilk uygun fiyatı çekmeye çalışır
        const out = await handler({ fetch, query, url });
        lastPrice = out?.price ?? null;
        lastStatus = out?.status ?? "OK";
      }catch(e){
        lastStatus = "ERR";
      }

      await fav.ref.set({
        lastPrice,
        lastStatus,
        lastCheckedAt: now
      }, { merge:true });

      await sleep(800); // rate limit azalt
    }
  }

  console.log("DONE");
}

main().catch(e=>{
  console.error(e);
  process.exit(1);
});
