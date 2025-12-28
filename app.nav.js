function showPage(p){
document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
var el=document.getElementById("page-"+p);
if(el) el.classList.add("active");
}
document.querySelectorAll(".tab").forEach(t=>{
t.addEventListener("click",()=>showPage(t.dataset.page));
});
