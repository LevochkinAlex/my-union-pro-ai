"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { syncPushSubscription, setupForegroundMessageHandler } from "@/lib/firebase-push-notifications";

/**
 * Component to initialize Firebase Cloud Messaging on app load
 */
export default function FirebasePushInit() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user?.id) {
      console.log("[Firebase] No session, skipping sync");
      return;
    }

    console.log("[Firebase] Session ready, initializing FCM...");

    // Setup foreground message handler
    setupForegroundMessageHandler();

    // Check notification permission
    const checkPermission = async () => {
      if (typeof window !== "undefined" && "Notification" in window) {
        const permission = Notification.permission;
        console.log("[Firebase] Browser notification permission:", permission);

        if (permission === "granted") {
          console.log("[Firebase] ✅ Notifications are allowed");
          // Sync subscription after a delay to ensure Firebase is initialized
          setTimeout(() => {
            syncPushSubscription();
          }, 2000);
        } else if (permission === "default") {
          console.log("[Firebase] ⚠️ Notification permission not requested yet");
        } else {
          console.log("[Firebase] ❌ Notifications are blocked by browser");
        }
      }
    };

    // Initial check
    setTimeout(() => {
      checkPermission();
    }, 2000);

    // Periodic sync every 60 seconds
    const intervalId = setInterval(() => {
      console.log("[Firebase] Periodic sync...");
      syncPushSubscription();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [session?.user?.id]);

  return null;
}

