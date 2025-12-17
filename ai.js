// ai.js – FINAL
// Kullanıcı model seçmez.
// Sağlayıcıya göre EN İYİ model otomatik seçilir.
// API key AES-GCM ile cihazda şifreli saklanır.

const LS_CFG = "fiyattakip_ai_cfg_final";

let sessionPin = null;

/* ================= UTIL ================= */

const te = s => new TextEncoder().encode(s);
const td = b => new TextDecoder().decode(b);

const b64 = buf =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const unb64 = str =>
  Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;

/* ================= CRYPTO ================= */

async function deriveKey(pin, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey(
    "raw", te(pin), "PBKDF2", false, ["deriveKey"]
  );
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

/* ================= MODELS ================= */

// OpenAI → sabit ve güvenli
const OPENAI_MODEL = "gpt-4.1-mini";

// Gemini → otomatik fallback zinciri
const GEMINI_MODELS = [
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro-latest",
  "gemini-1.0-pro"
];

/* ================= CALLERS ================= */

async function callOpenAI(apiKey, prompt) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "OpenAI hata");

  return data.output_text || data.output?.[0]?.content?.[0]?.text || "";
}

async function callGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
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
    return callOpenAI(apiKey, prompt);
  }

  // GEMINI – otomatik fallback
  let lastErr;
  for (const model of GEMINI_MODELS) {
    try {
      return await callGemini(apiKey, model, prompt);
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error("Gemini çalışmadı: " + lastErr.message);
}
