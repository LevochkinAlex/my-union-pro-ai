import { PrismaClient } from "@prisma/client";
import { unlink } from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function deleteInvalidSignedDocument(email) {
  try {
    console.log(`🔍 Поиск документов пользователя: ${email}`);
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        documents: {
          where: {
            status: "SIGNED",
            type: {
              in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
            },
          },
        },
      },
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    console.log(`\n📄 Найдено документов со статусом SIGNED: ${user.documents.length}`);
    
    for (const doc of user.documents) {
      console.log(`\n🗑️  Удаление документа:`);
      console.log(`  ID: ${doc.id}`);
      console.log(`  Тип: ${doc.type}`);
      console.log(`  Название: ${doc.title}`);
      console.log(`  Статус: ${doc.status}`);
      console.log(`  Файл: ${doc.signedFilePath || doc.filePath}`);
      
      // Удаляем файлы с диска
      const filesToDelete = [doc.signedFilePath, doc.filePath].filter(Boolean);
      
      for (const filePath of filesToDelete) {
        try {
          const absolutePath = path.join(process.cwd(), "public", filePath);
          await unlink(absolutePath);
          console.log(`  ✅ Удален файл: ${filePath}`);
        } catch (error) {
          console.log(`  ⚠️  Файл не найден или уже удален: ${filePath}`);
        }
      }
      
      // Обновляем документ - убираем signedFilePath и возвращаем статус GENERATED
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          status: "GENERATED",
          signedFilePath: null,
          updatedAt: new Date(),
        },
      });
      
      console.log(`  ✅ Статус документа изменен на GENERATED, signedFilePath очищен`);
    }
    
    console.log("\n✅ Готово! Некорректные подписанные документы удалены.");
    console.log("📋 Пользователь может загрузить правильные документы заново.");
    
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Email пользователя
deleteInvalidSignedDocument("ceo@yappix.ru");

