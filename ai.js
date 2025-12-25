// ai.js — Gemini + Rules AI (stabil, modül)
// - API key cihazda saklanır (opsiyonel PIN ile şifreli)
// - AI yoksa bile sistem çalışır (Rules AI fallback)

const LS_CFG = "fiyattakip_ai_cfg_v5";
let sessionPin = null;

// ---------- Rules AI (fallback) ----------
export function rulesGenerate(task, input){
  const text = String(input||"").trim();
  if (!text) return task === "improve_query"
    ? "iphone 13 128gb"
    : "Ürüne göre genel değerlendirme: (ürün adı girilmedi).";
  if (task === "improve_query"){
    return text.replace(/\s+/g," ").slice(0, 80);
  }
  // product_comment
  return `Ürüne göre genel değerlendirme: ${text}\n- Artılar: İhtiyaca göre değişir.\n- Eksiler: Satıcı/garanti/yorumları kontrol et.\nNot: Fiyat yoksa karşılaştırma için manuel fiyat gir.`;
}

// ---------- Crypto helpers ----------
const te = (s)=>new TextEncoder().encode(String(s));
const td = (buf)=>new TextDecoder().decode(buf);

const b64 = (ab)=>{
  const bytes = new Uint8Array(ab);
  let bin = "";
  for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const unb64 = (s)=>{
  const bin = atob(String(s||""));
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

async function deriveKeyFromPin(pin, saltB64){
  const salt = new Uint8Array(unb64(saltB64));
  const baseKey = await crypto.subtle.importKey("raw", te(pin), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name:"PBKDF2", salt, iterations: 120000, hash:"SHA-256" },
    baseKey,
    { name:"AES-GCM", length: 256 },
    false,
    ["encrypt","decrypt"]
  );
  return { key, salt };
}

async function encryptString(pin, plain){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { key } = await deriveKeyFromPin(pin, b64(salt));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, te(plain));
  return { saltB64: b64(salt), ivB64: b64(iv), ctB64: b64(ct) };
}
async function decryptString(pin, blob){
  const { key } = await deriveKeyFromPin(pin, blob.saltB64);
  const iv = new Uint8Array(unb64(blob.ivB64));
  const ct = unb64(blob.ctB64);
  const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
  return td(pt);
}

// ---------- Public config API ----------
export function setSessionPin(pin){ sessionPin = pin || null; }
export function clearSessionPin(){ sessionPin = null; }

function loadCfg(){
  try{ return JSON.parse(localStorage.getItem(LS_CFG) || "null"); }catch{ return null; }
}
function saveCfg(obj){
  localStorage.setItem(LS_CFG, JSON.stringify(obj));
}
export function clearAiCfg(){ localStorage.removeItem(LS_CFG); sessionPin = null; }

export function aiConfigured(){
  const cfg = loadCfg();
  return !!(cfg && (cfg.keyPlain || cfg.keyEnc));
}

export async function saveGeminiKey(key, pin=null){
  const clean = String(key||"").trim();
  if (!clean) throw new Error("API key boş");
  if (pin){
    const enc = await encryptString(pin, clean);
    saveCfg({ keyEnc: enc, hasPin: true, savedAt: Date.now() });
  } else {
    saveCfg({ keyPlain: clean, hasPin: false, savedAt: Date.now() });
  }
}

export async function getGeminiKeyOrThrow(){
  const cfg = loadCfg();
  if (!cfg) throw new Error("AI ayarı yok");
  if (cfg.keyPlain) return cfg.keyPlain;
  if (cfg.keyEnc){
    const pin = sessionPin;
    if (!pin) throw new Error("PIN gerekli");
    return await decryptString(pin, cfg.keyEnc);
  }
  throw new Error("AI ayarı yok");
}

// ---------- Gemini calls ----------
async function geminiTextRaw({ key, prompt, model="gemini-2.0-flash" }){
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ parts: [{ text: String(prompt||"") }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 300 }
  };
  const r = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok){
    const t = await r.text().catch(()=> "");
    throw new Error(`Gemini hata: ${r.status} ${t.slice(0,140)}`);
  }
  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")?.trim();
  if (!text) throw new Error("AI sonuç üretmedi");
  return text;
}

async function geminiVisionRaw({ key, prompt, mime, base64Data, model="gemini-2.0-flash" }){
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{
      parts: [
        { text: String(prompt||"") },
        { inlineData: { mimeType: mime, data: base64Data } }
      ]
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 120 }
  };
  const r = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok){
    const t = await r.text().catch(()=> "");
    throw new Error(`Gemini hata: ${r.status} ${t.slice(0,140)}`);
  }
  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")?.trim();
  if (!text) throw new Error("Görselden metin çıkarılamadı");
  return text;
}

// High-level helpers used by app
export async function improveQueryWithAI(q){
  const text = String(q||"").trim();
  if (!text) return rulesGenerate("improve_query", "");
  try{
    const key = await getGeminiKeyOrThrow();
    const prompt = `Kullanıcının arama sorgusunu e-ticaret için daha net hale getir. Sadece sorguyu yaz, açıklama yok.\nSorgu: ${text}`;
    const out = await geminiTextRaw({ key, prompt });
    return out.replace(/\s+/g," ").trim().slice(0,80) || rulesGenerate("improve_query", text);
  }catch{
    return rulesGenerate("improve_query", text);
  }
}

export async function productCommentWithAI({ title, lastPrice }){
  const name = String(title||"").trim();
  const priceStr = lastPrice!=null ? `Son bilinen fiyat: ${lastPrice}` : "Fiyat verisi yok.";
  try{
    const key = await getGeminiKeyOrThrow();
    const prompt = `Aşağıdaki ürün için kısa ve dürüst bir değerlendirme yaz. Uydurma "piyasada yok/çıkmadı" gibi ifadeler kullanma. Teknik özellik uydurma.\nÜrün: ${name}\n${priceStr}\nÇıktı: 5-8 madde, artı/eksi ve öneri.`;
    return await geminiTextRaw({ key, prompt });
  }catch{
    return rulesGenerate("product_comment", name);
  }
}

export async function visionFileToQuery(file){
  if (!file) throw new Error("Görsel yok");
  const mime = file.type || "image/jpeg";
  const base64Data = await new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=> {
      const s = String(fr.result||"");
      const b64 = s.split(",")[1] || "";
      resolve(b64);
    };
    fr.onerror = ()=>reject(new Error("Dosya okunamadı"));
    fr.readAsDataURL(file);
  });

  try{
    const key = await getGeminiKeyOrThrow();
    const prompt = "Bu görseldeki ürün için e-ticaret araması yapmaya uygun kısa bir sorgu üret. Sadece sorguyu yaz.";
    const out = await geminiVisionRaw({ key, prompt, mime, base64Data });
    return out.replace(/\s+/g," ").trim().slice(0,80) || "ürün";
  }catch{
    // AI yoksa: kullanıcı en azından dosya adından
    const fallback = (file.name||"").replace(/\.[a-z0-9]+$/i,"").replace(/[_-]+/g," ").trim();
    return fallback ? fallback.slice(0,80) : "ürün";
  }
}

export async function testAI(){
  const key = await getGeminiKeyOrThrow();
  const out = await geminiTextRaw({ key, prompt:"Sadece 'OK' yaz." });
  return out.toUpperCase().includes("OK");
}
