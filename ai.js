// ai.js
// API key cihazda ŞİFRELİ saklanır (AES-GCM). PIN localStorage'a yazılmaz.

const LS_CFG = "fiyattakip_ai_cfg_v2";
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
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) || "{}");
    return {
      provider: cfg.provider || "gemini",
      model: cfg.model || "gemini-1.5-flash",
      keyEnc: cfg.keyEnc || null,
    };
  } catch {
    return { provider:"gemini", model:"gemini-1.5-flash", keyEnc:null };
  }
}

export function hasAIConfig(){
  const cfg = loadAIConfig();
  return !!(cfg.keyEnc && cfg.provider && cfg.model);
}

export async function saveAIConfigEncrypted({ provider, model, apiKey, pin, rememberPin=false }){
  if (!apiKey?.trim()) throw new Error("API key boş.");
  if (!pin?.trim()) throw new Error("PIN/Şifre boş.");
  const keyEnc = await encryptString(pin, apiKey.trim());
  const cfg = { provider, model, keyEnc };
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
    throw new Error("PIN yanlış veya şifreli veri bozulmuş.");
  }
}

async function callGeminiText({ apiKey, model, prompt, timeoutMs=30000 }){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try{
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
      throw new Error(`Gemini hata: ${res.status} ${msg}`);
    }
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p=>p?.text).filter(Boolean).join("").trim();
    if (!text) throw new Error("Gemini cevap boş.");
    return text;
  } finally { clearTimeout(t); }
}

async function callGeminiVision({ apiKey, model, prompt, imageBase64, mimeType="image/jpeg", timeoutMs=45000 }){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try{
    const res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: imageBase64 } }
          ]
        }]
      }),
      signal: ctrl.signal
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok){
      const msg = data?.error?.message || JSON.stringify(data);
      throw new Error(`Gemini hata: ${res.status} ${msg}`);
    }
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p=>p?.text).filter(Boolean).join("").trim();
    if (!text) throw new Error("Gemini cevap boş.");
    return text;
  } finally { clearTimeout(t); }
}

export async function runAI({ prompt, pin, provider, model }){
  const cfg = loadAIConfig();
  const prov = provider || cfg.provider;
  const mod = model || cfg.model;

  const thePin = pin || sessionPin;
  if (!thePin) throw new Error("PIN gerekli.");
  const apiKey = await decryptApiKeyWithPin(thePin);

  if (prov !== "gemini") throw new Error("Bu sürümde sadece Gemini aktif.");
  return await callGeminiText({ apiKey, model: mod, prompt });
}

export async function runAIVision({ prompt, pin, imageBase64, mimeType="image/jpeg", model }){
  const cfg = loadAIConfig();
  const mod = model || cfg.model || "gemini-1.5-flash";
  const thePin = pin || sessionPin;
  if (!thePin) throw new Error("PIN gerekli.");
  const apiKey = await decryptApiKeyWithPin(thePin);
  return await callGeminiVision({ apiKey, model: mod, prompt, imageBase64, mimeType });
}
