#!/usr/bin/env node

/**
 * Тестирование WhatsApp Cloud API (прямая интеграция с Meta)
 */

const ACCESS_TOKEN = "EAAd6IqvMNZBMBQHNJHWH3sMvZAYBR8ZCvnw8FoU0pnEM5TyCe9Fj0c82wp5t6jBEsAbocdhI0Y5dtzieKV2dZAPKkULpYabxbYh5hVLulP8OIfsLNs1iTDK0wFCICrr6QZAhTZCeUMZA5ZCQZAMkrJCHDfOTab2HNxKDODLVw4qZBqZCas94ZAWipwbZCsRH8jHqtvBWv1AZDZD";
const PHONE_NUMBER_ID = "867058486493985";
const TEMPLATE_NAME = "authentication_template_";
const API_VERSION = "v21.0";

async function sendAuthTemplate(recipientPhone, pinCode) {
  console.log("\n💬 Отправка authentication template через WhatsApp Cloud API...");
  console.log("Phone Number ID:", PHONE_NUMBER_ID);
  console.log("Template:", TEMPLATE_NAME);
  console.log("Получатель:", recipientPhone);
  console.log("PIN-код:", pinCode);

  // Нормализуем номер (убираем +)
  const normalizedPhone = recipientPhone.replace(/^\+/, "");

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const requestBody = {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
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
        {
          type: "button",
          sub_type: "url",
          index: 0,
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

  console.log("\nЗапрос:");
  console.log(`POST ${url}`);
  console.log("Body:", JSON.stringify(requestBody, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  console.log("\n📊 Ответ API:");
  console.log("Status:", response.status);
  console.log("Data:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    console.error("\n❌ Ошибка отправки");
    
    if (data.error) {
      console.error("Код ошибки:", data.error.code);
      console.error("Сообщение:", data.error.message);
      console.error("Тип:", data.error.type);
      
      if (data.error.error_data) {
        console.error("Детали:", data.error.error_data.details);
      }
    }
    
    return false;
  }

  console.log("\n✅ Template успешно отправлен!");
  console.log("   Message ID:", data.messages?.[0]?.id);
  console.log("   Проверьте WhatsApp на номере:", recipientPhone);
  
  console.log("\n📱 Ожидаемое сообщение:");
  console.log("---");
  console.log(`Your temporary password is ${pinCode}. Please log in and update it as soon as possible.`);
  console.log("---");
  
  return true;
}

async function main() {
  const phone = process.argv[2];
  const pinCode = process.argv[3] || "1234";

  if (!phone) {
    console.log("❌ Укажите номер телефона:");
    console.log("   node scripts/test-whatsapp-cloud.mjs +79991234567");
    console.log("\n💡 Для теста используйте тестовый номер Facebook или свой номер");
    process.exit(1);
  }

  console.log("🚀 Тестирование WhatsApp Cloud API (Meta)");
  console.log("=".repeat(60));
  console.log("\nTemplate: authentication_template_");
  console.log("Category: AUTHENTICATION");
  console.log("Provider: Meta (Facebook)");

  const success = await sendAuthTemplate(phone, pinCode);

  if (success) {
    console.log("\n" + "=".repeat(60));
    console.log("✅ Тест успешно завершен!");
    console.log("=".repeat(60));
  } else {
    console.log("\n" + "=".repeat(60));
    console.log("❌ Тест завершен с ошибками");
    console.log("=".repeat(60));
    process.exit(1);
  }
}

main().catch(console.error);

