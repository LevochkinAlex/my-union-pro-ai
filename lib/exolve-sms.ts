/**
 * Exolve SMS API для отправки SMS кодов
 * Документация: https://dev.exolve.ru/
 */

const EXOLVE_API_KEY = process.env.EXOLVE_API_KEY;
// Правильный endpoint для Exolve согласно документации
const EXOLVE_API_URL = "https://api.exolve.ru/messaging/v1/SendSMS";

export interface ExolveSMSResult {
  success: boolean;
  error?: string;
  messageId?: string;
  details?: unknown;
}

/**
 * Отправляет SMS через Exolve API
 */
export async function sendSMSViaExolve(
  phone: string,
  text: string
): Promise<ExolveSMSResult> {
  if (!EXOLVE_API_KEY) {
    console.error("[Exolve SMS] EXOLVE_API_KEY не установлен в .env.local");
    return {
      success: false,
      error: "EXOLVE_API_KEY не настроен",
    };
  }

  try {
    console.log("[Exolve SMS] Отправка SMS на номер:", phone);

    // Нормализуем номер для Exolve (убираем +)
    const normalizedPhone = phone.replace(/^\+/, "");

    // Согласно документации Exolve API
    const requestBody = {
      number: normalizedPhone,
      destination: normalizedPhone,
      text: text,
    };

    console.log("[Exolve SMS] Запрос:", {
      url: EXOLVE_API_URL,
      body: requestBody,
      hasKey: !!EXOLVE_API_KEY,
    });

    const response = await fetch(EXOLVE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${EXOLVE_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[Exolve SMS] Ошибка API:", {
        status: response.status,
        data,
      });
      return {
        success: false,
        error: data.message || data.error || "Ошибка Exolve API",
        details: data,
      };
    }

    console.log("[Exolve SMS] SMS успешно отправлено:", data);

    return {
      success: true,
      messageId: data.txn_id || data.id,
    };
  } catch (error) {
    console.error("[Exolve SMS] Ошибка при отправке SMS:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error,
    };
  }
}

/**
 * Отправляет PIN-код через Exolve SMS
 */
export async function sendPINViaSMS(
  phone: string,
  pinCode: string
): Promise<ExolveSMSResult> {
  const text = `Ваш код для входа в МойСоюз: ${pinCode}\n\nКод действителен 10 минут.\nНе сообщайте этот код никому.`;

  return sendSMSViaExolve(phone, text);
}

