// Firebase Cloud Messaging Service Worker with Image Caching
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// ===========================================
// IMAGE CACHING для чата
// ===========================================
const IMAGE_CACHE_NAME = 'chat-images-v1';
const IMAGE_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 дней
const IMAGE_CACHE_MAX_SIZE = 100; // Максимум 100 изображений

// Паттерны для кеширования изображений
const IMAGE_PATTERNS = [
  /\/uploads\/chat\//,
  /\/uploads\/avatars\//,
  /\/api\/uploads\/chat\//,
  /\/api\/image-proxy/,
];

// Проверка, является ли URL изображением для кеширования
function shouldCacheImage(url) {
  return IMAGE_PATTERNS.some(pattern => pattern.test(url));
}

// Очистка старых записей из кеша
async function cleanupImageCache() {
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const keys = await cache.keys();
    
    // Если превышен лимит - удаляем старые
    if (keys.length > IMAGE_CACHE_MAX_SIZE) {
      const toDelete = keys.slice(0, keys.length - IMAGE_CACHE_MAX_SIZE);
      await Promise.all(toDelete.map(key => cache.delete(key)));
    }
  } catch (e) {
    console.error('[SW] Cache cleanup error:', e);
  }
}

// Обработка запросов на изображения
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // Кешируем только изображения чата
  if (shouldCacheImage(url) && event.request.method === 'GET') {
    event.respondWith(
      (async () => {
        // Сначала проверяем кеш
        const cache = await caches.open(IMAGE_CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        
        if (cachedResponse) {
          // Возвращаем из кеша, но обновляем в фоне
          fetch(event.request).then(response => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
          }).catch(() => {});
          
          return cachedResponse;
        }
        
        // Если нет в кеше - загружаем и кешируем
        try {
          const networkResponse = await fetch(event.request);
          
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
            cleanupImageCache(); // Очистка в фоне
          }
          
          return networkResponse;
        } catch (error) {
          // При ошибке сети возвращаем placeholder
          return new Response('', { status: 503 });
        }
      })()
    );
  }
});

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCEJfZrdewYPcg2Fqn2YR6rx-FWOJsE7vU",
  authDomain: "myunion-c3187.firebaseapp.com",
  projectId: "myunion-c3187",
  storageBucket: "myunion-c3187.firebasestorage.app",
  messagingSenderId: "146951326004",
  appId: "1:146951326004:web:b39d67e64ebd56f414fd61",
  measurementId: "G-XFQBYFS5TX"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || payload.data?.title || 'New message';
  const notificationBody = payload.notification?.body || payload.data?.body || '';
  
  // Check if sound should be enabled (default to true if not specified)
  const soundEnabled = payload.data?.soundEnabled !== 'false';
  const soundUrl = payload.data?.sound || payload.notification?.sound || '/notification-sound.mp3';
  
  const notificationOptions = {
    body: notificationBody,
    icon: payload.notification?.icon || payload.data?.icon || '/icon.png',
    badge: '/icon.png',
    tag: payload.data?.sessionId || 'chat-message',
    data: payload.data || {},
    requireInteraction: false,
    silent: !soundEnabled,
    ...(soundEnabled && { sound: soundUrl }),
  };

  console.log('[firebase-messaging-sw.js] Showing notification:', {
    title: notificationTitle,
    body: notificationBody,
    soundEnabled,
    sound: soundUrl,
  });

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click received.');
  
  event.notification.close();

  if (event.notification.data?.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});

