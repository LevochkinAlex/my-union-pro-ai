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
      // Не логируем как ошибку - это нормальное состояние для неавторизованных пользователей
      return;
    }

    console.log("[Firebase] Session ready, initializing FCM...");

    // Setup foreground message handler (async)
    setupForegroundMessageHandler().catch((error: any) => {
      // Suppress known non-critical errors from browser extensions
      const errorMessage = error?.message || String(error);
      if (
        typeof errorMessage === "string" &&
        (errorMessage.includes("message channel closed") ||
          errorMessage.includes("listener indicated an asynchronous response") ||
          errorMessage.includes("Extension context invalidated"))
      ) {
        // Suppress these errors - they're from browser extensions
        return;
      }
      console.error("[Firebase] Error setting up message handler:", error);
    });

    // Check notification permission
    const checkPermission = async () => {
      if (typeof window !== "undefined" && "Notification" in window) {
        const permission = Notification.permission;
        console.log("[Firebase] Browser notification permission:", permission);

        if (permission === "granted") {
          console.log("[Firebase] ✅ Notifications are allowed");
          // Sync subscription after a delay to ensure Firebase is initialized
          setTimeout(() => {
            syncPushSubscription().catch((error: any) => {
              // Suppress known non-critical errors from browser extensions
              const errorMessage = error?.message || String(error);
              if (
                typeof errorMessage === "string" &&
                (errorMessage.includes("message channel closed") ||
                  errorMessage.includes("listener indicated an asynchronous response") ||
                  errorMessage.includes("Extension context invalidated"))
              ) {
                // Suppress these errors - they're from browser extensions
                return;
              }
              console.warn("[Firebase] Sync error (non-critical):", error);
            });
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
      syncPushSubscription().catch((error: any) => {
        // Suppress known non-critical errors from browser extensions
        const errorMessage = error?.message || String(error);
        if (
          typeof errorMessage === "string" &&
          (errorMessage.includes("message channel closed") ||
            errorMessage.includes("listener indicated an asynchronous response") ||
            errorMessage.includes("Extension context invalidated"))
        ) {
          // Suppress these errors - they're from browser extensions
          return;
        }
        console.warn("[Firebase] Periodic sync error (non-critical):", error);
      });
    }, 60000);

    return () => clearInterval(intervalId);
  }, [session?.user?.id]);

  return null;
}

