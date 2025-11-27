/**
 * SendPulse API для WhatsApp отправки
 * Документация: https://sendpulse.com/integrations/api/chatbot/whatsapp
 */

const SENDPULSE_USER_ID = process.env.SENDPULSE_USER_ID;
const SENDPULSE_SECRET = process.env.SENDPULSE_SECRET;
const SENDPULSE_WHATSAPP_BOT_ID = process.env.SENDPULSE_WHATSAPP_BOT_ID;
const SENDPULSE_API_BASE = "https://api.sendpulse.com";

interface SendPulseTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SendPulseResult {
  success: boolean;
  error?: string;
  details?: unknown;
  messageId?: string;
}

/**
 * Получение access token для SendPulse API
 */
async function getAccessToken(): Promise<string | null> {
  if (!SENDPULSE_USER_ID || !SENDPULSE_SECRET) {
    console.error("[SendPulse] Credentials не настроены");
    return null;
  }

  try {
    const response = await fetch(`${SENDPULSE_API_BASE}/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: SENDPULSE_USER_ID,
        client_secret: SENDPULSE_SECRET,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[SendPulse] Ошибка получения токена:", error);
      return null;
    }

    const data: SendPulseTokenResponse = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("[SendPulse] Исключение при получении токена:", error);
    return null;
  }
}

/**
 * Отправка WhatsApp сообщения через SendPulse с использованием authentication template
 * 
 * Для отправки PIN-кодов используется утвержденный authentication template
 * Документация: https://sendpulse.com/integrations/api/chatbot/whatsapp
 */
export async function sendPINViaWhatsApp(
  phone: string,
  pinCode: string
): Promise<SendPulseResult> {
  console.log("[SendPulse WhatsApp] 🚀 Начало отправки через SendPulse");
  console.log("[SendPulse WhatsApp] Проверка credentials:", {
    hasUserId: !!SENDPULSE_USER_ID,
    hasSecret: !!SENDPULSE_SECRET,
    hasBotId: !!SENDPULSE_WHATSAPP_BOT_ID,
    botId: SENDPULSE_WHATSAPP_BOT_ID,
  });

  if (!SENDPULSE_USER_ID || !SENDPULSE_SECRET) {
    console.error("[SendPulse WhatsApp] ❌ Credentials не настроены");
    return {
      success: false,
      error: "SendPulse credentials не настроены",
    };
  }

  const token = await getAccessToken();
  
  if (!token) {
    console.error("[SendPulse WhatsApp] ❌ Не удалось получить токен");
    return {
      success: false,
      error: "Не удалось получить токен SendPulse",
    };
  }

  console.log("[SendPulse WhatsApp] ✅ Токен получен");

  if (!SENDPULSE_WHATSAPP_BOT_ID) {
    console.error("[SendPulse WhatsApp] ❌ SENDPULSE_WHATSAPP_BOT_ID не настроен");
    return {
      success: false,
      error: "WhatsApp Bot ID не настроен",
    };
  }

  try {
    // Нормализуем номер (убираем +, пробелы, скобки, дефисы)
    const normalizedPhone = phone.replace(/[\s\+\-\(\)]/g, "");

    console.log("[SendPulse WhatsApp] Отправка authentication template");
    console.log("[SendPulse WhatsApp] Bot ID:", SENDPULSE_WHATSAPP_BOT_ID);
    console.log("[SendPulse WhatsApp] Номер:", normalizedPhone);
    console.log("[SendPulse WhatsApp] PIN-код:", pinCode);

    // Шаг 1: Найти или создать контакт
    console.log("[SendPulse WhatsApp] 🔍 Поиск контакта...");
    const searchResponse = await fetch(
      `${SENDPULSE_API_BASE}/whatsapp/contacts?bot_id=${SENDPULSE_WHATSAPP_BOT_ID}&phone=${normalizedPhone}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const searchData = await searchResponse.json();
    let contactId: string | null = null;

    if (searchResponse.ok && searchData.success && searchData.data && searchData.data.length > 0) {
      contactId = searchData.data[0].id;
      console.log("[SendPulse WhatsApp] ✅ Контакт найден, ID:", contactId);
    } else {
      // Попробуем создать контакт
      console.log("[SendPulse WhatsApp] 📝 Создание нового контакта...");
      const createResponse = await fetch(
        `${SENDPULSE_API_BASE}/whatsapp/contacts`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bot_id: SENDPULSE_WHATSAPP_BOT_ID,
            phone: normalizedPhone,
          }),
        }
      );

      const createData = await createResponse.json();
      if (createResponse.ok && createData.success && createData.data?.id) {
        contactId = createData.data.id;
        console.log("[SendPulse WhatsApp] ✅ Контакт создан, ID:", contactId);
      } else if (createData.errors?.phone?.includes("Contact already exists")) {
        // Контакт уже существует, попробуем найти еще раз
        console.log("[SendPulse WhatsApp] ⚠️ Контакт уже существует, повторный поиск...");
        const retrySearch = await fetch(
          `${SENDPULSE_API_BASE}/whatsapp/contacts?bot_id=${SENDPULSE_WHATSAPP_BOT_ID}&phone=${normalizedPhone}`,
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        const retryData = await retrySearch.json();
        if (retrySearch.ok && retryData.success && retryData.data && retryData.data.length > 0) {
          contactId = retryData.data[0].id;
          console.log("[SendPulse WhatsApp] ✅ Контакт найден после повторного поиска, ID:", contactId);
        }
      }
    }

    if (!contactId) {
      console.error("[SendPulse WhatsApp] ❌ Не удалось найти или создать контакт");
      return {
        success: false,
        error: "Не удалось найти или создать контакт в SendPulse",
        details: { searchData },
      };
    }

    // Шаг 2: Отправить шаблон используя contact_id
    console.log("[SendPulse WhatsApp] 📤 Отправка шаблона контакту:", contactId);
    const response = await fetch(
      `${SENDPULSE_API_BASE}/whatsapp/contacts/sendTemplate`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bot_id: SENDPULSE_WHATSAPP_BOT_ID,
          contact_id: contactId,
          template: {
            name: "sample_template", // Используем существующий шаблон из SendPulse
            language: {
              code: "en_US", // Язык шаблона
            },
            components: [
              {
                type: "BODY",
                parameters: [
                  {
                    type: "text",
                    text: pinCode, // OTP код
                  },
                ],
              },
            ],
          },
        }),
      }
    );

    const responseText = await response.text();
    console.log("[SendPulse WhatsApp] Статус ответа:", response.status, response.statusText);
    console.log("[SendPulse WhatsApp] Полный ответ (raw):", responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("[SendPulse WhatsApp] Ошибка парсинга JSON:", e);
      return {
        success: false,
        error: `Ошибка ответа от SendPulse: ${response.status} ${response.statusText}`,
        details: { rawResponse: responseText },
      };
    }

    console.log("[SendPulse WhatsApp] Распарсенный ответ:", JSON.stringify(data, null, 2));

    if (!response.ok || !data.success) {
      console.error("[SendPulse WhatsApp] ❌ Ошибка отправки template:", JSON.stringify(data, null, 2));
      
      // Более информативное сообщение об ошибке
      let errorMessage = "Ошибка отправки WhatsApp";
      if (data.errors) {
        const firstError = Object.values(data.errors)[0];
        if (Array.isArray(firstError) && firstError.length > 0) {
          errorMessage = firstError[0];
        } else if (typeof firstError === 'string') {
          errorMessage = firstError;
        }
      } else if (data.message) {
        errorMessage = data.message;
      } else if (data.error) {
        errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      }
      
      return {
        success: false,
        error: errorMessage,
        details: data,
      };
    }

    console.log("[SendPulse WhatsApp] Template успешно отправлен:", data);

    return {
      success: true,
      messageId: data.data?.id || data.result?.id,
    };
  } catch (error) {
    console.error("[SendPulse WhatsApp] Исключение при отправке:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error,
    };
  }
}

/**
 * Валидация российского номера телефона
 */
export function validatePhone(phone: string): boolean {
  const phoneRegex = /^(\+7|7|8)\d{10}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ""));
}

/**
 * Нормализация номера телефона к формату +7XXXXXXXXXX
 */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  
  if (cleaned.startsWith("8")) {
    cleaned = "+7" + cleaned.slice(1);
  }
  
  if (cleaned.startsWith("7") && !cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  
  return cleaned;
}
