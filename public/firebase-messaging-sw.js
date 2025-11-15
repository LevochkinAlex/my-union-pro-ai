// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

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
  
  const notificationTitle = payload.notification?.title || 'New message';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: payload.notification?.icon || '/icon.png',
    badge: '/icon.png',
    tag: payload.data?.sessionId,
    data: payload.data,
    requireInteraction: false,
    silent: false,
  };

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

