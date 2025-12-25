// ai.js (module) - Gemini key management + AI helpers (tema bozmaz)
// Stores API key encrypted in localStorage using a user PIN.

const LS_CFG = "fiyattakip_ai_cfg_v10";
let sessionPin = null;

const te = (s)=> new TextEncoder().encode(s);
const td = (b)=> new TextDecoder().decode(b);

function b64(buf){
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function unb64(s){
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(pin, saltB64){
  const salt = saltB64 ? new Uint8Array(unb64(saltB64)) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey("raw", te(pin), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name:"PBKDF2", salt, iterations: 210000, hash:"SHA-256" },
    baseKey,
    { name:"AES-GCM", length: 256 },
    false,
    ["encrypt","decrypt"]
  );
  return { key, saltB64: saltB64 || b64(salt) };
}

async function encryptJSON(pin, obj){
  const { key, saltB64 } = await deriveKey(pin);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = te(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, pt);
  return { saltB64, ivB64: b64(iv), ctB64: b64(ct) };
}

async function decryptJSON(pin, enc){
  const { key } = await deriveKey(pin, enc.saltB64);
  const iv = new Uint8Array(unb64(enc.ivB64));
  const ct = unb64(enc.ctB64);
  const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
  return JSON.parse(td(pt));
}

export function aiIsConfigured(){
  try{
    const raw = localStorage.getItem(LS_CFG);
    if (!raw) return false;
    const enc = JSON.parse(raw);
    return !!(enc && enc.ctB64);
  }catch{ return false; }
}

export function setAiPin(pin){
  sessionPin = String(pin || "").trim();
}

export async function saveAiConfig({ provider="gemini", apiKey="", model="gemini-1.5-flash" }){
  if (!sessionPin) throw new Error("PIN gerekli.");
  const cleanKey = String(apiKey||"").trim();
  if (!cleanKey) throw new Error("API key boş.");
  const payload = { provider, apiKey: cleanKey, model };
  const enc = await encryptJSON(sessionPin, payload);
  localStorage.setItem(LS_CFG, JSON.stringify(enc));
  return true;
}

export async function loadAiConfig(){
  const raw = localStorage.getItem(LS_CFG);
  if (!raw) return null;
  if (!sessionPin) throw new Error("PIN gerekli.");
  const enc = JSON.parse(raw);
  return await decryptJSON(sessionPin, enc);
}

export function clearAiConfig(){
  localStorage.removeItem(LS_CFG);
}

async function geminiFetch({ apiKey, model, parts }){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role:"user", parts }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 800 }
  };
  const r = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok){
    const t = await r.text().catch(()=> "");
    throw new Error(`Gemini hata: ${r.status} ${t.slice(0,180)}`);
  }
  return await r.json();
}

export async function aiGenerateText(prompt){
  const cfg = await loadAiConfig();
  if (!cfg?.apiKey) throw new Error("AI ayarı yok.");
  const j = await geminiFetch({
    apiKey: cfg.apiKey,
    model: cfg.model || "gemini-1.5-flash",
    parts: [{ text: prompt }]
  });
  const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")?.trim();
  if (!text) throw new Error("AI yanıt boş.");
  return text;
}

export async function aiGenerateJSON(prompt){
  const raw = await aiGenerateText(prompt + "\n\nSADECE JSON döndür. Kod bloğu kullanma.");
  // strip fences if any
  const cleaned = raw.replace(/```json|```/g,"").trim();
  try{ return JSON.parse(cleaned); }catch{
    // try to extract {...}
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m){
      return JSON.parse(m[0]);
    }
    throw new Error("AI JSON parse edilemedi.");
  }
}

// --- UI: Settings modal (PIN + key) ---
export function openAiSettingsModal({ toast } = {}){
  const existing = document.getElementById("aiSettingsModal");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.id = "aiSettingsModal";
  wrap.className = "modalWrap";
  wrap.innerHTML = `
    <div class="modalBack" data-close="1"></div>
    <div class="modal">
      <div class="modalHead">
        <div class="modalTitle">AI Ayarları</div>
        <button class="iconBtn" data-close="1" aria-label="Kapat">✕</button>
      </div>

      <div class="modalBody">
        <div class="miniHint">Güvenlik için API Key cihazında şifreli saklanır (PIN ile).</div>

        <label class="lbl">PIN (4-12 karakter)</label>
        <input id="aiPin" class="in" placeholder="PIN" type="password" inputmode="numeric" />

        <label class="lbl">Gemini API Key</label>
        <input id="aiKey" class="in" placeholder="AIza..." type="password" />

        <label class="lbl">Model</label>
        <select id="aiModel" class="in">
          <option value="gemini-1.5-flash">gemini-1.5-flash</option>
          <option value="gemini-1.5-pro">gemini-1.5-pro</option>
        </select>

        <div class="rowGap">
          <button id="btnAiSave" class="btnPrimary full" type="button">Kaydet</button>
          <button id="btnAiTest" class="btnGhost full" type="button">Test Et</button>
          <button id="btnAiClear" class="btnGhost full" type="button">Sil</button>
        </div>

        <div class="miniHint" id="aiStatus"></div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = ()=> wrap.remove();
  wrap.querySelectorAll('[data-close="1"]').forEach(el=> el.addEventListener("click", close));

  const status = wrap.querySelector("#aiStatus");
  const say = (m)=> { status.textContent = m; toast && toast(m); };

  // prefill
  status.textContent = aiIsConfigured() ? "Kayıt var. PIN girip Test edebilirsin." : "Kayıt yok.";

  wrap.querySelector("#btnAiSave").addEventListener("click", async ()=>{
    try{
      const pin = wrap.querySelector("#aiPin").value.trim();
      const key = wrap.querySelector("#aiKey").value.trim();
      const model = wrap.querySelector("#aiModel").value;
      if (pin.length < 4) throw new Error("PIN çok kısa.");
      setAiPin(pin);
      await saveAiConfig({ apiKey: key, model });
      say("Kaydedildi ✅");
    }catch(e){ say(e.message || String(e)); }
  });

  wrap.querySelector("#btnAiTest").addEventListener("click", async ()=>{
    try{
      const pin = wrap.querySelector("#aiPin").value.trim();
      if (pin.length < 4) throw new Error("PIN gir.");
      setAiPin(pin);
      const out = await aiGenerateText("Tek cümleyle: 'AI hazır' yaz.");
      say("Test ✅ " + out.slice(0,60));
    }catch(e){ say(e.message || String(e)); }
  });

  wrap.querySelector("#btnAiClear").addEventListener("click", ()=>{
    clearAiConfig();
    say("Silindi.");
  });
}
