import { loadHtml, toNumberTry } from "./common.js";

export async function getPriceIdefix({ fetch, query, url }){
  const u = url?.startsWith("http") ? url : `https://www.idefix.com/search?q=${encodeURIComponent(query)}`;
  const { dom, status } = await loadHtml(fetch, u);
  if(status>=400) return { price:null, status:`HTTP ${status}` };

  const priceText = dom(".price, .productPrice, .currentPrice").first().text();
  const price = toNumberTry(priceText);
  return { price, status: price ? "OK" : "PARSE" };
}
