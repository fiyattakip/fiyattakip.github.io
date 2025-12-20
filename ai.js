// ai.js
// API key cihazda ŞİFRELİ saklanır (AES-GCM).
// PIN/Şifre localStorage'a yazılmaz. "Oturum hatırla" seçilirse sadece RAM'de tutulur.
//
// Gemini tarafında model isimleri değişebildiği için 404 vb. durumlarda otomatik fallback vardır.

const LS_CFG = "fiyattakip_ai_cfg_v3"; // v2 -> v3 (yeni model fallback + defaultlar)

// Oturum belleği (sayfa kapanınca gider)
let sessionPin = null;

function te(str) { return new TextEncoder().encode(str); }
function td(buf) { return new TextDecoder().decode(buf); }

function b64(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function unb64(s) {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/* =========================
   Crypto: PBKDF2 -> AES-GCM
========================= */
async function deriveKeyFromPin(pin, saltB64) {
  const salt = saltB64
    ? unb64(saltB64)
    : crypto.getRandomValues(new Uint8Array(16)).buffer;

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

async function encryptString(pin, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { key, saltB64 } = await deriveKeyFromPin(pin, null);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te(plain));
  return { saltB64, ivB64: b64(iv), ctB64: b64(ct) };
}

async function decryptString(pin, blob) {
  const { key } = await deriveKeyFromPin(pin, blob.saltB64);
  const iv = new Uint8Array(unb64(blob.ivB64));
  const ct = unb64(blob.ctB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return td(pt);
}

/* =========================
   Session PIN (RAM)
========================= */
export function getSessionPin() { return sessionPin; }
export function setSessionPin(pin) { sessionPin = pin || null; }
export function clearSessionPin() { sessionPin = null; }

/* =========================
   Config storage
========================= */
// provider: "openai" | "gemini"
// model:
//  - openai: örn "gpt-4.1-mini"
//  - gemini: en güvenlisi "gemini-flash-latest" (alias), fallback: "gemini-2.5-flash-lite"
export function loadAIConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) || "{}");
    return {
      provider: cfg.provider || "gemini",
      // Gemini tarafında "flash-latest" en pratik; 404 olursa fallback var
      model: cfg.model || "gemini-flash-latest",
      keyEnc: cfg.keyEnc || null // {saltB64, ivB64, ctB64}
    };
  } catch {
    return { provider: "gemini", model: "gemini-flash-latest", keyEnc: null };
  }
}

export function hasAIConfig() {
  const cfg = loadAIConfig();
  return !!(cfg.keyEnc && cfg.provider && cfg.model);
}

// apiKey şifreli kaydedilir, PIN kaydedilmez. rememberPin=true ise sadece sessionPin set edilir.
export async function saveAIConfigEncrypted({ provider, model, apiKey, pin, rememberPin = false }) {
  const prov = (provider || "gemini").trim().toLowerCase();
  const mod = (model || (prov === "gemini" ? "gemini-flash-latest" : "gpt-4.1-mini")).trim();

  if (!apiKey?.trim()) throw new Error("API key boş.");
  if (!pin?.trim()) throw new Error("PIN/Şifre boş. (Anahtar şifreli saklanacak.)");

  const keyEnc = await encryptString(pin, apiKey.trim());
  const cfg = { provider: prov, model: mod, keyEnc };

  localStorage.setItem(LS_CFG, JSON.stringify(cfg));

  if (rememberPin) sessionPin = pin;
  else sessionPin = null;

  return cfg;
}

export function clearAIConfig() {
  localStorage.removeItem(LS_CFG);
  sessionPin = null;
}

export async function decryptApiKeyWithPin(pin) {
  const cfg = loadAIConfig();
  if (!cfg.keyEnc) throw new Error("AI key kayıtlı değil.");
  if (!pin?.trim()) throw new Error("PIN gerekli.");
  try {
    return await decryptString(pin, cfg.keyEnc);
  } catch {
    throw new Error("PIN yanlış veya şifreli veri bozulmuş.");
  }
}

/* =========================
   OpenAI helpers (Responses API)
========================= */
function pickTextFromOpenAIResponses(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const out = data?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const c = item?.content;
      if (Array.isArray(c)) {
        for (const part of c) {
          if (typeof part?.text === "string" && part.text.trim()) return part.text.trim();
        }
      }
    }
  }
  return "";
}

async function callOpenAI({ apiKey, model, prompt, timeoutMs = 30000 }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, input: prompt }),
      signal: ctrl.signal
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || JSON.stringify(data);
      throw new Error(`OpenAI hata: ${res.status} ${msg}`);
    }

    const text = pickTextFromOpenAIResponses(data);
    if (!text) throw new Error("OpenAI cevap boş/okunamadı.");
    return text;
  } finally {
    clearTimeout(t);
  }
}

/* =========================
   Gemini helpers (generateContent)
   - Model isimleri değişebildiği için fallback var
========================= */
async function callGeminiOnce({ apiKey, model, prompt, timeoutMs = 30000 }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
      signal: ctrl.signal
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.error?.message || JSON.stringify(data);
      throw new Error(`Gemini hata: ${res.status} ${msg}`);
    }

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p?.text)
      .filter(Boolean)
      .join("")
      .trim();

    if (!text) throw new Error("Gemini cevap boş.");
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function callGeminiWithFallback({ apiKey, model, prompt, timeoutMs = 30000 }) {
  // Sıra: seçilen model -> flash-latest -> 2.5 flash lite
  const tryModels = [
    model,
    "gemini-flash-latest",
    "gemini-2.5-flash-lite"
  ].filter(Boolean);

  let lastErr = null;

  for (const m of tryModels) {
    try {
      return await callGeminiOnce({ apiKey, model: m, prompt, timeoutMs });
    } catch (e) {
      lastErr = e;
      // Bir sonraki modele dene
      continue;
    }
  }

  throw lastErr || new Error("Gemini başarısız.");
}

/* =========================
   Public: Run AI
========================= */
export async function runAI({ prompt, pin, provider, model, timeoutMs = 30000 }) {
  const cfg = loadAIConfig();

  const prov = (provider || cfg.provider || "gemini").trim().toLowerCase();
  const mod =
    (model || cfg.model || (prov === "gemini" ? "gemini-flash-latest" : "gpt-4.1-mini")).trim();

  const thePin = pin || sessionPin;
  if (!thePin) throw new Error("PIN gerekli. (AI Ayarları'ndan gir)");

  const apiKey = await decryptApiKeyWithPin(thePin);

  if (prov === "gemini") {
    return await callGeminiWithFallback({ apiKey, model: mod, prompt, timeoutMs });
  }

  // default: openai
  return await callOpenAI({ apiKey, model: mod, prompt, timeoutMs });
}
