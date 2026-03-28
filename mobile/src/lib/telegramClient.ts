import Constants from "expo-constants";
import { Linking, Platform } from "react-native";

/** Схема официального клиента Telegram (для проверки установки). */
const TG_APP_SCHEME = "tg://";

/**
 * Проверяет, установлен ли клиент Telegram.
 * На iOS нужен `LSApplicationQueriesSchemes: ["tg"]` в app.json.
 * На Android 11+ — блок `queries` с intent для схемы `tg`.
 *
 * В **Expo Go** `canOpenURL(tg://)` почти всегда недоступен (ограничения хост-приложения),
 * поэтому там проверку не делаем — иначе ложно показывали бы «установите Telegram».
 */
export async function isTelegramClientInstalled(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  if (Constants.appOwnership === "expo") return true;
  try {
    return await Linking.canOpenURL(TG_APP_SCHEME);
  } catch {
    return false;
  }
}

export function getTelegramStoreUrl(): string {
  if (Platform.OS === "ios") {
    return "https://apps.apple.com/app/telegram-messenger/id686449807";
  }
  return "https://play.google.com/store/apps/details?id=org.telegram.messenger";
}
