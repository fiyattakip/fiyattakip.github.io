const LS_CFG = "fiyattakip_ai_cfg_v4";
let sessionPin = null;

function rulesGenerate(task, input){
  const text = String(input||"").trim();
  if (!text) return "Bir şey yaz (ör: 'iphone 13 128gb').";
  if (task === "improve_query"){
    // Basit temizlik: gereksiz kelimeleri azalt
    return text.replace(/\s+/g," ").slice(0,80);
  }
  // product_comment
  return `Ürüne göre genel değerlendirme: ${text}.\n- Artılar: fiyat/performans, garanti, stok\n- Eksiler: satıcı puanı, iade koşulları\nNot: Fiyat verisi yoksa linkten açıp satıcı/yorum kontrol et.`;
}


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

  }catch(e){
    return rulesGenerate('product_comment', prompt);
  }
}
nst LS_CFG = "fiyattakip_ai_cfg_v4";
let sessionPin = null;

function rulesGenerate(task, input){
  const text = String(input||"").trim();
  if (!text) return "Bir şey yaz (ör: 'iphone 13 128gb').";
  if (task === "improve_query"){
    // Basit temizlik: gereksiz kelimeleri azalt
    return text.replace(/\s+/g," ").slice(0,80);
  }
  // product_comment
  return `Ürüne göre genel değerlendirme: ${text}.\n- Artılar: fiyat/performans, garanti, stok\n- Eksiler: satıcı puanı, iade koşulları\nNot: Fiyat verisi yoksa linkten açıp satıcı/yorum kontrol et.`;
}


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
  try{
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
export async function geminiVision({ prompt, mime, base64Data 
  }catch(e){
    return rulesGenerate('improve_query', '');
  }
}){
  try{
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
