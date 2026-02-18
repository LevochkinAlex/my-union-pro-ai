/**
 * Валидация initData мини-приложения MAX и извлечение данных пользователя.
 * Документация: https://dev.max.ru/docs/webapps/validation
 */

import crypto from "crypto";

const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;

export interface MaxWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string | null;
  language_code?: string;
  photo_url?: string | null;
}

export interface MaxInitDataParsed {
  query_id?: string;
  auth_date: number;
  hash: string;
  user?: MaxWebAppUser;
  start_param?: string;
}

/**
 * Парсит строку initData (URL-encoded) в объект. Не проверяет подпись.
 */
function parseInitData(initData: string): Record<string, string> {
  const params = new URLSearchParams(initData);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Строит data_check_string для валидации: исключаем hash, сортируем по ключу,
 * формат key=value, разделитель \n. Значения уже в decoded виде (URLSearchParams даёт decoded).
 */
function buildDataCheckString(params: Record<string, string>): string {
  const { hash: _hash, ...rest } = params;
  const sorted = Object.keys(rest).sort();
  return sorted.map((key) => `${key}=${rest[key]}`).join("\n");
}

/**
 * Проверяет подпись initData по алгоритму MAX:
 * 1. secret_key = HMAC-SHA256(key: "WebAppData", data: Bot Token)
 * 2. computed_hash = HMAC-SHA256(key: secret_key, data: data_check_string)
 * 3. Сравниваем computed_hash с hash из initData
 */
function validateInitDataSignature(initData: string): boolean {
  if (!MAX_BOT_TOKEN) {
    console.error("[MAX WebApp Auth] MAX_BOT_TOKEN не установлен");
    return false;
  }

  const params = parseInitData(initData);
  const receivedHash = params.hash;
  if (!receivedHash) return false;

  const dataCheckString = buildDataCheckString(params);
  // secret_key: HMAC-SHA256 с ключом "WebAppData" и данными = токен бота
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(MAX_BOT_TOKEN)
    .digest();
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (receivedHash.length !== computedHash.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(receivedHash, "hex"),
    Buffer.from(computedHash, "hex")
  );
}

/**
 * Проверяет, что auth_date не старше 24 часов.
 */
function isAuthDateFresh(authDateMs: number): boolean {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 часа
  return now - authDateMs < maxAge;
}

/**
 * Валидирует initData и возвращает распарсенные данные пользователя или null.
 */
export function validateAndParseInitData(initData: string): MaxInitDataParsed | null {
  if (!initData || typeof initData !== "string") return null;

  if (!validateInitDataSignature(initData)) {
    console.warn("[MAX WebApp Auth] Неверная подпись initData");
    return null;
  }

  const params = parseInitData(initData);
  const authDate = params.auth_date ? parseInt(params.auth_date, 10) : NaN;
  if (!Number.isFinite(authDate) || !isAuthDateFresh(authDate)) {
    console.warn("[MAX WebApp Auth] auth_date отсутствует или устарел");
    return null;
  }

  let user: MaxWebAppUser | undefined;
  if (params.user) {
    try {
      user = JSON.parse(params.user) as MaxWebAppUser;
      if (typeof user.id !== "number") user = undefined;
    } catch {
      user = undefined;
    }
  }

  if (!user) {
    console.warn("[MAX WebApp Auth] Нет данных пользователя в initData");
    return null;
  }

  return {
    query_id: params.query_id,
    auth_date: authDate,
    hash: params.hash,
    user,
    start_param: params.start_param,
  };
}
