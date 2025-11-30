import { prisma } from "../lib/prisma";
import { normalizePhone } from "../lib/utils/phone";
import fs from "fs/promises";
import path from "path";

const phone = process.argv[2];

if (!phone) {
  console.error("❌ Укажите номер телефона: pnpm tsx scripts/check-document-files.ts +79032911816");
  process.exit(1);
}

function resolveFilePath(filePath: string) {
  // Убираем начальный слеш если есть
  const normalized = filePath.startsWith("/") ? filePath.substring(1) : filePath;
  return path.join(process.cwd(), "public", normalized);
}

async function checkDocumentFiles() {
  try {
    const normalizedPhone = normalizePhone(phone);
    console.log(`\n🔍 Проверяем файлы документов для пользователя: ${phone}\n`);

    // Ищем пользователя
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: phone },
          { authPhone: normalizedPhone },
          { authPhone: phone },
        ],
      },
    });

    if (!user) {
      console.log("❌ Пользователь не найден!");
      process.exit(1);
    }

    console.log(`✅ Пользователь найден: ${user.firstName} ${user.lastName}\n`);

    // Получаем документы
    const documents = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: {
          in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
        },
      },
    });

    if (documents.length === 0) {
      console.log("❌ Документы не найдены!");
      process.exit(1);
    }

    console.log(`📄 Найдено документов: ${documents.length}\n`);

    for (const doc of documents) {
      console.log(`📋 Документ: ${doc.type} (${doc.status})`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   filePath: ${doc.filePath || "не указан"}`);
      console.log(`   signedFilePath: ${doc.signedFilePath || "не указан"}`);
      console.log(`   fileName: ${doc.fileName || "не указан"}`);

      // Проверяем обычный файл
      if (doc.filePath) {
        const absolutePath = resolveFilePath(doc.filePath);
        console.log(`   Абсолютный путь: ${absolutePath}`);
        try {
          const stats = await fs.stat(absolutePath);
          console.log(`   ✅ Файл существует (${stats.size} байт)`);
        } catch (error) {
          console.log(`   ❌ Файл НЕ существует: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        console.log(`   ⚠️  filePath не указан`);
      }

      // Проверяем подписанный файл
      if (doc.signedFilePath) {
        const absolutePath = resolveFilePath(doc.signedFilePath);
        console.log(`   Абсолютный путь (подписанный): ${absolutePath}`);
        try {
          const stats = await fs.stat(absolutePath);
          console.log(`   ✅ Подписанный файл существует (${stats.size} байт)`);
        } catch (error) {
          console.log(`   ❌ Подписанный файл НЕ существует: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        console.log(`   ℹ️  Подписанный файл не загружен`);
      }

      console.log("");
    }

    console.log("✅ Проверка завершена\n");
  } catch (error) {
    console.error("❌ Ошибка:", error);
    if (error instanceof Error) {
      console.error("   Сообщение:", error.message);
      console.error("   Stack:", error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDocumentFiles();

