// ai.js
// - Sadece Gemini
// - API key localStorage'a AES-GCM ile ŞİFRELİ kaydedilir
// - PIN localStorage'a kaydolmaz (sadece sessionStorage / RAM)
// - Model: otomatik stabil (fallback listesi)

const LS_CFG = "fiyattakip_ai_cfg_v4";
const SS_PIN = "fiyattakip_ai_pin_session";

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

export function getSessionPin(){
  return sessionStorage.getItem(SS_PIN) || null;
}
export function setSessionPin(pin){
  if (!pin) sessionStorage.removeItem(SS_PIN);
  else sessionStorage.setItem(SS_PIN, pin);
}
export function clearSessionPin(){
  sessionStorage.removeItem(SS_PIN);
}

export function loadAIConfig(){
  try{
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) || "{}");
    return {
      provider: "gemini",
      keyEnc: cfg.keyEnc || null,
      modelCandidates: cfg.modelCandidates || ["gemini-2.5-flash","gemini-2.0-flash","gemini-3-flash"]
    };
  }catch{
    return { provider:"gemini", keyEnc:null, modelCandidates:["gemini-2.5-flash","gemini-2.0-flash","gemini-3-flash"] };
  }
}

export function hasAIConfig(){
  const cfg = loadAIConfig();
  return !!cfg.keyEnc;
}

export async function saveAIConfigEncrypted({ apiKey, pin, rememberPin=false }){
  if (!apiKey?.trim()) throw new Error("API key boş.");
  if (!pin?.trim()) throw new Error("PIN/Şifre boş.");
  const keyEnc = await encryptString(pin, apiKey.trim());
  const cfg = {
    keyEnc,
    modelCandidates: ["gemini-2.5-flash","gemini-2.0-flash","gemini-3-flash"]
  };
  localStorage.setItem(LS_CFG, JSON.stringify(cfg));
  if (rememberPin) setSessionPin(pin);
  return cfg;
}

export function clearAIConfig(){
  localStorage.removeItem(LS_CFG);
  clearSessionPin();
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

async function callGeminiOnce({ apiKey, model, prompt, imageB64=null, timeoutMs=35000 }){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);

  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts = [];
  if (prompt) parts.push({ text: prompt });

  if (imageB64){
    // imageB64: "data:image/png;base64,...." veya "base64...."
    const pure = imageB64.includes(",") ? imageB64.split(",")[1] : imageB64;
    parts.push({
      inline_data: { mime_type: "image/jpeg", data: pure }
    });
  }

  try{
    const res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ contents:[{ parts }] }),
      signal: ctrl.signal
    });

    const data = await res.json().catch(()=>({}));
    if (!res.ok){
      const msg = data?.error?.message || JSON.stringify(data);
      const err = new Error(`Gemini hata: ${res.status} ${msg}`);
      err.status = res.status;
      throw err;
    }

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p=>p?.text).filter(Boolean).join("").trim();

    if (!text) throw new Error("Gemini cevap boş.");
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function callGeminiAuto({ apiKey, prompt, imageB64=null }){
  const cfg = loadAIConfig();
  const models = cfg.modelCandidates || ["gemini-2.5-flash","gemini-2.0-flash","gemini-3-flash"];

  let lastErr = null;
  for (const m of models){
    try{
      return await callGeminiOnce({ apiKey, model: m, prompt, imageB64 });
    }catch(e){
      lastErr = e;
      // 404/400 gibi model sorunlarında sıradakine geç
      continue;
    }
  }
  throw lastErr || new Error("Gemini çağrısı başarısız.");
}

// Dışarıdan çağıracağın fonksiyon: PIN’i (oturumdan) kullanır.
export async function runAI({ prompt, pin=null, imageB64=null }){
  const thePin = pin || getSessionPin();
  if (!thePin) throw new Error("PIN gerekli. (AI Ayarları’ndan gir ve Oturumu Hatırla seç)");
  const apiKey = await decryptApiKeyWithPin(thePin);
  return await callGeminiAuto({ apiKey, prompt, imageB64 });
}
