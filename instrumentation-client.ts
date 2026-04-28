/**
 * Клиентская инициализация Sentry (Next.js 16+ / Turbopack).
 * Замена legacy `sentry.client.config.ts`.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  enableLogs: true,

  debug: false,

  environment: process.env.NODE_ENV || "development",

  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],

  beforeSend(event, hint) {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null;
    }

    if (process.env.NODE_ENV === "production" && event.request?.url?.includes("localhost")) {
      return null;
    }

    return event;
  },

  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
    "NetworkError",
    "Failed to fetch",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
