import { loadHtml, toNumberTry } from "./common.js";

export async function getPriceHepsiburada({ fetch, query, url }){
  const u = url?.startsWith("http") ? url : `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`;
  const { dom, status } = await loadHtml(fetch, u);
  if(status>=400) return { price:null, status:`HTTP ${status}` };

  const priceText = dom('[data-test-id="price-current-price"], .price_1nQy, .product-price').first().text();
  const price = toNumberTry(priceText);
  return { price, status: price ? "OK" : "PARSE" };
}
