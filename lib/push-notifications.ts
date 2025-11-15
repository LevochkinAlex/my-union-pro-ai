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
    // OneSignal SDK should already be initialized via Script component in layout
    // Just wait for it to be ready and sync subscription
    const checkAndSync = () => {
      const OneSignal = (window as any).OneSignal;
      
      if (!OneSignal) {
        console.warn("[Push] OneSignal not available yet, retrying...");
        setTimeout(checkAndSync, 500);
        return false;
      }

      // Check if SDK is initialized (has init method or is already initialized)
      if (typeof OneSignal.init === "function") {
        // SDK not initialized yet, wait a bit more
        console.log("[Push] OneSignal SDK detected, waiting for initialization...");
        setTimeout(() => {
          syncPushSubscription();
          
          // Set up periodic sync (every 30 seconds)
          setInterval(() => {
            syncPushSubscription();
          }, 30000);
        }, 3000);
      } else {
        // SDK might be initialized, try to sync
        console.log("[Push] OneSignal SDK appears initialized, syncing subscription...");
        syncPushSubscription();
        
        // Set up periodic sync (every 30 seconds)
        setInterval(() => {
          syncPushSubscription();
        }, 30000);
      }
      
      return true;
    };

    // Wait for SDK to be loaded from Script component
    setTimeout(checkAndSync, 2000);
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

    // Try to access OneSignal directly first, then use push() as fallback
    console.log("[Push] Checking OneSignal availability...");
    console.log("[Push] OneSignal type:", typeof OneSignal);
    console.log("[Push] OneSignal is array:", Array.isArray(OneSignal));
    
    return new Promise<void>((resolve) => {
      // Check if OneSignal is already initialized (not an array)
      if (typeof OneSignal === "object" && !Array.isArray(OneSignal) && OneSignal !== null) {
        console.log("[Push] OneSignal appears to be initialized, accessing directly");
        trySyncDirectly(OneSignal, userId, resolve);
        return;
      }
      
      // If OneSignal is an array, use push() method
      console.log("[Push] OneSignal is array, using push() method...");
      try {
        if (typeof OneSignal.push !== "function") {
          console.error("[Push] OneSignal.push is not a function!");
          console.log("[Push] OneSignal:", OneSignal);
          resolve();
          return;
        }
        
        OneSignal.push(() => {
          console.log("[Push] Inside OneSignal.push() callback");
          const OneSignalInstance = (window as any).OneSignal;
          
          console.log("[Push] OneSignalInstance:", OneSignalInstance ? "exists" : "null");
          console.log("[Push] OneSignalInstance type:", typeof OneSignalInstance);
          
          if (!OneSignalInstance) {
            console.warn("[Push] OneSignal instance not available in push queue");
            resolve();
            return;
          }
          
          console.log("[Push] OneSignalInstance methods:", Object.keys(OneSignalInstance).slice(0, 10));
          
          trySyncDirectly(OneSignalInstance, userId, resolve);
        });
      } catch (error) {
        console.error("[Push] Error in OneSignal.push():", error);
        resolve();
      }
    });
  } catch (error) {
    console.error("[Push] Error syncing subscription:", error);
  }
}

// Helper function to try syncing directly
function trySyncDirectly(OneSignalInstance: any, userId: string, resolve: () => void) {
  try {
    console.log("[Push] Trying to sync directly with OneSignalInstance");

    // Set external user ID first (non-blocking)
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

    // Helper function to sync subscription to backend
    const syncToBackend = (playerId: string) => {
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
          };

    // Try to get player ID
    if (typeof OneSignalInstance.getUserId === "function") {
      try {
        console.log("[Push] Calling getUserId...");
        OneSignalInstance.getUserId((playerId: string | null) => {
          console.log("[Push] getUserId callback called with:", playerId);
          if (!playerId) {
            console.warn("[Push] No player ID available - user may not be subscribed");
            console.log("[Push] This usually means the user hasn't granted notification permission yet");
            resolve();
            return;
          }

          console.log("[Push] Player ID found:", playerId);

          // Check if notifications are enabled (optional check)
          if (typeof OneSignalInstance.isPushNotificationsEnabled === "function") {
            try {
              console.log("[Push] Checking if push notifications are enabled...");
              OneSignalInstance.isPushNotificationsEnabled((isEnabled: boolean) => {
                console.log("[Push] Push notifications enabled:", isEnabled);
                if (!isEnabled) {
                  console.log("[Push] Push notifications not enabled by user");
                  resolve();
                  return;
                }
                console.log("[Push] Notifications enabled, syncing to backend...");
                syncToBackend(playerId);
              });
            } catch (error) {
              console.warn("[Push] Error checking push notifications enabled:", error);
              // Sync anyway if check fails
              console.log("[Push] Sync anyway after check error...");
              syncToBackend(playerId);
            }
          } else {
            // If check method not available, sync anyway
            console.log("[Push] isPushNotificationsEnabled not available, syncing anyway...");
            syncToBackend(playerId);
          }
        });
      } catch (error) {
        console.error("[Push] Error getting user ID:", error);
        resolve();
      }
    } else {
      console.warn("[Push] getUserId method not available");
      console.log("[Push] OneSignalInstance methods:", Object.keys(OneSignalInstance));
      resolve();
    }
  } catch (error) {
    console.error("[Push] Error in trySyncDirectly:", error);
    resolve();
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

  return new Promise<boolean>((resolve) => {
    try {
      OneSignal.push(() => {
        const OneSignalInstance = (window as any).OneSignal;
        
        if (!OneSignalInstance) {
          console.warn("[Push] OneSignal instance not available");
          resolve(false);
          return;
        }

        // Check if already subscribed
        if (typeof OneSignalInstance.getUserId === "function") {
          OneSignalInstance.getUserId((playerId: string | null) => {
            if (playerId) {
              console.log("[Push] Already subscribed with player ID:", playerId);
              resolve(true);
              return;
            }

            // Request permission using registerForPushNotifications
            if (typeof OneSignalInstance.registerForPushNotifications === "function") {
              OneSignalInstance.registerForPushNotifications()
                .then(() => {
                  console.log("[Push] Permission granted");
                  // Sync subscription after permission is granted
                  setTimeout(() => {
                    syncPushSubscription();
                  }, 1000);
                  resolve(true);
                })
                .catch((error: any) => {
                  console.error("[Push] Permission denied or error:", error);
                  resolve(false);
                });
            } else if (typeof OneSignalInstance.showSlidedownPrompt === "function") {
              // Alternative method: show slidedown prompt
              OneSignalInstance.showSlidedownPrompt()
                .then(() => {
                  console.log("[Push] Slidedown prompt shown");
                  setTimeout(() => {
                    syncPushSubscription();
                  }, 1000);
                  resolve(true);
                })
                .catch((error: any) => {
                  console.error("[Push] Error showing prompt:", error);
                  resolve(false);
                });
            } else {
              console.warn("[Push] No method available to request permission");
              resolve(false);
            }
          });
        } else {
          console.warn("[Push] getUserId method not available");
          resolve(false);
        }
      });
    } catch (error) {
      console.error("[Push] Error requesting permission:", error);
      resolve(false);
    }
  });
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

