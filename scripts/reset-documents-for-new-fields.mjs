import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения (пробуем .env.prod для продакшена, затем .env.local)
const envPath = process.env.NODE_ENV === "production" 
  ? join(__dirname, "..", ".env.prod")
  : join(__dirname, "..", ".env.local");
dotenv.config({ path: envPath });
// Также загружаем системные переменные окружения
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Начинаем сброс документов и статусов для новых обязательных полей...\n");

  try {
    // Находим всех пользователей, кроме ganteya@gmail.com
    const users = await prisma.user.findMany({
      where: {
        email: {
          not: "ganteya@gmail.com",
        },
      },
      include: {
        documents: true,
      },
    });

    console.log(`📊 Найдено пользователей для обработки: ${users.length}\n`);

    let processedCount = 0;
    let documentsDeletedCount = 0;
    let statusChangedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      // Проверяем, заполнены ли новые обязательные поля
      const hasNewFields = 
        user.workplace && 
        user.workplaceInn && 
        user.directorName && 
        user.directorPosition;

      if (hasNewFields) {
        console.log(`⏭️  Пропускаем ${user.email} - новые поля уже заполнены`);
        skippedCount++;
        continue;
      }

      // Удаляем документы со статусами GENERATED и DRAFT
      const documentsToDelete = user.documents.filter(
        (doc) => doc.status === "GENERATED" || doc.status === "DRAFT"
      );

      if (documentsToDelete.length > 0) {
        await prisma.document.deleteMany({
          where: {
            id: {
              in: documentsToDelete.map((d) => d.id),
            },
          },
        });
        documentsDeletedCount += documentsToDelete.length;
        console.log(
          `🗑️  Удалено ${documentsToDelete.length} документов для ${user.email}`
        );
      }

      // Изменяем статус на PROFILE_INCOMPLETE, если он не PENDING_VERIFICATION
      if (user.membershipStatus !== "PENDING_VERIFICATION") {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            membershipStatus: "PROFILE_INCOMPLETE",
          },
        });
        statusChangedCount++;
        console.log(
          `📝 Статус изменен на PROFILE_INCOMPLETE для ${user.email}`
        );
      }

      processedCount++;
    }

    console.log("\n✅ Обработка завершена!");
    console.log(`📊 Статистика:`);
    console.log(`   - Обработано пользователей: ${processedCount}`);
    console.log(`   - Пропущено (поля заполнены): ${skippedCount}`);
    console.log(`   - Удалено документов: ${documentsDeletedCount}`);
    console.log(`   - Изменено статусов: ${statusChangedCount}`);
  } catch (error) {
    console.error("❌ Ошибка при обработке:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log("\n✨ Скрипт выполнен успешно!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Ошибка выполнения скрипта:", error);
    process.exit(1);
  });

