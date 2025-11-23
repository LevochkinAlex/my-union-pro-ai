import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function deleteSpecificMessage(email) {
  try {
    console.log(`🔍 Поиск сообщений пользователя: ${email}`);
    
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    // Ищем сообщение с этим текстом
    const messagesToDelete = await prisma.chatMessage.findMany({
      where: {
        userId: user.id,
        role: "assistant",
        content: {
          contains: "Извините, но моя задача заключается в сборе данных для вступления в профсоюз"
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (messagesToDelete.length === 0) {
      console.log("❌ Сообщение не найдено");
      return;
    }

    console.log(`\n📋 Найдено сообщений: ${messagesToDelete.length}`);
    
    for (const message of messagesToDelete) {
      console.log(`\n🗑️ Удаление сообщения:`);
      console.log(`  ID: ${message.id}`);
      console.log(`  Дата: ${message.createdAt}`);
      console.log(`  Текст: ${message.content.substring(0, 100)}...`);
      
      await prisma.chatMessage.delete({
        where: { id: message.id }
      });
      
      console.log(`  ✅ Удалено`);
    }
    
    console.log("\n✅ Готово! Некорректное сообщение удалено из истории чата.");
    
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Email пользователя
deleteSpecificMessage("ceo@yappix.ru");

