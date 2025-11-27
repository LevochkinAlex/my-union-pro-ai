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
  const token = await getAccessToken();
  
  if (!token) {
    return {
      success: false,
      error: "Не удалось получить токен SendPulse",
    };
  }

  if (!SENDPULSE_WHATSAPP_BOT_ID) {
    console.error("[SendPulse WhatsApp] SENDPULSE_WHATSAPP_BOT_ID не настроен");
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

    // Используем утвержденный authentication template для отправки OTP
    // Документация: https://sendpulse.com/integrations/api/chatbot/whatsapp
    
    // Формат для SendPulse: отправка template по номеру телефона
    const response = await fetch(
      `${SENDPULSE_API_BASE}/whatsapp/contacts/sendTemplateByPhones`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bot_id: SENDPULSE_WHATSAPP_BOT_ID,
          phones: [normalizedPhone], // Массив номеров
          template: {
            name: "authentication_template_", // Одобренный Facebook template
            language: {
              code: "en",
            },
            components: [
              {
                type: "body",
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

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error("[SendPulse WhatsApp] Ошибка отправки template:", data);
      
      // Более информативное сообщение об ошибке
      let errorMessage = "Ошибка отправки WhatsApp";
      if (data.errors) {
        const firstError = Object.values(data.errors)[0];
        if (Array.isArray(firstError) && firstError.length > 0) {
          errorMessage = firstError[0];
        }
      } else if (data.message) {
        errorMessage = data.message;
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
