/**
 * app.nav.js
 * Bottom tabbar behavior (icons + active state + safe page transitions + haptic)
 * Does NOT touch firebase/auth/ai logic.
 */
const PAGE_ORDER = ["home","graph","favs","settings"];

function showPage(key, dir=1){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tabbar .tab").forEach(t=>t.classList.remove("active"));

  const page = document.querySelector(`#page-${CSS.escape(key)}`);
  if (page){
    page.classList.add("active");
    // subtle direction hint
    page.style.transform = `translateX(${dir>0?10:-10}px)`;
    requestAnimationFrame(()=>{ page.style.transform = ""; });
  }
  const tab = document.querySelector(`.tabbar .tab[data-page="${CSS.escape(key)}"]`);
  if (tab) tab.classList.add("active");
}

function vib(ms=8){
  try{ if (navigator.vibrate) navigator.vibrate(ms); }catch(e){}
}

document.addEventListener("DOMContentLoaded", ()=>{
  const tabs = Array.from(document.querySelectorAll(".tabbar .tab[data-page]"));
  tabs.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.getAttribute("data-page");
      const current = document.querySelector(".page.active")?.id?.replace("page-","") || "home";
      const dir = (PAGE_ORDER.indexOf(key) >= PAGE_ORDER.indexOf(current)) ? 1 : -1;
      vib(8);
      showPage(key, dir);
    });
  });

  // Keep existing camera handler from app.js if present; just add haptic & active reset
  const cam = document.getElementById("fabCamera");
  if (cam){
    cam.addEventListener("click", ()=> vib(10), { capture: true });
  }

  // Initial highlight (in case app.js didn't run yet)
  if (!document.querySelector(".page.active")){
    showPage("home", 1);
  }
});
