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

function saveCfg(cfg){
  localStorage.setItem(LS_CFG, JSON.stringify(cfg));
}

export function aiConfigured(){
  const cfg = loadAiCfg();
  return !!(cfg && (cfg.encGeminiKey || cfg.encOpenAIKey));
}

export function getPreferredProvider(){
  const cfg = loadAiCfg();
  return cfg?.preferredProvider || "gemini";
}

export function setPreferredProvider(p){
  const cfg = loadAiCfg() || {};
  cfg.preferredProvider = (p === "openai") ? "openai" : "gemini";
  saveCfg(cfg);
  return true;
}

async function getPinOrThrow(){
  const pin = sessionPin || prompt("PIN gir (AI için):");
  if (!pin) throw new Error("PIN gerekli.");
  setSessionPin(pin);
  return pin;
}

async function getKeyOrThrow(provider){
  const cfg = loadAiCfg();
  const pin = await getPinOrThrow();

  if (provider === "openai"){
    if (!cfg?.encOpenAIKey) throw new Error("OpenAI key kayıtlı değil.");
    return (await decryptString(pin, cfg.encOpenAIKey)).trim();
  }
  // default gemini
  if (!cfg?.encGeminiKey) throw new Error("Gemini key kayıtlı değil.");
  return (await decryptString(pin, cfg.encGeminiKey)).trim();
}

function looksLikeGeminiKey(k){ return /^AIza[0-9A-Za-z\-_]{10,}$/.test(k || ""); }
function looksLikeOpenAIKey(k){ return /^sk-[A-Za-z0-9\-_]{10,}$/.test(k || "") || /^sk-proj-[A-Za-z0-9\-_]{10,}$/.test(k || ""); }

export async function saveAiKeys({ geminiKey, openaiKey, pin, rememberPin, preferredProvider }){
  if (!pin || pin.length < 4) throw new Error("PIN en az 4 karakter olmalı.");
  const cfg = loadAiCfg() || {};

  const gk = (geminiKey || "").trim();
  const ok = (openaiKey || "").trim();

  if (!gk && !ok) throw new Error("En az bir API key girmen lazım (Gemini veya OpenAI).");

  if (gk){
    if (!looksLikeGeminiKey(gk)) throw new Error("Gemini API key hatalı görünüyor.");
    cfg.encGeminiKey = await encryptString(pin, gk);
  }

  if (ok){
    if (!looksLikeOpenAIKey(ok)) throw new Error("OpenAI API key hatalı görünüyor.");
    cfg.encOpenAIKey = await encryptString(pin, ok);
  }

  cfg.preferredProvider = (preferredProvider === "openai") ? "openai" : "gemini";
  cfg.updatedAt = Date.now();

  saveCfg(cfg);
  sessionPin = rememberPin ? pin : null;
  return true;
}

export function clearAiCfg(){
  localStorage.removeItem(LS_CFG);
  sessionPin = null;
}

/* ---------------- Provider calls ---------------- */

function isQuotaLikeError(msg){
  const s = String(msg||"").toLowerCase();
  return s.includes(" 429") || s.includes("quota") || s.includes("insufficient") || s.includes("rate limit") || s.includes("too many") || s.includes("billing");
}

/** Gemini text */
async function geminiTextRaw(prompt){
  const key = await getKeyOrThrow("gemini");
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
    throw new Error(`Gemini hata: ${r.status} ${t.slice(0,180)}`);
  }

  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")?.trim();
  if (!text) throw new Error("Gemini boş cevap döndü.");
  return text;
}

/** Gemini vision */
async function geminiVisionRaw({ prompt, base64Data, mime }){
  const key = await getKeyOrThrow("gemini");
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
    throw new Error(`Gemini hata: ${r.status} ${t.slice(0,180)}`);
  }

  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")?.trim();
  if (!text) throw new Error("Görselden metin çıkarılamadı.");
  return text;
}

/** OpenAI text (browser fetch; key client-side!) */
async function openaiTextRaw(prompt){
  const key = await getKeyOrThrow("openai");

  // Responses API
  const url = "https://api.openai.com/v1/responses";
  const body = {
    model: "gpt-4.1-mini",
    input: prompt,
    max_output_tokens: 700
  };

  const r = await fetch(url, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    // Keep it short in toast
    throw new Error(`OpenAI hata: ${r.status} ${t.slice(0,180)}`);
  }

  const j = await r.json();
  // Responses: output_text convenience isn't always present; parse output array.
  const text =
    (j?.output_text && String(j.output_text).trim()) ||
    (j?.output?.flatMap(o=>o?.content||[]).filter(c=>c?.type==="output_text").map(c=>c?.text).join("").trim()) ||
    "";
  if (!text) throw new Error("OpenAI boş cevap döndü.");
  return text;
}

async function openaiVisionRaw({ prompt, base64Data, mime }){
  const key = await getKeyOrThrow("openai");
  const url = "https://api.openai.com/v1/responses";

  const body = {
    model: "gpt-4.1-mini",
    input: [{
      role: "user",
      content: [
        { type:"input_text", text: prompt },
        { type:"input_image", image_url: `data:${mime};base64,${base64Data}` }
      ]
    }],
    max_output_tokens: 550
  };

  const r = await fetch(url, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`OpenAI hata: ${r.status} ${t.slice(0,180)}`);
  }

  const j = await r.json();
  const text =
    (j?.output_text && String(j.output_text).trim()) ||
    (j?.output?.flatMap(o=>o?.content||[]).filter(c=>c?.type==="output_text").map(c=>c?.text).join("").trim()) ||
    "";
  if (!text) throw new Error("OpenAI boş cevap döndü.");
  return text;
}

/* ---------------- Unified API with auto fallback ---------------- */

export async function aiText(prompt){
  const cfg = loadAiCfg() || {};
  const preferred = cfg.preferredProvider === "openai" ? "openai" : "gemini";
  const providers = preferred === "openai" ? ["openai","gemini"] : ["gemini","openai"];

  let lastErr = null;
  for (const p of providers){
    if (p==="openai" && !cfg.encOpenAIKey) continue;
    if (p==="gemini" && !cfg.encGeminiKey) continue;
    try{
      return (p==="openai") ? await openaiTextRaw(prompt) : await geminiTextRaw(prompt);
    }catch(e){
      lastErr = e;
      const msg = e?.message || String(e);
      // If quota-like, try other provider if exists. Otherwise throw immediately.
      if (!isQuotaLikeError(msg)) throw e;
    }
  }
  throw lastErr || new Error("AI çalıştırılamadı.");
}

export async function aiVision({ prompt, base64Data, mime }){
  const cfg = loadAiCfg() || {};
  const preferred = cfg.preferredProvider === "openai" ? "openai" : "gemini";
  const providers = preferred === "openai" ? ["openai","gemini"] : ["gemini","openai"];

  let lastErr = null;
  for (const p of providers){
    if (p==="openai" && !cfg.encOpenAIKey) continue;
    if (p==="gemini" && !cfg.encGeminiKey) continue;
    try{
      return (p==="openai")
        ? await openaiVisionRaw({ prompt, base64Data, mime })
        : await geminiVisionRaw({ prompt, base64Data, mime });
    }catch(e){
      lastErr = e;
      const msg = e?.message || String(e);
      if (!isQuotaLikeError(msg)) throw e;
    }
  }
  throw lastErr || new Error("Görsel analiz çalıştırılamadı.");
}
