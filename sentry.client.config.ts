import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
  
  // Only send errors in production
  environment: process.env.NODE_ENV || "development",
  
  // Filter out sensitive data
  beforeSend(event, hint) {
    // Don't send events if DSN is not configured
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null;
    }
    
    // Filter out localhost errors in production
    if (process.env.NODE_ENV === "production" && event.request?.url?.includes("localhost")) {
      return null;
    }
    
    return event;
  },
  
  // Ignore certain errors
  ignoreErrors: [
    // Browser extensions
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
    // Network errors
    "NetworkError",
    "Failed to fetch",
  ],
});

