/** Публичные ссылки для страниц входа/регистрации (клиент и сервер). */

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "myunionpro_bot";

export const TELEGRAM_LOGIN_HELP_URL = `https://t.me/${TELEGRAM_BOT}?start=login_issue`;
