#!/usr/bin/env node

/**
 * Тестирование WhatsApp authentication template
 * Usage: node scripts/test-whatsapp-template.mjs +79991234567
 */

// ⚠️ ВАЖНО: Используйте переменные окружения для секретов!
const SENDPULSE_USER_ID = process.env.SENDPULSE_USER_ID || "YOUR_SENDPULSE_USER_ID";
const SENDPULSE_SECRET = process.env.SENDPULSE_SECRET || "YOUR_SENDPULSE_SECRET";
const SENDPULSE_WHATSAPP_BOT_ID = "69285cff0016f7374d089440";
const SENDPULSE_API_BASE = "https://api.sendpulse.com";

async function getAccessToken() {
  console.log("\n🔑 Получение access token...");
  const response = await fetch(`${SENDPULSE_API_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: SENDPULSE_USER_ID,
      client_secret: SENDPULSE_SECRET,
    }),
  });

  const data = await response.json();
  console.log("✅ Токен получен");
  return data.access_token;
}

async function sendAuthenticationTemplate(phone, pinCode) {
  console.log("\n💬 Отправка authentication template в WhatsApp...");
  console.log("Bot ID:", SENDPULSE_WHATSAPP_BOT_ID);
  console.log("Номер:", phone);
  console.log("PIN-код:", pinCode);

  const token = await getAccessToken();
  const normalizedPhone = phone.replace(/[\s\+\-\(\)]/g, "");

  console.log("\nЗапрос к API:");
  console.log(`POST ${SENDPULSE_API_BASE}/whatsapp/contacts/sendTemplateByPhones`);
  
  const requestBody = {
    bot_id: SENDPULSE_WHATSAPP_BOT_ID,
    phones: [normalizedPhone], // Массив номеров
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
              text: pinCode,
            },
          ],
        },
      ],
    },
  };
  
  console.log("Body:", JSON.stringify(requestBody, null, 2));

  const response = await fetch(`${SENDPULSE_API_BASE}/whatsapp/contacts/sendTemplateByPhones`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  console.log("\n📊 Ответ API:");
  console.log("Status:", response.status);
  console.log("Data:", JSON.stringify(data, null, 2));

  if (!response.ok || !data.success) {
    console.error("\n❌ Ошибка отправки template");
    
    if (data.errors) {
      console.error("Детали ошибок:", data.errors);
      
      const errorMessages = Object.values(data.errors).flat();
      if (errorMessages.some(msg => msg.includes("not found") || msg.includes("не найден"))) {
        console.log("\n💡 Возможные причины:");
        console.log("   1. Template 'myunion_auth_code' еще не создан в SendPulse");
        console.log("   2. Template создан, но еще не одобрен Facebook (статус: Pending)");
        console.log("   3. Имя template не совпадает (проверьте точное написание)");
        console.log("\n📋 Следующие шаги:");
        console.log("   1. Создайте template в SendPulse (см. WHATSAPP_TEMPLATES.md)");
        console.log("   2. Отправьте на модерацию в Facebook");
        console.log("   3. Дождитесь одобрения (обычно 2-24 часа)");
        console.log("   4. Запустите этот скрипт снова");
      }
    }
    
    return false;
  }

  console.log("\n✅ Authentication template успешно отправлен!");
  console.log("   Проверьте WhatsApp на номере:", phone);
  console.log("   ID сообщения:", data.data?.id || data.result?.id);
  console.log("\n📱 Ожидаемое сообщение в WhatsApp:");
  console.log("---");
  console.log(`Ваш код для входа в МойСоюз: *${pinCode}*`);
  console.log("");
  console.log("⏱ Код действителен 5 минут");
  console.log("⚠️ Никому не сообщайте этот код");
  console.log("---");
  return true;
}

async function main() {
  const phone = process.argv[2];
  const pinCode = process.argv[3] || "1234";

  if (!phone) {
    console.log("❌ Укажите номер телефона:");
    console.log("   node scripts/test-whatsapp-template.mjs +79991234567");
    process.exit(1);
  }

  console.log("🚀 Тестирование WhatsApp Authentication Template");
  console.log("================================================\n");
  console.log("Template: authentication_template_");
  console.log("Category: AUTHENTICATION");
  console.log("Language: English (en)");

  const success = await sendAuthenticationTemplate(phone, pinCode);

  if (success) {
    console.log("\n" + "=".repeat(50));
    console.log("✅ Тест успешно завершен!");
    console.log("=".repeat(50));
  } else {
    console.log("\n" + "=".repeat(50));
    console.log("❌ Тест завершен с ошибками");
    console.log("=".repeat(50));
    process.exit(1);
  }
}

main().catch(console.error);

