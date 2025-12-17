import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// SENİN CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyBcXkVFQzB2XtxO7wqnbXhzM1Io54zCsBI",
  authDomain: "fiyattakip-ttoxub.firebaseapp.com",
  projectId: "fiyattakip-ttoxub",
  storageBucket: "fiyattakip-ttoxub.firebasestorage.app",
  messagingSenderId: "105868725844",
  appId: "1:105868725844:web:fc04f5a08e708916e727c1",
  measurementId: "G-M6JXDZ3PK0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export const authApi = {
  onAuthStateChanged: (cb)=> onAuthStateChanged(auth, cb),
  signIn: (email, pass)=> signInWithEmailAndPassword(auth, email, pass),
  signUp: (email, pass)=> createUserWithEmailAndPassword(auth, email, pass),
  signOut: ()=> fbSignOut(auth),
  signInWithGoogle: ()=> signInWithPopup(auth, provider),
};

/*
  ⚠️ Firebase Console kontrol listesi:
  1) Authentication -> Settings -> Authorized domains
     - fiyattakip.github.io ekle
     - (opsiyonel) localhost ekle
  2) Authentication -> Sign-in method:
     - Email/Password: enabled
     - Google: enabled
  3) Google Cloud -> APIs & Services -> Credentials -> API keys
     - Kısıtlamalar çok sıkıysa auth çalışmaz. (İlk testte kısıtlamayı gevşet)
*/
