/**
 * OneSignal Push Notifications - v16 optimized
 */

// Initialize OneSignal (mostly handled by SDK v16 auto-init now)
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

// Request notification permission using v16 API
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
    
    // v16 uses promise-based API
    if (typeof OneSignal.Slidedown?.promptPush === "function") {
      const result = await OneSignal.Slidedown.promptPush();
      console.log("[OneSignal] Permission result:", result);
      if (result) {
        console.log("[OneSignal] ✅ Permission granted");
        syncPushSubscription();
        return true;
      }
    } else if (typeof OneSignal.registerForPushNotifications === "function") {
      // Fallback for older API
      await OneSignal.registerForPushNotifications();
      console.log("[OneSignal] ✅ Permission granted (fallback)");
      syncPushSubscription();
      return true;
    } else {
      console.warn("[OneSignal] No permission request method available");
      return false;
    }
  } catch (error) {
    console.error("[OneSignal] Error requesting permission:", error);
    return false;
  }
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

    // Set external user ID
    if (typeof OneSignal.setExternalUserId === "function") {
      try {
        OneSignal.setExternalUserId(userId);
        console.log("[OneSignal] External user ID set");
      } catch (error) {
        console.warn("[OneSignal] Error setting external user ID:", error);
      }
    }

    // Get player ID using v16 promise-based API
    if (typeof OneSignal.getUserId === "function") {
      try {
        const playerId = await OneSignal.getUserId();
        console.log("[OneSignal] Player ID:", playerId);

        if (!playerId) {
          console.log("[OneSignal] No player ID - user not subscribed yet");
          return;
        }

        // Save subscription to backend
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
        console.error("[OneSignal] Error getting player ID:", error);
      }
    } else {
      console.warn("[OneSignal] getUserId not available");
    }
  } catch (error) {
    console.error("[OneSignal] Sync error:", error);
  }
}
