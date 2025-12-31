/**
 * app.nav.js (stable)
 * Bottom tabbar behavior + safe page transitions.
 */
const PAGE_ORDER = ["home","search","favs","settings"];

function navShowPage(key, dir=1){
  // Prefer app.js showPage if exists
  if (typeof window.showPage === "function"){
    window.showPage(key, dir);
    return;
  }
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tabbar .tab").forEach(t=>t.classList.remove("active"));

  const page = document.querySelector(`#page-${CSS.escape(key)}`);
  if (page){
    page.classList.add("active");
    page.style.transform = `translateX(${dir>0?10:-10}px)`;
    requestAnimationFrame(()=> page.style.transform = "");
  }
  const tab = document.querySelector(`.tabbar .tab[data-page="${CSS.escape(key)}"]`);
  if (tab) tab.classList.add("active");
}

function vib(ms=10){
  try{ navigator.vibrate && navigator.vibrate(ms); }catch(_){}
}

document.addEventListener("DOMContentLoaded", ()=>{
  // tab clicks
  document.querySelectorAll(".tabbar .tab[data-page]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.dataset.page;
      const cur = document.querySelector(".page.active")?.id?.replace("page-","") || "home";
      const dir = (PAGE_ORDER.indexOf(key) >= PAGE_ORDER.indexOf(cur)) ? 1 : -1;
      vib(10);
      navShowPage(key, dir);
    });
  });

  // camera button
  const cam = document.getElementById("fabCamera");
  if (cam){
    cam.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      vib(10);
      if (typeof window.cameraAiSearch === "function") window.cameraAiSearch();
    });
  }

  // ensure default page
  if (!document.querySelector(".page.active")){
    navShowPage("home", 1);
  }
});
