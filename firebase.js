// Firebase yapılandırması
export const firebaseConfig = {
  apiKey: "AIzaSyBcXkVFQzB2XtxO7wqnbXhzM1Io54zCsBI",
  authDomain: "fiyattakip-ttoxub.firebaseapp.com",
  projectId: "fiyattakip-ttoxub",
  storageBucket: "fiyattakip-ttoxub.firebasestorage.app",
  messagingSenderId: "105868725844",
  appId: "1:105868725844:web:fc04f5a08e708916e727c1",
};

// Firebase'in doğru yapılandırılıp yapılandırılmadığını kontrol et
export function firebaseConfigLooksInvalid() {
  return !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("PASTE_");
}

// Eğer Firebase kullanmak istemiyorsan, bu dosyayı boş bırakabilirsin
// veya sadece geçici bir yapılandırma sağlayabilirsin
export const auth = {
  currentUser: null,
  onAuthStateChanged: (callback) => {
    // Demo modunda her zaman null döndür
    callback(null);
    return () => {}; // unsubscribe fonksiyonu
  }
};

export const db = {
  collection: () => ({
    doc: () => ({
      set: async () => ({ success: true }),
      get: async () => ({ exists: false, data: () => null }),
      update: async () => ({ success: true }),
      delete: async () => ({ success: true })
    }),
    where: () => ({
      get: async () => ({ docs: [] })
    })
  })
};

export const googleProvider = {
  providerId: 'google.com'
};

// Demo modunda Firebase'i başlatma
export function initializeApp() {
  console.log('Firebase başlatıldı (demo modu)');
  return {
    name: 'fiyattakip-app',
    options: firebaseConfig
  };
}
