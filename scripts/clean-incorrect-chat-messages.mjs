import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanIncorrectMessages(email) {
  try {
    console.log(`🔍 Поиск некорректных сообщений пользователя: ${email}`);
    
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    // Список фраз для удаления
    const phrasesToDelete = [
      "Я загрузил файл: instrukcii-po-aktivacii",
      "Извините, я специализируюсь только на помощи в оформлении заявлений",
      "Спасибо за загрузку документа. Пожалуйста, уточните, что именно вы хотите сделать с этим файлом",
      "Я загрузил файл: membership_001.pdf"
    ];

    let totalDeleted = 0;

    for (const phrase of phrasesToDelete) {
      const messagesToDelete = await prisma.chatMessage.findMany({
        where: {
          userId: user.id,
          content: {
            contains: phrase
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      if (messagesToDelete.length > 0) {
        console.log(`\n🗑️  Найдено сообщений с фразой "${phrase.substring(0, 50)}...": ${messagesToDelete.length}`);
        
        for (const message of messagesToDelete) {
          console.log(`  - [${message.role}] ${message.content.substring(0, 80)}...`);
          
          await prisma.chatMessage.delete({
            where: { id: message.id }
          });
          
          totalDeleted++;
        }
      }
    }
    
    console.log(`\n✅ Готово! Удалено сообщений: ${totalDeleted}`);
    
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Email пользователя
cleanIncorrectMessages("ceo@yappix.ru");

