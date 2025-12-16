// firebase.js  (GitHub Pages için compat sürüm)
// Not: Bu dosya tek başına çalışmaz; index.html içinde aşağıdaki CDN scriptleri de olmalı.

window.FIYATTAKIP_FIREBASE = {
  init() {
    const firebaseConfig = {
      apiKey: "AIzaSyBcXkVFQzB2XtxO7wqnbXhzM1Io54zCsBI",
      authDomain: "fiyattakip-ttoxub.firebaseapp.com",
      projectId: "fiyattakip-ttoxub",
      storageBucket: "fiyattakip-ttoxub.appspot.com", // sende .firebasestorage.app görünüyor ama web için appspot doğru
      messagingSenderId: "105868725844",
      appId: "1:105868725844:web:fc04f5a08e708916e727c1",
    };

    // Tekrar init olmasın
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    // Auth + Firestore global erişim
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Auth persistence: cihaz kapanınca da kalsın
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

    // Google provider (istersen kapatabilirsin)
    const googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });

    return { auth, db, googleProvider };
  },
};
