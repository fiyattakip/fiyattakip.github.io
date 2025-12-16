import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import * as fb from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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
const db = getFirestore(app);

export { auth, db, fb, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification };
