import Constants from "expo-constants";
import { Platform } from "react-native";

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

function getExpoHostFromManifest(): string | null {
  const cfg = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
    manifest?: { debuggerHost?: string };
  };
  const hostWithPort =
    cfg.expoConfig?.hostUri ||
    cfg.manifest2?.extra?.expoGo?.debuggerHost ||
    cfg.manifest?.debuggerHost ||
    "";
  const host = hostWithPort.split(":")[0]?.trim();
  return host || null;
}

function resolveUrlForDevice(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const isLocalhost = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (!isLocalhost || Platform.OS === "web") return rawUrl;
    const host = getExpoHostFromManifest();
    if (!host) return rawUrl;
    u.hostname = host;
    return u.toString().replace(/\/$/, "");
  } catch {
    return rawUrl;
  }
}

const rawApiBaseUrl = extra.apiBaseUrl || "http://localhost:3004";
const apiBaseUrl = resolveUrlForDevice(rawApiBaseUrl);
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
