const LS_CFG = "fiyattakip_ai_cfg_v4";
let sessionPin = null;

function te(str){ return new TextEncoder().encode(str); }
function td(buf){ return new TextDecoder().decode(buf); }

function b64(buf){
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer);
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
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16)).buffer;
  const baseKey = await crypto.subtle.importKey("raw", te(pin), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name:"PBKDF2", salt, iterations: 120000, hash:"SHA-256" },
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
export function getSessionPin(){ return sessionPin; }

export function loadAIConfig(){
  try{
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) || "{}");
    return {
      provider: "gemini",
      model: "gemini-2.5-flash",
      keyEnc: cfg.keyEnc || null
    };
  }catch{
    return { provider:"gemini", model:"gemini-2.5-flash", keyEnc:null };
  }
}

export function hasAIConfig(){
  const cfg = loadAIConfig();
  return !!cfg.keyEnc;
}

export async function saveAIConfigEncrypted({ apiKey, pin, rememberPin=false }){
  if (!apiKey?.trim()) throw new Error("API key boş.");
  if (!pin?.trim()) throw new Error("PIN boş.");
  const keyEnc = await encryptString(pin, apiKey.trim());
  localStorage.setItem(LS_CFG, JSON.stringify({ keyEnc }));
  if (rememberPin) sessionPin = pin;
  return true;
}

export function clearAIConfig(){
  localStorage.removeItem(LS_CFG);
  sessionPin = null;
}

export async function decryptApiKeyWithPin(pin){
  const cfg = loadAIConfig();
  if (!cfg.keyEnc) throw new Error("AI key kayıtlı değil.");
  const thePin = pin || sessionPin;
  if (!thePin) throw new Error("PIN gerekli.");
  return await decryptString(thePin, cfg.keyEnc);
}

async function callGeminiV1({ apiKey, model, parts, timeoutMs=45000 }){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);

  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try{
    const res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ contents: [{ role:"user", parts }] }),
      signal: ctrl.signal
    });

    const data = await res.json().catch(()=>({}));
    if (!res.ok){
      const msg = data?.error?.message || JSON.stringify(data);
      throw new Error(`Gemini hata: ${res.status} ${msg}`);
    }

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p=>p?.text).filter(Boolean).join("").trim();

    if (!text) throw new Error("AI cevap boş.");
    return text;
  } finally { clearTimeout(t); }
}

function tryParseJsonLoose(text){
  // 1) direkt parse
  try { return JSON.parse(text); } catch {}

  // 2) içinden JSON blok bul
  const firstObj = text.indexOf("{");
  const lastObj  = text.lastIndexOf("}");
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj){
    const cut = text.slice(firstObj, lastObj+1);
    try { return JSON.parse(cut); } catch {}
  }
  const firstArr = text.indexOf("[");
  const lastArr  = text.lastIndexOf("]");
  if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr){
    const cut = text.slice(firstArr, lastArr+1);
    try { return JSON.parse(cut); } catch {}
  }
  return null;
}

export async function aiTextSearch({ query, pin }){
  const cfg = loadAIConfig();
  const apiKey = await decryptApiKeyWithPin(pin);

  const prompt =
`Türkiye e-ticaret araması için her siteye özel en iyi arama sorgusunu üret.
Siteler: Trendyol, Hepsiburada, N11, Amazon TR, Pazarama, ÇiçekSepeti, idefix
Girdi: "${query}"
SADECE JSON döndür:
[
 {"site":"Trendyol","query":"...","reason":"..."},
 {"site":"Hepsiburada","query":"...","reason":"..."},
 {"site":"N11","query":"...","reason":"..."},
 {"site":"Amazon TR","query":"...","reason":"..."},
 {"site":"Pazarama","query":"...","reason":"..."},
 {"site":"ÇiçekSepeti","query":"...","reason":"..."},
 {"site":"idefix","query":"...","reason":"..."}
]`;

  const text = await callGeminiV1({
    apiKey,
    model: cfg.model,
    parts: [{ text: prompt }]
  });

  const js = tryParseJsonLoose(text);
  if (Array.isArray(js) && js.length) return js;

  // fallback: hiç JSON gelmezse boş dönmeyelim
  return [
    { site:"Trendyol", query, reason:"AI parse edilemedi, ham sorgu kullanıldı." },
    { site:"Hepsiburada", query, reason:"AI parse edilemedi, ham sorgu kullanıldı." },
    { site:"N11", query, reason:"AI parse edilemedi, ham sorgu kullanıldı." },
    { site:"Amazon TR", query, reason:"AI parse edilemedi, ham sorgu kullanıldı." },
    { site:"Pazarama", query, reason:"AI parse edilemedi, ham sorgu kullanıldı." },
    { site:"ÇiçekSepeti", query, reason:"AI parse edilemedi, ham sorgu kullanıldı." },
    { site:"idefix", query, reason:"AI parse edilemedi, ham sorgu kullanıldı." }
  ];
}

export async function aiVisionDetect({ file, pin }){
  const cfg = loadAIConfig();
  const apiKey = await decryptApiKeyWithPin(pin);

  const b64data = await new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=>resolve(String(fr.result).split(",")[1] || "");
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

  const prompt =
`Bu görseldeki ürünü tanı (marka/model varsa).
Kısa ve net yaz.
SADECE JSON döndür:
{"product":"...","search":"...","notes":"..."}`;

  const text = await callGeminiV1({
    apiKey,
    model: cfg.model,
    parts: [
      { text: prompt },
      { inlineData: { mimeType: file.type || "image/jpeg", data: b64data } }
    ]
  });

  const js = tryParseJsonLoose(text);
  if (js?.search) return js;

  // fallback: metin geldiyse en azından search üret
  return {
    product: "Ürün",
    search: "ürün",
    notes: text.slice(0, 300)
  };
}
