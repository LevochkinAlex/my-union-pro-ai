// Firebase Cloud Messaging Service Worker with Image Caching
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Global error handler to suppress extension-related errors
self.addEventListener('error', (event) => {
  const errorMessage = event.message || '';
  if (
    errorMessage.includes('message channel closed') ||
    errorMessage.includes('listener indicated an asynchronous response') ||
    errorMessage.includes('Extension context invalidated')
  ) {
    event.preventDefault();
    return;
  }
});

self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message || String(event.reason) || '';
  if (
    reason.includes('message channel closed') ||
    reason.includes('listener indicated an asynchronous response') ||
    reason.includes('Extension context invalidated')
  ) {
    event.preventDefault();
    return;
  }
});

// Handle message events from the main thread
self.addEventListener('message', (event) => {
  // Don't return true for async handling - this causes the "message channel closed" error
  // Just handle the message synchronously or use event.waitUntil for async work
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

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
    icon: payload.notification?.icon || payload.data?.icon || '/icon-192x192.png',
    badge: '/badge-96x96.png', // Монохромная иконка для статусбара Android
    tag: payload.data?.sessionId || 'chat-message',
    data: payload.data || {},
    requireInteraction: false,
    silent: !soundEnabled,
    vibrate: soundEnabled ? [200, 100, 200] : undefined, // Вибрация для Android
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
  console.log('[firebase-messaging-sw.js] Notification click received.', event.notification);
  
  event.notification.close();

  // Получаем URL из разных мест (для совместимости)
  const url = event.notification.data?.url 
    || event.notification.data?.link
    || event.notification.tag; // Используем tag как fallback для чатов
  
  // Если URL нет, но есть тип уведомления - формируем URL
  let targetUrl = url;
  if (!targetUrl && event.notification.data?.type) {
    const type = event.notification.data.type;
    const baseUrl = self.location.origin;
    
    switch (type) {
      case 'chat_message':
        // Для сообщений чата используем chatId если есть
        if (event.notification.data.chatId) {
          targetUrl = `${baseUrl}/dashboard/chat?chatId=${event.notification.data.chatId}`;
        } else if (event.notification.data.senderId) {
          // Fallback на senderId для обратной совместимости
          targetUrl = `${baseUrl}/dashboard/chat?userId=${event.notification.data.senderId}`;
        } else {
          targetUrl = `${baseUrl}/dashboard/chat`;
        }
        break;
      case 'news_published':
        targetUrl = event.notification.data.newsId 
          ? `${baseUrl}/dashboard/news/${event.notification.data.newsId}`
          : `${baseUrl}/dashboard/news`;
        break;
      case 'post_comment':
      case 'comment_reply':
        targetUrl = event.notification.data.postId
          ? `${baseUrl}/posts/${event.notification.data.postId}`
          : `${baseUrl}/dashboard`;
        break;
      case 'ticket_response':
        targetUrl = event.notification.data.ticketId
          ? `${baseUrl}/dashboard/appeals/${event.notification.data.ticketId}`
          : `${baseUrl}/dashboard/appeals`;
        break;
      default:
        targetUrl = `${baseUrl}/dashboard`;
    }
  }
  
  // Если URL все еще нет, используем главную страницу
  if (!targetUrl) {
    targetUrl = self.location.origin + '/dashboard';
  }

  console.log('[firebase-messaging-sw.js] Opening URL:', targetUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Если есть открытое окно с этим URL - фокусируем его
      for (const client of clientList) {
        if (client.url === targetUrl || client.url.startsWith(targetUrl.split('?')[0])) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }
      // Иначе открываем новое окно
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

