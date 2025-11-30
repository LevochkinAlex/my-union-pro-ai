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

  if (!window.OneSignalDeferred) {
    console.log("[OneSignal] OneSignalDeferred not available");
    return false;
  }

  try {
    console.log("[OneSignal] Requesting push permission...");
    
    return new Promise((resolve) => {
      window.OneSignalDeferred!.push(async (OneSignal: any) => {
        try {
          // v16 official API для запроса разрешения
          await OneSignal.Notifications.requestPermission();
          
          // Проверяем результат
          const permissionStatus = Notification.permission;
          console.log("[OneSignal] Permission status after request:", permissionStatus);
          
          if (permissionStatus === "granted") {
            console.log("[OneSignal] ✅ Permission granted!");
            // Синхронизируем подписку после получения разрешения
            setTimeout(() => {
              syncPushSubscription();
            }, 1500);
            resolve(true);
          } else {
            console.log("[OneSignal] ❌ Permission denied or dismissed");
            resolve(false);
          }
        } catch (error: any) {
          console.error("[OneSignal] Error requesting permission:", error);
          resolve(false);
        }
      });
    });
  } catch (error: any) {
    console.error("[OneSignal] Error:", error);
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

    // For v16, get subscription through proper v16 API
    const getPlayerId = (): Promise<string | null> => {
      return new Promise((resolve) => {
        if (typeof window !== "undefined" && window.OneSignalDeferred) {
          window.OneSignalDeferred.push(async (OneSignal: any) => {
            try {
              // v16 - просто получаем ID из PushSubscription напрямую
              const subscription = OneSignal.User?.PushSubscription;
              
              if (subscription?.id) {
                console.log("[OneSignal] Player ID (PushSubscription.id):", subscription.id);
                resolve(subscription.id);
                return;
              }

              // Если нет ID, проверяем permission и ждём
              const permission = await OneSignal.Notifications.getNotificationPermission();
              if (permission === "granted") {
                // После permission granted, ID должен появиться
                const sub = OneSignal.User?.PushSubscription;
                if (sub?.id) {
                  console.log("[OneSignal] Player ID (after permission):", sub.id);
                  resolve(sub.id);
                  return;
                }
              }

              console.log("[OneSignal] No player ID available yet");
              resolve(null);
            } catch (error) {
              console.error("[OneSignal] Error getting player ID:", error);
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

/**
 * Отправляет push-уведомление пользователю (server-side)
 */
export async function sendPushNotification(
  userId: string,
  options: {
    title: string;
    body: string;
    url?: string;
  }
): Promise<void> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
    const response = await fetch(`${baseUrl}/api/push/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.INTERNAL_API_TOKEN || "",
      },
      body: JSON.stringify({
        userId,
        title: options.title,
        message: options.body,
        data: options.url ? { url: options.url } : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Push] Failed to send notification:", response.status, errorText);
    }
  } catch (error) {
    console.error("[Push] Error sending notification:", error);
  }
}
