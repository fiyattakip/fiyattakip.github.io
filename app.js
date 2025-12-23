// app.js — minimal clickable proof
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('testBtn');
  const log = document.getElementById('log');
  btn.addEventListener('click', ()=>{
    log.textContent += 'OK: Tıklama çalışıyor ✔\n';
    alert('OK: Tıklama çalışıyor');
  });
});
