// Link-only stable search (old project logic)

const appMain = document.getElementById("appMain");
const qEl = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");
const searchResults = document.getElementById("searchResults");

appMain.classList.remove("hidden");

const SITES = [
  { key:"trendyol", name:"Trendyol", build:q=>`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { key:"hepsiburada", name:"Hepsiburada", build:q=>`https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { key:"n11", name:"N11", build:q=>`https://www.n11.com/arama?q=${encodeURIComponent(q)}` },
  { key:"amazontr", name:"Amazon TR", build:q=>`https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
];

function renderSearchRows(queryText){
  const q = queryText.trim();
  if (!q){
    searchResults.className = "listBox emptyBox";
    searchResults.textContent = "Henüz arama yapılmadı.";
    return;
  }
  searchResults.className = "listBox";
  searchResults.innerHTML = "";

  for (const s of SITES){
    const url = s.build(q);
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div>
        <div><b>${s.name}</b></div>
        <div>${q}</div>
      </div>
      <div>
        <button class="btnOpen">Aç</button>
      </div>
    `;
    item.querySelector(".btnOpen").onclick = ()=>window.open(url,"_blank");
    searchResults.appendChild(item);
  }
}

btnSearch.addEventListener("click", ()=>renderSearchRows(qEl.value));
