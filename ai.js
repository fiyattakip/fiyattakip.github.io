// ai.js — Gemini only, model auto-pick + encrypted key (AES-GCM) + session PIN remember
// Docs: Models + generateContent v1. :contentReference[oaicite:0]{index=0}

const LS_CFG = "fiyattakip_ai_cfg_v3"; // { provider:"gemini", model, keyEnc }
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

export function getSessionPin(){ return sessionPin; }
export function setSessionPin(pin){ sessionPin = pin || null; }
export function clearSessionPin(){ sessionPin = null; }

export function loadAIConfig(){
  try{
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) || "{}");
    return {
      provider: "gemini",
      model: cfg.model || "",
      keyEnc: cfg.keyEnc || null
    };
  }catch{
    return { provider:"gemini", model:"", keyEnc:null };
  }
}

export function hasAIConfig(){
  const cfg = loadAIConfig();
  return !!(cfg.keyEnc);
}

export async function saveAIConfigEncrypted({ apiKey, pin, rememberPin=false }){
  if (!apiKey?.trim()) throw new Error("API key boş.");
  if (!pin?.trim()) throw new Error("PIN boş.");
  const keyEnc = await encryptString(pin, apiKey.trim());
  const cfg = { provider:"gemini", model:"", keyEnc };
  localStorage.setItem(LS_CFG, JSON.stringify(cfg));
  if (rememberPin) sessionPin = pin;
  return cfg;
}

export function clearAIConfig(){
  localStorage.removeItem(LS_CFG);
  sessionPin = null;
}

export async function decryptApiKeyWithPin(pin){
  const cfg = loadAIConfig();
  if (!cfg.keyEnc) throw new Error("AI key kayıtlı değil.");
  if (!pin?.trim()) throw new Error("PIN gerekli.");
  try{
    return await decryptString(pin, cfg.keyEnc);
  }catch{
    throw new Error("PIN yanlış veya veri bozulmuş.");
  }
}

async function listModelsV1(apiKey){
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method:"GET" });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data?.error?.message || "Model listesi alınamadı.");
  return data?.models || [];
}

// “stabil flash” model seçimi: flash geçen + generateContent destekleyen
async function pickStableModel(apiKey){
  const models = await listModelsV1(apiKey);
  const ok = models
    .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map(m => m.name?.replace(/^models\//,""))
    .filter(Boolean);

  // Öncelik: flash ve güncel
  const preferred = [
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash"
  ];

  for (const p of preferred){
    const hit = ok.find(x => x === p);
    if (hit) return hit;
  }
  // “flash” içeren ilk model
  const flash = ok.find(x => x.toLowerCase().includes("flash"));
  if (flash) return flash;

  // hiçbiri yoksa ilk generateContent model
  return ok[0] || "";
}

async function geminiGenerate({ apiKey, model, contents, timeoutMs=40000 }){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try{
    const res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ contents }),
      signal: ctrl.signal
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok){
      const msg = data?.error?.message || JSON.stringify(data);
      throw new Error(`Gemini hata: ${res.status} ${msg}`);
    }
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p=>p?.text).filter(Boolean).join("").trim();
    return { text, raw: data };
  } finally { clearTimeout(t); }
}

function safeJsonFromText(text){
  // cevap içinde JSON varsa ayıkla
  const s = String(text || "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start){
    const sub = s.slice(start, end+1);
    return JSON.parse(sub);
  }
  return JSON.parse(s);
}

/**
 * runTextAI: Ürün linkleri üretir.
 * Dönüş: [{site, title, url, note}]
 */
export async function runTextAI({ prompt, pin }){
  const cfg = loadAIConfig();
  const thePin = pin || sessionPin;
  if (!thePin) throw new Error("PIN gerekli. (AI Ayarları)");
  const apiKey = await decryptApiKeyWithPin(thePin);

  let model = cfg.model;
  if (!model){
    model = await pickStableModel(apiKey);
    localStorage.setItem(LS_CFG, JSON.stringify({ ...cfg, model }));
  }
  if (!model) throw new Error("Uygun Gemini modeli bulunamadı. (AI Studio key doğru mu?)");

  const sys = `
Sadece JSON dizi dön.
Format: [{"site":"Trendyol|Hepsiburada|N11|Amazon TR|Pazarama|ÇiçekSepeti|idefix","title":"...","url":"https://...","note":"kısa not"}]
Kurallar:
- Her itemda site adı zorunlu.
- URL ürün detay sayfası olsun (arama linki değil).
- En fazla 8 sonuç.
- Türkçe yaz.
  `.trim();

  const { text } = await geminiGenerate({
    apiKey,
    model,
    contents: [{ parts: [{ text: sys + "\n\nKullanıcı isteği:\n" + prompt }] }]
  });

  const arr = safeJsonFromText(text);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("AI sonuç üretemedi.");
  return arr.map(x=>({
    site: String(x.site||"").trim(),
    title: String(x.title||"").trim(),
    url: String(x.url||"").trim(),
    note: String(x.note||"").trim(),
  })).filter(x=>x.site && x.title && x.url);
}

/**
 * runVisionAI: Görselden ürün/metin çıkarır.
 * Dönüş: { extractedText, query }
 */
export async function runVisionAI({ file, pin }){
  const cfg = loadAIConfig();
  const thePin = pin || sessionPin;
  if (!thePin) throw new Error("PIN gerekli. (AI Ayarları)");
  const apiKey = await decryptApiKeyWithPin(thePin);

  let model = cfg.model;
  if (!model){
    model = await pickStableModel(apiKey);
    localStorage.setItem(LS_CFG, JSON.stringify({ ...cfg, model }));
  }
  if (!model) throw new Error("Uygun Gemini modeli bulunamadı.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const b64img = btoa(String.fromCharCode(...bytes));
  const mime = file.type || "image/jpeg";

  const sys = `
Fotoğraftan ürün adı/marka/model gibi metni çıkar.
Sadece JSON dön:
{"extractedText":"...","query":"arama için en iyi kısa ifade"}
`.trim();

  const { text } = await geminiGenerate({
    apiKey,
    model,
    contents: [{
      parts: [
        { text: sys },
        { inlineData: { mimeType: mime, data: b64img } }
      ]
    }],
    timeoutMs: 50000
  });

  const obj = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}")+1));
  const extractedText = String(obj.extractedText||"").trim();
  const query = String(obj.query||"").trim();

  if (!extractedText && !query) throw new Error("Görselden metin çıkarılamadı.");
  return { extractedText, query: query || extractedText };
}
