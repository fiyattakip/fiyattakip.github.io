import { loadHtml, toNumberTry } from "./common.js";

export async function getPriceN11({ fetch, query, url }){
  const u = url?.startsWith("http") ? url : `https://www.n11.com/arama?q=${encodeURIComponent(query)}`;
  const { dom, status } = await loadHtml(fetch, u);
  if(status>=400) return { price:null, status:`HTTP ${status}` };

  const priceText = dom('.productPrice, .priceContainer ins, .price').first().text();
  const price = toNumberTry(priceText);
  return { price, status: price ? "OK" : "PARSE" };
}
