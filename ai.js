// ai.js (Gemini-only, stabil)
// API key cihazda AES-GCM ile şifreli saklanır. PIN localStorage'a yazılmaz.

const LS_CFG = "fiyattakip_ai_cfg_v1";
let sessionPin = null;

function te(s){ return new TextEncoder().encode(s); }
function td(b){ return new TextDecoder().decode(b); }

function b64(buf){
  const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer);
  let bin=""; for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin);
}
function unb64(s){
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

async function deriveKey(pin, saltB64){
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
  const { key, saltB64 } = await deriveKey(pin, null);
  const ct = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, te(plain));
  return { saltB64, ivB64: b64(iv), ctB64: b64(ct) };
}

async function decryptString(pin, blob){
  const { key } = await deriveKey(pin, blob.saltB64);
  const iv = new Uint8Array(unb64(blob.ivB64));
  const ct = unb64(blob.ctB64);
  const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
  return td(pt);
}

export function loadAIConfig(){
  try{
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) || "{}");
    return {
      model: cfg.model || "gemini-1.5-flash-002",
      keyEnc: cfg.keyEnc || null
    };
  }catch{
    return { model:"gemini-1.5-flash-002", keyEnc:null };
  }
}

export function hasAIConfig(){
  const c = loadAIConfig();
  return !!c.keyEnc;
}

export function setSessionPin(pin){ sessionPin = pin || null; }
export function clearAI(){ localStorage.removeItem(LS_CFG); sessionPin=null; }

export async function saveGeminiKey({ apiKey, pin, rememberPin=false }){
  if (!apiKey?.trim()) throw new Error("API key boş.");
  if (!pin?.trim()) throw new Error("PIN boş.");
  const keyEnc = await encryptString(pin, apiKey.trim());
  localStorage.setItem(LS_CFG, JSON.stringify({ model:"gemini-1.5-flash-002", keyEnc }));
  if (rememberPin) sessionPin = pin;
}

async function getKey(pin){
  const cfg = loadAIConfig();
  if (!cfg.keyEnc) throw new Error("AI key kayıtlı değil.");
  const thePin = pin || sessionPin;
  if (!thePin) throw new Error("PIN gerekli.");
  return await decryptString(thePin, cfg.keyEnc);
}

async function geminiText({ apiKey, model, prompt, timeoutMs=30000 }){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
      signal: ctrl.signal
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok){
      const msg = data?.error?.message || JSON.stringify(data);
      throw new Error(msg);
    }
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p=>p?.text).filter(Boolean).join("").trim();
    if (!text) throw new Error("AI cevap boş.");
    return text;
  } finally { clearTimeout(t); }
}

async function geminiVision({ apiKey, model, prompt, imageBase64, mimeType, timeoutMs=45000 }){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } }
          ]
        }]
      }),
      signal: ctrl.signal
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok){
      const msg = data?.error?.message || JSON.stringify(data);
      throw new Error(msg);
    }
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p=>p?.text).filter(Boolean).join("").trim();
    if (!text) throw new Error("AI cevap boş.");
    return text;
  } finally { clearTimeout(t); }
}

export async function aiSearchLinks({ query, pin }){
  const cfg = loadAIConfig();
  const apiKey = await getKey(pin);
  const prompt =
`Türkiye e-ticaret sitelerinde arama için link üret.
Sadece şu siteler: Trendyol, Hepsiburada, N11, Amazon TR, Pazarama, ÇiçekSepeti, idefix.
ÇIKTI SADECE JSON olsun:
[
  {"site":"Trendyol","url":"...","why":"kısa"},
  ...
]
Sorgu: ${query}`;
  const text = await geminiText({ apiKey, model: cfg.model, prompt });
  return text;
}

export async function aiImageToText({ imageBase64, mimeType, pin }){
  const cfg = loadAIConfig();
  const apiKey = await getKey(pin);
  const prompt =
`Bu görseldeki ürün/etiket/metin ne?
1) Ürün adı (kısa)
2) Varsa marka/model
3) Arama için 1 satır anahtar kelime
Sadece düz metin dön.`;
  const text = await geminiVision({ apiKey, model: cfg.model, prompt, imageBase64, mimeType });
  return text;
}
