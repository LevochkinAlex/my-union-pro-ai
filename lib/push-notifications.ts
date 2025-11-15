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
    // OneSignal SDK should already be loaded via Script component in layout
    // Just initialize it when ready
    const checkAndInit = () => {
      const OneSignal = (window as any).OneSignal;
      
      if (!OneSignal) {
        console.warn("[Push] OneSignal not available yet, retrying...");
        setTimeout(checkAndInit, 500);
        return false;
      }

      // Use push queue to ensure SDK is ready
      OneSignal.push(() => {
        const OneSignalInstance = (window as any).OneSignal;
        
        if (!OneSignalInstance) {
          console.error("[Push] OneSignal not available in push queue");
          return;
        }

        // Initialize OneSignal with config
        if (typeof OneSignalInstance.init === "function") {
          try {
            OneSignalInstance.init({
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

            // Wait for SDK to fully initialize
            setTimeout(() => {
              syncPushSubscription();
              
              // Set up periodic sync (every 30 seconds)
              setInterval(() => {
                syncPushSubscription();
              }, 30000);
            }, 3000);
          } catch (error) {
            console.error("[Push] Error initializing OneSignal:", error);
          }
        } else {
          console.error("[Push] OneSignal.init is not a function. OneSignal object:", OneSignalInstance);
        }
      });
      
      return true;
    };

    // Wait a bit for SDK to be loaded from Script component
    setTimeout(checkAndInit, 1000);
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

  try {
    // Get user ID from session first
    const sessionResponse = await fetch("/api/auth/session");
    if (!sessionResponse.ok) {
      console.warn("[Push] Failed to get session");
      return;
    }
    
    const session = await sessionResponse.json();
    const userId = session?.user?.id;

    if (!userId) {
      console.warn("[Push] No user ID available");
      return;
    }

    // Try to get OneSignal instance
    const OneSignal = (window as any).OneSignal;
    if (!OneSignal) {
      console.warn("[Push] OneSignal not available, will retry later");
      return;
    }

    // Use OneSignal.push to ensure SDK is ready
    return new Promise<void>((resolve) => {
      try {
        OneSignal.push(() => {
          const OneSignalInstance = (window as any).OneSignal;
          
          if (!OneSignalInstance) {
            console.warn("[Push] OneSignal instance not available in push queue");
            resolve();
            return;
          }

          // Set external user ID first
          if (userId && typeof OneSignalInstance.setExternalUserId === "function") {
            try {
              OneSignalInstance.setExternalUserId(userId, (success: boolean) => {
                if (success) {
                  console.log("[Push] External user ID set:", userId);
                } else {
                  console.warn("[Push] Failed to set external user ID");
                }
              });
            } catch (error) {
              console.warn("[Push] Error setting external user ID:", error);
            }
          }

          // Get player ID
          if (typeof OneSignalInstance.getUserId === "function") {
            try {
              OneSignalInstance.getUserId((playerId: string | null) => {
                if (!playerId) {
                  console.warn("[Push] No player ID available - user may not be subscribed");
                  resolve();
                  return;
                }

                // Get subscription status
                if (typeof OneSignalInstance.isPushNotificationsEnabled === "function") {
                  try {
                    OneSignalInstance.isPushNotificationsEnabled((isEnabled: boolean) => {
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
                          subscriptionId: playerId,
                        }),
                      })
                        .then(async (response) => {
                          if (response.ok) {
                            const data = await response.json();
                            console.log("[Push] ✅ Subscription synced:", {
                              playerId,
                              subscriptionId: data.subscription?.id,
                            });
                          } else {
                            const errorText = await response.text();
                            console.error("[Push] Failed to sync subscription:", response.status, errorText);
                          }
                          resolve();
                        })
                        .catch((error) => {
                          console.error("[Push] Error syncing subscription:", error);
                          resolve();
                        });
                    });
                  } catch (error) {
                    console.warn("[Push] Error checking push notifications enabled:", error);
                    // Try to sync anyway
                    fetch("/api/push/subscribe", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        oneSignalId: playerId,
                        subscriptionId: playerId,
                      }),
                    })
                      .then(async (response) => {
                        if (response.ok) {
                          console.log("[Push] ✅ Subscription synced (without enabled check):", playerId);
                        }
                        resolve();
                      })
                      .catch(() => resolve());
                  }
                } else {
                  // If isPushNotificationsEnabled is not available, try to sync anyway
                  fetch("/api/push/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      oneSignalId: playerId,
                      subscriptionId: playerId,
                    }),
                  })
                    .then(async (response) => {
                      if (response.ok) {
                        console.log("[Push] ✅ Subscription synced (without enabled check):", playerId);
                      }
                      resolve();
                    })
                    .catch(() => resolve());
                }
              });
            } catch (error) {
              console.warn("[Push] Error getting user ID:", error);
              resolve();
            }
          } else {
            console.warn("[Push] getUserId method not available");
            resolve();
          }
        });
      } catch (error) {
        console.error("[Push] Error in push queue:", error);
        resolve();
      }
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

