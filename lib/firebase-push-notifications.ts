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
    return null;
  }

  if (messagingInstance) {
    return messagingInstance;
  }

  try {
    const app = getFirebaseApp();
    // Check if messaging is supported
    if (!("Notification" in window)) {
      return null;
    }
    
    // Get messaging instance
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (error) {
    console.error("[Firebase] Error getting messaging:", error);
    return null;
  }
}

// Request push notification permission
export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      // Sync subscription after permission granted
      setTimeout(() => {
        syncPushSubscription();
      }, 1000);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[Firebase] Error requesting permission:", error);
    return false;
  }
}

// Sync subscription with backend
export async function syncPushSubscription(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    // Get session
    const sessionResponse = await fetch("/api/auth/session");
    if (!sessionResponse.ok) {
      return;
    }

    const session = await sessionResponse.json();
    const userId = session?.user?.id;

    if (!userId) {
      return;
    }

    // Wait for Service Worker to be ready (with retry)
    if ("serviceWorker" in navigator) {
      let registration = await navigator.serviceWorker.getRegistration();
      
      if (!registration) {
        try {
          registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        } catch (error) {
          console.error("[Firebase] ❌ Service Worker registration failed:", error);
          return;
        }
      }
      
      // Wait for Service Worker to be ready
      try {
        await navigator.serviceWorker.ready;
      } catch (error) {
        // Wait a bit more
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Respect notification permission status
    if (!("Notification" in window)) {
      return;
    }

    const permission = Notification.permission;
    if (permission === "denied") {
      console.warn("[Firebase] Notification permission denied by the user");
      return;
    }

    if (permission !== "granted") {
      return;
    }

    // Get FCM token
    const messaging = await getMessagingInstance();
    if (!messaging) {
      return;
    }

    let token: string | null = null;
    try {
      token = await getToken(messaging, {
        vapidKey: VAPID_PUBLIC_KEY,
      });
    } catch (tokenError: any) {
      if (tokenError?.code === "messaging/permission-blocked") {
        console.warn("[Firebase] Browser blocked notification permission request");
        return;
      }
      throw tokenError;
    }

    if (!token) {
      return;
    }

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

    if (!response.ok) {
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
    if (Notification.permission !== "granted") {
      return;
    }

    try {
      let soundEnabled = true;
      try {
        const settingsResponse = await fetch("/api/settings");
        if (settingsResponse.ok) {
          const settings = await settingsResponse.json();
          soundEnabled = settings.pushSoundEnabled !== false;
        }
      } catch (error) {
        console.error("[Firebase] Error loading notification settings:", error);
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const notificationOptions: NotificationOptions = {
        body: payload.notification?.body || payload.data?.body || "Новое сообщение",
        icon: payload.notification?.icon || `${baseUrl}/icon.png`,
        badge: `${baseUrl}/icon.png`,
        tag: payload.data?.sessionId || "chat-message",
        data: payload.data || {},
        requireInteraction: false,
        silent: !soundEnabled,
      };

      try {
        const notification = new Notification(
          payload.notification?.title || "AI Помощник",
          notificationOptions
        );

        notification.onclick = () => {
          window.focus();
          if (payload.data?.url) {
            window.location.href = payload.data.url;
          }
          notification.close();
        };

        setTimeout(() => {
          notification.close();
        }, 10000);
      } catch (notifError) {
        console.error("[Firebase] Notification error:", notifError);
        throw notifError;
      }
    } catch (error) {
      console.error("[Firebase] Error showing notification:", error);
    }
  });
}

