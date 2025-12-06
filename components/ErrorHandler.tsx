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
      const errorString = String(error);

      // Suppress known non-critical errors from browser extensions
      if (
        typeof errorMessage === "string" &&
        (errorMessage.includes("message channel closed") ||
          errorMessage.includes("listener indicated an asynchronous response") ||
          errorMessage.includes("Extension context invalidated") ||
          errorMessage.includes("message port closed") ||
          errorString.includes("message channel closed") ||
          errorString.includes("listener indicated an asynchronous response") ||
          errorString.includes("Extension context invalidated"))
      ) {
        // Suppress these errors - they're from browser extensions and not critical
        event.preventDefault();
        event.stopPropagation();
        return false;
      }

      // Log other errors normally
      console.error("Unhandled promise rejection:", error);
    };

    // Handle general errors
    const handleError = (event: ErrorEvent) => {
      const errorMessage = event.message || String(event.error);
      const errorString = String(event.error || "");

      // Suppress known non-critical errors from browser extensions
      if (
        typeof errorMessage === "string" &&
        (errorMessage.includes("message channel closed") ||
          errorMessage.includes("listener indicated an asynchronous response") ||
          errorMessage.includes("Extension context invalidated") ||
          errorMessage.includes("message port closed") ||
          errorString.includes("message channel closed") ||
          errorString.includes("listener indicated an asynchronous response") ||
          errorString.includes("Extension context invalidated"))
      ) {
        // Suppress these errors - they're from browser extensions and not critical
        event.preventDefault();
        event.stopPropagation();
        return false;
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
        try {
          // Try to respond to extension messages to prevent channel closure errors
          if (event.ports && event.ports.length > 0) {
            event.ports[0]?.postMessage({ success: true });
          }
        } catch (e) {
          // Ignore errors when responding to extension messages
        }
        return;
      }
    };

    // Override console.error to filter out extension-related errors
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      const errorString = args.map(arg => String(arg)).join(" ");
      if (
        errorString.includes("message channel closed") ||
        errorString.includes("listener indicated an asynchronous response") ||
        errorString.includes("Extension context invalidated") ||
        errorString.includes("message port closed")
      ) {
        // Suppress these errors in console
        return;
      }
      originalConsoleError.apply(console, args);
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection, true);
    window.addEventListener("error", handleError, true);
    window.addEventListener("message", handleMessage, true);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection, true);
      window.removeEventListener("error", handleError, true);
      window.removeEventListener("message", handleMessage, true);
      console.error = originalConsoleError;
    };
  }, []);

  return null;
}

