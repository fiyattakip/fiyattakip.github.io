const LS_CFG = "fiyattakip_ai_cfg_v4";
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

export function setSessionPin(pin){ sessionPin = pin || null; }
export function clearSessionPin(){ sessionPin = null; }
export function getSessionPin(){ return sessionPin; }

export function loadAIConfig(){
  try{
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) || "{}");
    return {
      provider: "gemini",
      model: "gemini-2.5-flash",
      keyEnc: cfg.keyEnc || null
    };
  }catch{
    return { provider:"gemini", model:"gemini-2.5-flash", keyEnc:null };
  }
}

export function hasAIConfig(){
  const cfg = loadAIConfig();
  return !!cfg.keyEnc;
}

export async function saveAIConfigEncrypted({ apiKey, pin, rememberPin=false }){
  if (!apiKey?.trim()) throw new Error("API key boş.");
  if (!pin?.trim()) throw new Error("PIN boş.");
  const keyEnc = await encryptString(pin, apiKey.trim());
  localStorage.setItem(LS_CFG, JSON.stringify({ keyEnc }));
  if (rememberPin) sessionPin = pin;
  return true;
}

export function clearAIConfig(){
  localStorage.removeItem(LS_CFG);
  sessionPin = null;
}

export async function getDecryptedApiKey(pinMaybe=null){
  const cfg = loadAIConfig();
  if (!cfg.keyEnc) throw new Error("AI key kayıtlı değil.");
  const pin = pinMaybe || sessionPin;
  if (!pin) throw new Error("PIN gerekli.");
  return decryptString(pin, cfg.keyEnc);
}

// -------- GEMINI API ----------

export async function geminiGenerateText({ apiKey, prompt, system=null, model="gemini-2.5-flash" }){
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = [];
  if(system){
    contents.push({ role:"user", parts:[{ text:`SİSTEM:\n${system}` }] });
  }
  contents.push({ role:"user", parts:[{ text: prompt }] });

  const res = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 800 }
    })
  });

  const json = await res.json();
  if(!res.ok){
    const msg = json?.error?.message || "Gemini hata";
    throw new Error(msg);
  }
  const text = json?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("") || "";
  return text.trim();
}

export async function geminiExtractTextFromImage({ apiKey, file, model="gemini-2.5-flash" }){
  const b64 = await fileToBase64(file);
  const mime = file.type || "image/jpeg";
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      contents: [{
        role:"user",
        parts: [
          { text: "Bu görselde ürün/metin ne yazıyor? Sadece metni çıkar. Gereksiz açıklama yapma." },
          { inlineData: { mimeType: mime, data: b64 } }
        ]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 500 }
    })
  });

  const json = await res.json();
  if(!res.ok){
    const msg = json?.error?.message || "Görsel okuma hata";
    throw new Error(msg);
  }
  const text = json?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("") || "";
  return text.trim();
}

function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> {
      const s = String(r.result || "");
      const base64 = s.split(",")[1] || "";
      resolve(base64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
