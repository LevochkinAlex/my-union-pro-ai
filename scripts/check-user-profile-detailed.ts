/**
 * Детальная проверка профиля и истории сообщений
 */

import { prisma } from "../lib/prisma";
import { extractProfileDataFromMessages, isProfileComplete } from "../lib/profile-extraction";

const TEST_EMAIL = "ceo@yappix.ru";
const SESSION_ID = "cmienfsfi000upt5v3lm01k24";

async function checkUserProfileDetailed() {
  console.log("\n🔍 ДЕТАЛЬНАЯ ПРОВЕРКА ПРОФИЛЯ И ЧАТА\n");
  console.log("═".repeat(70));
  
  // 1. Получаем пользователя
  const user = await prisma.user.findUnique({
    where: { email: TEST_EMAIL },
    include: {
      organization: true,
      children: true,
    },
  });

  if (!user) {
    console.log("❌ Пользователь не найден!");
    return;
  }

  console.log(`\n👤 ПОЛЬЗОВАТЕЛЬ: ${user.email} (ID: ${user.id})`);
  
  // 2. Проверяем текущий профиль
  console.log("\n📊 ТЕКУЩИЙ ПРОФИЛЬ В БД:");
  console.log("─".repeat(70));
  console.log(`  Регион: ${user.region || "❌ не заполнено"}`);
  console.log(`  Организация ID: ${user.organizationId || "не связано"}`);
  console.log(`  Организация Name: ${user.organizationName || "❌ не заполнено"}`);
  console.log(`  ФИО: ${user.lastName || "?"} ${user.firstName || "?"} ${user.middleName || "?"}`);
  console.log(`  Дата рождения: ${user.dateOfBirth || "❌ не заполнено"}`);
  console.log(`  Телефон: ${user.phone || "❌ не заполнено"}`);
  console.log(`  Адрес: ${user.address || "❌ не заполнено"}`);
  console.log(`  Должность: ${user.jobTitle || "❌ не заполнено"}`);
  console.log(`  Профессия: ${user.profession || "❌ не заполнено"}`);
  console.log(`  Образование: ${user.education || "❌ не заполнено"}`);
  
  // 3. Проверяем полноту профиля
  const profileComplete = isProfileComplete(user);
  console.log(`\n✅ Профиль полный: ${profileComplete ? "ДА" : "НЕТ"}`);
  
  // 4. Получаем историю сообщений
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: SESSION_ID },
    orderBy: { createdAt: "asc" },
  });
  
  console.log(`\n💬 ИСТОРИЯ СООБЩЕНИЙ: ${messages.length} сообщений`);
  console.log("─".repeat(70));
  
  // Последние 10 сообщений
  const recentMessages = messages.slice(-10);
  recentMessages.forEach((msg, idx) => {
    const role = msg.role === "user" ? "👤 User" : "🤖 Bot";
    const content = msg.content.substring(0, 80).replace(/\n/g, " ");
    console.log(`  ${messages.length - 10 + idx + 1}. ${role}: ${content}...`);
  });
  
  // 5. Извлекаем данные из истории
  console.log(`\n🔄 ИЗВЛЕЧЕНИЕ ДАННЫХ ИЗ ИСТОРИИ СООБЩЕНИЙ...`);
  const extractedData = await extractProfileDataFromMessages(
    messages.map(m => ({ role: m.role, content: m.content }))
  );
  
  console.log("\n📤 ИЗВЛЕЧЕННЫЕ ДАННЫЕ:");
  console.log("─".repeat(70));
  Object.entries(extractedData).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  
  console.log(`\nВсего извлечено полей: ${Object.keys(extractedData).length}`);
  
  // 6. Сравнение
  console.log(`\n⚖️ СРАВНЕНИЕ: БД vs ИЗВЛЕЧЕННЫЕ ДАННЫЕ`);
  console.log("─".repeat(70));
  
  const fields = [
    'region', 'organizationName', 'firstName', 'lastName', 'middleName',
    'dateOfBirth', 'phone', 'address', 'jobTitle', 'profession', 'education'
  ];
  
  let mismatchCount = 0;
  fields.forEach(field => {
    const dbValue = (user as any)[field];
    const extractedValue = extractedData[field];
    
    if (!dbValue && extractedValue) {
      console.log(`  ⚠️ ${field}: БД пусто, но извлечено "${extractedValue}"`);
      mismatchCount++;
    } else if (dbValue && !extractedValue) {
      console.log(`  ℹ️ ${field}: БД "${dbValue}", не извлечено`);
    } else if (dbValue !== extractedValue && extractedValue) {
      console.log(`  🔄 ${field}: БД "${dbValue}" != извлечено "${extractedValue}"`);
      mismatchCount++;
    }
  });
  
  if (mismatchCount === 0) {
    console.log(`  ✅ Все данные синхронизированы`);
  } else {
    console.log(`\n  ❌ НАЙДЕНО ${mismatchCount} НЕСООТВЕТСТВИЙ!`);
    console.log(`  🔥 ДАННЫЕ НЕ СОХРАНЯЮТСЯ В ПРОФИЛЬ!`);
  }
  
  console.log("\n" + "═".repeat(70));
}

checkUserProfileDetailed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });

