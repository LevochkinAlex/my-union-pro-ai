/**
 * Скрипт для получения Phone Number ID из WhatsApp Business Account
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "138596839968735";
const WHATSAPP_API_VERSION = "v21.0";

console.log("🔍 Получение списка номеров телефонов из WhatsApp Business Account...");
console.log("  Business Account ID:", WHATSAPP_BUSINESS_ACCOUNT_ID);
console.log("");

if (!WHATSAPP_ACCESS_TOKEN) {
  console.error("❌ WHATSAPP_ACCESS_TOKEN не найден в .env.local");
  process.exit(1);
}

const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_BUSINESS_ACCOUNT_ID}/phone_numbers`;

try {
  console.log("🌐 Запрос к API:", url);
  console.log("");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    },
  });

  const data = await response.json();

  console.log("📥 Ответ сервера:");
  console.log("  Status:", response.status, response.statusText);
  console.log("");

  if (response.ok && data.data) {
    console.log("✅ Найдено номеров:", data.data.length);
    console.log("");

    data.data.forEach((phone, index) => {
      console.log(`📱 Номер ${index + 1}:`);
      console.log("  Phone Number ID:", phone.id);
      console.log("  Display Phone Number:", phone.display_phone_number);
      console.log("  Verified Name:", phone.verified_name);
      console.log("  Quality Rating:", phone.quality_rating || "N/A");
      console.log("  Status:", phone.code_verification_status || "N/A");
      console.log("");
    });

    if (data.data.length > 0) {
      const firstPhone = data.data[0];
      console.log("💡 Используйте этот Phone Number ID в .env.local:");
      console.log(`   WHATSAPP_PHONE_NUMBER_ID=${firstPhone.id}`);
      console.log("");
    }
  } else {
    console.error("❌ Ошибка получения номеров:");
    if (data.error) {
      console.error("  Error:", data.error.message || JSON.stringify(data.error));
      console.error("  Type:", data.error.type);
      console.error("  Code:", data.error.code);
      if (data.error.error_subcode) {
        console.error("  Subcode:", data.error.error_subcode);
      }
    } else {
      console.error("  Response:", JSON.stringify(data, null, 2));
    }
  }
} catch (error) {
  console.error("❌ Исключение при запросе:", error.message);
  if (error.cause) {
    console.error("  Cause:", error.cause);
  }
}
