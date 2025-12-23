import { loadHtml, toNumberTry } from "./common.js";

export async function getPriceTrendyol({ fetch, query, url }){
  const u = url?.startsWith("http") ? url : `https://www.trendyol.com/sr?q=${encodeURIComponent(query)}`;
  const { dom, status } = await loadHtml(fetch, u);
  if(status>=400) return { price:null, status:`HTTP ${status}` };

  // Trendyol DOM sık değişir → basit yaklaşım: ilk fiyat görüneni al
  const priceText = dom('[data-testid="price-current-price"], .prc-box-dscnt, .prc-box-sllng').first().text();
  const price = toNumberTry(priceText);
  return { price, status: price ? "OK" : "PARSE" };
}
