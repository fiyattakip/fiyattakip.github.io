// firebase.js (GitHub Pages + compat CDN)
window.FIYATTAKIP_FIREBASE = {
  init() {
    const firebaseConfig = {
      apiKey: "AIzaSyBcXkVFQzB2XtxO7wqnbXhzM1Io54zCsBI",
      authDomain: "fiyattakip-ttoxub.firebaseapp.com",
      projectId: "fiyattakip-ttoxub",
      storageBucket: "fiyattakip-ttoxub.appspot.com",
      messagingSenderId: "105868725844",
      appId: "1:105868725844:web:fc04f5a08e708916e727c1",
    };

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    const auth = firebase.auth();
    const db = firebase.firestore();

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

    const googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });

    return { auth, db, googleProvider };
  },
};
