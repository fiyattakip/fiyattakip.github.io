import { loadHtml, toNumberTry } from "./common.js";

export async function getPriceAmazonTR({ fetch, query, url }){
  const u = url?.startsWith("http") ? url : `https://www.amazon.com.tr/s?k=${encodeURIComponent(query)}`;
  const { dom, status } = await loadHtml(fetch, u);
  if(status>=400) return { price:null, status:`HTTP ${status}` };

  const whole = dom(".a-price-whole").first().text();
  const frac = dom(".a-price-fraction").first().text();
  const price = toNumberTry(`${whole},${frac}`);
  return { price, status: price ? "OK" : "PARSE" };
}
