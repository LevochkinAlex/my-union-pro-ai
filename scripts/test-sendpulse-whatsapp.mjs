/**
 * Тест отправки authentication template через SendPulse WhatsApp API
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const SENDPULSE_USER_ID = process.env.SENDPULSE_USER_ID;
const SENDPULSE_SECRET = process.env.SENDPULSE_SECRET;
const SENDPULSE_WHATSAPP_BOT_ID = process.env.SENDPULSE_WHATSAPP_BOT_ID;
const SENDPULSE_API_BASE = "https://api.sendpulse.com";

const testPhone = "79874157897"; // Без +
const testPin = "1234";

console.log("🔍 Проверка конфигурации SendPulse:");
console.log("  USER_ID:", SENDPULSE_USER_ID ? `✅ (${SENDPULSE_USER_ID.substring(0, 10)}...)` : "❌ не найден");
console.log("  SECRET:", SENDPULSE_SECRET ? `✅ (${SENDPULSE_SECRET.substring(0, 10)}...)` : "❌ не найден");
console.log("  WHATSAPP_BOT_ID:", SENDPULSE_WHATSAPP_BOT_ID || "❌ не найден");
console.log("");

if (!SENDPULSE_USER_ID || !SENDPULSE_SECRET) {
  console.error("❌ SendPulse credentials не настроены!");
  process.exit(1);
}

// Шаг 1: Получение токена
console.log("📥 Получение токена SendPulse...");
const tokenResponse = await fetch(`${SENDPULSE_API_BASE}/oauth/access_token`, {
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

if (!tokenResponse.ok) {
  const error = await tokenResponse.text();
  console.error("❌ Ошибка получения токена:", error);
  process.exit(1);
}

const tokenData = await tokenResponse.json();
const token = tokenData.access_token;

console.log("✅ Токен получен:", token.substring(0, 30) + "...");
console.log("  Expires in:", tokenData.expires_in, "seconds");
console.log("");

if (!SENDPULSE_WHATSAPP_BOT_ID) {
  console.error("❌ SENDPULSE_WHATSAPP_BOT_ID не настроен!");
  process.exit(1);
}

// Шаг 2: Отправка template
console.log("📤 Отправка authentication template через SendPulse WhatsApp...");
console.log("  Bot ID:", SENDPULSE_WHATSAPP_BOT_ID);
console.log("  Номер:", testPhone);
console.log("  PIN:", testPin);
console.log("");

const url = `${SENDPULSE_API_BASE}/whatsapp/contacts/sendTemplateByPhones`;

const requestBody = {
  bot_id: SENDPULSE_WHATSAPP_BOT_ID,
  phones: [testPhone],
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

console.log("🌐 Запрос к API:", url);
console.log("📦 Тело запроса:", JSON.stringify(requestBody, null, 2));
console.log("");

try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  console.log("📥 Ответ сервера:");
  console.log("  Status:", response.status, response.statusText);
  console.log("  Body:", JSON.stringify(data, null, 2));
  console.log("");

  if (response.ok && (data.success || data.data)) {
    console.log("✅ SendPulse WhatsApp сообщение успешно отправлено!");
    if (data.data?.id) {
      console.log("  Message ID:", data.data.id);
    }
  } else {
    console.error("❌ Ошибка отправки SendPulse WhatsApp:");
    if (data.error) {
      console.error("  Error:", data.error);
    }
    if (data.errors) {
      console.error("  Errors:", JSON.stringify(data.errors, null, 2));
    }
    if (data.message) {
      console.error("  Message:", data.message);
    }
  }
} catch (error) {
  console.error("❌ Исключение при отправке:", error.message);
  if (error.cause) {
    console.error("  Cause:", error.cause);
  }
}

