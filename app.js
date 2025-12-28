function show(p){
 document.querySelectorAll('.page').forEach(s=>s.classList.remove('active'));
 const el=document.getElementById('page-'+p);
 if(el) el.classList.add('active');
}

document.querySelectorAll('nav button').forEach(b=>{
 b.onclick=()=>show(b.dataset.page);
});

document.getElementById("camBtn")?.addEventListener("click",()=>{
 navigator.mediaDevices?.getUserMedia({video:true})
 .then(()=>alert("Kamera izni alındı"))
 .catch(()=>alert("Kamera izni reddedildi"));
});
