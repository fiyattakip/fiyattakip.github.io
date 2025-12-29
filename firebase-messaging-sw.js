importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

// BURAYI KENDİ FIREBASE CONFIG'İNLE DOLDUR
firebase.initializeApp({
  apiKey: "AIzaSyDG7M4ag2m7wMYC6N3dqwxXJ2Nc_unwQVg",
  authDomain: "fiyattakip-ttoxub.firebaseapp.com",
  projectId: "fiyattakip-ttoxub",
  storageBucket: "fiyattakip-ttoxub.firebasestorage.app",
  messagingSenderId: "105868725844",
  appId: "1:105868725844:web:fc04f5a08e708916e727c1"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "FiyatTakip";
  const body = payload?.notification?.body || "";
  self.registration.showNotification(title, {
    body,
    icon: "./icon-192.png"
  });
});
