/**
 * Firebase Cloud Messaging Push Notifications
 * Replaces OneSignal
 */

"use client";

import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";
import { firebaseConfig, VAPID_PUBLIC_KEY } from "./firebase-config";

let messagingInstance: Messaging | null = null;

// Initialize Firebase app
function getFirebaseApp() {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig);
  }
  return getApps()[0];
}

// Get messaging instance
async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === "undefined") {
    return null;
  }

  // Check if Service Worker is supported
  if (!("serviceWorker" in navigator)) {
    console.warn("[Firebase] Service Worker not supported");
    return null;
  }

  if (messagingInstance) {
    return messagingInstance;
  }

  try {
    const app = getFirebaseApp();
    // Check if messaging is supported
    if (!("Notification" in window)) {
      console.warn("[Firebase] Notifications not supported");
      return null;
    }
    
    // Get messaging instance
    messagingInstance = getMessaging(app);
    console.log("[Firebase] Messaging instance created");
    return messagingInstance;
  } catch (error) {
    console.error("[Firebase] Error getting messaging:", error);
    return null;
  }
}

// Request push notification permission
export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === "undefined") {
    console.log("[Firebase] Window not available");
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log("[Firebase] Notification permission:", permission);

    if (permission === "granted") {
      console.log("[Firebase] ✅ Permission granted!");
      // Sync subscription after permission granted
      setTimeout(() => {
        syncPushSubscription();
      }, 1000);
      return true;
    } else {
      console.log("[Firebase] ❌ Permission denied");
      return false;
    }
  } catch (error) {
    console.error("[Firebase] Error requesting permission:", error);
    return false;
  }
}

// Sync subscription with backend
export async function syncPushSubscription(): Promise<void> {
  if (typeof window === "undefined") {
    console.log("[Firebase] Window not available");
    return;
  }

  try {
    // Get session
    const sessionResponse = await fetch("/api/auth/session");
    if (!sessionResponse.ok) {
      console.warn("[Firebase] Failed to get session");
      return;
    }

    const session = await sessionResponse.json();
    const userId = session?.user?.id;

    if (!userId) {
      console.warn("[Firebase] No user ID available");
      return;
    }

    console.log("[Firebase] Syncing for user:", userId);

    // Wait for Service Worker to be ready (with retry)
    if ("serviceWorker" in navigator) {
      let registration = await navigator.serviceWorker.getRegistration();
      
      if (!registration) {
        console.log("[Firebase] Service Worker not found, registering...");
        try {
          registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
          console.log("[Firebase] ✅ Service Worker registered:", registration.scope);
        } catch (error) {
          console.error("[Firebase] ❌ Service Worker registration failed:", error);
          return;
        }
      }
      
      // Wait for Service Worker to be ready
      try {
        await navigator.serviceWorker.ready;
        console.log("[Firebase] Service Worker ready:", registration.scope);
      } catch (error) {
        console.warn("[Firebase] Service Worker not ready yet:", error);
        // Wait a bit more
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Get FCM token
    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.warn("[Firebase] Messaging not available");
      return;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
    });

    if (!token) {
      console.log("[Firebase] No FCM token - user not subscribed yet");
      return;
    }

    console.log("[Firebase] FCM Token obtained:", token.substring(0, 20) + "...");

    // Save subscription to backend
    await saveSubscription(token);
  } catch (error) {
    console.error("[Firebase] Sync error:", error);
  }
}

// Save subscription to backend
async function saveSubscription(fcmToken: string): Promise<void> {
  try {
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fcmToken,
        subscriptionId: fcmToken, // Use token as subscription ID
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("[Firebase] ✅ Subscription synced:", data.subscription?.id);
    } else {
      const errorText = await response.text();
      console.error("[Firebase] Failed to sync subscription:", response.status, errorText);
    }
  } catch (error) {
    console.error("[Firebase] Error saving subscription:", error);
  }
}

// Listen for foreground messages
export async function setupForegroundMessageHandler() {
  if (typeof window === "undefined") {
    return;
  }

  const messaging = await getMessagingInstance();
  if (!messaging) {
    return;
  }

  onMessage(messaging, async (payload) => {
    console.log("[Firebase] 🔔 Foreground message received:", payload);
    
    // Show notification manually in foreground
    if (Notification.permission !== "granted") {
      console.warn("[Firebase] ⚠️ Notification permission not granted");
      return;
    }

    try {
      // Проверяем настройки пользователя для звука
      let soundEnabled = true;
      try {
        const settingsResponse = await fetch("/api/settings");
        if (settingsResponse.ok) {
          const settings = await settingsResponse.json();
          soundEnabled = settings.pushSoundEnabled !== false;
          console.log("[Firebase] Sound enabled:", soundEnabled);
        }
      } catch (error) {
        console.warn("[Firebase] Failed to get user settings:", error);
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const notificationOptions: NotificationOptions = {
        body: payload.notification?.body || payload.data?.body || "Новое сообщение",
        icon: payload.notification?.icon || `${baseUrl}/icon.png`,
        badge: `${baseUrl}/icon.png`,
        tag: payload.data?.sessionId || "chat-message",
        data: payload.data || {},
        requireInteraction: false,
        silent: !soundEnabled, // Браузерный звук
      };

      console.log("[Firebase] 📢 Showing notification:", {
        title: payload.notification?.title || "AI Помощник",
        body: notificationOptions.body,
        soundEnabled,
      });

      // Показываем уведомление
      const notification = new Notification(
        payload.notification?.title || "AI Помощник",
        notificationOptions
      );

      console.log("[Firebase] ✅ Notification shown");

      // Звук воспроизводится браузером через silent: false

      notification.onclick = () => {
        console.log("[Firebase] 🔘 Notification clicked");
        window.focus();
        if (payload.data?.url) {
          window.location.href = payload.data.url;
        }
        notification.close();
      };

      // Автоматически закрываем через 5 секунд
      setTimeout(() => {
        notification.close();
      }, 5000);
    } catch (error) {
      console.error("[Firebase] ❌ Error showing notification:", error);
    }
  });
}

