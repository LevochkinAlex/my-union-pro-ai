/**
 * Тест экстракции данных профиля из сообщений чата
 */

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

// Тестовый пользователь
const TEST_USER_EMAIL = "ceo@yappix.ru";

// Симулируем диалог чата (типичный сценарий)
const CHAT_MESSAGES = [
  { role: "assistant", content: "Здравствуйте! Укажите регион России, в котором вы находитесь." },
  { role: "user", content: "Москва" },
  { role: "assistant", content: "Ваш регион: Москва. Укажите наименование организации." },
  { role: "user", content: "Городская больница №5" },
  { role: "assistant", content: "Организация: Городская больница №5. Укажите ФИО." },
  { role: "user", content: "Сидоров Алексей Михайлович" },
  { role: "assistant", content: "ФИО: Сидоров Алексей Михайлович. Верно?" },
  { role: "user", content: "да" },
  { role: "assistant", content: "Укажите дату рождения." },
  { role: "user", content: "25.12.1990" },
  { role: "assistant", content: "Дата рождения: 25.12.1990. Верно?" },
  { role: "user", content: "да" },
  { role: "assistant", content: "Укажите адрес проживания." },
  { role: "user", content: "Москва, улица Тверская 10, кв 5" },
  { role: "assistant", content: "Адрес: Москва, улица Тверская 10, кв 5. Верно?" },
  { role: "user", content: "да" },
  { role: "assistant", content: "Укажите номер телефона." },
  { role: "user", content: "+79161234567" },
  { role: "assistant", content: "Телефон: +79161234567. Верно?" },
  { role: "user", content: "да" },
  { role: "assistant", content: "Укажите должность." },
  { role: "user", content: "терапевт" },
  { role: "assistant", content: "Должность: терапевт. Верно?" },
  { role: "user", content: "да" },
  { role: "assistant", content: "Укажите профессию." },
  { role: "user", content: "врач" },
  { role: "assistant", content: "Профессия: врач. Верно?" },
  { role: "user", content: "да" },
  { role: "assistant", content: "Укажите образование." },
  { role: "user", content: "Высшее (специалитет)" },
  { role: "assistant", content: "Образование: Высшее (специалитет). Верно?" },
  { role: "user", content: "да" },
  { role: "assistant", content: `Отлично! Все данные собраны:

1. **Регион**: Москва
2. **Организация**: Городская больница №5
3. **ФИО**: Сидоров Алексей Михайлович
4. **Дата рождения**: 25.12.1990
5. **Адрес**: Москва, улица Тверская 10, кв 5
6. **Телефон**: +79161234567
7. **Должность**: терапевт
8. **Профессия**: врач
9. **Образование**: Высшее (специалитет)

Все верно?` },
  { role: "user", content: "да, всё верно" },
];

async function testExtraction() {
  console.log("\n🧪 ТЕСТ ЭКСТРАКЦИИ ДАННЫХ ИЗ ЧАТА\n");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Динамический импорт функции экстракции
  const { extractProfileDataFromMessages, isProfileComplete } = await import("../lib/profile-extraction");

  // Получаем тестового пользователя
  const user = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
  });

  if (!user) {
    console.error("❌ Пользователь не найден:", TEST_USER_EMAIL);
    return;
  }

  console.log("✅ Пользователь:", user.email);
  console.log("   ID:", user.id);
  console.log("\n📋 Текущее состояние профиля:");
  console.log("─────────────────────────────────────────────────────────");
  console.log("  firstName:", user.firstName || "❌ ПУСТО");
  console.log("  lastName:", user.lastName || "❌ ПУСТО");
  console.log("  middleName:", user.middleName || "❌ ПУСТО");
  console.log("  dateOfBirth:", user.dateOfBirth?.toLocaleDateString() || "❌ ПУСТО");
  console.log("  address:", user.address || "❌ ПУСТО");
  console.log("  phone:", user.phone || "❌ ПУСТО");
  console.log("  region:", user.region || "❌ ПУСТО");
  console.log("  organizationName:", user.organizationName || "❌ ПУСТО");
  console.log("  jobTitle:", user.jobTitle || "❌ ПУСТО");
  console.log("  profession:", user.profession || "❌ ПУСТО");
  console.log("  education:", user.education || "❌ ПУСТО");
  
  // Проверяем полноту профиля
  console.log("\n📊 Профиль полный:", isProfileComplete(user) ? "✅ ДА" : "❌ НЕТ");

  // Тестируем экстракцию из сообщений
  console.log("\n\n🔍 ТЕСТИРОВАНИЕ ЭКСТРАКЦИИ ИЗ СООБЩЕНИЙ\n");
  console.log("══════════════════════════════════════════════════════════════\n");

  const extractedData = await extractProfileDataFromMessages(CHAT_MESSAGES as any);

  console.log("📝 Извлечённые данные:");
  console.log("─────────────────────────────────────────────────────────");
  for (const [key, value] of Object.entries(extractedData)) {
    if (value !== undefined && value !== null) {
      const displayValue = value instanceof Date ? value.toLocaleDateString() : value;
      console.log(`  ${key}: ${displayValue}`);
    }
  }

  // Проверяем что все важные поля извлечены
  const requiredFields = [
    "firstName", "lastName", "dateOfBirth", "address", 
    "phone", "jobTitle", "profession", "education"
  ];

  console.log("\n📋 Проверка обязательных полей:");
  console.log("─────────────────────────────────────────────────────────");
  let allFieldsExtracted = true;
  for (const field of requiredFields) {
    const extracted = extractedData[field];
    const status = extracted ? "✅" : "❌";
    console.log(`  ${status} ${field}: ${extracted || "НЕ ИЗВЛЕЧЕНО"}`);
    if (!extracted) allFieldsExtracted = false;
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  if (allFieldsExtracted) {
    console.log("✅ ЭКСТРАКЦИЯ УСПЕШНА - все обязательные поля извлечены!");
  } else {
    console.log("❌ ЭКСТРАКЦИЯ НЕПОЛНАЯ - некоторые поля не извлечены!");
  }
  console.log("═══════════════════════════════════════════════════════════\n");
}

testExtraction()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

