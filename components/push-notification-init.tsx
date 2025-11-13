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
      return;
    }

    const initPush = async () => {
      const initialized = await initializePushNotifications();

      if (initialized) {
        // Sync subscription after a small delay to ensure OneSignal is ready
        setTimeout(() => {
          syncPushSubscription();
        }, 1000);
      }
    };

    initPush();
  }, [session?.user?.id]);

  // This component doesn't render anything
  return null;
}

