
// =====================
// AI FONKSİYONLARI (STABLE)
// =====================

async function getAIComment(item) {
  try {
    const res = await fetch("https://fiyattakip-api.onrender.com/ai/yorum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title || item.name,
        price: item.price,
        site: item.site
      })
    });

    if (!res.ok) throw new Error("AI servis hatası");

    const data = await res.json();
    return data.yorum;
  } catch (e) {
    console.error(e);
    return "AI yorumu şu anda alınamıyor.";
  }
}

// KULLANIM:
// aiBtn.onclick = async () => alert(await getAIComment(item));
