// Firebase Admin SDK initialization for server-side
//
// Используется только для FCM push-уведомлений (web/mobile).
// НЕ FIrestore / Auth / Storage.
//
// ВНИМАНИЕ: Всё берётся из env. Hardcoded приватные ключи, закоммиченные
// JSON-ключи и прочее — НЕ ДОПУСКАЮТСЯ. Любой попавший в git приватный ключ
// должен немедленно ротироваться в Google Cloud Console / Firebase.
//
// Ожидаемые env:
//   FIREBASE_PROJECT_ID       (опционально, по умолчанию "myunion-c3187")
//   FIREBASE_CLIENT_EMAIL     (обязательно)
//   FIREBASE_PRIVATE_KEY      (обязательно, допускается экранирование \n)
//
// Если переменные не заданы, модуль не инициализирует Firebase, а отправка
// push становится no-op (с warning в логах). Это нужно для локальной
// разработки без секретов и чтобы не ронять весь процесс из-за отсутствия FCM.

import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildCredentials(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const projectId = readEnv("FIREBASE_PROJECT_ID") ?? "myunion-c3187";
  const clientEmail = readEnv("FIREBASE_CLIENT_EMAIL");
  const privateKeyRaw = readEnv("FIREBASE_PRIVATE_KEY");

  if (!clientEmail || !privateKeyRaw) {
    return null;
  }

  // В .env ключ хранится с экранированными переводами строк: "-----BEGIN...\\n..."
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  return { projectId, clientEmail, privateKey };
}

let app: App | null = null;
let messagingInstance: Messaging | null = null;
let initWarned = false;

function getApp(): App | null {
  if (app) return app;

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }

  const creds = buildCredentials();
  if (!creds) {
    if (!initWarned) {
      console.warn(
        "[Firebase Admin] ⚠️ FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY не заданы — FCM push отключены",
      );
      initWarned = true;
    }
    return null;
  }

  try {
    app = initializeApp({
      credential: cert({
        projectId: creds.projectId,
        clientEmail: creds.clientEmail,
        privateKey: creds.privateKey,
      }),
      projectId: creds.projectId,
    });
    console.log("[Firebase Admin] ✅ Initialized (projectId:", creds.projectId + ")");
    return app;
  } catch (error) {
    console.error("[Firebase Admin] ❌ Initialization error:", error);
    return null;
  }
}

/**
 * Возвращает Messaging или null, если Firebase не сконфигурирован.
 * Все вызывающие места должны проверять на null и деградировать плавно.
 */
export function getMessagingOrNull(): Messaging | null {
  if (messagingInstance) return messagingInstance;
  const a = getApp();
  if (!a) return null;
  try {
    messagingInstance = getMessaging(a);
    return messagingInstance;
  } catch (error) {
    console.error("[Firebase Admin] getMessaging() error:", error);
    return null;
  }
}

/**
 * Обратная совместимость: `messaging` как Messaging-прокси.
 * При отсутствии конфигурации все методы no-op и возвращают пустые результаты.
 * Это позволяет не переписывать все 4 вызывающих модуля разом.
 */
function createMessagingProxy(): Messaging {
  const noopResponse = () => ({
    responses: [] as unknown[],
    successCount: 0,
    failureCount: 0,
  });
  // Прокси: методы проверяют реальный messaging, иначе деградируют
  return new Proxy({} as Messaging, {
    get(_target, prop: string | symbol) {
      const m = getMessagingOrNull();
      if (m) {
        const value = (m as unknown as Record<string | symbol, unknown>)[prop];
        if (typeof value === "function") return (value as (...args: unknown[]) => unknown).bind(m);
        return value;
      }
      // Возвращаем безопасные заглушки для наиболее часто вызываемых методов.
      if (prop === "send") {
        return async () => {
          console.warn("[Firebase Admin] send(): FCM disabled, noop");
          return "";
        };
      }
      if (prop === "sendEachForMulticast" || prop === "sendMulticast") {
        return async () => {
          console.warn(`[Firebase Admin] ${String(prop)}(): FCM disabled, noop`);
          return noopResponse();
        };
      }
      return undefined;
    },
  });
}

export const messaging: Messaging = createMessagingProxy();
