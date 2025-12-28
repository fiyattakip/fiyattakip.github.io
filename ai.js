// AI yönetimi (basit versiyon)
const LS_CFG = "fiyattakip_ai_cfg";

// Demo modunda AI fonksiyonları
export async function geminiText(prompt) {
  // Demo yanıtlar
  const demoResponses = [
    "✅ Bu fiyat çok iyi! Hemen alabilirsin. Diğer sitelerden 500 TL daha ucuz.",
    "⚠️ Ortalama bir fiyat. Black Friday'de düşebilir, beklemeyi düşünebilirsin.",
    "🔥 En iyi fiyat Trendyol'da. Hepsiburada'dan 300 TL daha ucuz.",
    "📊 Fiyatlar normal aralıkta. En ucuz n11, en pahalı Amazon.",
    "💎 Bu ürün için iyi bir fiyat. Kargo dahil en uygunu."
  ];
  
  // Rastgele demo yanıt seç
  const randomResponse = demoResponses[Math.floor(Math.random() * demoResponses.length)];
  
  // Kısa bir gecikme ekle (gerçekçi olsun diye)
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return randomResponse;
}

export async function geminiVision({ prompt, mime, base64Data }) {
  // Demo görsel analiz yanıtları
  const demoProducts = [
    "iPhone 15 Pro",
    "Samsung Galaxy S24 Ultra", 
    "AirPods Pro 2",
    "MacBook Air M2",
    "PlayStation 5",
    "Nike Air Max 270",
    "LG OLED TV 55 inç",
    "Xiaomi 13T Pro"
  ];
  
  const randomProduct = demoProducts[Math.floor(Math.random() * demoProducts.length)];
  
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return `Resimde "${randomProduct}" ürünü tespit edildi.`;
}

// AI yapılandırması (demo)
export function aiConfigured() {
  return true; // Her zaman aktif
}

export function loadAiCfg() {
  return { provider: 'demo', model: 'demo-v1' };
}

export function saveGeminiKey({ apiKey, pin, rememberPin }) {
  console.log('Demo modunda API key kaydedildi:', apiKey.substring(0, 10) + '...');
  return true;
}

export function clearAiCfg() {
  console.log('Demo AI yapılandırması temizlendi');
}

export function getGeminiKeyOrThrow() {
  return "demo-api-key-12345"; // Demo API key
}
