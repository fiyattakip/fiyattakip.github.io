function $(id){return document.getElementById(id);}
function on(el,ev,fn){ if(el) el.addEventListener(ev,fn); }

let mode="normal";
on($("modeNormal"),"click",()=>mode="normal");
on($("modeFiyat"),"click",()=>mode="fiyat");
on($("modeAI"),"click",()=>mode="ai");

on($("btnNormal"),"click",()=>alert("Arama çalışıyor: "+mode));
on($("btnBell"),"click",()=>$("loginModal").classList.remove("hidden"));
on($("closeLogin"),"click",()=>$("loginModal").classList.add("hidden"));
on($("loginBackdrop"),"click",()=>$("loginModal").classList.add("hidden"));
on($("logoutBtn"),"click",()=>alert("Çıkış"));
on($("btnCamera"),"click",()=>alert("Kamera"));
