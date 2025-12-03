import { PrismaClient } from "@prisma/client";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { existsSync } from "fs";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function cleanupMissingAvatars() {
  try {
    console.log("🔍 Поиск пользователей с аватарами...\n");

    const users = await prisma.user.findMany({
      where: {
        avatarUrl: {
          not: null,
        },
      },
      select: {
        id: true,
        email: true,
        avatarUrl: true,
      },
    });

    console.log(`Найдено ${users.length} пользователей с аватарами\n`);

    const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "avatars");
    let cleaned = 0;
    let found = 0;

    for (const user of users) {
      if (!user.avatarUrl) continue;

      // Извлекаем имя файла из URL
      let filename = null;
      if (user.avatarUrl.startsWith("/api/uploads/avatars/")) {
        filename = user.avatarUrl.replace("/api/uploads/avatars/", "");
      } else if (user.avatarUrl.startsWith("/uploads/avatars/")) {
        filename = user.avatarUrl.replace("/uploads/avatars/", "");
      } else if (user.avatarUrl.startsWith("data:")) {
        // Base64 изображение - пропускаем
        found++;
        continue;
      } else {
        console.log(`⚠️  Неизвестный формат URL для ${user.email}: ${user.avatarUrl}`);
        continue;
      }

      const filePath = path.join(UPLOAD_DIR, filename);

      if (!existsSync(filePath)) {
        console.log(`❌ Файл не найден: ${user.email} -> ${filename}`);
        console.log(`   Очищаем avatarUrl из базы данных...`);

        await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: null },
        });

        cleaned++;
      } else {
        found++;
      }
    }

    console.log(`\n✨ Очистка завершена!`);
    console.log(`   ✅ Найдено файлов: ${found}`);
    console.log(`   🗑️  Очищено URL: ${cleaned}`);
  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupMissingAvatars();

