/**
 * OneSignal Push Notifications Integration
 * Handles initialization and push notification management
 */

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

export interface PushNotificationOptions {
  title: string;
  message: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
}

/**
 * Initialize OneSignal for push notifications
 */
export async function initializePushNotifications() {
  if (!ONESIGNAL_APP_ID) {
    console.warn("[Push] OneSignal App ID not configured");
    return false;
  }

  // Check if we're in browser environment
  if (typeof window === "undefined") {
    return false;
  }

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (
    isLocalhost &&
    process.env.NEXT_PUBLIC_ENABLE_PUSH_ON_LOCAL !== "true"
  ) {
    console.info("[Push] Skipping OneSignal init on localhost");
    return false;
  }

  try {
    // Dynamically load OneSignal script
    window.OneSignal = window.OneSignal || [];
    const script = document.createElement("script");
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.async = true;

    script.onload = () => {
      window.OneSignal = window.OneSignal || [];

      if (window.OneSignal && typeof window.OneSignal.init === "function") {
        window.OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerPath: "/OneSignalSDKWorker.js",
          serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
          promptOptions: {
            slidedown: {
              prompts: [
                {
                  type: "push", // Slide down style
                  autoPrompt: true,
                  text: {
                    actionMessage:
                      "Получайте уведомления о новых сообщениях от AI",
                    acceptButton: "Разрешить",
                    cancelButton: "Отклонить",
                  },
                  delay: {
                    pageViews: 1,
                    seconds: 10,
                  },
                },
              ],
            },
          },
        });

        // Set up event listeners
        window.OneSignal.on("subscriptionChange", (isSubscribed: boolean) => {
          console.log("[Push] Subscription changed:", isSubscribed);
          if (isSubscribed) {
            syncPushSubscription();
          }
        });

        console.log("[Push] OneSignal initialized successfully");
        return true;
      }
    };

    script.onerror = () => {
      console.error("[Push] Failed to load OneSignal SDK");
    };

    document.head.appendChild(script);
    return true;
  } catch (error) {
    console.error("[Push] Error initializing OneSignal:", error);
    return false;
  }
}

/**
 * Sync push subscription with backend
 */
export async function syncPushSubscription() {
  if (typeof window === "undefined" || !window.OneSignal) {
    return;
  }

  try {
    const playerId = await window.OneSignal.getUserId?.();
    const pushSubscriptionId = await window.OneSignal.getSubscriptionId?.();

    if (!playerId || !pushSubscriptionId) {
      console.warn("[Push] No subscription ID available");
      return;
    }

    // Send to backend to store
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oneSignalId: playerId,
        subscriptionId: pushSubscriptionId,
      }),
    });

    console.log("[Push] Subscription synced:", playerId);
  } catch (error) {
    console.error("[Push] Error syncing subscription:", error);
  }
}

/**
 * Request push notification permission
 */
export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !window.OneSignal) {
    console.warn("[Push] OneSignal not available");
    return false;
  }

  try {
    const permission = await window.OneSignal.showNativePrompt?.();
    console.log("[Push] Permission requested:", permission);
    return permission === "granted";
  } catch (error) {
    console.error("[Push] Error requesting permission:", error);
    return false;
  }
}

/**
 * Get push subscription ID for current user
 */
export async function getPushSubscriptionId(): Promise<string | null> {
  if (typeof window === "undefined" || !window.OneSignal) {
    return null;
  }

  try {
    return await window.OneSignal.getUserId?.();
  } catch (error) {
    console.error("[Push] Error getting subscription ID:", error);
    return null;
  }
}

declare global {
  interface Window {
    OneSignal?: any;
  }
}

