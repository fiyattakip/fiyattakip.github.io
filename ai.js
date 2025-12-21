// ai.js (FULL - fixed)
// - API key cihazda AES-GCM ile şifreli saklanır.
// - PIN localStorage'a yazılmaz. İstersen "oturum hatırla" ile RAM'de tutulur.
// - Gemini modelini sabitlemez: ListModels ile generateContent destekleyen bir modeli otomatik seçer.
// - Görsel (kamera/galeri) için inline_data destekli çağrı hazır.

const LS_CFG = "fiyattakip_ai_cfg_v3";

// Oturum belleği (sayfa kapanınca gider)
let sessionPin = null;

// Basit model cache (oturum boyunca tekrar listModels çağırmasın)
let cachedTextModel = null;
let cachedVisionModel = null;

/* =========================
   Helpers: encode/decode, base64
========================= */
function te(str) { return new TextEncoder().encode(String(str)); }
function td(buf) { return new TextDecoder().decode(buf); }

function b64(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function unb64(s) {
  const bin = atob(String(s));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isAbortError(e) {
  return String(e?.name || e).toLowerCase().includes("abort");
}

/* =========================
   Crypto: PIN -> key
========================= */
async function deriveKeyFromPin(pin, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16)).buffer;

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
   Session PIN
========================= */
export function getSessionPin() { return sessionPin; }
export function setSessionPin(pin) { sessionPin = pin || null; }
export function clearSessionPin() { sessionPin = null; }

/* =========================
   Config storage
========================= */
export function loadAIConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) || "{}");
    return {
      provider: cfg.provider || "gemini",
      // model = "auto" demek: listModels ile otomatik seç
      model: cfg.model || "auto",
      keyEnc: cfg.keyEnc || null, // {saltB64, ivB64, ctB64}
      // son çalışan modeller (opsiyonel cache)
      lastTextModel: cfg.lastTextModel || null,
      lastVisionModel: cfg.lastVisionModel || null,
    };
  } catch {
    return { provider: "gemini", model: "auto", keyEnc: null, lastTextModel: null, lastVisionModel: null };
  }
}

export function hasAIConfig() {
  const cfg = loadAIConfig();
  return !!(cfg.keyEnc && cfg.provider);
}

function saveLocalCfgPatch(patch) {
  const cfg = loadAIConfig();
  const next = { ...cfg, ...patch };
  localStorage.setItem(LS_CFG, JSON.stringify(next));
  return next;
}

export async function saveAIConfigEncrypted({ provider = "gemini", model = "auto", apiKey, pin, rememberPin = false }) {
  if (!apiKey?.trim()) throw new Error("API key boş.");
  if (!pin?.trim()) throw new Error("PIN/Şifre boş. (Anahtar şifreli saklanacak.)");

  const keyEnc = await encryptString(pin, apiKey.trim());
  const cfg = { provider, model, keyEnc, lastTextModel: null, lastVisionModel: null };
  localStorage.setItem(LS_CFG, JSON.stringify(cfg));

  // PIN'i RAM'de tut (oturum hatırla)
  if (rememberPin) sessionPin = pin;

  // Model cache'lerini sıfırla
  cachedTextModel = null;
  cachedVisionModel = null;

  return cfg;
}

export function clearAIConfig() {
  localStorage.removeItem(LS_CFG);
  sessionPin = null;
  cachedTextModel = null;
  cachedVisionModel = null;
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
   Gemini REST helpers
========================= */
async function fetchJson(url, { method = "GET", headers = {}, body = null, timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: ctrl.signal,
    });

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map(p => p?.text).filter(Boolean).join("").trim();
}

