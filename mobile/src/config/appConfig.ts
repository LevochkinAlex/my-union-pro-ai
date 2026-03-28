import Constants from "expo-constants";

type ExtraConfig = {
  apiBaseUrl?: string;
  socketUrl?: string;
  /** Публичный URL сайта (для подсказок). API может быть на другом хосте. */
  webAppUrl?: string;
  /**
   * HTTPS-оригин для Telegram Login Widget (тот же домен, что в BotFather → /setdomain).
   * Обязателен для «Войти через Telegram»: localhost и http:// Telegram не принимает.
   */
  telegramLoginOrigin?: string;
  telegramBotId?: string;
};

const extra = (Constants.expoConfig?.extra || {}) as ExtraConfig;

const apiBaseUrl = extra.apiBaseUrl || "http://localhost:3004";
const webAppUrl = extra.webAppUrl || apiBaseUrl;

function resolveTelegramLoginOrigin(): string | null {
  const explicit = extra.telegramLoginOrigin?.trim().replace(/\/$/, "");
  if (explicit) {
    if (!explicit.startsWith("https://")) return null;
    try {
      const host = new URL(explicit).hostname;
      if (host === "localhost" || host === "127.0.0.1") return null;
      return explicit;
    } catch {
      return null;
    }
  }
  const candidate = webAppUrl.replace(/\/$/, "");
  if (!candidate.startsWith("https://")) return null;
  try {
    const host = new URL(candidate).hostname;
    if (host === "localhost" || host === "127.0.0.1") return null;
    return candidate;
  } catch {
    return null;
  }
}

const telegramLoginOrigin = resolveTelegramLoginOrigin();

export const appConfig = {
  apiBaseUrl,
  socketUrl: extra.socketUrl || "http://localhost:3005",
  webAppUrl,
  /** null → виджет Telegram откроет «Bot domain invalid»; задайте telegramLoginOrigin в app.json */
  telegramLoginOrigin,
  telegramBotId: extra.telegramBotId || "8321416024",
};
