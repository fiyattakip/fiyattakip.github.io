// firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Firebase config (DOĞRU – DEĞİŞTİRME)
const firebaseConfig = {
  apiKey: "AIzaSyBcXkVFQzB2XtxO7wqnbXhzM1Io54zCsBI",
  authDomain: "fiyattakip-ttoxub.firebaseapp.com",
  projectId: "fiyattakip-ttoxub",
  storageBucket: "fiyattakip-ttoxub.appspot.com",
  messagingSenderId: "105868725844",
  appId: "1:105868725844:web:fc04f5a08e708916e727c1"
};

// Firebase başlat
const app = initializeApp(firebaseConfig);

// AUTH (ÖNEMLİ)
export const auth = getAuth(app);

export default app;