function normalizeModelName(name) {
  // "models/xxx" -> "xxx"
  return String(name || "").replace(/^models\//, "");
}

async function listGeminiModels(apiKey) {
  // v1beta: models list endpoint
  const url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(apiKey);
  const { ok, status, data } = await fetchJson(url, { timeoutMs: 30000 });

  if (!ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Gemini ListModels hata: ${status} ${msg}`);
  }

  const models = Array.isArray(data?.models) ? data.models : [];
  return models;
}

function filterGenerateContentModels(models) {
  return models
    .filter(m =>
      typeof m?.name === "string" &&
      Array.isArray(m?.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes("generateContent")
    )
    .map(m => m.name);
}

function rankModels(modelNames, kind /* "text" | "vision" */) {
  // Tercih sırası (bulursak bunu seç)
  // Not: Bu isimler zamanla değişebilir; asıl güvenlik "listModels + fallback" mekanizması.
  const preferText = [
    "models/gemini-3-flash",
    "models/gemini-2.5-flash",
    "models/gemini-flash-latest",
    "models/gemini-3-pro",
    "models/gemini-2.5-pro",
  ];

  // Vision için flash/pro yeter; çoğu multimodal ama yine de fallback var.
  const preferVision = [
    "models/gemini-3-flash",
    "models/gemini-2.5-flash",
    "models/gemini-flash-latest",
    "models/gemini-3-pro",
    "models/gemini-2.5-pro",
  ];

  const prefer = kind === "vision" ? preferVision : preferText;

  // önce prefer listesindeki mevcutları sıraya koy
  const picked = [];
  for (const p of prefer) {
    if (modelNames.includes(p)) picked.push(p);
  }

  // kalanları sona ekle (deterministik)
  for (const m of modelNames) {
    if (!picked.includes(m)) picked.push(m);
  }

  return picked;
}

async function pickGeminiModel(apiKey, kind) {
  // Oturum cache
  if (kind === "text" && cachedTextModel) return cachedTextModel;
  if (kind === "vision" && cachedVisionModel) return cachedVisionModel;

  // LocalStorage cache (son çalışan)
  const cfg = loadAIConfig();
  const last = kind === "vision" ? cfg.lastVisionModel : cfg.lastTextModel;
  if (last) {
    // Basit: önce son çalışanı dene
    if (kind === "text") cachedTextModel = last;
    else cachedVisionModel = last;
    return last;
  }

  const models = await listGeminiModels(apiKey);
  const gcModels = filterGenerateContentModels(models);
  if (!gcModels.length) throw new Error("Gemini: generateContent destekleyen model bulunamadı.");

  const ranked = rankModels(gcModels, kind);
  const picked = normalizeModelName(ranked[0]); // "models/.." -> ".."

  if (kind === "text") cachedTextModel = picked;
  else cachedVisionModel = picked;

  return picked;
}

async function tryGeminiGenerate({ apiKey, modelId, contents, timeoutMs = 30000 }) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(modelId) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const { ok, status, data } = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
    timeoutMs,
  });

  if (!ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Gemini hata: ${status} ${msg}`);
  }

  const text = extractGeminiText(data);
  if (!text) throw new Error("Gemini cevap boş.");
  return text;
}

async function callGeminiText({ apiKey, prompt, model = "auto", timeoutMs = 30000 }) {
  // model "auto" ise seç
  let modelId = model && model !== "auto" ? String(model) : await pickGeminiModel(apiKey, "text");

  // 404 / model unsupported gibi durumlarda fallback denemesi
  // - 1) seçilen modeli dener
  // - 2) hata alırsa listModels ile sıradaki 2 modeli dener
  let lastErr = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await tryGeminiGenerate({
        apiKey,
        modelId,
        contents: [{ parts: [{ text: prompt }] }],
        timeoutMs,
      });

      // başarılı modeli kaydet (local + memory)
      cachedTextModel = modelId;
      saveLocalCfgPatch({ lastTextModel: modelId });

      return text;
    } catch (e) {
      lastErr = e;

      const msg = String(e?.message || e);
      // abort ise direkt fırlat
      if (isAbortError(e)) throw e;

      // bir sonraki modele geç
      const models = await listGeminiModels(apiKey);
      const gcModels = rankModels(filterGenerateContentModels(models), "text").map(normalizeModelName);

      const idx = gcModels.indexOf(modelId);
      const next = gcModels[idx + 1] || gcModels[0];
      if (!next || next === modelId) break;

      modelId = next;
      // küçük bekleme
      await sleep(150);
    }
  }

  throw lastErr || new Error("Gemini: bilinmeyen hata.");
}

