/**
 * Скрипт для проверки данных сессии чата и профиля пользователя
 * Запуск: pnpm tsx scripts/check-session-profile.ts <sessionId>
 */

import { prisma } from "../lib/prisma";
import { isProfileComplete } from "../lib/profile-extraction";

async function checkSession(sessionId: string) {
  try {
    console.log(`\n🔍 Проверка сессии: ${sessionId}\n`);

    // Получаем сессию
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        user: true,
      },
    });

    if (!session) {
      console.error(`❌ Сессия не найдена`);
      return;
    }

    console.log(`✅ Сессия найдена:`);
    console.log(`   Тип: ${session.type}`);
    console.log(`   Пользователь: ${session.user.email}`);
    console.log(`   Создана: ${session.createdAt}\n`);

    // Получаем все сообщения сессии
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

    console.log(`📨 Всего сообщений: ${messages.length}\n`);

    // Показываем последние 10 сообщений
    console.log(`📝 Последние сообщения:\n`);
    const lastMessages = messages.slice(-10);
    lastMessages.forEach((msg, index) => {
      const time = new Date(msg.createdAt).toLocaleTimeString("ru-RU");
      const role = msg.role === "user" ? "👤 USER" : "🤖 BOT";
      const content = msg.content.slice(0, 100);
      console.log(`${index + 1}. [${time}] ${role}:`);
      console.log(`   ${content}${msg.content.length > 100 ? "..." : ""}\n`);
    });

    // Проверяем наличие маркера [PROFILE_COMPLETE]
    const hasCompleteMarker = messages.some(
      (msg) => msg.role === "assistant" && msg.content.includes("[PROFILE_COMPLETE]")
    );
    console.log(`\n🏁 Маркер [PROFILE_COMPLETE]: ${hasCompleteMarker ? "✅ ЕСТЬ" : "❌ НЕТ"}\n`);

    // Проверяем профиль пользователя
    console.log(`👤 Профиль пользователя:\n`);
    const user = session.user;
    
    const fields = {
      "Имя": user.firstName,
      "Фамилия": user.lastName,
      "Отчество": user.middleName,
      "Дата рождения": user.dateOfBirth,
      "Телефон": user.phone,
      "Адрес": user.address,
      "Должность": user.jobTitle,
      "Профессия": user.profession,
      "Образование": user.education,
      "Регион": user.region,
      "Город": user.city,
      "Организация ID": user.organizationId,
    };

    Object.entries(fields).forEach(([key, value]) => {
      const status = value ? "✅" : "❌";
      const displayValue = value ? String(value).slice(0, 50) : "(не заполнено)";
      console.log(`   ${status} ${key}: ${displayValue}`);
    });

    const profileComplete = isProfileComplete(user);
    console.log(`\n🎯 Профиль полностью заполнен: ${profileComplete ? "✅ ДА" : "❌ НЕТ"}\n`);

    if (!profileComplete) {
      console.log(`⚠️ Отсутствующие обязательные поля:\n`);
      const requiredFields = {
        firstName: "Имя",
        lastName: "Фамилия",
        dateOfBirth: "Дата рождения",
        phone: "Телефон",
        address: "Адрес",
        jobTitle: "Должность",
        profession: "Профессия",
        education: "Образование",
      };

      Object.entries(requiredFields).forEach(([key, label]) => {
        if (!user[key as keyof typeof user]) {
          console.log(`   ❌ ${label}`);
        }
      });
      console.log();
    }

    // Проверяем документы
    const documents = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: {
          in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
        },
      },
    });

    console.log(`📄 Документы: ${documents.length} шт.\n`);
    documents.forEach((doc) => {
      console.log(`   - ${doc.title} (${doc.status})`);
    });

  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const sessionId = process.argv[2];

if (!sessionId) {
  console.error("❌ Использование: pnpm tsx scripts/check-session-profile.ts <sessionId>");
  process.exit(1);
}

checkSession(sessionId);

