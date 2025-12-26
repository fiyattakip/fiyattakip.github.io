
function getAISettings(){
  try{ return JSON.parse(localStorage.getItem("aiSettings")||"{}"); }catch(e){ return {}; }
}
function rulesComment(item){
  const title = (item?.title||item?.name||"").toString().slice(0,120);
  const site = (item?.site||"").toString();
  const price = item?.price || item?.lastPrice || item?.manualPrice || "";
  const parts=[];
  if(title) parts.push(`Ürün: ${title}`);
  if(site) parts.push(`Site: ${site}`);
  if(price) parts.push(`Fiyat: ${price}`);
  parts.push("Kısa yorum:");
  parts.push("• Kullanım amacına göre (ders/oyun/iş) uygunluğunu kontrol et.");
  parts.push("• Öne çıkan özellik: (RAM/dep./ekran/garanti) ilan açıklamasından doğrula.");
  parts.push("• Benzer ürünlerle kıyas: daha iyi/benzer fiyat-performans olabilir.");
  return parts.join("\n");
}
async function callAIProxy(prompt){
  const s=getAISettings();
  const proxy=(s.proxy||"").trim();
  if(!proxy) throw new Error("no-proxy");
  const provider=(s.provider||"gemini");
  const key=(s.key||"");
  const r=await fetch(proxy,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider,key,prompt})});
  if(!r.ok) throw new Error("proxy-http-"+r.status);
  const j=await r.json();
  return (j && (j.text||j.result||j.output)) ? String(j.text||j.result||j.output) : "";
}
async function getFavoriteAIComment(item){
  const s=getAISettings();
  if((s.enabled||"on")==="off") return "AI kapalı (Ayarlar > AI Ayarları).";
  // Try proxy if provided, otherwise rules
  const prompt = `Aşağıdaki ürünü uydurma yapmadan kısa değerlendir. Fiyat yoksa özellik odaklı yaz.\n\nÜrün adı: ${item?.title||item?.name||""}\nSite: ${item?.site||""}\nLink: ${item?.url||""}\nFiyat: ${item?.price||item?.lastPrice||item?.manualPrice||""}`;
  try{
    const s2=getAISettings();
    if((s2.provider||"")!=="rules" && (s2.proxy||"").trim()){
      const t=await callAIProxy(prompt);
      if(t) return t;
    }
  }catch(e){}
  return rulesComment(item);
}


const LS_CFG = "fiyattakip_ai_cfg_v4";
let sessionPin = null;

function te(str){ return new TextEncoder().encode(str); }
function td(buf){ return new TextDecoder().decode(buf); }
function b64(buf){
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function unb64(s){
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKeyFromPin(pin, saltB64){
  const salt = saltB64 ? new Uint8Array(unb64(saltB64)) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey("raw", te(pin), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name:"PBKDF2", salt, iterations:120000, hash:"SHA-256" },
    baseKey,
    { name:"AES-GCM", length:256 },
    false,
    ["encrypt","decrypt"]
  );
  return { key, saltB64: saltB64 || b64(salt) };
}

async function encryptString(pin, plain){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { key, saltB64 } = await deriveKeyFromPin(pin, null);
  const ct = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, te(plain));
  return { saltB64, ivB64: b64(iv), ctB64: b64(ct) };
}
async function decryptString(pin, blob){
  const { key } = await deriveKeyFromPin(pin, blob.saltB64);
  const iv = new Uint8Array(unb64(blob.ivB64));
  const ct = unb64(blob.ctB64);
  const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
  return td(pt);
}

export function setSessionPin(pin){ sessionPin = pin || null; }
export function clearSessionPin(){ sessionPin = null; }

export function loadAiCfg(){
  try{ return JSON.parse(localStorage.getItem(LS_CFG) || "null"); }catch{ return null; }
}
export function aiConfigured(){
  const cfg = loadAiCfg();
  return !!(cfg && cfg.provider === "gemini" && cfg.encKey);
}

export async function getGeminiKeyOrThrow(){
  const cfg = loadAiCfg();
  if (!cfg || cfg.provider !== "gemini" || !cfg.encKey) throw new Error("AI key kayıtlı değil.");
  const pin = sessionPin || prompt("PIN gir (AI için):");
  if (!pin) throw new Error("PIN gerekli.");
  const key = await decryptString(pin, cfg.encKey);
  setSessionPin(pin);
  return key;
}

export async function saveGeminiKey({ apiKey, pin, rememberPin }){
  if (!apiKey?.startsWith("AIza")) throw new Error("Gemini API key hatalı görünüyor.");
  if (!pin || pin.length < 4) throw new Error("PIN en az 4 karakter olmalı.");

  const encKey = await encryptString(pin, apiKey.trim());
  const cfg = {
    provider: "gemini",
    model: "gemini-2.5-flash",
    encKey,
    updatedAt: Date.now()
  };
  localStorage.setItem(LS_CFG, JSON.stringify(cfg));
  sessionPin = rememberPin ? pin : null;
  return true;
}

export function clearAiCfg(){
  localStorage.removeItem(LS_CFG);
  sessionPin = null;
}

/** Gemini text */
export async function geminiText(prompt){
  const key = await getGeminiKeyOrThrow();
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [{ role:"user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 700 }
  };

  const r = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`Gemini hata: ${r.status} ${t.slice(0,140)}`);
  }

  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")?.trim();
  if (!text) throw new Error("AI sonuç üretemedi.");
  return text;
}

/** Gemini vision (image -> text) */
export async function geminiVision({ prompt, mime, base64Data }){
  const key = await getGeminiKeyOrThrow();
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [{
      role:"user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mime, data: base64Data } }
      ]
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 550 }
  };

  const r = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`Gemini hata: ${r.status} ${t.slice(0,140)}`);
  }

  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")?.trim();
  if (!text) throw new Error("Görselden metin çıkarılamadı.");
  return text;
}
