#!/usr/bin/env node

/**
 * Получение Phone Number ID через WhatsApp Business API
 */

const ACCESS_TOKEN = "EAAd6IqvMNZBMBQHNJHWH3sMvZAYBR8ZCvnw8FoU0pnEM5TyCe9Fj0c82wp5t6jBEsAbocdhI0Y5dtzieKV2dZAPKkULpYabxbYh5hVLulP8OIfsLNs1iTDK0wFCICrr6QZAhTZCeUMZA5ZCQZAMkrJCHDfOTab2HNxKDODLVw4qZBqZCas94ZAWipwbZCsRH8jHqtvBWv1AZDZD";
const WHATSAPP_BUSINESS_ACCOUNT_ID = "103868636019519"; // Из предыдущего скриншота

async function getPhoneNumbers() {
  console.log("🔍 Получение списка номеров WhatsApp...");
  console.log("Business Account ID:", WHATSAPP_BUSINESS_ACCOUNT_ID);
  
  const url = `https://graph.facebook.com/v18.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/phone_numbers`;
  
  console.log("\nЗапрос:");
  console.log(`GET ${url}`);
  console.log("Token:", ACCESS_TOKEN.substring(0, 20) + "...");
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
    },
  });

  const data = await response.json();

  console.log("\n📊 Ответ API:");
  console.log(JSON.stringify(data, null, 2));

  if (!response.ok || data.error) {
    console.error("\n❌ Ошибка получения номеров:", data.error);
    return null;
  }

  if (data.data && data.data.length > 0) {
    console.log("\n✅ Найдены номера:");
    data.data.forEach((phone, index) => {
      console.log(`\n${index + 1}. Номер: ${phone.display_phone_number}`);
      console.log(`   Phone Number ID: ${phone.id}`);
      console.log(`   Verified: ${phone.verified_name}`);
      console.log(`   Quality: ${phone.quality_rating || 'N/A'}`);
    });

    return data.data;
  } else {
    console.log("\n⚠️ Номера не найдены");
    return null;
  }
}

async function main() {
  console.log("🚀 Получение Phone Number ID из WhatsApp Business API");
  console.log("=".repeat(60));
  
  const phones = await getPhoneNumbers();
  
  if (phones && phones.length > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("✅ Успешно!");
    console.log("=".repeat(60));
    console.log("\n📋 Используйте эти данные:");
    console.log(`\nWHATSAPP_PHONE_NUMBER_ID=${phones[0].id}`);
    console.log(`WHATSAPP_BUSINESS_ACCOUNT_ID=${WHATSAPP_BUSINESS_ACCOUNT_ID}`);
    console.log(`WHATSAPP_ACCESS_TOKEN=${ACCESS_TOKEN.substring(0, 30)}...`);
  } else {
    console.log("\n❌ Не удалось получить Phone Number ID");
    console.log("\n💡 Возможные причины:");
    console.log("   1. Токен неверный или истек");
    console.log("   2. У приложения нет доступа к WhatsApp Business Account");
    console.log("   3. Номер телефона не подключен к аккаунту");
  }
}

main().catch(console.error);

