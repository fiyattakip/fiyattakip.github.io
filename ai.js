/* ai.js — FIXED (Gemini/OpenAI) */

const LS_CFG = "fiyattakip_ai_cfg_v3";
const SS_PIN = "fiyattakip_ai_pin_session_v1";

let sessionPin = null;
try {
  sessionPin = sessionStorage.getItem(SS_PIN) || null;
} catch {
  sessionPin = null;
}

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

/* =========================
   Session PIN helpers
========================= */
export function setSessionPin(pin){
  sessionPin = pin || null;
  try{
    if (sessionPin) sessionStorage.setItem(SS_PIN, sessionPin);
    else sessionStorage.removeItem(SS_PIN);
  }catch{}
}
export function clearSessionPin(){
  sessionPin = null;
  try{ sessionStorage.removeItem(SS_PIN); }catch{}
}
export function getSessionPin(){ return sessionPin; }

/* =========================
   Config storage
========================= */
export function loadAIConfig(){
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) || "{}");
    return {
      provider: cfg.provider || "gemini",
      model: cfg.model || "gemini-2.5-flash",
      keyEnc: cfg.keyEnc || null
    };
  } catch {
    return { provider:"gemini", model:"gemini-2.5-flash", keyEnc:null };
  }
}

export function hasAIConfig(){
  const cfg = loadAIConfig();
  return !!(cfg.keyEnc && cfg.provider && cfg.model);
}

export async function saveAIConfigEncrypted({ provider, model, apiKey, pin, rememberPin=false }){
  if (!apiKey?.trim()) throw new Error("API key boş.");
  if (!pin?.trim()) throw new Error("PIN boş.");

  const keyEnc = await encryptString(pin, apiKey.trim());
  const cfg = {
    provider: (provider || "gemini").trim(),
    model: (model || "gemini-2.5-flash").trim(),
    keyEnc
  };

  localStorage.setItem(LS_CFG, JSON.stringify(cfg));

  // IMPORTANT: rememberPin => sessionStorage ile PIN’i tut (refresh’te kaybolmasın)
  if (rememberPin) setSessionPin(pin);
  else clearSessionPin();

  return cfg;
}

export function clearAIConfig(){
  localStorage.removeItem(LS_CFG);
  clearSessionPin();
}

export async function decryptApiKeyWithPin(pin){
  const cfg = loadAIConfig();
  if (!cfg.keyEnc) throw new Error("AI key kayıtlı değil.");
  const thePin = pin || sessionPin;
  if (!thePin) throw new Error("PIN gerekli.");
  return await decryptString(thePin, cfg.keyEnc);
}

/* =========================
   Robust JSON extraction
========================= */
function stripCodeFences(s){
  if (!s) return "";
  // ```json ... ``` or ``` ... ```
  return String(s).replace(/```(?:json)?/gi, "```").split("```").length >= 3
    ? String(s).split("```").slice(1, -1).join("```").trim()
    : String(s).trim();
}

function extractLikelyJsonSlice(s){
  const t = stripCodeFences(s);

  // find first { or [
  const iObj = t.indexOf("{");
  const iArr = t.indexOf("[");
  let start = -1;
  if (iObj === -1) start = iArr;
  else if (iArr === -1) start = iObj;
  else start = Math.min(iObj, iArr);

  if (start === -1) return null;

  // find last } or ]
  const endObj = t.lastIndexOf("}");
  const endArr = t.lastIndexOf("]");
  let end = Math.max(endObj, endArr);
  if (end === -1 || end <= start) return null;

  return t.slice(start, end + 1).trim();
}

function safeJsonParseAny(s){
  try { return JSON.parse(s); } catch {}
  const slice = extractLikelyJsonSlice(s);
  if (!slice) return null;
  try { return JSON.parse(slice); } catch {}
  // bazen tek tırnak vs olur — son çare: basit düzeltme
  try {
    const fixed = slice
      .replace(/^\uFEFF/, "")
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

/* =========================
   Gemini + OpenAI callers
========================= */
async function fetchJson(url, opts, timeoutMs){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs || 30000);
  try{
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok){
      const msg = data?.error?.message || JSON.stringify(data);
      throw new Error(`${res.status} ${msg}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function callGeminiV1({ apiKey, model, parts, timeoutMs=30000 }){
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const data = await fetchJson(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      contents: [{ role:"user", parts }],
      // JSON dönmesini “zorla”; yine de dönmezse aşağıda ayıklıyoruz
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800
      }
    })
  }, timeoutMs);

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(p=>p?.text)
    .filter(Boolean)
    .join("")
    .trim();

  if (!text) throw new Error("Gemini cevap boş.");
  return text;
}

