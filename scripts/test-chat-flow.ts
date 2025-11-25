/**
 * Автоматический тест полного цикла заполнения профиля через чат
 */

import { prisma } from "../lib/prisma";

const USER_EMAIL = "test.org.dadata@example.com";
const USER_ID = "cmiepahzd00001ynhbyi536da";

// Симулируем диалог
const DIALOG_STEPS = [
  { step: 1, message: "Привет", expected: "регион" },
  { step: 2, message: "Татарстан", expected: "организаци" },
  { step: 3, message: "БСМП Набережные Челны", expected: "нашел|найдена|правильная" },
  { step: 4, message: "да", expected: "фамилия|имя" },
  { step: 5, message: "Иванов Иван Иванович", expected: "дата рождения|когда вы родились" },
  { step: 6, message: "15.05.1990", expected: "адрес" },
  { step: 7, message: "Татарстан, Набережные Челны, Чулман 11, квартира 141", expected: "телефон" },
  { step: 8, message: "+79123456789", expected: "должность" },
  { step: 9, message: "врач", expected: "найден|врач" },
  { step: 10, message: "да", expected: "профессия|специальность" },
  { step: 11, message: "массажист", expected: "найден|массажист" },
  { step: 12, message: "да", expected: "образование" },
  { step: 13, message: "высшее", expected: "проверим|давайте проверим" },
  { step: 14, message: "да", expected: "документ|генерир" },
];

async function simulateChat() {
  console.log("\n🤖 АВТОМАТИЧЕСКИЙ ТЕСТ ДИАЛОГА ЧАТА\n");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Создаем новую сессию
  const session = await prisma.chatSession.create({
    data: {
      userId: USER_ID,
      type: "STATEMENT",
      title: "Тестовая сессия - автоматический тест",
    },
  });

  console.log(`✅ Создана новая сессия: ${session.id}\n`);

  for (const dialogStep of DIALOG_STEPS) {
    console.log(`\n📝 ШАГ ${dialogStep.step}: "${dialogStep.message}"`);
    console.log("─────────────────────────────────────────────────────────");

    // Сохраняем сообщение пользователя
    await prisma.chatMessage.create({
      data: {
        userId: USER_ID,
        sessionId: session.id,
        role: "user",
        content: dialogStep.message,
      },
    });

    // Вызываем API чата (симулируем)
    try {
      const response = await fetch("http://localhost:3004/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: dialogStep.message,
          sessionId: session.id,
          userId: USER_ID,
        }),
      });

      if (!response.ok) {
        console.log(`❌ API Error: ${response.status}`);
        const text = await response.text();
        console.log(`Response: ${text.substring(0, 200)}...`);
        continue;
      }

      // Читаем stream ответа
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let botResponse = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          botResponse += decoder.decode(value, { stream: true });
        }
      }

      console.log(`\n🤖 Ответ бота:\n${botResponse}\n`);

      // Проверяем ожидаемый паттерн
      const expectedPattern = new RegExp(dialogStep.expected, "i");
      if (expectedPattern.test(botResponse)) {
        console.log(`✅ Паттерн найден: "${dialogStep.expected}"`);
      } else {
        console.log(`⚠️ Ожидаемый паттерн НЕ найден: "${dialogStep.expected}"`);
      }

      // Небольшая задержка между запросами
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Ошибка при вызове API:`, error);
    }
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("🎯 ФИНАЛЬНАЯ ПРОВЕРКА ПРОФИЛЯ\n");

  // Проверяем финальное состояние профиля
  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
  });

  if (!user) {
    console.log("❌ Пользователь не найден!");
    return;
  }

  console.log("📊 ДАННЫЕ В БД:");
  console.log("─────────────────────────────────────────────────────────");
  console.log(`  region: ${user.region || "❌ ПУСТО"}`);
  console.log(`  organizationName: ${user.organizationName || "❌ ПУСТО"}`);
  console.log(`  firstName: ${user.firstName || "❌ ПУСТО"}`);
  console.log(`  lastName: ${user.lastName || "❌ ПУСТО"}`);
  console.log(`  middleName: ${user.middleName || "❌ ПУСТО"}`);
  console.log(`  dateOfBirth: ${user.dateOfBirth ? user.dateOfBirth.toLocaleDateString() : "❌ ПУСТО"}`);
  console.log(`  address: ${user.address || "❌ ПУСТО"}`);
  console.log(`  phone: ${user.phone || "❌ ПУСТО"}`);
  console.log(`  jobTitle: ${user.jobTitle || "❌ ПУСТО"}`);
  console.log(`  profession: ${user.profession || "❌ ПУСТО"}`);
  console.log(`  education: ${user.education || "❌ ПУСТО"}`);

  // Проверяем полноту профиля
  const isComplete =
    !!user.region &&
    (!!user.organizationName || !!user.organizationId) &&
    !!user.firstName &&
    !!user.lastName &&
    !!user.dateOfBirth &&
    !!user.address &&
    !!user.phone &&
    !!user.jobTitle &&
    !!user.profession &&
    !!user.education;

  console.log("\n─────────────────────────────────────────────────────────");
  console.log(`\n${isComplete ? "✅" : "❌"} Профиль ${isComplete ? "ПОЛНЫЙ" : "НЕПОЛНЫЙ"}`);
  console.log("\n══════════════════════════════════════════════════════════════\n");
}

simulateChat()
  .catch((error) => {
    console.error("\n❌ Критическая ошибка:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
