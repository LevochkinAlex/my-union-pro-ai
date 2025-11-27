/**
 * WhatsApp Cloud API (прямая интеграция с Meta)
 * Документация: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const WHATSAPP_API_VERSION = "v21.0"; // Последняя версия API

interface WhatsAppResult {
  success: boolean;
  error?: string;
  details?: unknown;
  messageId?: string;
}

/**
 * Отправка authentication template через WhatsApp Cloud API
 */
export async function sendAuthenticationTemplate(
  phone: string,
  pinCode: string,
  templateName: string = "authentication_template_"
): Promise<WhatsAppResult> {
  if (!WHATSAPP_ACCESS_TOKEN) {
    console.error("[WhatsApp Cloud] WHATSAPP_ACCESS_TOKEN не настроен");
    return {
      success: false,
      error: "WhatsApp Access Token не настроен",
    };
  }

  if (!WHATSAPP_PHONE_NUMBER_ID) {
    console.error("[WhatsApp Cloud] WHATSAPP_PHONE_NUMBER_ID не настроен");
    return {
      success: false,
      error: "WhatsApp Phone Number ID не настроен",
    };
  }

  try {
    // Нормализуем номер (формат: без + в начале, только цифры)
    const normalizedPhone = phone.replace(/^\+/, "");

    console.log("[WhatsApp Cloud] Отправка authentication template");
    console.log("[WhatsApp Cloud] Template:", templateName);
    console.log("[WhatsApp Cloud] Номер:", normalizedPhone);
    console.log("[WhatsApp Cloud] PIN-код:", pinCode);

    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const requestBody = {
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: templateName === "authentication_template_" ? "ru" : "en", // Язык template (из Facebook)
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
          {
            type: "button",
            sub_type: "url",
            index: 0,
            parameters: [
              {
                type: "text",
                text: pinCode, // Для autofill кнопки
              },
            ],
          },
        ],
      },
    };

    console.log("[WhatsApp Cloud] Запрос к API:", url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[WhatsApp Cloud] Ошибка отправки:", data);
      
      let errorMessage = "Ошибка отправки WhatsApp";
      if (data.error) {
        errorMessage = data.error.message || data.error.error_user_msg || errorMessage;
      }
      
      return {
        success: false,
        error: errorMessage,
        details: data,
      };
    }

    console.log("[WhatsApp Cloud] Template успешно отправлен:", data);

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (error) {
    console.error("[WhatsApp Cloud] Исключение при отправке:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error,
    };
  }
}

/**
 * Отправка PIN-кода через WhatsApp
 */
export async function sendPINViaWhatsApp(
  phone: string,
  pinCode: string
): Promise<WhatsAppResult> {
  return sendAuthenticationTemplate(phone, pinCode, "authentication_template_");
}

/**
 * Проверка статуса WhatsApp Business Account
 */
export async function getWhatsAppAccountInfo(): Promise<unknown> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_BUSINESS_ACCOUNT_ID) {
    return {
      success: false,
      error: "WhatsApp credentials не настроены",
    };
  }

  try {
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_BUSINESS_ACCOUNT_ID}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
    });

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

