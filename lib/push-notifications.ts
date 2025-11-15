/**
 * OneSignal v16 Push Notifications
 * Uses official OneSignalDeferred API
 */

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
  }
}

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

  console.log("[OneSignal] Initialization checked");
  return true;
}

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

  try {
    console.log("[OneSignal] Requesting push permission...");
    
    // v16 official API for requesting notifications
    if (typeof OneSignal.Notifications?.requestPermission === "function") {
      // Modern v16 API
      await OneSignal.Notifications.requestPermission();
      console.log("[OneSignal] ✅ Permission granted via Notifications API");
      syncPushSubscription();
      return true;
    } else if (typeof OneSignal.registerForPushNotifications === "function") {
      // Fallback
      await OneSignal.registerForPushNotifications();
      console.log("[OneSignal] ✅ Permission granted via registerForPushNotifications");
      syncPushSubscription();
      return true;
    } else {
      console.warn("[OneSignal] No permission request method available");
      return false;
    }
  } catch (error: any) {
    if (error?.message?.includes("https://")) {
      console.warn("[OneSignal] HTTPS required for push notifications");
    } else {
      console.error("[OneSignal] Error requesting permission:", error);
    }
    return false;
  }
}

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

  try {
    // Get session
    const sessionResponse = await fetch("/api/auth/session");
    if (!sessionResponse.ok) {
      console.warn("[OneSignal] Failed to get session");
      return;
    }
    
    const session = await sessionResponse.json();
    const userId = session?.user?.id;

    if (!userId) {
      console.warn("[OneSignal] No user ID available");
      return;
    }

    console.log("[OneSignal] Syncing for user:", userId);

    // Get subscription ID using OneSignalDeferred pattern
    let playerId: string | null = null;

    // For v16, we need to get subscription through the deferred API
    const getPlayerId = (): Promise<string | null> => {
      return new Promise((resolve) => {
        if (typeof window !== "undefined" && window.OneSignalDeferred) {
          window.OneSignalDeferred.push(async (OneSignal: any) => {
            try {
              const subscription = await OneSignal.User.PushSubscription.getSubscription();
              if (subscription?.id) {
                console.log("[OneSignal] Player ID (v16 getSubscription):", subscription.id);
                resolve(subscription.id);
              } else {
                console.log("[OneSignal] No subscription found");
                resolve(null);
              }
            } catch (error) {
              console.error("[OneSignal] Error getting subscription:", error);
              resolve(null);
            }
          });
        } else {
          resolve(null);
        }
      });
    };

    playerId = await getPlayerId();

    if (!playerId) {
      console.log("[OneSignal] No player ID - user not subscribed yet");
      return;
    }

    // Save subscription to backend
    await saveSubscription(playerId);
  } catch (error) {
    console.error("[OneSignal] Sync error:", error);
  }
}

async function saveSubscription(playerId: string): Promise<void> {
  try {
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oneSignalId: playerId,
        subscriptionId: playerId,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("[OneSignal] ✅ Subscription synced:", data.subscription?.id);
    } else {
      const errorText = await response.text();
      console.error("[OneSignal] Failed to sync subscription:", response.status, errorText);
    }
  } catch (error) {
    console.error("[OneSignal] Error saving subscription:", error);
  }
}
