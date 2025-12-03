"use client";

import { useEffect } from "react";

/**
 * Global error handler component
 * Suppresses non-critical errors from browser extensions and message channels
 */
export default function ErrorHandler() {
  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      const errorMessage = error?.message || String(error);

      // Suppress known non-critical errors from browser extensions
      if (
        typeof errorMessage === "string" &&
        (errorMessage.includes("message channel closed") ||
          errorMessage.includes("listener indicated an asynchronous response") ||
          errorMessage.includes("Extension context invalidated"))
      ) {
        // Suppress these errors - they're from browser extensions and not critical
        event.preventDefault();
        return;
      }

      // Log other errors normally
      console.error("Unhandled promise rejection:", error);
    };

    // Handle general errors
    const handleError = (event: ErrorEvent) => {
      const errorMessage = event.message || String(event.error);

      // Suppress known non-critical errors from browser extensions
      if (
        typeof errorMessage === "string" &&
        (errorMessage.includes("message channel closed") ||
          errorMessage.includes("listener indicated an asynchronous response") ||
          errorMessage.includes("Extension context invalidated"))
      ) {
        // Suppress these errors - they're from browser extensions and not critical
        event.preventDefault();
        return;
      }

      // Log other errors normally
      console.error("Global error:", event.error);
    };

    // Handle message events from browser extensions
    // This helps prevent "message channel closed" errors
    const handleMessage = (event: MessageEvent) => {
      // Silently handle messages from browser extensions
      // These are typically from extensions trying to communicate with the page
      if (event.source !== window) {
        // Extension messages - no action needed, just prevent errors
        return;
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);
    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}