async function callGeminiVision({ apiKey, prompt, imageParts, model = "auto", timeoutMs = 45000 }) {
  // imageParts: [{ inline_data: { mime_type, data(base64) } }] formatında gelecek
  if (!Array.isArray(imageParts) || imageParts.length === 0) {
    throw new Error("Görsel bulunamadı.");
  }

  let modelId = model && model !== "auto" ? String(model) : await pickGeminiModel(apiKey, "vision");
  let lastErr = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const parts = [{ text: prompt }, ...imageParts];

      const text = await tryGeminiGenerate({
        apiKey,
        modelId,
        contents: [{ parts }],
        timeoutMs,
      });

      cachedVisionModel = modelId;
      saveLocalCfgPatch({ lastVisionModel: modelId });

      return text;
    } catch (e) {
      lastErr = e;
      if (isAbortError(e)) throw e;

      const models = await listGeminiModels(apiKey);
      const gcModels = rankModels(filterGenerateContentModels(models), "vision").map(normalizeModelName);

      const idx = gcModels.indexOf(modelId);
      const next = gcModels[idx + 1] || gcModels[0];
      if (!next || next === modelId) break;

      modelId = next;
      await sleep(150);
    }
  }

  throw lastErr || new Error("Gemini Vision: bilinmeyen hata.");
}

/* =========================
   Public API
========================= */

// runAI: text
export async function runAI({ prompt, pin, provider = "gemini", model = "auto", timeoutMs = 30000 }) {
  const cfg = loadAIConfig();
  const prov = provider || cfg.provider || "gemini";
  const mod = model || cfg.model || "auto";

  if (prov !== "gemini") {
    throw new Error("Bu sürümde sadece Gemini aktif. (provider=gemini)");
  }

  const thePin = pin || sessionPin;
  if (!thePin) throw new Error("PIN gerekli. (AI Ayarları'ndan gir ve istersen 'oturum hatırla' aç.)");

  const apiKey = await decryptApiKeyWithPin(thePin);
  return await callGeminiText({ apiKey, prompt, model: mod, timeoutMs });
}

// runAIVision: text + image
export async function runAIVision({ prompt, imageParts, pin, provider = "gemini", model = "auto", timeoutMs = 45000 }) {
  const cfg = loadAIConfig();
  const prov = provider || cfg.provider || "gemini";
  const mod = model || cfg.model || "auto";

  if (prov !== "gemini") {
    throw new Error("Bu sürümde sadece Gemini aktif. (provider=gemini)");
  }

  const thePin = pin || sessionPin;
  if (!thePin) throw new Error("PIN gerekli. (AI Ayarları'ndan gir ve istersen 'oturum hatırla' aç.)");

  const apiKey = await decryptApiKeyWithPin(thePin);
  return await callGeminiVision({ apiKey, prompt, imageParts, model: mod, timeoutMs });
}

/* =========================
   Image helpers (kamera/galeri)
========================= */

// File -> { inline_data: { mime_type, data } }
export async function fileToInlineDataPart(file) {
  if (!file) throw new Error("Dosya yok.");
  const mime = file.type || "image/jpeg";
  const buf = await file.arrayBuffer();
  const data = b64(buf);
  return { inline_data: { mime_type: mime, data } };
}

// DataURL (base64) -> inline_data part
export function dataUrlToInlineDataPart(dataUrl) {
  // data:image/png;base64,....
  const m = String(dataUrl).match(/^data:(.*?);base64,(.*)$/);
  if (!m) throw new Error("Geçersiz dataURL.");
  const mime = m[1] || "image/jpeg";
  const data = m[2];
  return { inline_data: { mime_type: mime, data } };
}
