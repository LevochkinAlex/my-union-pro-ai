"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

/**
 * Component to initialize Firebase Cloud Messaging on app load
 * Firebase загружается лениво только для авторизованных пользователей
 */
export default function FirebasePushInit() {
  const { data: session } = useSession();
  const firebaseLoadedRef = useRef(false);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!session?.user?.id || firebaseLoadedRef.current) {
      return;
    }

    // Ленивая загрузка Firebase
    const initFirebase = async () => {
      try {
        firebaseLoadedRef.current = true;
        if (process.env.NODE_ENV === 'development') console.log("[Firebase] Session ready, loading Firebase...");
        
        const { syncPushSubscription, setupForegroundMessageHandler } = await import("@/lib/firebase-push-notifications");

        // Setup foreground message handler
        setupForegroundMessageHandler().catch((error: any) => {
          const errorMessage = error?.message || String(error);
          if (
            typeof errorMessage === "string" &&
            (errorMessage.includes("message channel closed") ||
              errorMessage.includes("listener indicated an asynchronous response") ||
              errorMessage.includes("Extension context invalidated"))
          ) {
            return;
          }
          console.error("[Firebase] Error setting up message handler:", error);
        });

        // Check notification permission
        if (typeof window !== "undefined" && "Notification" in window) {
          const permission = Notification.permission;
          if (process.env.NODE_ENV === 'development') console.log("[Firebase] Notification permission:", permission);
          if (permission === "granted") {
            if (process.env.NODE_ENV === 'development') console.log("[Firebase] Notifications allowed");
            setTimeout(() => {
              syncPushSubscription().catch((error: any) => {
                const errorMessage = error?.message || String(error);
                if (
                  typeof errorMessage === "string" &&
                  (errorMessage.includes("message channel closed") ||
                    errorMessage.includes("listener indicated an asynchronous response") ||
                    errorMessage.includes("Extension context invalidated"))
                ) {
                  return;
                }
                console.warn("[Firebase] Sync error (non-critical):", error);
              });
            }, 2000);
          } else if (permission === "default" && process.env.NODE_ENV === 'development') {
            console.log("[Firebase] Notification permission not requested yet");
          } else if (permission !== "default" && process.env.NODE_ENV === 'development') {
            console.log("[Firebase] Notifications blocked");
          }
        }

        // Periodic sync every 60 seconds
        intervalIdRef.current = setInterval(() => {
          syncPushSubscription().catch((error: any) => {
            const errorMessage = error?.message || String(error);
            if (
              typeof errorMessage === "string" &&
              (errorMessage.includes("message channel closed") ||
                errorMessage.includes("listener indicated an asynchronous response") ||
                errorMessage.includes("Extension context invalidated"))
            ) {
              return;
            }
            console.warn("[Firebase] Periodic sync error (non-critical):", error);
          });
        }, 60000);

      } catch (error) {
        console.error("[Firebase] Failed to load Firebase module:", error);
        firebaseLoadedRef.current = false;
      }
    };

    // Задержка загрузки Firebase на 3 секунды после загрузки страницы
    const timeoutId = setTimeout(() => {
      initFirebase();
    }, 3000);

    return () => {
      clearTimeout(timeoutId);
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
    };
  }, [session?.user?.id]);

  return null;
}
