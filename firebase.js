import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export function watchAuth(cb){
  return onAuthStateChanged(auth, cb);
}

export async function loginEmailPass(email, pass){
  return signInWithEmailAndPassword(auth, email, pass);
}

export async function loginGoogle(){
  return signInWithPopup(auth, googleProvider);
}

export async function logout(){
  return signOut(auth);
}

export async function upsertUser(uid){
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, { createdAt: serverTimestamp() }, { merge:true });
  }
}

export async function listFavorites(uid){
  const ref = collection(db, "users", uid, "favorites");
  const snaps = await getDocs(ref);
  const items = [];
  snaps.forEach(s=> items.push({ id:s.id, ...s.data() }));
  return items;
}

export async function saveFavorite(uid, favId, payload){
  const ref = doc(db, "users", uid, "favorites", favId);
  await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge:true });
}

export async function patchFavorite(uid, favId, payload){
  const ref = doc(db, "users", uid, "favorites", favId);
  await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
}

export async function removeFavorite(uid, favId){
  const ref = doc(db, "users", uid, "favorites", favId);
  await deleteDoc(ref);
}
