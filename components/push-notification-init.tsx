"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { syncPushSubscription } from "@/lib/push-notifications";

/**
 * Component to initialize push notifications on app load
 * Should be placed in a layout that wraps the entire app
 */
export default function PushNotificationInit() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user?.id) {
      console.log("[OneSignal] No session, skipping sync");
      return;
    }

    console.log("[OneSignal] Session ready, syncing push subscription...");

    // Initial sync
    syncPushSubscription();

    // Periodic sync every 30 seconds
    const intervalId = setInterval(() => {
      console.log("[OneSignal] Periodic sync...");
      syncPushSubscription();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [session?.user?.id]);

  return null;
}

