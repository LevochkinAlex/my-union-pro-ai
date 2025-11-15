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

    // Initial sync
    syncPushSubscription();

    // Periodic sync every 60 seconds
    const intervalId = setInterval(() => {
      console.log("[OneSignal] Periodic sync...");
      syncPushSubscription();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [session?.user?.id]);

  return null;
}
