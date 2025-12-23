import { loadHtml, toNumberTry } from "./common.js";

export async function getPriceCiceksepeti({ fetch, query, url }){
  const u = url?.startsWith("http") ? url : `https://www.ciceksepeti.com/arama?query=${encodeURIComponent(query)}`;
  const { dom, status } = await loadHtml(fetch, u);
  if(status>=400) return { price:null, status:`HTTP ${status}` };

  const priceText = dom(".price, .product__price, .listing__price").first().text();
  const price = toNumberTry(priceText);
  return { price, status: price ? "OK" : "PARSE" };
}
