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

      // Suppress known non-critical errors from browser extensions and React hydration
      if (
        typeof errorMessage === "string" &&
        (errorMessage.includes("message channel closed") ||
          errorMessage.includes("listener indicated an asynchronous response") ||
          errorMessage.includes("Extension context invalidated") ||
          errorMessage.includes("message port closed") ||
          errorMessage.includes("Minified React error #418") ||
          errorMessage.includes("Minified React error #423") ||
          errorMessage.includes("Minified React error #425") ||
          errorMessage.includes("Hydration failed") ||
          errorString.includes("message channel closed") ||
          errorString.includes("listener indicated an asynchronous response") ||
          errorString.includes("Extension context invalidated") ||
          errorString.includes("Minified React error"))
      ) {
        // Suppress these errors - they're non-critical
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

      // Suppress known non-critical errors from browser extensions and React hydration
      if (
        typeof errorMessage === "string" &&
        (errorMessage.includes("message channel closed") ||
          errorMessage.includes("listener indicated an asynchronous response") ||
          errorMessage.includes("Extension context invalidated") ||
          errorMessage.includes("message port closed") ||
          errorMessage.includes("Minified React error #418") ||
          errorMessage.includes("Minified React error #423") ||
          errorMessage.includes("Minified React error #425") ||
          errorMessage.includes("Hydration failed") ||
          errorString.includes("message channel closed") ||
          errorString.includes("listener indicated an asynchronous response") ||
          errorString.includes("Extension context invalidated") ||
          errorString.includes("Minified React error"))
      ) {
        // Suppress these errors - they're non-critical
        event.preventDefault();
        event.stopPropagation();
        return false;
      }

      // Log other errors normally (only if error exists)
      if (event.error !== undefined && event.error !== null) {
        console.error("Global error:", event.error);
      }
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
    console.error = function(...args: any[]) {
      try {
        // Quick check: if no arguments or all empty, skip
        if (!args || args.length === 0) return;
        
        // Try to convert to string for filtering
        let errorString = '';
        try {
          errorString = args.map(arg => {
            if (arg === undefined || arg === null) return '';
            try {
              return String(arg);
            } catch {
              return '';
            }
          }).join(" ");
        } catch {
          // If mapping fails, just skip this error
          return;
        }
        
        // Check if this is an error we want to suppress
        // Suppress extension errors and React hydration errors (#418, #423, #425)
        if (
          errorString &&
          (
            errorString.includes("message channel closed") ||
            errorString.includes("listener indicated an asynchronous response") ||
            errorString.includes("Extension context invalidated") ||
            errorString.includes("message port closed") ||
            (errorString.includes("extension") && errorString.includes("undefined")) ||
            // Suppress React hydration errors - these are cosmetic and don't break functionality
            errorString.includes("Minified React error #418") ||
            errorString.includes("Minified React error #423") ||
            errorString.includes("Minified React error #425") ||
            errorString.includes("Hydration failed") ||
            errorString.includes("hydrating the entire root") ||
            // React dev: предупреждение о key не должно ронять dev-overlay из‑за перехвата console.error
            errorString.includes('Each child in a list should have a unique "key" prop') ||
            errorString.includes("unique \"key\" prop")
          )
        ) {
          // Suppress these errors in console
          return;
        }
        
        // Call original console.error safely
        try {
          originalConsoleError.apply(console, args);
        } catch {
          // If that fails, nothing we can do
        }
      } catch {
        // Catch all - prevent any error in error handler
      }
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

