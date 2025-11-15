"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { syncPushSubscription } from "@/lib/push-notifications";

/**
 * Component to sync OneSignal subscription on app load
 * OneSignal v16 handles most initialization automatically
 */
export default function PushNotificationInit() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user?.id) {
      console.log("[OneSignal] No session, skipping sync");
      return;
    }

    console.log("[OneSignal] Session ready, syncing subscription...");

    // Проверяем разрешение уведомлений
    const checkPermission = async () => {
      if (typeof window !== "undefined" && window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            // v16 API для проверки разрешения
            const permissionStatus = Notification.permission;
            console.log("[OneSignal] Browser notification permission:", permissionStatus);
            
            if (permissionStatus === "granted") {
              console.log("[OneSignal] ✅ Notifications are allowed");
              syncPushSubscription();
            } else if (permissionStatus === "default") {
              console.log("[OneSignal] ⚠️ Notification permission not requested yet - need to click button");
            } else {
              console.log("[OneSignal] ❌ Notifications are blocked by browser");
            }
          } catch (error) {
            console.error("[OneSignal] Error checking permission:", error);
          }
        });
      }
    };

    // Initial check and sync
    setTimeout(() => {
      checkPermission();
    }, 2000);

    // Periodic sync every 60 seconds
    const intervalId = setInterval(() => {
      console.log("[OneSignal] Periodic sync...");
      syncPushSubscription();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [session?.user?.id]);

  return null;
}
