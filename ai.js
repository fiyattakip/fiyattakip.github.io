// ai.js (GÜNCEL – Gemini v1 UYUMLU)

const LS_CFG = "fiyattakip_ai_cfg_v3";
let sessionPin = null;

/* =========================
   Helpers
========================= */
const te = (s) => new TextEncoder().encode(s);
const td = (b) => new TextDecoder().decode(b);

function b64(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(str){
  return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
}

/* =========================
   Crypto (AES-GCM)
========================= */
async function deriveKey(pin, salt){
  const base = await crypto.subtle.importKey(
    "raw", te(pin), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name:"PBKDF2", salt, iterations:120000, hash:"SHA-256" },
    base,
    { name:"AES-GCM", length:256 },
    false,
    ["encrypt","decrypt"]
  );
}

async function encrypt(pin, text){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);
  const enc = await crypto.subtle.encrypt(
    { name:"AES-GCM", iv },
    key,
    te(text)
  );
  return { iv:b64(iv), salt:b64(salt), data:b64(enc) };
}

async function decrypt(pin, blob){
  const key = await deriveKey(pin, new Uint8Array(unb64(blob.salt)));
  const dec = await crypto.subtle.decrypt(
    { name:"AES-GCM", iv:new Uint8Array(unb64(blob.iv)) },
    key,
    unb64(blob.data)
  );
  return td(dec);
}

/* =========================
   Config
========================= */
export function setSessionPin(pin){ sessionPin = pin; }

export function hasAIConfig(){
  return !!localStorage.getItem(LS_CFG);
}

export async function saveAIConfigEncrypted({ apiKey, pin, rememberPin=false }){
  const enc = await encrypt(pin, apiKey);
  localStorage.setItem(LS_CFG, JSON.stringify(enc));
  if (rememberPin) sessionPin = pin;
}

async function getApiKey(pin){
  const cfg = JSON.parse(localStorage.getItem(LS_CFG));
  return decrypt(pin || sessionPin, cfg);
}

/* =========================
   GEMINI TEXT
========================= */
export async function runAI({ prompt, pin }){
  const apiKey = await getApiKey(pin);

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-002:generateContent?key=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Gemini hata");

  return data.candidates?.[0]?.content?.parts?.map(p=>p.text).join("") || "";
}

/* =========================
   GEMINI VISION
========================= */
export async function runAIVision({ prompt, imageBase64, mimeType, pin }){
  const apiKey = await getApiKey(pin);

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-002:generateContent?key=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64
              }
            }
          ]
        }]
      })
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Gemini vision hata");

  return data.candidates?.[0]?.content?.parts?.map(p=>p.text).join("") || "";
}
