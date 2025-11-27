/**
 * MAX Messenger Bot API для отправки 2FA PIN-кодов
 * Официальная библиотека: https://github.com/max-messenger/max-bot-api-client-ts
 * Документация: https://github.com/max-messenger/max-bot-api-client-ts/tree/main/docs
 */

const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;
const MAX_API_BASE = "https://bot.max.ru/api";

export interface MaxSendMessageResult {
  success: boolean;
  error?: string;
  details?: unknown;
  messageId?: string;
}

/**
 * Отправляет текстовое сообщение через MAX Bot API
 * @param maxChatId - Chat ID пользователя в MAX
 * @param text - Текст сообщения
 */
async function sendMaxMessage(
  maxChatId: string,
  text: string
): Promise<MaxSendMessageResult> {
  if (!MAX_BOT_TOKEN) {
    console.error("[MAX Messenger] MAX_BOT_TOKEN не установлен в .env.local");
    return {
      success: false,
      error: "MAX Bot Token не настроен",
    };
  }

  const url = `${MAX_API_BASE}/sendMessage`;

  try {
    console.log("[MAX Messenger] Отправка сообщения на chat_id:", maxChatId);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MAX_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: maxChatId,
        text: text,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error("[MAX Messenger] Ошибка API:", data);
      return {
        success: false,
        error: data.description || data.message || "Ошибка MAX Bot API",
        details: data,
      };
    }

    console.log("[MAX Messenger] Сообщение успешно отправлено:", data.result?.message_id);

    return {
      success: true,
      messageId: data.result?.message_id,
    };
  } catch (error) {
    console.error("[MAX Messenger] Ошибка при отправке сообщения:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error,
    };
  }
}

/**
 * Отправляет PIN-код через MAX Messenger
 * @param maxId - ID пользователя в MAX (телефон в формате 79XXXXXXXXX)
 * @param pinCode - 4-значный PIN-код
 */
export async function sendPINViaMax(
  maxId: string,
  pinCode: string
): Promise<MaxSendMessageResult> {
  const message = `
🔐 Код для входа в МойСоюз

Ваш код подтверждения: ${pinCode}

⏱ Код действителен 5 минут
⚠️ Никому не сообщайте этот код
  `.trim();

  return sendMaxMessage(maxId, message);
}

/**
 * Получает информацию о MAX боте (для проверки токена)
 */
export async function getMaxBotInfo() {
  if (!MAX_BOT_TOKEN) {
    return {
      success: false,
      error: "MAX_BOT_TOKEN не настроен",
    };
  }

  const url = `${MAX_API_BASE}/getMe`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${MAX_BOT_TOKEN}`,
      },
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      return {
        success: false,
        error: data.description || "Ошибка MAX Bot API",
        details: data,
      };
    }

    return {
      success: true,
      bot: data.result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Валидирует MAX Chat ID (должен быть строкой)
 */
export function validateMaxChatId(chatId: string | undefined): boolean {
  if (!chatId) return false;
  // MAX Chat ID - это строка (может быть числовым ID или username)
  return typeof chatId === "string" && chatId.length > 0;
}

/**
 * Отправляет приветственное сообщение при первой привязке MAX
 */
export async function sendMaxWelcomeMessage(maxId: string): Promise<MaxSendMessageResult> {
  const message = `
👋 Добро пожаловать в МойСоюз!

Ваш MAX Messenger успешно привязан к аккаунту.

Теперь вы будете получать коды для входа прямо сюда 🚀

Это сообщение отправлено автоматически
  `.trim();

  return sendMaxMessage(maxId, message);
}

