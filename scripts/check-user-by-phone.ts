import { prisma } from "../lib/prisma";
import { isProfileComplete } from "../lib/profile-extraction";
import { normalizePhone } from "../lib/utils/phone";

const phone = process.argv[2];

if (!phone) {
  console.error("❌ Укажите номер телефона: pnpm tsx scripts/check-user-by-phone.ts +79032911816");
  process.exit(1);
}

async function checkUser() {
  try {
    const normalizedPhone = normalizePhone(phone);
    console.log(`\n🔍 Ищем пользователя с номером: ${phone} (нормализованный: ${normalizedPhone})\n`);

    // Ищем пользователя по телефону
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: phone },
          { authPhone: normalizedPhone },
          { authPhone: phone },
        ],
      },
      include: {
        organization: true,
        documents: {
          where: {
            type: {
              in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
            },
          },
          orderBy: { createdAt: "desc" },
        },
        chatMessages: {
          where: {
            OR: [
              { content: { contains: "[PROFILE_COMPLETE]" } },
              { content: { contains: "[GENERATE_DOCUMENTS_BUTTON]" } },
              { content: { contains: "Вы успешно заполнили свою анкету" } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!user) {
      console.log("❌ Пользователь не найден!");
      process.exit(1);
    }

    console.log("✅ Пользователь найден!\n");
    console.log("📋 Основная информация:");
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email || "не указан"}`);
    console.log(`   Имя: ${user.firstName || "не указано"}`);
    console.log(`   Фамилия: ${user.lastName || "не указана"}`);
    console.log(`   Отчество: ${user.middleName || "не указано"}`);
    console.log(`   Телефон: ${user.phone || "не указан"}`);
    console.log(`   Auth Phone: ${user.authPhone || "не указан"}`);
    console.log(`   Дата рождения: ${user.dateOfBirth || "не указана"}`);
    console.log(`   Адрес: ${user.address || "не указан"}`);
    console.log(`   Должность: ${user.jobTitle || "не указана"}`);
    console.log(`   Профессия: ${user.profession || "не указана"}`);
    console.log(`   Образование: ${user.education || "не указано"}`);
    console.log(`   Статус членства: ${user.membershipStatus}`);
    console.log(`   Организация: ${user.organization?.name || "не выбрана"}`);
    console.log(`   Создан: ${user.createdAt}`);
    console.log(`   Обновлен: ${user.updatedAt}`);

    // Проверяем полноту профиля
    console.log("\n📊 Проверка полноты профиля:");
    const requiredFields = {
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth,
      phone: user.phone,
      address: user.address,
      jobTitle: user.jobTitle,
      profession: user.profession,
      education: user.education,
    };

    const missingFields: string[] = [];
    Object.entries(requiredFields).forEach(([key, value]) => {
      const filled = value !== null && value !== undefined && value !== "";
      console.log(`   ${filled ? "✅" : "❌"} ${key}: ${value || "ОТСУТСТВУЕТ"}`);
      if (!filled) {
        missingFields.push(key);
      }
    });

    const profileComplete = isProfileComplete(user);
    console.log(`\n🎯 Профиль полностью заполнен: ${profileComplete ? "✅ ДА" : "❌ НЕТ"}`);
    if (!profileComplete) {
      console.log(`   Отсутствующие поля: ${missingFields.join(", ")}`);
    }

    // Проверяем документы
    console.log("\n📄 Документы:");
    if (user.documents.length === 0) {
      console.log("   ❌ Документы отсутствуют");
    } else {
      user.documents.forEach((doc) => {
        console.log(`   ${doc.status === "GENERATED" ? "✅" : doc.status === "SIGNED" ? "📝" : "⏳"} ${doc.type}: ${doc.status} (${doc.fileName || "без файла"})`);
      });
    }

    // Проверяем системные сообщения
    console.log("\n💬 Системные сообщения в чате:");
    if (user.chatMessages.length === 0) {
      console.log("   ℹ️ Системных сообщений не найдено");
    } else {
      user.chatMessages.forEach((msg) => {
        const preview = msg.content.substring(0, 100).replace(/\n/g, " ");
        const markers = [];
        if (msg.content.includes("[PROFILE_COMPLETE]")) markers.push("[PROFILE_COMPLETE]");
        if (msg.content.includes("[GENERATE_DOCUMENTS_BUTTON]")) markers.push("[GENERATE_DOCUMENTS_BUTTON]");
        if (msg.content.includes("Вы успешно заполнили")) markers.push("PROFILE_COMPLETED_MSG");
        console.log(`   💬 ${msg.createdAt.toISOString()}: ${preview}${markers.length > 0 ? ` [${markers.join(", ")}]` : ""}`);
      });
    }

    // Анализ проблемы
    console.log("\n🔍 Анализ проблемы:");
    if (!profileComplete) {
      console.log("   ❌ ПРОБЛЕМА: Профиль не заполнен полностью");
      console.log(`   💡 РЕШЕНИЕ: Заполните отсутствующие поля: ${missingFields.join(", ")}`);
    } else if (user.documents.length === 0) {
      console.log("   ❌ ПРОБЛЕМА: Документы не сгенерированы, хотя профиль заполнен");
      console.log("   💡 РЕШЕНИЕ: Нужно нажать кнопку 'Сгенерировать документы' в чате или вызвать генерацию через API");
      
      // Проверяем, было ли системное сообщение о заполнении профиля
      const hasProfileCompletedMsg = user.chatMessages.some(
        (msg) => msg.content.includes("[GENERATE_DOCUMENTS_BUTTON]") || msg.content.includes("Вы успешно заполнили")
      );
      if (!hasProfileCompletedMsg) {
        console.log("   ⚠️  Также отсутствует системное сообщение о заполнении профиля");
        console.log("   💡 Это означает, что система не отправила уведомление после заполнения профиля");
      }
    } else {
      console.log("   ✅ Все в порядке: профиль заполнен, документы есть");
    }

    console.log("\n");
  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser();

