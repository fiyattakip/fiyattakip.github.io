
async function aiYorumGetir(productName) {
  try {
    const res = await fetch("https://fiyattakip-api.onrender.com/api/ai-comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: productName })
    });
    const data = await res.json();
    alert(data.text || "AI yorum alınamadı");
  } catch {
    alert("AI servisine ulaşılamadı");
  }
}
window.aiYorumGetir = aiYorumGetir;
