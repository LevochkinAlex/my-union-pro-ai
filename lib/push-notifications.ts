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
    // Initialize OneSignal using the array pattern
    // This is the recommended way to initialize OneSignal SDK
    (window as any).OneSignal = (window as any).OneSignal || [];

    // Load OneSignal SDK script first
    const script = document.createElement("script");
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.async = true;

    script.onload = () => {
      console.log("[Push] OneSignal SDK script loaded");
      
      // Wait a bit for SDK to process the queue and initialize
      setTimeout(() => {
        // Use push queue to ensure SDK is ready
        (window as any).OneSignal.push(() => {
          const OneSignal = (window as any).OneSignal;
          
          if (!OneSignal) {
            console.error("[Push] OneSignal not available after load");
            return;
          }

          // Initialize OneSignal with config
          if (typeof OneSignal.init === "function") {
            try {
              OneSignal.init({
                appId: ONESIGNAL_APP_ID,
                allowLocalhostAsSecureOrigin: true,
                serviceWorkerPath: "/OneSignalSDKWorker.js",
                serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
                promptOptions: {
                  slidedown: {
                    prompts: [
                      {
                        type: "push",
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

              console.log("[Push] OneSignal.init called successfully");

              // Wait longer for SDK to fully initialize all methods
              // Don't use .on() method as it may not be available immediately
              // Instead, periodically check subscription status
              setTimeout(() => {
                syncPushSubscription();
                
                // Set up periodic sync (every 30 seconds) instead of event listener
                setInterval(() => {
                  syncPushSubscription();
                }, 30000);
              }, 3000);
            } catch (error) {
              console.error("[Push] Error initializing OneSignal:", error);
            }
          } else {
            console.error("[Push] OneSignal.init is not a function. OneSignal object:", OneSignal);
          }
        });
      }, 500);
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
  if (typeof window === "undefined") {
    console.warn("[Push] Window not available");
    return;
  }

  const OneSignal = (window as any).OneSignal;
  if (!OneSignal) {
    console.warn("[Push] OneSignal not available");
    return;
  }

  try {
    // Get user ID from session
    const sessionResponse = await fetch("/api/auth/session");
    const session = await sessionResponse.json();
    const userId = session?.user?.id;

    if (!userId) {
      console.warn("[Push] No user ID available");
      return;
    }

    // Use OneSignal.push to ensure SDK is ready
    return new Promise<void>((resolve) => {
      window.OneSignal.push(() => {
        // Set external user ID first
        if (userId && window.OneSignal.setExternalUserId) {
          window.OneSignal.setExternalUserId(userId, (success: boolean) => {
            if (success) {
              console.log("[Push] External user ID set:", userId);
            } else {
              console.warn("[Push] Failed to set external user ID");
            }
          });
        }

        OneSignal.getUserId((playerId: string | null) => {
          if (!playerId) {
            console.warn("[Push] No player ID available - user may not be subscribed");
            resolve();
            return;
          }

          // Get subscription status
          OneSignal.isPushNotificationsEnabled((isEnabled: boolean) => {
            if (!isEnabled) {
              console.log("[Push] Push notifications not enabled by user");
              resolve();
              return;
            }

            // Send to backend to store
            fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                oneSignalId: playerId,
                subscriptionId: playerId, // OneSignal uses playerId as subscriptionId
              }),
            })
              .then((response) => {
                if (response.ok) {
                  console.log("[Push] Subscription synced:", playerId);
                } else {
                  console.error("[Push] Failed to sync subscription:", response.statusText);
                }
                resolve();
              })
              .catch((error) => {
                console.error("[Push] Error syncing subscription:", error);
                resolve();
              });
          });
        });
      });
    });
  } catch (error) {
    console.error("[Push] Error syncing subscription:", error);
  }
}

/**
 * Request push notification permission
 */
export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === "undefined") {
    console.warn("[Push] Window not available");
    return false;
  }

  const OneSignal = (window as any).OneSignal;
  if (!OneSignal) {
    console.warn("[Push] OneSignal not available");
    return false;
  }

  try {
    const permission = await OneSignal.showNativePrompt?.();
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
  if (typeof window === "undefined") {
    return null;
  }

  const OneSignal = (window as any).OneSignal;
  if (!OneSignal) {
    return null;
  }

  try {
    return new Promise<string | null>((resolve) => {
      OneSignal.getUserId?.((userId: string | null) => {
        resolve(userId);
      });
    });
  } catch (error) {
    console.error("[Push] Error getting subscription ID:", error);
    return null;
  }
}

declare global {
  interface Window {
    OneSignal?: {
      push: (callback: () => void) => void;
      init: (config: any) => void;
      on?: (event: string, callback: (data: any) => void) => void;
      getUserId?: (callback: (userId: string | null) => void) => void;
      isPushNotificationsEnabled?: (callback: (isEnabled: boolean) => void) => void;
      setExternalUserId?: (userId: string, callback?: (success: boolean) => void) => void;
      showNativePrompt?: () => Promise<string>;
    };
  }
}

