import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Детальная проверка пользователей с Яндекс авторизацией
 */
async function checkYandexUsersDetails() {
  try {
    console.log("🔍 Детальная проверка пользователей с Яндекс авторизацией...\n");
    
    const yandexUsers = await prisma.user.findMany({
      where: {
        yandexId: {
          not: null,
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    console.log(`📊 Найдено пользователей: ${yandexUsers.length}\n`);

    for (const user of yandexUsers) {
      console.log("=".repeat(80));
      console.log(`👤 Пользователь: ${user.email || "без email"}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Яндекс ID: ${user.yandexId}`);
      console.log(`   ФИО: ${user.lastName || ""} ${user.firstName || ""} ${user.middleName || ""}`.trim() || "—");
      console.log(`   Телефон: ${user.phone || "—"}`);
      console.log(`   Email подтвержден: ${user.emailVerified ? "Да" : "Нет"}`);
      console.log(`   Статус: ${user.membershipStatus}`);
      console.log(`   Роль: ${user.role}`);
      console.log(`\n   📋 Профиль:`);
      console.log(`      Должность: ${user.jobTitle || "—"}`);
      console.log(`      Профессия (старое): ${user.profession || "—"}`);
      console.log(`      Профессии (новое): ${user.professions ? "✅ Заполнено" : "—"}`);
      console.log(`      Образование (старое): ${user.education || "—"}`);
      console.log(`      Образования (новое): ${user.educations ? "✅ Заполнено" : "—"}`);
      console.log(`      Занятость: ${user.employmentStatus || "—"}`);
      console.log(`\n   💼 Место работы:`);
      console.log(`      Название: ${user.workplace || "—"}`);
      console.log(`      ИНН: ${user.workplaceInn || "—"}`);
      console.log(`      Руководитель: ${user.directorName || "—"}`);
      console.log(`      Должность руководителя: ${user.directorPosition || "—"}`);
      console.log(`\n   🏢 Организация:`);
      console.log(`      ID: ${user.organizationId || "—"}`);
      console.log(`      Название: ${user.organization?.name || user.organizationName || "—"}`);
      console.log(`      Тип: ${user.organization?.type || "—"}`);
      console.log(`\n   📅 Даты:`);
      console.log(`      Создан: ${user.createdAt.toLocaleString("ru-RU")}`);
      console.log(`      Обновлен: ${user.updatedAt.toLocaleString("ru-RU")}`);
      console.log("");
    }

    console.log("=".repeat(80));

  } catch (error) {
    console.error("❌ Ошибка:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkYandexUsersDetails()
  .then(() => {
    console.log("\n✅ Проверка завершена");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Ошибка:", error);
    process.exit(1);
  });
