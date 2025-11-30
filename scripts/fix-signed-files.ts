import { prisma } from "../lib/prisma";
import { normalizePhone } from "../lib/utils/phone";
import fs from "fs/promises";
import path from "path";

const phone = process.argv[2];

if (!phone) {
  console.error("❌ Укажите номер телефона: pnpm tsx scripts/fix-signed-files.ts +79032911816");
  process.exit(1);
}

function resolveFilePath(filePath: string) {
  const normalized = filePath.startsWith("/") ? filePath.substring(1) : filePath;
  return path.join(process.cwd(), "public", normalized);
}

async function fixSignedFiles() {
  try {
    const normalizedPhone = normalizePhone(phone);
    console.log(`\n🔍 Проверяем и исправляем подписанные файлы для пользователя: ${phone}\n`);

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
        signedFilePath: { not: null },
      },
    });

    if (documents.length === 0) {
      console.log("ℹ️  Документов с подписанными файлами не найдено\n");
      process.exit(0);
    }

    console.log(`📄 Найдено документов с подписанными файлами: ${documents.length}\n`);

    let fixedCount = 0;

    for (const doc of documents) {
      if (!doc.signedFilePath) continue;

      const absolutePath = resolveFilePath(doc.signedFilePath);
      console.log(`📋 Документ: ${doc.type}`);
      console.log(`   Подписанный файл: ${doc.signedFilePath}`);

      try {
        await fs.access(absolutePath);
        console.log(`   ✅ Файл существует\n`);
      } catch (error) {
        console.log(`   ❌ Файл НЕ существует, очищаем ссылку...`);
        
        // Обновляем документ: убираем ссылку на несуществующий файл и меняем статус
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            signedFilePath: null,
            status: doc.status === "SIGNED" ? "GENERATED" : doc.status, // Возвращаем статус GENERATED если был SIGNED
          },
        });
        
        console.log(`   ✅ Ссылка очищена, статус обновлен\n`);
        fixedCount++;
      }
    }

    console.log(`✅ Исправлено документов: ${fixedCount}\n`);
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

fixSignedFiles();

