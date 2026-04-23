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

⏱ Код действителен 10 минут
⚠️ Никому не сообщайте этот код
  `.trim();

  return sendMaxMessage(maxId, message);
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

/**
 * Отправляет пользователю в MAX ссылку для входа (как в Telegram).
 * Ссылка одноразовая, действительна 10 минут.
 */
export async function sendMaxLoginLink(
  maxChatId: string,
  loginUrl: string,
  firstName?: string
): Promise<MaxSendMessageResult> {
  const name = firstName ? `, ${firstName}` : "";
  const message = `
🔐 Вход в МойСоюз${name}

Нажмите ссылку ниже для входа в личный кабинет:

${loginUrl}

⏱ Ссылка действительна 10 минут
  `.trim();

  return sendMaxMessage(maxChatId, message);
}

