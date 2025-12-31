// firebase.js (compat, global) - no import/export
// Requires firebase compat scripts loaded in index.html
(function(){
  const cfg = window.FIREBASE_CONFIG;
  window.firebaseConfigLooksInvalid = function(){
    return !cfg || !cfg.apiKey || String(cfg.apiKey).includes("PASTE_");
  };

  if (!window.firebase || !window.firebase.initializeApp){
    console.error("Firebase compat scripts yüklenmedi.");
    return;
  }

  // init once
  try{
    if (!firebase.apps || !firebase.apps.length){
      firebase.initializeApp(cfg);
    }
  }catch(e){
    console.error("Firebase init hata:", e);
  }

  window.auth = firebase.auth();
  window.googleProvider = new firebase.auth.GoogleAuthProvider();
  window.db = firebase.firestore ? firebase.firestore() : null;
})();
