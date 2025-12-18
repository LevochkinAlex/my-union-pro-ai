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
      return;
    }

    // Setup foreground message handler (async)
    setupForegroundMessageHandler().catch(console.error);

    // Check notification permission
    const checkPermission = async () => {
      if (typeof window !== "undefined" && "Notification" in window) {
        const permission = Notification.permission;

        if (permission === "granted") {
          // Sync subscription after a delay to ensure Firebase is initialized
          setTimeout(() => {
            syncPushSubscription();
          }, 2000);
        }
      }
    };

    // Initial check
    setTimeout(() => {
      checkPermission();
    }, 2000);

    // Periodic sync every 60 seconds
    const intervalId = setInterval(() => {
      syncPushSubscription();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [session?.user?.id]);

  return null;
}

