import { appConfig } from "../config/appConfig";
import type { ChatMessageItem, MobileChat } from "../types/chat";

export type MobileAuthUser = {
  id: string;
  email: string | null;
  role: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

export type MobileAuthSuccess = {
  accessToken: string;
  user: MobileAuthUser;
};

const authJson = (accessToken: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${accessToken}`,
});

async function fetchJson(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Network request failed/i.test(message)) {
      throw new Error(
        `Нет соединения с API (${appConfig.apiBaseUrl}). Проверьте, что сервер запущен и телефон в той же сети.`,
      );
    }
    throw error instanceof Error ? error : new Error(message);
  }
}

export async function getHealthStatus() {
  const response = await fetchJson(`${appConfig.apiBaseUrl}/api/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
}

export async function getChats(accessToken: string, options?: { bypassCache?: boolean }) {
  const params = new URLSearchParams();
  params.set("includeAI", "true");
  if (options?.bypassCache) params.set("bypassCache", "1");
  const response = await fetchJson(`${appConfig.apiBaseUrl}/api/chat?${params.toString()}`, {
    headers: authJson(accessToken),
  });

  if (!response.ok) {
    throw new Error(`Chats fetch failed: ${response.status}`);
  }

  return response.json() as Promise<{ chats: MobileChat[] }>;
}

export async function getViewMode(accessToken: string) {
  const response = await fetchJson(`${appConfig.apiBaseUrl}/api/user/view-mode`, {
    headers: authJson(accessToken),
  });
  if (!response.ok) {
    throw new Error(`View mode fetch failed: ${response.status}`);
  }
  return response.json() as Promise<{
    currentMode?: string;
    viewMode?: string;
    availableModes?: unknown[];
    canSwitch?: boolean;
  }>;
}

export async function mobileLogin(email: string, password: string) {
  const response = await fetchJson(`${appConfig.apiBaseUrl}/api/mobile/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorPayload.error || `Login failed: ${response.status}`);
  }

  return response.json() as Promise<MobileAuthSuccess>;
}

/** Как на сайте: письмо со ссылкой для входа (без пароля). */
export async function sendEmailMagicLink(email: string) {
  const response = await fetchJson(`${appConfig.apiBaseUrl}/api/auth/email/send-magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    devMode?: boolean;
    magicLink?: string;
  };
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Ошибка: ${response.status}`);
  }
  return data;
}

/** Сессия входа через бота: открыть https://t.me/BOT?start=app_<key> */
export async function startBotAppLoginSession(options?: { expoHost?: string | null }): Promise<{ botUrl: string }> {
  const response = await fetchJson(`${appConfig.apiBaseUrl}/api/mobile/auth/bot-login/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expoHost: options?.expoHost ?? null }),
  });
  const data = (await response.json().catch(() => ({}))) as { botUrl?: string; error?: string };
  if (!response.ok || !data.botUrl) {
    throw new Error(data.error || `Ошибка: ${response.status}`);
  }
  return { botUrl: data.botUrl };
}

/** Одноразовый token из ссылки в письме → JWT приложения. */
export async function exchangeMagicLinkToken(token: string): Promise<MobileAuthSuccess> {
  const response = await fetchJson(`${appConfig.apiBaseUrl}/api/mobile/auth/exchange-login-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.trim() }),
  });
  const data = (await response.json().catch(() => ({}))) as MobileAuthSuccess & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Ошибка: ${response.status}`);
  }
  if (!data.accessToken || !data.user) {
    throw new Error("Некорректный ответ сервера");
  }
  return data;
}

/**
 * URL виджета Telegram. `origin` должен совпадать с доменом в BotFather (/setdomain), только HTTPS.
 */
export function buildTelegramOAuthUrl(appRedirectUri: string, schemeFallback = "myunion"): string {
  const origin = appConfig.telegramLoginOrigin;
  if (!origin) {
    throw new Error("TELEGRAM_ORIGIN_NOT_CONFIGURED");
  }
  const returnTo = `${origin}/telegram-app-bridge?scheme=${encodeURIComponent(
    schemeFallback,
  )}&redirect=${encodeURIComponent(appRedirectUri)}`;
  return `https://oauth.telegram.org/auth?bot_id=${appConfig.telegramBotId}&origin=${encodeURIComponent(
    origin,
  )}&return_to=${encodeURIComponent(returnTo)}`;
}

/** Достаёт token из текста ссылки или из вставленной строки целиком. */
export function extractTokenFromEmailLink(input: string): string | null {
  const s = input.trim();
  const m = s.match(/(?:[?&#]token=)([a-f0-9]+)/i);
  if (m) return m[1];
  if (/^[a-f0-9]{40,128}$/i.test(s)) return s;
  return null;
}

export async function getChatThread(accessToken: string, chatId: string, limit = 80) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  const response = await fetchJson(`${appConfig.apiBaseUrl}/api/chat/${chatId}?${params.toString()}`, {
    headers: authJson(accessToken),
  });

  if (!response.ok) {
    throw new Error(`Messages fetch failed: ${response.status}`);
  }

  return response.json() as Promise<{ messages: ChatMessageItem[]; chat: unknown }>;
}
