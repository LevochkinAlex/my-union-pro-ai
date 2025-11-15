/**
 * OneSignal v16 Push Notifications
 */

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
    
    // v16 uses registerForPushNotifications which returns a promise
    if (typeof OneSignal.registerForPushNotifications === "function") {
      await OneSignal.registerForPushNotifications();
      console.log("[OneSignal] ✅ Permission granted");
      syncPushSubscription();
      return true;
    } else {
      console.warn("[OneSignal] registerForPushNotifications not available");
      return false;
    }
  } catch (error: any) {
    // In v16, it might throw errors on localhost or non-HTTPS
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

    // Set external user ID
    if (typeof OneSignal.setExternalUserId === "function") {
      try {
        OneSignal.setExternalUserId(userId);
        console.log("[OneSignal] External user ID set");
      } catch (error) {
        console.warn("[OneSignal] Error setting external user ID:", error);
      }
    }

    // Get player ID - v16 uses async method
    if (typeof OneSignal.User !== "undefined" && OneSignal.User?.PushSubscription?.id) {
      // v16 has User.PushSubscription API
      const playerId = OneSignal.User.PushSubscription.id;
      console.log("[OneSignal] Player ID (v16 User API):", playerId);

      if (!playerId) {
        console.log("[OneSignal] No player ID - user not subscribed yet");
        return;
      }

      // Save subscription to backend
      await saveSubscription(playerId);
    } else if (typeof OneSignal.getUserId === "function") {
      // Fallback to older API
      try {
        const playerId = await OneSignal.getUserId();
        console.log("[OneSignal] Player ID:", playerId);

        if (!playerId) {
          console.log("[OneSignal] No player ID - user not subscribed yet");
          return;
        }

        await saveSubscription(playerId);
      } catch (error) {
        console.error("[OneSignal] Error getting player ID:", error);
      }
    } else {
      console.warn("[OneSignal] No method available to get player ID");
    }
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
