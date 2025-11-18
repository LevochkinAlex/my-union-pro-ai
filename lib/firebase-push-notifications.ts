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
    let registration: ServiceWorkerRegistration | null = null;
    if ("serviceWorker" in navigator) {
      try {
        registration = await navigator.serviceWorker.getRegistration();
        
        if (!registration) {
          try {
            registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
            console.log("[Firebase] Service Worker registered:", registration.scope);
          } catch (error) {
            console.error("[Firebase] ❌ Service Worker registration failed:", error);
            return;
          }
        }
        
        // Wait for Service Worker to be ready
        try {
          registration = await navigator.serviceWorker.ready;
          console.log("[Firebase] Service Worker ready:", registration.scope);
        } catch (error) {
          console.warn("[Firebase] Service Worker not ready yet:", error);
          // Wait a bit more and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          registration = await navigator.serviceWorker.ready;
        }
        
        // Verify that registration has pushManager (required for FCM)
        if (!registration || !registration.pushManager) {
          console.warn("[Firebase] Service Worker registration does not have pushManager");
          return;
        }
      } catch (error) {
        console.error("[Firebase] ❌ Error setting up Service Worker:", error);
        return;
      }
    } else {
      console.warn("[Firebase] Service Worker not supported in this browser");
      return;
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

    // Verify registration is still available before getting token
    if (!registration) {
      console.warn("[Firebase] ⚠️ Service Worker registration is not available");
      return;
    }

    // Get FCM token
    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.warn("[Firebase] ⚠️ Messaging instance is not available");
      return;
    }

    let token: string | null = null;
    try {
      console.log("[Firebase] Requesting FCM token with VAPID key...");
      // Ensure we have a valid service worker registration before calling getToken
      const currentRegistration = await navigator.serviceWorker.ready;
      if (!currentRegistration || !currentRegistration.pushManager) {
        console.warn("[Firebase] ⚠️ Service Worker registration or pushManager not available");
        return;
      }
      
      token = await getToken(messaging, {
        vapidKey: VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: currentRegistration,
      });
      console.log("[Firebase] ✅ FCM token obtained:", {
        tokenPrefix: token ? token.substring(0, 20) + "..." : "null",
        tokenLength: token?.length || 0,
      });
    } catch (tokenError: any) {
      if (tokenError?.code === "messaging/permission-blocked") {
        console.warn("[Firebase] ⚠️ Browser blocked notification permission request");
        return;
      }
      console.error("[Firebase] ❌ Error getting FCM token:", {
        code: tokenError?.code,
        message: tokenError?.message,
        error: tokenError,
      });
      throw tokenError;
    }

    if (!token) {
      console.warn("[Firebase] ⚠️ No FCM token received");
      return;
    }

    // Save subscription to backend
    console.log("[Firebase] Saving token to backend...");
    await saveSubscription(token);
  } catch (error) {
    console.error("[Firebase] Sync error:", error);
  }
}

// Save subscription to backend
async function saveSubscription(fcmToken: string): Promise<void> {
  try {
    console.log("[Firebase] Saving subscription to backend...", {
      tokenPrefix: fcmToken.substring(0, 20) + "...",
      tokenLength: fcmToken.length,
    });
    
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fcmToken,
        subscriptionId: fcmToken, // Use token as subscription ID
      }),
    });

    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = `Failed to read error response: ${e}`;
      }
      
      console.error("[Firebase] ❌ Failed to sync subscription:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        url: "/api/push/subscribe",
      });
      
      // Don't throw - just log the error, subscription sync is not critical
      return;
    }

    let result;
    try {
      result = await response.json();
      console.log("[Firebase] ✅ Subscription saved successfully:", {
        subscriptionId: result.subscription?.id,
        lastSyncAt: result.subscription?.lastSyncAt,
        success: result.success,
      });
    } catch (jsonError) {
      console.error("[Firebase] ❌ Failed to parse subscription response:", jsonError);
      return;
    }
  } catch (error) {
    console.error("[Firebase] ❌ Error saving subscription:", error);
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
      
      // Check sound from payload data first, then from settings
      const payloadSoundEnabled = payload.data?.soundEnabled !== "false";
      const finalSoundEnabled = payloadSoundEnabled && soundEnabled;
      const soundUrl = payload.data?.sound || (payload.notification as any)?.sound || `${baseUrl}/notification-sound.mp3`;
      
      const notificationOptions: NotificationOptions = {
        body: payload.notification?.body || payload.data?.body || "Новое сообщение",
        icon: payload.notification?.icon || payload.data?.icon || `${baseUrl}/icon.png`,
        badge: `${baseUrl}/icon.png`,
        tag: payload.data?.sessionId || "chat-message",
        data: payload.data || {},
        requireInteraction: false,
        silent: !finalSoundEnabled,
        ...(finalSoundEnabled && { sound: soundUrl }),
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

