import cheerio from "cheerio";

export async function loadHtml(fetch, url, headers={}){
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "accept-language": "tr-TR,tr;q=0.9",
      ...headers
    }
  });
  const status = res.status;
  const text = await res.text();
  return { $, html:text, status, res, cheerio, load: cheerio.load, dom: cheerio.load(text) };
}

export function toNumberTry(s){
  const t = String(s||"").replace(/\./g,"").replace(",",".").replace(/[^\d.]/g,"");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
