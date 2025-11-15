"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  initializePushNotifications,
  syncPushSubscription,
} from "@/lib/push-notifications";

/**
 * Component to initialize push notifications on app load
 * Should be placed in a layout that wraps the entire app
 */
export default function PushNotificationInit() {
  const { data: session } = useSession();

  useEffect(() => {
    // Only initialize if user is logged in
    if (!session?.user?.id) {
      console.log("[Push] No session, skipping initialization");
      return;
    }

    console.log("[Push] Initializing push notifications for user:", session.user.id);

    const initPush = async () => {
      try {
        const initialized = await initializePushNotifications();
        console.log("[Push] Initialization result:", initialized);

        if (initialized) {
          // Sync subscription after delays to ensure OneSignal is ready
          // First sync after 3 seconds
          setTimeout(() => {
            console.log("[Push] First sync attempt...");
            syncPushSubscription();
          }, 3000);
          
          // Second sync after 10 seconds (in case first one failed)
          setTimeout(() => {
            console.log("[Push] Second sync attempt...");
            syncPushSubscription();
          }, 10000);
          
          // Periodic sync every 30 seconds
          const intervalId = setInterval(() => {
            console.log("[Push] Periodic sync...");
            syncPushSubscription();
          }, 30000);
          
          // Cleanup interval on unmount
          return () => clearInterval(intervalId);
        } else {
          console.warn("[Push] Failed to initialize push notifications");
        }
      } catch (error) {
        console.error("[Push] Error in initPush:", error);
      }
    };

    initPush();
  }, [session?.user?.id]);

  // This component doesn't render anything
  return null;
}

