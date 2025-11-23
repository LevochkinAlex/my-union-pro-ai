import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function listAllDocuments(email) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        documents: {
          orderBy: {
            updatedAt: "desc"
          }
        }
      }
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    console.log(`\n📋 Все документы пользователя: ${user.firstName} ${user.lastName}`);
    console.log(`Всего документов: ${user.documents.length}\n`);

    user.documents.forEach((doc, index) => {
      console.log(`${index + 1}. ${doc.title}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Тип: ${doc.type}`);
      console.log(`   Статус: ${doc.status}`);
      console.log(`   Файл: ${doc.filePath}`);
      console.log(`   Подписанный: ${doc.signedFilePath || 'нет'}`);
      console.log(`   Обновлен: ${doc.updatedAt}`);
      console.log(`   Создан: ${doc.createdAt}`);
      console.log('');
    });

  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

listAllDocuments("ceo@yappix.ru");

