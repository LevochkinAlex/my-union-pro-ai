/**
 * OneSignal Push Notifications - Clean implementation
 */

// Initialize OneSignal
export async function initializePushNotifications(): Promise<boolean> {
  if (typeof window === "undefined") {
    console.log("[OneSignal] Window not available");
    return false;
  }

  const OneSignal = (window as any).OneSignal;
  if (!OneSignal) {
    console.log("[OneSignal] OneSignal SDK not available");
    return false;
  }

  console.log("[OneSignal] Initialization started");
  return true;
}

// Request notification permission
export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === "undefined") {
    console.log("[OneSignal] Window not available");
    return false;
  }

  const OneSignal = (window as any).OneSignal;
  if (!OneSignal) {
    console.log("[OneSignal] OneSignal SDK not available");
    return false;
  }

  return new Promise<boolean>((resolve) => {
    try {
      // If OneSignal is a queue (array), use push
      if (Array.isArray(OneSignal)) {
        console.log("[OneSignal] Using queue push for permission request");
        OneSignal.push(() => {
          const instance = (window as any).OneSignal;
          if (instance && typeof instance.registerForPushNotifications === "function") {
            console.log("[OneSignal] Calling registerForPushNotifications");
            instance
              .registerForPushNotifications()
              .then(() => {
                console.log("[OneSignal] ✅ Permission granted");
                syncPushSubscription();
                resolve(true);
              })
              .catch((error: any) => {
                console.error("[OneSignal] Permission error:", error);
                resolve(false);
              });
          } else {
            console.warn("[OneSignal] registerForPushNotifications not available");
            resolve(false);
          }
        });
      } else {
        // If already initialized
        if (typeof OneSignal.registerForPushNotifications === "function") {
          OneSignal.registerForPushNotifications()
            .then(() => {
              console.log("[OneSignal] ✅ Permission granted");
              syncPushSubscription();
              resolve(true);
            })
            .catch((error: any) => {
              console.error("[OneSignal] Permission error:", error);
              resolve(false);
            });
        } else {
          resolve(false);
        }
      }
    } catch (error) {
      console.error("[OneSignal] Error requesting permission:", error);
      resolve(false);
    }
  });
}

// Sync subscription with backend
export async function syncPushSubscription(): Promise<void> {
  if (typeof window === "undefined") {
    console.log("[OneSignal] Window not available");
    return;
  }

  const OneSignal = (window as any).OneSignal;
  if (!OneSignal) {
    console.log("[OneSignal] OneSignal SDK not available");
    return;
  }

  return new Promise<void>((resolve) => {
    try {
      // Get session first
      fetch("/api/auth/session")
        .then((response) => response.json())
        .then((session) => {
          if (!session?.user?.id) {
            console.log("[OneSignal] No user session");
            resolve();
            return;
          }

          const userId = session.user.id;
          console.log("[OneSignal] Syncing for user:", userId);

          // Function to sync with the queue or direct instance
          const performSync = (instance: any) => {
            if (!instance) {
              console.warn("[OneSignal] Instance not available");
              resolve();
              return;
            }

            // Set external user ID
            if (typeof instance.setExternalUserId === "function") {
              try {
                instance.setExternalUserId(userId);
                console.log("[OneSignal] External user ID set");
              } catch (error) {
                console.warn("[OneSignal] Error setting external user ID:", error);
              }
            }

            // Get player ID
            if (typeof instance.getUserId === "function") {
              instance.getUserId((playerId: string | null) => {
                if (!playerId) {
                  console.log("[OneSignal] No player ID - user not subscribed yet");
                  resolve();
                  return;
                }

                console.log("[OneSignal] Player ID:", playerId);

                // Save subscription to backend
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
                      console.log("[OneSignal] ✅ Subscription synced:", data.subscription?.id);
                    } else {
                      console.error("[OneSignal] Failed to sync subscription:", response.status);
                    }
                  })
                  .catch((error) => {
                    console.error("[OneSignal] Sync error:", error);
                  })
                  .finally(() => resolve());
              });
            } else {
              console.warn("[OneSignal] getUserId not available");
              resolve();
            }
          };

          // If OneSignal is still a queue, use push
          if (Array.isArray(OneSignal)) {
            console.log("[OneSignal] Using queue push for sync");
            OneSignal.push(() => {
              performSync((window as any).OneSignal);
            });
          } else {
            // If already initialized
            performSync(OneSignal);
          }
        })
        .catch((error) => {
          console.error("[OneSignal] Session error:", error);
          resolve();
        });
    } catch (error) {
      console.error("[OneSignal] Sync error:", error);
      resolve();
    }
  });
}
