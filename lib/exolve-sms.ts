/**
 * Exolve SMS API для отправки SMS кодов
 * Документация: https://docs.exolve.ru/docs/ru/api-reference/sms-api/
 */

const EXOLVE_API_KEY = process.env.EXOLVE_API_KEY;
const EXOLVE_SENDER_NUMBER = "79587173423"; // Номер отправителя в Exolve
// Правильный endpoint для Exolve SMS API
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

    // Нормализуем номер для Exolve (убираем +, оставляем только цифры)
    const normalizedPhone = phone.replace(/[^\d]/g, "");

    // Exolve Messaging API использует REST формат с полями в lowercase
    // https://docs.exolve.ru/docs/ru/api-reference/sms-api/
    const requestBody = {
      number: EXOLVE_SENDER_NUMBER, // Номер отправителя (купленный в Exolve)
      destination: normalizedPhone,  // Номер получателя (без +)
      text: text,
    };

    console.log("[Exolve SMS] Запрос:", {
      url: EXOLVE_API_URL,
      destination: normalizedPhone,
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

    let data;
    const responseText = await response.text();
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("[Exolve SMS] ❌ Не удалось распарсить ответ как JSON:", responseText);
      return {
        success: false,
        error: `Неверный формат ответа от Exolve API: ${response.status} ${response.statusText}`,
        details: { responseText, status: response.status },
      };
    }

    console.log("[Exolve SMS] Ответ API:", {
      status: response.status,
      ok: response.ok,
      data,
    });

    // Проверяем ответ
    if (!response.ok) {
      const errorMessage = data.error?.message || data.message || data.error || `Ошибка Exolve API: ${response.status} ${response.statusText}`;
      console.error("[Exolve SMS] ❌ Ошибка API:", {
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        data,
        phone: normalizedPhone,
      });
      
      // Специальная обработка для "incorrect customer state"
      if (errorMessage.toLowerCase().includes("incorrect customer state") || 
          errorMessage.toLowerCase().includes("customer state")) {
        console.error("[Exolve SMS] ⚠️ ПРОБЛЕМА С АККАУНТОМ EXOLVE: аккаунт не активирован или имеет неправильный статус. Проверьте настройки аккаунта в Exolve.");
      }
      
      return {
        success: false,
        error: errorMessage,
        details: data,
      };
    }

    // Проверяем наличие ошибки в теле ответа
    if (data.error) {
      const errorMessage = data.error?.message || data.error || data.message || "Неизвестная ошибка Exolve API";
      console.error("[Exolve SMS] ❌ Ошибка в ответе:", {
        error: errorMessage,
        data,
        phone: normalizedPhone,
      });
      
      // Специальная обработка для "incorrect customer state"
      if (errorMessage.toLowerCase().includes("incorrect customer state") || 
          errorMessage.toLowerCase().includes("customer state")) {
        console.error("[Exolve SMS] ⚠️ ПРОБЛЕМА С АККАУНТОМ EXOLVE: аккаунт не активирован или имеет неправильный статус. Проверьте настройки аккаунта в Exolve.");
      }
      
      return {
        success: false,
        error: errorMessage,
        details: data,
      };
    }

    console.log("[Exolve SMS] ✅ SMS успешно отправлено, message_id:", data.message_id || data.txn_id);

    return {
      success: true,
      messageId: data.message_id || data.txn_id,
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

