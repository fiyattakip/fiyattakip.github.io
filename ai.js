// ai.js – FINAL (auto-model + cache + no UI model field)
// API Key AES-GCM ile cihazda şifreli saklanır.

const LS_CFG = "fiyattakip_ai_cfg_final";
const LS_MODEL_CACHE = "fiyattakip_ai_model_cache_v1";
const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

let sessionPin = null;

/* ================= UTIL ================= */
const te = s => new TextEncoder().encode(s);
const td = b => new TextDecoder().decode(b);

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;

function now() { return Date.now(); }

function readModelCache() {
  try { return JSON.parse(localStorage.getItem(LS_MODEL_CACHE) || "{}"); }
  catch { return {}; }
}
function writeModelCache(cache) {
  localStorage.setItem(LS_MODEL_CACHE, JSON.stringify(cache));
}

/* ================= CRYPTO ================= */
async function deriveKey(pin, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey("raw", te(pin), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return { key, saltB64: saltB64 || b64(salt) };
}

async function encrypt(pin, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { key, saltB64 } = await deriveKey(pin);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te(text));
  return { saltB64, ivB64: b64(iv), ctB64: b64(ct) };
}

async function decrypt(pin, blob) {
  const { key } = await deriveKey(pin, blob.saltB64);
  const iv = unb64(blob.ivB64);
  const ct = unb64(blob.ctB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return td(pt);
}

/* ================= CONFIG ================= */
export function saveAIConfig({ provider, apiKey, pin, rememberPin }) {
  if (!provider || !apiKey || !pin) throw new Error("Eksik bilgi");

  return encrypt(pin, apiKey).then(enc => {
    localStorage.setItem(LS_CFG, JSON.stringify({ provider, keyEnc: enc }));
    if (rememberPin) sessionPin = pin;
  });
}

export function loadAIConfig() {
  return JSON.parse(localStorage.getItem(LS_CFG) || "{}");
}

export function clearAIConfig() {
  localStorage.removeItem(LS_CFG);
  sessionPin = null;
}

export function clearModelCache() {
  localStorage.removeItem(LS_MODEL_CACHE);
}

/* ================= AUTO MODEL PICK ================= */

// Öncelik listeleri (isim değişse bile /models’den kontrol edilip bulunursa seçilir)
const OPENAI_PREF = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o"
];

const GEMINI_PREF = [
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro-latest",
  "gemini-1.0-pro"
];

async function pickOpenAIModel(apiKey) {
  const cache = readModelCache();
  const c = cache.openai;
  if (c && c.model && (now() - c.ts) < MODEL_CACHE_TTL_MS) return c.model;

  // Model listesini çek
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "OpenAI model listesi alınamadı");

  const ids = new Set((data.data || []).map(m => m.id));

  // Öncelik listemizden ilk mevcut olanı seç
  let chosen = OPENAI_PREF.find(id => ids.has(id));

  // Hiçbiri yoksa: GPT ile başlayan herhangi birini seç (son çare)
  if (!chosen) {
    const any = [...ids].find(x => x.startsWith("gpt-"));
    if (!any) throw new Error("OpenAI: Uygun model bulunamadı");
    chosen = any;
  }

  cache.openai = { model: chosen, ts: now() };
  writeModelCache(cache);
  return chosen;
}

async function pickGeminiModel(apiKey) {
  const cache = readModelCache();
  const c = cache.gemini;
  if (c && c.model && (now() - c.ts) < MODEL_CACHE_TTL_MS) return c.model;

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Gemini model listesi alınamadı");

  // Google: models: [{ name:"models/gemini-1.5-flash", supportedGenerationMethods:[...] }, ...]
  const models = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => (m.name || "").replace("models/", "")); // -> "gemini-1.5-flash" vs

  const set = new Set(models);

  // Öncelik listemizden mevcut olanı seç
  let chosen = GEMINI_PREF.find(id => set.has(id));

  // Yoksa "gemini" içeren herhangi birini seç
  if (!chosen) {
    const any = models.find(x => x.includes("gemini"));
    if (!any) throw new Error("Gemini: Uygun model bulunamadı");
    chosen = any;
  }

  cache.gemini = { model: chosen, ts: now() };
  writeModelCache(cache);
  return chosen;
}

/* ================= CALLERS ================= */

async function callOpenAI(apiKey, model, prompt) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: prompt
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "OpenAI hata");
  return data.output_text || data.output?.[0]?.content?.[0]?.text || "";
}

async function callGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Gemini hata");
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

/* ================= PUBLIC RUN ================= */

export async function runAI({ prompt, pin }) {
  const cfg = loadAIConfig();
  if (!cfg.provider || !cfg.keyEnc) throw new Error("AI ayarları yok");

  const realPin = pin || sessionPin;
  if (!realPin) throw new Error("PIN gerekli");

  const apiKey = await decrypt(realPin, cfg.keyEnc);

  if (cfg.provider === "openai") {
    const model = await pickOpenAIModel(apiKey);
    return callOpenAI(apiKey, model, prompt);
  }

  // gemini
  const model = await pickGeminiModel(apiKey);
  return callGemini(apiKey, model, prompt);
}
