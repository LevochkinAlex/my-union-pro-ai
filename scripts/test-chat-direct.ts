/**
 * Прямой тест логики чата без HTTP
 */

import { prisma } from "../lib/prisma";
import { extractProfileDataFromMessages, isProfileComplete } from "../lib/profile-extraction";

const USER_EMAIL = "test.org.dadata@example.com";

async function testDirectChat() {
  console.log("\n🤖 ПРЯМОЙ ТЕСТ ЛОГИКИ ЧАТА\n");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Находим пользователя
  const user = await prisma.user.findUnique({
    where: { email: USER_EMAIL },
  });

  if (!user) {
    console.log("❌ Пользователь не найден!");
    return;
  }

  console.log(`✅ Пользователь найден: ${user.id}\n`);

  // Очищаем старые сессии и сообщения
  await prisma.chatMessage.deleteMany({ where: { userId: user.id } });
  await prisma.chatSession.deleteMany({ where: { userId: user.id } });
  console.log("🧹 Старые сессии очищены\n");

  // Создаем сессию и добавляем тестовые сообщения
  const session = await prisma.chatSession.create({
    data: {
      userId: user.id,
      type: "STATEMENT",
      title: "Тестовая сессия",
    },
  });

  console.log(`✅ Создана сессия: ${session.id}\n`);

  // Симулируем историю диалога
  const messages = [
    { role: "assistant", content: "Здравствуйте! Для начала укажите ваш регион." },
    { role: "user", content: "Татарстан" },
    { role: "assistant", content: "Теперь укажите наименование организации, в которой вы работаете." },
    { role: "user", content: "БСМП Набережные Челны" },
    { role: "assistant", content: "Я нашел вашу организацию в реестре: [НАЙДЕНА ОРГАНИЗАЦИЯ В РЕЕСТРЕ МИНЮСТА: Бюро судебно-медицинской экспертизы г. Набережные Челны]. Это правильная организация? (да/нет)" },
    { role: "user", content: "да" },
    { role: "assistant", content: "Отлично! Теперь укажите ваше ФИО (фамилия, имя, отчество)." },
    { role: "user", content: "Иванов Иван Иванович" },
    { role: "assistant", content: "Укажите вашу дату рождения (в формате ДД.ММ.ГГГГ)." },
    { role: "user", content: "15.05.1990" },
    { role: "assistant", content: "Укажите ваш адрес регистрации." },
    { role: "user", content: "Татарстан, Набережные Челны, Чулман 11, квартира 141" },
    { role: "assistant", content: "Укажите ваш контактный телефон." },
    { role: "user", content: "+79123456789" },
    { role: "assistant", content: "Укажите вашу должность." },
    { role: "user", content: "врач" },
    { role: "assistant", content: "[НАЙДЕНО В СПРАВОЧНИКЕ: Врач]. Ваша должность: врач. Верно? (да/нет)" },
    { role: "user", content: "да" },
    { role: "assistant", content: "Укажите вашу профессию или специальность." },
    { role: "user", content: "массажист" },
    { role: "assistant", content: "[НАЙДЕНО В СПРАВОЧНИКЕ: Массажист]. Ваша профессия: массажист. Верно? (да/нет)" },
    { role: "user", content: "да" },
    { role: "assistant", content: "Укажите ваше образование." },
    { role: "user", content: "высшее" },
    {
      role: "assistant",
      content: `Отлично! Давайте проверим собранные данные:

1. **Регион**: Татарстан
2. **Организация**: Бюро судебно-медицинской экспертизы г. Набережные Челны
3. **ФИО**: Иванов Иван Иванович
4. **Дата рождения**: 15.05.1990
5. **Адрес**: Татарстан, Набережные Челны, Чулман 11, квартира 141
6. **Телефон**: +79123456789
7. **Должность**: врач
8. **Профессия**: массажист
9. **Образование**: высшее

Все верно? (да/нет)`,
    },
  ];

  console.log("📝 Создаю историю сообщений...\n");

  for (const msg of messages) {
    await prisma.chatMessage.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        role: msg.role as "user" | "assistant",
        content: msg.content,
      },
    });
  }

  console.log(`✅ Создано ${messages.length} сообщений\n`);

  // Загружаем сообщения и извлекаем данные
  const chatMessages = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
  });

  console.log("🔍 ИЗВЛЕЧЕНИЕ ДАННЫХ ИЗ ИСТОРИИ...\n");

  const extractedData = await extractProfileDataFromMessages(chatMessages);

  console.log("📤 ИЗВЛЕЧЕННЫЕ ДАННЫЕ:");
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`  region: ${extractedData.region || "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log(`  organizationName: ${extractedData.organizationName || "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log(`  firstName: ${extractedData.firstName || "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log(`  lastName: ${extractedData.lastName || "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log(`  middleName: ${extractedData.middleName || "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log(`  dateOfBirth: ${extractedData.dateOfBirth ? extractedData.dateOfBirth.toLocaleDateString() : "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log(`  address: ${extractedData.address || "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log(`  phone: ${extractedData.phone || "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log(`  jobTitle: ${extractedData.jobTitle || "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log(`  profession: ${extractedData.profession || "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log(`  education: ${extractedData.education || "❌ НЕ ИЗВЛЕЧЕНО"}`);
  console.log("\n");

  // Сохраняем в БД
  console.log("💾 СОХРАНЕНИЕ В БД...\n");

  const cleanData = Object.fromEntries(
    Object.entries(extractedData).filter(
      ([key, value]) =>
        value !== undefined &&
        value !== null &&
        value !== "" &&
        !(typeof value === "number" && Number.isNaN(value))
    )
  );

  await prisma.user.update({
    where: { id: user.id },
    data: cleanData,
  });

  console.log("✅ Данные сохранены\n");

  // Перезагружаем пользователя
  const updatedUser = await prisma.user.findUnique({
    where: { id: user.id },
  });

  if (!updatedUser) {
    console.log("❌ Ошибка загрузки пользователя!");
    return;
  }

  console.log("💾 ДАННЫЕ В БД:");
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`  region: ${updatedUser.region || "❌ ПУСТО"}`);
  console.log(`  organizationName: ${updatedUser.organizationName || "❌ ПУСТО"}`);
  console.log(`  firstName: ${updatedUser.firstName || "❌ ПУСТО"}`);
  console.log(`  lastName: ${updatedUser.lastName || "❌ ПУСТО"}`);
  console.log(`  middleName: ${updatedUser.middleName || "❌ ПУСТО"}`);
  console.log(`  dateOfBirth: ${updatedUser.dateOfBirth ? updatedUser.dateOfBirth.toLocaleDateString() : "❌ ПУСТО"}`);
  console.log(`  address: ${updatedUser.address || "❌ ПУСТО"}`);
  console.log(`  phone: ${updatedUser.phone || "❌ ПУСТО"}`);
  console.log(`  jobTitle: ${updatedUser.jobTitle || "❌ ПУСТО"}`);
  console.log(`  profession: ${updatedUser.profession || "❌ ПУСТО"}`);
  console.log(`  education: ${updatedUser.education || "❌ ПУСТО"}`);

  // Проверяем полноту профиля
  const isComplete = isProfileComplete(updatedUser);

  console.log("\n──────────────────────────────────────────────────────────────");
  console.log(`\n${isComplete ? "✅" : "❌"} Профиль ${isComplete ? "ПОЛНЫЙ" : "НЕПОЛНЫЙ"}`);

  if (!isComplete) {
    console.log("\n⚠️ ОТСУТСТВУЮЩИЕ ПОЛЯ:");
    if (!updatedUser.region) console.log("  - region");
    if (!updatedUser.organizationName && !updatedUser.organizationId) console.log("  - organizationName/organizationId");
    if (!updatedUser.firstName) console.log("  - firstName");
    if (!updatedUser.lastName) console.log("  - lastName");
    if (!updatedUser.dateOfBirth) console.log("  - dateOfBirth");
    if (!updatedUser.address) console.log("  - address");
    if (!updatedUser.phone) console.log("  - phone");
    if (!updatedUser.jobTitle) console.log("  - jobTitle");
    if (!updatedUser.profession) console.log("  - profession");
    if (!updatedUser.education) console.log("  - education");
  }

  console.log("\n══════════════════════════════════════════════════════════════\n");
}

testDirectChat()
  .catch((error) => {
    console.error("\n❌ Критическая ошибка:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

