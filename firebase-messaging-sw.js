importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

// Firebase config (web config public'tur)
firebase.initializeApp({
  "apiKey": "AIzaSyBcXkVFQzB2XtxO7wqnbXhzM1Io54zCsBI",
  "authDomain": "fiyattakip-ttoxub.firebaseapp.com",
  "projectId": "fiyattakip-ttoxub",
  "storageBucket": "fiyattakip-ttoxub.firebasestorage.app",
  "messagingSenderId": "105868725844",
  "appId": "1:105868725844:web:fc04f5a08e708916e727c1"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "FiyatTakip";
  const body = payload?.notification?.body || "";
  const click_action = payload?.notification?.click_action || payload?.fcmOptions?.link || "/";
  self.registration.showNotification(title, {
    body,
    icon: "./icon-192.png",
    data: { click_action }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.click_action || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url).catch(()=>{});
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
