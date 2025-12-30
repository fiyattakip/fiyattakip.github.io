// ai.js (frontend)
// Not: API key'i tarayıcıda tutmak risklidir. Bu projede zaten kullanıcı ayarından alındığı için
// ana AI çağrısını backend üzerinden yapıyoruz (CORS + tek nokta kontrol).

export async function fetchAIComment({ apiBase, productName, productUrl = "", priceData = [], apiKey = "" }) {
  const res = await fetch(`${apiBase}/ai-yorum`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      urun: productName,
      link: productUrl,
      fiyatlar: (priceData || []).map(p => ({
        site: p.site || p.siteName || p.source || "Site",
        fiyat: p.fiyat || p.price || p.amount || ""
      })),
      apiKey
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.success !== true || !data.yorum) {
    throw new Error(data?.error || "AI yorum alınamadı");
  }
  return data.yorum;
}