async function callOpenAIResponses({ apiKey, model, input, timeoutMs=30000 }){
  const url = "https://api.openai.com/v1/responses";
  const data = await fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type":"application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      input
    })
  }, timeoutMs);

  // Responses API: output_text bazen var
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();

  // fallback: output[] içinden text topla
  const out = [];
  for (const item of (data?.output || [])){
    for (const c of (item?.content || [])){
      if (c?.type === "output_text" && c?.text) out.push(c.text);
    }
  }
  const text = out.join("").trim();
  if (!text) throw new Error("OpenAI cevap boş.");
  return text;
}

/* =========================
   Public: runAI / runAIVision
========================= */
export async function runAI({ prompt, pin, provider, model, timeoutMs=30000 }){
  const cfg = loadAIConfig();
  const prov = (provider || cfg.provider || "gemini").toLowerCase().trim();
  const mdl = (model || cfg.model || (prov==="gemini" ? "gemini-2.5-flash" : "gpt-4o-mini")).trim();
  const apiKey = await decryptApiKeyWithPin(pin);

  const safePrompt =
`SADECE çıktıyı ver. Açıklama/markdown yok.
Eğer JSON istendiyse kesinlikle JSON dışında hiçbir şey yazma.

${prompt}`.trim();

  if (prov === "openai"){
    return await callOpenAIResponses({
      apiKey,
      model: mdl,
      timeoutMs,
      input: safePrompt
    });
  }

  // default: gemini
  return await callGeminiV1({
    apiKey,
    model: mdl,
    timeoutMs,
    parts: [{ text: safePrompt }]
  });
}

export async function runAIVision({ prompt, file, pin, provider, model, timeoutMs=30000 }){
  if (!file) throw new Error("Görsel seçilmedi.");

  const cfg = loadAIConfig();
  const prov = (provider || cfg.provider || "gemini").toLowerCase().trim();
  const mdl = (model || cfg.model || (prov==="gemini" ? "gemini-2.5-flash" : "gpt-4o-mini")).trim();
  const apiKey = await decryptApiKeyWithPin(pin);

  const toDataUrl = () => new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=>resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

  const safePrompt =
`SADECE çıktıyı ver. Açıklama/markdown yok.
Eğer JSON istendiyse kesinlikle JSON dışında hiçbir şey yazma.

${prompt}`.trim();

  if (prov === "openai"){
    const dataUrl = await toDataUrl();
    const input = [{
      role: "user",
      content: [
        { type: "input_text", text: safePrompt },
        { type: "input_image", image_url: dataUrl }
      ]
    }];

    return await callOpenAIResponses({
      apiKey,
      model: mdl,
      timeoutMs,
      input
    });
  }

  // gemini vision: inlineData base64
  const b64data = await new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=>resolve(String(fr.result).split(",")[1] || "");
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

  return await callGeminiV1({
    apiKey,
    model: mdl,
    timeoutMs,
    parts: [
      { text: safePrompt },
      { inlineData: { mimeType: file.type || "image/jpeg", data: b64data } }
    ]
  });
}

/* =========================
   Optional helpers (JSON expected)
========================= */
export async function aiTextSearch({ query, pin }){
  const prompt =
`Türkiye e-ticaret araması için her siteye özel en iyi arama sorgusunu üret.
Siteler: Trendyol, Hepsiburada, N11, Amazon TR, Pazarama, ÇiçekSepeti, idefix
Girdi: "${query}"

SADECE JSON:
[
 {"site":"Trendyol","query":"...","reason":"..."},
 {"site":"Hepsiburada","query":"...","reason":"..."},
 {"site":"N11","query":"...","reason":"..."},
 {"site":"Amazon TR","query":"...","reason":"..."},
 {"site":"Pazarama","query":"...","reason":"..."},
 {"site":"ÇiçekSepeti","query":"...","reason":"..."},
 {"site":"idefix","query":"...","reason":"..."}
]`;

  const text = await runAI({ prompt, pin });
  const js = safeJsonParseAny(text);
  return Array.isArray(js) ? js : [];
}

export async function aiVisionDetect({ file, pin }){
  const prompt =
`Bu görseldeki ürünü tanı (marka/model varsa).
SADECE JSON:
{"product":"...","search":"...","notes":"..."}`;

  const text = await runAIVision({ prompt, file, pin });
  const js = safeJsonParseAny(text);
  if (!js?.search) throw new Error("Görsel bulunamadı.");
  return js;
}
