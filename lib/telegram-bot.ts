/**
 * Telegram Bot для отправки 2FA PIN-кодов
 * Документация: https://core.telegram.org/bots/api
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface SendMessageResult {
  success: boolean;
  error?: string;
  details?: unknown;
  messageId?: number;
}

/**
 * Inline кнопка для Telegram
 */
export interface InlineButton {
  text: string;
  url: string;
}

/**
 * Отправляет сообщение через Telegram Bot API
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  inlineButtons?: InlineButton[][]
): Promise<SendMessageResult> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("[Telegram Bot] TELEGRAM_BOT_TOKEN не установлен в .env.local");
    return {
      success: false,
      error: "TELEGRAM_BOT_TOKEN не настроен",
    };
  }

  const url = `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    console.log("[Telegram Bot] Отправка сообщения на chat_id:", chatId);

    const payload: {
      chat_id: string;
      text: string;
      parse_mode: string;
      reply_markup?: { inline_keyboard: InlineButton[][] };
    } = {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
    };

    // Добавляем Inline кнопки, если они есть
    if (inlineButtons && inlineButtons.length > 0) {
      payload.reply_markup = {
        inline_keyboard: inlineButtons,
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error("[Telegram Bot] Ошибка API:", data);
      return {
        success: false,
        error: data.description || "Ошибка Telegram API",
        details: data,
      };
    }

    console.log("[Telegram Bot] Сообщение успешно отправлено:", data.result.message_id);

    return {
      success: true,
      messageId: data.result.message_id,
    };
  } catch (error) {
    console.error("[Telegram Bot] Ошибка при отправке сообщения:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error,
    };
  }
}

/**
 * Отправляет PIN-код через Telegram
 */
export async function sendPINViaTelegram(
  chatId: string,
  pinCode: string
): Promise<SendMessageResult> {
  const message = `
🔐 <b>Код для входа в МойСоюз</b>

Ваш код подтверждения: <code>${pinCode}</code>

⏱ Код действителен 5 минут
⚠️ Никому не сообщайте этот код
  `.trim();

  return sendTelegramMessage(chatId, message);
}

/**
 * Получает информацию о боте (для проверки токена)
 */
export async function getBotInfo() {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: "TELEGRAM_BOT_TOKEN не настроен",
    };
  }

  const url = `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/getMe`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      return {
        success: false,
        error: data.description || "Ошибка Telegram API",
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
 * Валидирует chat_id (должен быть числом)
 */
export function validateChatId(chatId: string | undefined): boolean {
  if (!chatId) return false;
  return /^\d+$/.test(chatId);
}

/**
 * Отправляет приветственное сообщение при первом подключении
 */
export async function sendWelcomeMessage(chatId: string): Promise<SendMessageResult> {
  const message = `
👋 <b>Добро пожаловать в МойСоюз!</b>

Ваш Telegram успешно привязан к аккаунту.

Теперь вы будете получать коды для входа прямо сюда 🚀

<i>Это сообщение отправлено автоматически</i>
  `.trim();

  return sendTelegramMessage(chatId, message);
}

/**
 * Отправляет приветствие новому пользователю с кнопкой для завершения регистрации
 */
export async function sendNewUserWelcome(
  chatId: string,
  loginToken: string,
  firstName?: string
): Promise<SendMessageResult> {
  const name = firstName ? `, ${firstName}` : "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
  const loginUrl = `${baseUrl}/api/auth/telegram/auto-login?token=${loginToken}`;

  const message = `
👋 <b>Добро пожаловать в МойСоюз${name}!</b>

Мы создали для вас аккаунт.

Нажмите кнопку ниже для завершения регистрации и заполнения профиля:

⏱ <i>Ссылка действительна 10 минут</i>
  `.trim();

  const buttons: InlineButton[][] = [
    [{ text: "🚀 Завершить регистрацию", url: loginUrl }],
  ];

  return sendTelegramMessage(chatId, message, buttons);
}

/**
 * Отправляет приветствие существующему пользователю с кнопкой для входа
 */
export async function sendReturningUserWelcome(
  chatId: string,
  loginToken: string,
  firstName?: string
): Promise<SendMessageResult> {
  const name = firstName ? `, ${firstName}` : "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
  const loginUrl = `${baseUrl}/api/auth/telegram/auto-login?token=${loginToken}`;

  const message = `
🎉 <b>Рад видеть вас снова${name}!</b>

Нажмите кнопку ниже для входа в личный кабинет:

⏱ <i>Ссылка действительна 10 минут</i>
  `.trim();

  const buttons: InlineButton[][] = [
    [{ text: "🔐 Войти в аккаунт", url: loginUrl }],
  ];

  return sendTelegramMessage(chatId, message, buttons);
}

/**
 * Отправляет сообщение техподдержки
 */
export async function sendSupportMessage(
  chatId: string,
  from?: { id?: number; username?: string; first_name?: string }
): Promise<SendMessageResult> {
  const userName = from?.first_name || from?.username || "Пользователь";
  
  const message = `
🆘 <b>Техподдержка МойСоюз</b>

Привет, ${userName}! 👋

Мы готовы помочь вам с любыми вопросами:
• Проблемы с входом и регистрацией
• Вопросы по использованию платформы
• Технические проблемы
• Другое

Просто напишите ваш вопрос, и мы ответим в ближайшее время.

<b>Часы работы:</b> Пн-Пт, 9:00-18:00 МСК

<i>Вы также можете написать на email: support@myunion.pro</i>
  `.trim();

  return sendTelegramMessage(chatId, message);
}

