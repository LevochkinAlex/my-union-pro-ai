import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Скрипт для исправления полей пользователей, авторизованных через Яндекс
 * Приводит их данные в соответствие с текущей структурой профиля
 */
async function fixYandexUsers() {
  try {
    console.log("🔍 Поиск пользователей, авторизованных через Яндекс...");
    
    // Находим всех пользователей с yandexId
    const yandexUsers = await prisma.user.findMany({
      where: {
        yandexId: {
          not: null,
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        middleName: true,
        yandexId: true,
        // Старые поля, которые нужно мигрировать
        profession: true,
        education: true,
        // Новые поля
        workplace: true,
        workplaceInn: true,
        directorName: true,
        directorPosition: true,
        employmentStatus: true,
        professions: true,
        educations: true,
        awards: true,
        training: true,
        // Дополнительная информация
        organizationId: true,
        jobTitle: true,
        createdAt: true,
        // Статусы
        membershipStatus: true,
        unionMembershipStatus: true,
      },
    });

    console.log(`📊 Найдено пользователей с Яндекс авторизацией: ${yandexUsers.length}`);

    if (yandexUsers.length === 0) {
      console.log("✅ Пользователей с Яндекс авторизацией не найдено");
      return;
    }

    let fixedCount = 0;
    let skippedCount = 0;

    for (const user of yandexUsers) {
      const updates: any = {};
      let needsUpdate = false;

      console.log(`\n👤 Обработка пользователя: ${user.email || user.id}`);
      console.log(`   Имя: ${user.firstName || "—"} ${user.lastName || "—"}`);
      console.log(`   Яндекс ID: ${user.yandexId}`);

      // 1. Миграция profession -> professions (JSON)
      // Если есть старое поле profession, но нет нового professions
      if (user.profession && !user.professions) {
        try {
          // Проверяем, не является ли profession уже JSON
          let professionsData;
          try {
            professionsData = JSON.parse(user.profession);
            if (!Array.isArray(professionsData)) {
              throw new Error("Not an array");
            }
          } catch {
            // Если не JSON, создаем массив из одного элемента
            professionsData = [{ name: user.profession, experience: "" }];
          }
          updates.professions = JSON.stringify(professionsData);
          // Очищаем старое поле после миграции
          updates.profession = null;
          needsUpdate = true;
          console.log(`   ✅ Миграция profession -> professions`);
        } catch (error) {
          console.log(`   ⚠️ Ошибка миграции profession: ${error}`);
        }
      }

      // 2. Миграция education -> educations (JSON)
      // Если есть старое поле education, но нет нового educations
      if (user.education && !user.educations) {
        try {
          // Проверяем, не является ли education уже JSON
          let educationsData;
          try {
            educationsData = JSON.parse(user.education);
            if (!Array.isArray(educationsData)) {
              throw new Error("Not an array");
            }
          } catch {
            // Если не JSON, создаем массив из одного элемента
            educationsData = [{ 
              level: user.education, 
              institution: "", 
              year: "", 
              specialty: "" 
            }];
          }
          updates.educations = JSON.stringify(educationsData);
          // Очищаем старое поле после миграции
          updates.education = null;
          needsUpdate = true;
          console.log(`   ✅ Миграция education -> educations`);
        } catch (error) {
          console.log(`   ⚠️ Ошибка миграции education: ${error}`);
        }
      }

      // 3. Очистка старых полей profession и education, если новые поля заполнены
      // Это безопасная операция - очищаем только если новые поля уже есть
      if (user.professions && user.profession) {
        updates.profession = null;
        needsUpdate = true;
        console.log(`   ✅ Очистка старого поля profession (новое поле professions заполнено)`);
      }

      if (user.educations && user.education) {
        updates.education = null;
        needsUpdate = true;
        console.log(`   ✅ Очистка старого поля education (новое поле educations заполнено)`);
      }

      // 4. Проверка соответствия структуры данных новой схеме
      // Убеждаемся, что все поля соответствуют новой структуре
      
      // Если есть workplace, но нет workplaceInn и других полей - это нормально
      // Но если workplace содержит название ППО вместо места работы - это нужно исправить
      if (user.workplace && user.workplace.includes("ППО")) {
        console.log(`   ⚠️ Внимание: поле workplace содержит название ППО, возможно это ошибка`);
        console.log(`      Значение: ${user.workplace}`);
        // Не исправляем автоматически, так как это может быть намеренно
      }

      // 5. Логирование состояния полей
      if (!user.workplace) {
        console.log(`   ℹ️ Поле workplace не заполнено`);
      } else {
        console.log(`   ✅ Поле workplace заполнено: ${user.workplace.substring(0, 50)}...`);
      }

      if (!user.employmentStatus) {
        console.log(`   ℹ️ Поле employmentStatus не заполнено`);
      } else {
        console.log(`   ✅ Поле employmentStatus заполнено: ${user.employmentStatus}`);
      }

      // Проверка наличия новых JSON полей
      if (user.professions) {
        console.log(`   ✅ Поле professions заполнено (JSON)`);
      }
      if (user.educations) {
        console.log(`   ✅ Поле educations заполнено (JSON)`);
      }
      if (user.awards) {
        console.log(`   ✅ Поле awards заполнено (JSON)`);
      }
      if (user.training) {
        console.log(`   ✅ Поле training заполнено (JSON)`);
      }

      // Применяем обновления
      if (needsUpdate) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: updates,
          });
          fixedCount++;
          console.log(`   ✅ Пользователь обновлен`);
        } catch (error) {
          console.error(`   ❌ Ошибка обновления пользователя ${user.id}:`, error);
        }
      } else {
        skippedCount++;
        console.log(`   ⏭️ Обновления не требуются`);
      }
    }

    console.log(`\n📈 Итоги:`);
    console.log(`   ✅ Обновлено: ${fixedCount}`);
    console.log(`   ⏭️ Пропущено: ${skippedCount}`);
    console.log(`   📊 Всего обработано: ${yandexUsers.length}`);

  } catch (error) {
    console.error("❌ Ошибка при выполнении скрипта:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск скрипта
fixYandexUsers()
  .then(() => {
    console.log("\n✅ Скрипт завершен успешно");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Скрипт завершился с ошибкой:", error);
    process.exit(1);
  });
