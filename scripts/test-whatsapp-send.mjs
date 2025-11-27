/**
 * Тестовый скрипт для проверки отправки через WhatsApp
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_VERSION = "v21.0";

const testPhone = "79874157897"; // Без +
const testPin = "1234";

console.log("🔍 Проверка конфигурации WhatsApp:");
console.log("  ACCESS_TOKEN:", WHATSAPP_ACCESS_TOKEN ? `✅ (${WHATSAPP_ACCESS_TOKEN.substring(0, 20)}...)` : "❌ не найден");
console.log("  PHONE_NUMBER_ID:", WHATSAPP_PHONE_NUMBER_ID || "❌ не найден");
console.log("  API_VERSION:", WHATSAPP_API_VERSION);
console.log("");

if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  console.error("❌ WhatsApp не настроен! Проверьте .env.local");
  process.exit(1);
}

console.log("📤 Отправка тестового сообщения...");
console.log("  Номер:", testPhone);
console.log("  PIN:", testPin);
console.log("");

const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

const requestBody = {
  messaging_product: "whatsapp",
  to: testPhone,
  type: "template",
  template: {
    name: "authentication_template_",
    language: {
      code: "en",
    },
    components: [
      {
        type: "body",
        parameters: [
          {
            type: "text",
            text: testPin,
          },
        ],
      },
    ],
  },
};

try {
  console.log("🌐 Запрос к API:", url);
  console.log("📦 Тело запроса:", JSON.stringify(requestBody, null, 2));
  console.log("");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  console.log("📥 Ответ сервера:");
  console.log("  Status:", response.status, response.statusText);
  console.log("  Body:", JSON.stringify(data, null, 2));
  console.log("");

  if (response.ok && data.messages) {
    console.log("✅ WhatsApp сообщение успешно отправлено!");
    console.log("  Message ID:", data.messages[0]?.id);
  } else {
    console.error("❌ Ошибка отправки WhatsApp:");
    if (data.error) {
      console.error("  Error:", data.error.message || data.error.error_user_msg || JSON.stringify(data.error));
      console.error("  Type:", data.error.type);
      console.error("  Code:", data.error.code);
      if (data.error.error_subcode) {
        console.error("  Subcode:", data.error.error_subcode);
      }
    }
  }
} catch (error) {
  console.error("❌ Исключение при отправке:", error.message);
  console.error("  Stack:", error.stack);
}

